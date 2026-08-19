import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createDataStore } from './server/repository.mjs';
import { hashPassword, verifyPassword } from './server/security.mjs';

const app = express();
const port = Number(process.env.API_PORT || 5174);
const sessionCookieName = 'teacher_session';
const sessionDurationSeconds = 8 * 60 * 60;
const sessionSecret = process.env.SESSION_SECRET || 'local-development-secret-change-before-deploying';
const isProduction = process.env.NODE_ENV === 'production';
const allowLegacyStudentIdLogin = process.env.ALLOW_LEGACY_STUDENT_ID_LOGIN
  ? process.env.ALLOW_LEGACY_STUDENT_ID_LOGIN === 'true'
  : !isProduction;
const store = await createDataStore();

if (isProduction && (!process.env.SESSION_SECRET || sessionSecret.length < 32)) {
  throw new Error('Production requires SESSION_SECRET with at least 32 characters');
}

await store.initialize();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '5mb' }));

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: '登录尝试次数过多，请 15 分钟后再试' },
});

const studentAccessLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: '访问过于频繁，请稍后再试' },
});

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((item) => {
    const separator = item.indexOf('=');
    if (separator < 0) return [item.trim(), ''];
    return [item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1))];
  }).filter(([key]) => key));
}

function signSession(teacher) {
  const payload = Buffer.from(JSON.stringify({
    teacherId: teacher.teacherId,
    expiresAt: Date.now() + sessionDurationSeconds * 1000,
  })).toString('base64url');
  const signature = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySession(token) {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function teacherSummary(teacher) {
  return {
    teacherId: teacher.teacherId,
    account: teacher.account,
    displayName: teacher.displayName,
  };
}

function publicStudent(student) {
  const {
    teacherId: _teacherId,
    reportCode: _reportCode,
    ...visibleStudent
  } = student;
  return visibleStudent;
}

function requestIp(request) {
  return String(request.ip || request.socket.remoteAddress || '').slice(0, 64);
}

function audit(entry) {
  store.addAuditLog(entry).catch((error) => console.error('Audit log failed', error));
}

async function requireTeacher(request, response, next) {
  try {
    const cookies = parseCookies(request.headers.cookie);
    const session = verifySession(cookies[sessionCookieName]);
    if (!session) return response.status(401).json({ message: '请先登录教师管理后台' });
    const teacher = await store.getTeacherById(session.teacherId);
    if (!teacher?.active) return response.status(401).json({ message: '教师账号已失效，请重新登录' });
    request.teacher = teacher;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireSameOrigin(request, response, next) {
  const origin = request.get('origin');
  if (!origin) return next();
  const expectedOrigin = `${request.protocol}://${request.get('host')}`;
  if (origin !== expectedOrigin) return response.status(403).json({ message: '请求来源验证失败' });
  return next();
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function studentsToCsv(students) {
  const headers = [
    '学生ID', '报告访问码', '学员姓名', '课程级别', '课表ID', '最近课程数', '已提交作业', '作业总数',
    '代码正确率', '学习时长', '家长查看状态', '查看时间', '学位状态', '锁定时间', '上课星期', '上课时间',
  ];
  const rows = students.map((student) => [
    student.studentId,
    student.reportCode,
    student.name,
    student.level,
    student.scheduleId,
    student.learningData.recentLessons,
    student.learningData.submittedAssignments,
    student.learningData.totalAssignments,
    `${student.learningData.codeCorrectRate}%`,
    student.learningData.studyHours,
    student.viewedAt ? '已查看' : '未查看',
    student.viewedAt,
    student.seatLocked ? '已锁定' : '未锁定',
    student.seatLockedAt,
    student.selectedClassTime?.day,
    student.selectedClassTime?.time,
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, storage: store.backend });
});

app.post('/api/admin/login', adminLoginLimiter, requireSameOrigin, async (request, response, next) => {
  try {
    const account = String(request.body.account || '').trim().toLowerCase();
    const password = String(request.body.password || '');
    const teacher = await store.getTeacherByAccount(account);
    const passwordMatches = teacher
      ? await verifyPassword(password, teacher.passwordSalt, teacher.passwordHash)
      : await verifyPassword(password, '00000000000000000000000000000000', '0'.repeat(128));

    if (!teacher?.active || !passwordMatches) {
      audit({ action: 'teacher.login_failed', targetType: 'teacher_account', targetId: account, metadata: {}, ipAddress: requestIp(request) });
      return response.status(401).json({ message: '账号或密码错误' });
    }

    const secure = isProduction ? '; Secure' : '';
    response.setHeader('Set-Cookie', `${sessionCookieName}=${encodeURIComponent(signSession(teacher))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionDurationSeconds}${secure}`);
    audit({ teacherId: teacher.teacherId, action: 'teacher.login', targetType: 'teacher', targetId: teacher.teacherId, metadata: {}, ipAddress: requestIp(request) });
    return response.json({ teacher: teacherSummary(teacher) });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/admin/session', requireTeacher, (request, response) => {
  response.json({ teacher: teacherSummary(request.teacher) });
});

app.post('/api/admin/logout', requireSameOrigin, (request, response) => {
  const secure = isProduction ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
  response.json({ ok: true });
});

app.post('/api/admin/password', requireTeacher, requireSameOrigin, async (request, response, next) => {
  try {
    const currentPassword = String(request.body.currentPassword || '');
    const newPassword = String(request.body.newPassword || '');
    if (!(await verifyPassword(currentPassword, request.teacher.passwordSalt, request.teacher.passwordHash))) {
      return response.status(400).json({ message: '当前密码错误' });
    }
    if (currentPassword === newPassword) return response.status(400).json({ message: '新密码不能与当前密码相同' });
    const credentials = await hashPassword(newPassword);
    await store.updateTeacherPassword(request.teacher.teacherId, credentials.salt, credentials.hash);
    audit({ teacherId: request.teacher.teacherId, action: 'teacher.password_changed', targetType: 'teacher', targetId: request.teacher.teacherId, metadata: {}, ipAddress: requestIp(request) });
    return response.json({ ok: true });
  } catch (error) {
    if (error.message?.includes('至少需要')) return response.status(400).json({ message: error.message });
    return next(error);
  }
});

app.get('/api/admin/students', requireTeacher, async (request, response, next) => {
  try {
    response.json({ students: await store.listStudentsByTeacher(request.teacher.teacherId) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/import-batches', requireTeacher, async (request, response, next) => {
  try {
    response.json({ batches: await store.listImportBatches(request.teacher.teacherId, 10) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/audit-logs', requireTeacher, async (request, response, next) => {
  try {
    response.json({ logs: await store.listAuditLogs(request.teacher.teacherId, 20) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/students/export.csv', requireTeacher, async (request, response, next) => {
  try {
    const students = await store.listStudentsByTeacher(request.teacher.teacherId);
    const date = new Date().toISOString().slice(0, 10);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="students-${request.teacher.teacherId}-${date}.csv"`);
    audit({ teacherId: request.teacher.teacherId, action: 'students.exported', targetType: 'student_collection', targetId: request.teacher.teacherId, metadata: { count: students.length }, ipAddress: requestIp(request) });
    response.send(studentsToCsv(students));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/students/import', requireTeacher, requireSameOrigin, async (request, response, next) => {
  try {
    if (!Array.isArray(request.body.students) || request.body.students.length === 0) {
      return response.status(400).json({ message: '没有可导入的学生数据' });
    }
    if (request.body.students.length > 5000) {
      return response.status(400).json({ message: '单次最多导入 5000 条学生数据' });
    }

    const result = await store.importStudents(
      request.teacher.teacherId,
      request.body.students,
      String(request.body.fileName || '').slice(0, 255),
    );
    audit({ teacherId: request.teacher.teacherId, action: 'students.imported', targetType: 'student_collection', targetId: request.teacher.teacherId, metadata: { count: result.imported, fileName: request.body.fileName || '' }, ipAddress: requestIp(request) });
    return response.json(result);
  } catch (error) {
    if (error.code === 'STUDENT_OWNER_CONFLICT') return response.status(409).json({ message: error.message });
    if (error.message?.includes('必须包含')) return response.status(400).json({ message: error.message });
    return next(error);
  }
});

app.get('/api/students/:accessKey', studentAccessLimiter, async (request, response, next) => {
  try {
    const accessKey = request.params.accessKey.trim();
    const student = await store.getStudentByAccess(accessKey, allowLegacyStudentIdLogin);
    if (!student) return response.status(404).json({ message: '未找到匹配学生，请核对报告访问码' });
    return response.json({ student: publicStudent(student) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/students/:accessKey/viewed', studentAccessLimiter, async (request, response, next) => {
  try {
    const student = await store.getStudentByAccess(request.params.accessKey.trim(), allowLegacyStudentIdLogin);
    if (!student) return response.status(404).json({ message: '未找到匹配学生' });
    const updated = await store.markStudentViewed(student.studentId);
    audit({ teacherId: student.teacherId, action: 'parent.report_viewed', targetType: 'student', targetId: student.studentId, metadata: {}, ipAddress: requestIp(request) });
    return response.json({ student: publicStudent(updated) });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/students/:accessKey/seat-lock', studentAccessLimiter, async (request, response, next) => {
  try {
    const student = await store.getStudentByAccess(request.params.accessKey.trim(), allowLegacyStudentIdLogin);
    if (!student) return response.status(404).json({ message: '未找到匹配学生' });
    const selection = {
      day: String(request.body.day || '').trim(),
      time: String(request.body.time || '').trim(),
    };
    const updated = await store.lockStudentSeat(student.studentId, selection);
    audit({ teacherId: student.teacherId, action: 'parent.seat_locked', targetType: 'student', targetId: student.studentId, metadata: selection, ipAddress: requestIp(request) });
    return response.json({ student: publicStudent(updated) });
  } catch (error) {
    return next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ message: '服务器处理失败，请稍后重试' });
});

const server = app.listen(port, () => {
  console.log(`Learning report API running at http://localhost:${port} (${store.backend})`);
});

async function shutdown() {
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
