import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createDataStore, createTeacherId } from './server/repository.mjs';
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
const defaultTeacherPassword = 'bcm666';

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
    role: teacher.role || 'teacher',
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

function requireAdmin(request, response, next) {
  if (request.teacher?.role !== 'admin') return response.status(403).json({ message: '仅系统管理员可执行此操作' });
  return next();
}

function normalizeTeacherInput(input) {
  const account = String(input.account || '').trim().toLowerCase();
  const displayName = String(input.displayName || input.name || '').trim();
  if (!/^[a-z0-9._-]{3,40}$/.test(account)) throw new Error(`教师账号 ${account || '（空）'} 格式不正确`);
  if (!displayName) throw new Error(`教师账号 ${account} 缺少老师姓名`);
  return { account, displayName };
}

function requireSameOrigin(request, response, next) {
  const origin = request.get('origin');
  if (!origin) return next();
  const expectedOrigin = `${request.protocol}://${request.get('host')}`;
  const developmentOrigin = !isProduction && (() => {
    try {
      const parsed = new URL(origin);
      const localHost = parsed.hostname === 'localhost'
        || parsed.hostname === '127.0.0.1'
        || parsed.hostname === '::1'
        || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname)
        || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname);
      return localHost && parsed.port === '5173';
    } catch {
      return false;
    }
  })();
  if (origin !== expectedOrigin && !developmentOrigin) return response.status(403).json({ message: '请求来源验证失败' });
  return next();
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function studentsToCsv(students) {
  const headers = [
    '学生ID', '报告访问码', '学员姓名', '课程级别', '课线', '组长', '课表ID', '最近课程数', '已提交作业', '作业总数',
    '代码正确率', '学习时长', '家长查看状态', '查看时间', '学位状态', '锁定时间', '上课星期', '上课时间',
  ];
  const rows = students.map((student) => [
    student.studentId,
    student.reportCode,
    student.name,
    student.level,
    student.courseLine,
    student.teamLeader,
    student.scheduleId,
    student.learningData.recentLessons,
    student.learningData.submittedAssignments,
    3,
    '100%',
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
    const students = request.teacher.role === 'admin'
      ? await store.listAllStudents()
      : await store.listStudentsByTeacher(request.teacher.teacherId);
    response.json({ students });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/import-batches', requireTeacher, async (request, response, next) => {
  try {
    const batches = request.teacher.role === 'admin'
      ? await store.listAllImportBatches(10)
      : await store.listImportBatches(request.teacher.teacherId, 10);
    response.json({ batches });
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
    const students = request.teacher.role === 'admin'
      ? await store.listAllStudents()
      : await store.listStudentsByTeacher(request.teacher.teacherId);
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
    if (request.teacher.role !== 'admin' && request.body.students.length !== 1) {
      return response.status(400).json({ message: '教师每次只能新增或更新 1 名学生' });
    }

    const fileName = String(request.body.fileName || '').slice(0, 255);
    if (request.teacher.role !== 'admin') {
      const result = await store.importStudents(request.teacher.teacherId, request.body.students, fileName);
      audit({ teacherId: request.teacher.teacherId, action: 'students.imported', targetType: 'student_collection', targetId: request.teacher.teacherId, metadata: { count: result.imported, fileName }, ipAddress: requestIp(request) });
      return response.json(result);
    }

    const teachers = await store.listTeachers();
    const teachersByAccount = new Map(teachers.filter((teacher) => teacher.role === 'teacher' && teacher.active).map((teacher) => [teacher.account.toLowerCase(), teacher]));
    const grouped = new Map();
    for (const input of request.body.students) {
      const teacherAccount = String(input.teacherAccount || '').trim().toLowerCase();
      const owner = teachersByAccount.get(teacherAccount);
      if (!owner) throw new Error(`老师账号 ${teacherAccount || '（空）'} 不存在或已停用`);
      const existing = await store.getStudentById(String(input.studentId || '').trim().toUpperCase());
      if (existing && existing.teacherId !== owner.teacherId) {
        const error = new Error(`学生 ID ${existing.studentId} 已归属其他教师，无法导入`);
        error.code = 'STUDENT_OWNER_CONFLICT';
        throw error;
      }
      if (!grouped.has(owner.teacherId)) grouped.set(owner.teacherId, []);
      grouped.get(owner.teacherId).push(input);
    }

    let imported = 0;
    for (const [teacherId, inputs] of grouped) {
      const result = await store.importStudents(teacherId, inputs, fileName);
      imported += result.imported;
    }
    const students = await store.listAllStudents();
    audit({ teacherId: request.teacher.teacherId, action: 'admin.students_imported', targetType: 'student_collection', targetId: 'all', metadata: { count: imported, fileName }, ipAddress: requestIp(request) });
    return response.json({ imported, total: students.length, students });
  } catch (error) {
    if (error.code === 'STUDENT_OWNER_CONFLICT') return response.status(409).json({ message: error.message });
    if (error.message?.includes('必须包含') || error.message?.includes('作业提交数') || error.message?.includes('老师账号')) return response.status(400).json({ message: error.message });
    return next(error);
  }
});

app.get('/api/admin/teachers', requireTeacher, requireAdmin, async (_request, response, next) => {
  try {
    const [teachers, students] = await Promise.all([store.listTeachers(), store.listAllStudents()]);
    response.json({
      teachers: teachers.map((teacher) => ({
        ...teacher,
        studentCount: students.filter((student) => student.teacherId === teacher.teacherId).length,
        viewedCount: students.filter((student) => student.teacherId === teacher.teacherId && student.viewedAt).length,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/teachers/import', requireTeacher, requireAdmin, requireSameOrigin, async (request, response, next) => {
  try {
    if (!Array.isArray(request.body.teachers) || request.body.teachers.length === 0) {
      return response.status(400).json({ message: '没有可导入的老师账号' });
    }
    if (request.body.teachers.length > 1000) return response.status(400).json({ message: '单次最多导入 1000 个老师账号' });
    const normalized = request.body.teachers.map(normalizeTeacherInput);
    const accounts = new Set(normalized.map((teacher) => teacher.account));
    if (accounts.size !== normalized.length) return response.status(400).json({ message: '导入文件中存在重复老师账号' });
    const prepared = await Promise.all(normalized.map(async (teacher) => {
      const credentials = await hashPassword(defaultTeacherPassword, 6);
      return {
        ...teacher,
        teacherId: createTeacherId(),
        role: 'teacher',
        passwordSalt: credentials.salt,
        passwordHash: credentials.hash,
      };
    }));
    const result = await store.importTeachers(prepared);
    audit({ teacherId: request.teacher.teacherId, action: 'admin.teachers_imported', targetType: 'teacher_collection', targetId: 'teachers', metadata: { count: result.imported }, ipAddress: requestIp(request) });
    return response.json({ ...result, teachers: await store.listTeachers(), defaultPassword: defaultTeacherPassword });
  } catch (error) {
    if (error.code === 'TEACHER_ACCOUNT_CONFLICT') return response.status(409).json({ message: error.message });
    if (error.message?.includes('教师账号')) return response.status(400).json({ message: error.message });
    return next(error);
  }
});

app.post('/api/admin/administrators/import', requireTeacher, requireAdmin, requireSameOrigin, async (request, response, next) => {
  try {
    if (!Array.isArray(request.body.administrators) || request.body.administrators.length === 0) {
      return response.status(400).json({ message: '没有可导入的管理员账号' });
    }
    if (request.body.administrators.length > 200) return response.status(400).json({ message: '单次最多导入 200 个管理员账号' });
    const normalized = request.body.administrators.map((input) => ({
      ...normalizeTeacherInput(input),
      password: String(input.password || ''),
    }));
    const accounts = new Set(normalized.map((administrator) => administrator.account));
    if (accounts.size !== normalized.length) return response.status(400).json({ message: '导入文件中存在重复管理员账号' });
    const prepared = await Promise.all(normalized.map(async (administrator) => {
      const credentials = await hashPassword(administrator.password);
      return {
        account: administrator.account,
        displayName: administrator.displayName,
        teacherId: createTeacherId(),
        role: 'admin',
        passwordSalt: credentials.salt,
        passwordHash: credentials.hash,
      };
    }));
    const result = await store.importTeachers(prepared);
    audit({ teacherId: request.teacher.teacherId, action: 'admin.administrators_imported', targetType: 'teacher_collection', targetId: 'administrators', metadata: { count: result.imported }, ipAddress: requestIp(request) });
    return response.json({ ...result, teachers: await store.listTeachers() });
  } catch (error) {
    if (error.code === 'TEACHER_ACCOUNT_CONFLICT') return response.status(409).json({ message: error.message });
    if (error.message?.includes('教师账号') || error.message?.includes('至少需要')) return response.status(400).json({ message: error.message });
    return next(error);
  }
});

app.delete('/api/admin/teachers', requireTeacher, requireAdmin, requireSameOrigin, async (request, response, next) => {
  try {
    const teacherIds = [...new Set((Array.isArray(request.body.teacherIds) ? request.body.teacherIds : []).map((value) => String(value).trim()).filter(Boolean))];
    if (!teacherIds.length) return response.status(400).json({ message: '请选择要删除的老师账号' });
    if (teacherIds.length > 500) return response.status(400).json({ message: '单次最多删除 500 个老师账号' });
    const result = await store.deleteTeachers(teacherIds, request.teacher.teacherId);
    audit({ teacherId: request.teacher.teacherId, action: 'admin.teachers_deleted', targetType: 'teacher_collection', targetId: 'teachers', metadata: { count: result.deleted }, ipAddress: requestIp(request) });
    return response.json(result);
  } catch (error) {
    if (error.code === 'TEACHER_DELETE_BLOCKED') return response.status(409).json({ message: error.message });
    return next(error);
  }
});

app.post('/api/admin/teachers/:teacherId/reset-password', requireTeacher, requireAdmin, requireSameOrigin, async (request, response, next) => {
  try {
    const teacher = await store.getTeacherById(request.params.teacherId);
    if (!teacher || teacher.role !== 'teacher') return response.status(404).json({ message: '未找到老师账号' });
    const credentials = await hashPassword(defaultTeacherPassword, 6);
    await store.updateTeacherPassword(teacher.teacherId, credentials.salt, credentials.hash);
    audit({ teacherId: request.teacher.teacherId, action: 'admin.teacher_password_reset', targetType: 'teacher', targetId: teacher.teacherId, metadata: {}, ipAddress: requestIp(request) });
    return response.json({ ok: true, defaultPassword: defaultTeacherPassword });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/admin/teachers/:teacherId/active', requireTeacher, requireAdmin, requireSameOrigin, async (request, response, next) => {
  try {
    const teacher = await store.getTeacherById(request.params.teacherId);
    if (!teacher || teacher.role !== 'teacher') return response.status(404).json({ message: '未找到老师账号' });
    const updated = await store.setTeacherActive(teacher.account, Boolean(request.body.active));
    audit({ teacherId: request.teacher.teacherId, action: 'admin.teacher_status_changed', targetType: 'teacher', targetId: teacher.teacherId, metadata: { active: updated.active }, ipAddress: requestIp(request) });
    return response.json({ teacher: teacherSummary(updated) });
  } catch (error) {
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
