import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { generateReportCode } from './security.mjs';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(serverDirectory, '..');
const dataDirectory = path.join(projectDirectory, 'server-data');
const studentsFile = path.join(dataDirectory, 'students.json');
const teachersFile = path.join(dataDirectory, 'teachers.json');
const auditFile = path.join(dataDirectory, 'audit-logs.json');
const importsFile = path.join(dataDirectory, 'import-batches.json');

function toNumber(value, fallback, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function normalizeStudent(input, existing, teacherId) {
  const studentId = String(input.studentId || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  if (!studentId || !name) throw new Error('每行必须包含学生 ID 和学员姓名');

  const totalAssignments = toNumber(input.totalAssignments, 3, 0, 1000);
  const submittedAssignments = toNumber(input.submittedAssignments, totalAssignments, 0, totalAssignments);

  return {
    studentId,
    teacherId,
    reportCode: existing?.reportCode || generateReportCode(),
    name,
    level: String(input.level || existing?.level || '').trim(),
    scheduleId: String(input.scheduleId || existing?.scheduleId || '').trim(),
    learningData: {
      recentLessons: toNumber(input.recentLessons, 3, 1, 100),
      submittedAssignments,
      totalAssignments,
      codeCorrectRate: toNumber(input.codeCorrectRate, 100, 0, 100),
      studyHours: toNumber(input.studyHours, 0, 0, 10000),
    },
    viewedAt: existing?.viewedAt || null,
    seatLocked: Boolean(existing?.seatLocked),
    seatLockedAt: existing?.seatLockedAt || null,
    selectedClassTime: existing?.selectedClassTime || null,
  };
}

function ownerConflict(studentId) {
  const error = new Error(`学生 ID ${studentId} 已归属其他教师，无法导入`);
  error.code = 'STUDENT_OWNER_CONFLICT';
  return error;
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapTeacher(row) {
  if (!row) return null;
  return {
    teacherId: row.teacherId,
    account: row.account,
    displayName: row.displayName,
    passwordSalt: row.passwordSalt,
    passwordHash: row.passwordHash,
    active: Boolean(row.active),
  };
}

function mapStudent(row) {
  if (!row) return null;
  return {
    studentId: row.studentId,
    teacherId: row.teacherId,
    reportCode: row.reportCode,
    name: row.name,
    level: row.level || '',
    scheduleId: row.scheduleId || '',
    learningData: parseJson(row.learningData, {}),
    viewedAt: toIso(row.viewedAt),
    seatLocked: Boolean(row.seatLocked),
    seatLockedAt: toIso(row.seatLockedAt),
    selectedClassTime: parseJson(row.selectedClassTime),
  };
}

async function ensureJsonFile(file, initialValue = []) {
  try {
    await readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(initialValue, null, 2)}\n`, 'utf8');
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function createJsonStore() {
  let mutationQueue = Promise.resolve();
  const mutate = (operation) => {
    const result = mutationQueue.then(operation);
    mutationQueue = result.catch(() => undefined);
    return result;
  };

  return {
    backend: 'json',
    async initialize() {
      await Promise.all([
        ensureJsonFile(studentsFile),
        ensureJsonFile(teachersFile),
        ensureJsonFile(auditFile),
        ensureJsonFile(importsFile),
      ]);
      await mutate(async () => {
        const students = await readJson(studentsFile);
        let changed = false;
        for (const student of students) {
          if (!student.reportCode) {
            student.reportCode = generateReportCode();
            changed = true;
          }
        }
        if (changed) await writeJson(studentsFile, students);
      });
    },
    async close() {},
    async getTeacherByAccount(account) {
      return (await readJson(teachersFile)).find((teacher) => teacher.account.toLowerCase() === account.toLowerCase()) || null;
    },
    async getTeacherById(teacherId) {
      return (await readJson(teachersFile)).find((teacher) => teacher.teacherId === teacherId) || null;
    },
    async listTeachers() {
      return (await readJson(teachersFile)).map(({ passwordHash: _hash, passwordSalt: _salt, ...teacher }) => teacher);
    },
    async createTeacher(teacher) {
      return mutate(async () => {
        const teachers = await readJson(teachersFile);
        if (teachers.some((item) => item.account.toLowerCase() === teacher.account.toLowerCase())) throw new Error('教师账号已存在');
        teachers.push({ ...teacher, active: true });
        await writeJson(teachersFile, teachers);
        return teacher;
      });
    },
    async setTeacherActive(account, active) {
      return mutate(async () => {
        const teachers = await readJson(teachersFile);
        const teacher = teachers.find((item) => item.account.toLowerCase() === account.toLowerCase());
        if (!teacher) throw new Error('未找到教师账号');
        teacher.active = active;
        await writeJson(teachersFile, teachers);
        return teacher;
      });
    },
    async updateTeacherPassword(teacherId, passwordSalt, passwordHash) {
      return mutate(async () => {
        const teachers = await readJson(teachersFile);
        const teacher = teachers.find((item) => item.teacherId === teacherId);
        if (!teacher) throw new Error('未找到教师账号');
        teacher.passwordSalt = passwordSalt;
        teacher.passwordHash = passwordHash;
        await writeJson(teachersFile, teachers);
      });
    },
    async listStudentsByTeacher(teacherId) {
      return (await readJson(studentsFile)).filter((student) => student.teacherId === teacherId);
    },
    async getStudentByAccess(accessKey, allowLegacyId) {
      const normalized = String(accessKey || '').trim();
      return (await readJson(studentsFile)).find((student) => (
        student.reportCode === normalized || (allowLegacyId && student.studentId === normalized.toUpperCase())
      )) || null;
    },
    async getStudentById(studentId) {
      return (await readJson(studentsFile)).find((student) => student.studentId === studentId) || null;
    },
    async markStudentViewed(studentId) {
      return mutate(async () => {
        const students = await readJson(studentsFile);
        const student = students.find((item) => item.studentId === studentId);
        if (!student) return null;
        student.viewedAt = new Date().toISOString();
        await writeJson(studentsFile, students);
        return student;
      });
    },
    async lockStudentSeat(studentId, selection) {
      return mutate(async () => {
        const students = await readJson(studentsFile);
        const student = students.find((item) => item.studentId === studentId);
        if (!student) return null;
        student.seatLocked = true;
        student.seatLockedAt = new Date().toISOString();
        student.selectedClassTime = selection;
        await writeJson(studentsFile, students);
        return student;
      });
    },
    async importStudents(teacherId, inputs, fileName = '') {
      return mutate(async () => {
        const students = await readJson(studentsFile);
        const byId = new Map(students.map((student) => [student.studentId, student]));
        const importedIds = new Set();
        for (const input of inputs) {
          const normalizedId = String(input.studentId || '').trim().toUpperCase();
          const existing = byId.get(normalizedId);
          if (existing && existing.teacherId !== teacherId) throw ownerConflict(normalizedId);
          const normalized = normalizeStudent(input, existing, teacherId);
          byId.set(normalized.studentId, normalized);
          importedIds.add(normalized.studentId);
        }
        const allStudents = Array.from(byId.values());
        await writeJson(studentsFile, allStudents);
        const teacherStudents = allStudents.filter((student) => student.teacherId === teacherId);
        const batches = await readJson(importsFile);
        batches.unshift({
          batchId: `B-${randomBytes(6).toString('hex')}`,
          teacherId,
          fileName,
          importedCount: importedIds.size,
          totalStudents: teacherStudents.length,
          createdAt: new Date().toISOString(),
        });
        await writeJson(importsFile, batches.slice(0, 5000));
        return { imported: importedIds.size, total: teacherStudents.length, students: teacherStudents };
      });
    },
    async listImportBatches(teacherId, limit = 10) {
      return (await readJson(importsFile)).filter((batch) => batch.teacherId === teacherId).slice(0, limit);
    },
    async addAuditLog(entry) {
      return mutate(async () => {
        const logs = await readJson(auditFile);
        logs.unshift({ auditId: `A-${randomBytes(8).toString('hex')}`, ...entry, createdAt: new Date().toISOString() });
        await writeJson(auditFile, logs.slice(0, 20000));
      });
    },
    async listAuditLogs(teacherId, limit = 20) {
      return (await readJson(auditFile)).filter((log) => log.teacherId === teacherId).slice(0, limit);
    },
    async importSnapshot() {
      throw new Error('Snapshot migration is only available when DATA_BACKEND=mysql');
    },
  };
}

function mysqlStudentSelect() {
  return `SELECT student_id AS studentId, teacher_id AS teacherId, report_code AS reportCode,
    name, level, schedule_id AS scheduleId, learning_data AS learningData,
    viewed_at AS viewedAt, seat_locked AS seatLocked, seat_locked_at AS seatLockedAt,
    selected_class_time AS selectedClassTime FROM students`;
}

async function createMysqlStore() {
  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`MySQL configuration missing: ${missing.join(', ')}`);

  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 8),
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    multipleStatements: true,
    ssl: process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    } : undefined,
  });

  const store = {
    backend: 'mysql',
    async initialize() {
      await pool.query('SELECT 1');
      if (process.env.DB_AUTO_MIGRATE === 'true') {
        const schema = await readFile(path.join(projectDirectory, 'sql', 'schema.sql'), 'utf8');
        await pool.query(schema);
      }
    },
    async close() {
      await pool.end();
    },
    async getTeacherByAccount(account) {
      const [rows] = await pool.execute(`SELECT teacher_id AS teacherId, account, display_name AS displayName,
        password_salt AS passwordSalt, password_hash AS passwordHash, active FROM teachers WHERE LOWER(account) = LOWER(?) LIMIT 1`, [account]);
      return mapTeacher(rows[0]);
    },
    async getTeacherById(teacherId) {
      const [rows] = await pool.execute(`SELECT teacher_id AS teacherId, account, display_name AS displayName,
        password_salt AS passwordSalt, password_hash AS passwordHash, active FROM teachers WHERE teacher_id = ? LIMIT 1`, [teacherId]);
      return mapTeacher(rows[0]);
    },
    async listTeachers() {
      const [rows] = await pool.query('SELECT teacher_id AS teacherId, account, display_name AS displayName, active, created_at AS createdAt FROM teachers ORDER BY created_at');
      return rows.map((row) => ({ ...row, active: Boolean(row.active), createdAt: toIso(row.createdAt) }));
    },
    async createTeacher(teacher) {
      await pool.execute(`INSERT INTO teachers (teacher_id, account, display_name, password_salt, password_hash, active)
        VALUES (?, ?, ?, ?, ?, TRUE)`, [teacher.teacherId, teacher.account, teacher.displayName, teacher.passwordSalt, teacher.passwordHash]);
      return teacher;
    },
    async setTeacherActive(account, active) {
      const [result] = await pool.execute('UPDATE teachers SET active = ? WHERE LOWER(account) = LOWER(?)', [active, account]);
      if (!result.affectedRows) throw new Error('未找到教师账号');
      return this.getTeacherByAccount(account);
    },
    async updateTeacherPassword(teacherId, passwordSalt, passwordHash) {
      const [result] = await pool.execute('UPDATE teachers SET password_salt = ?, password_hash = ? WHERE teacher_id = ?', [passwordSalt, passwordHash, teacherId]);
      if (!result.affectedRows) throw new Error('未找到教师账号');
    },
    async listStudentsByTeacher(teacherId) {
      const [rows] = await pool.execute(`${mysqlStudentSelect()} WHERE teacher_id = ? ORDER BY created_at`, [teacherId]);
      return rows.map(mapStudent);
    },
    async getStudentByAccess(accessKey, allowLegacyId) {
      const [rows] = await pool.execute(`${mysqlStudentSelect()} WHERE report_code = ? OR (? = TRUE AND student_id = ?) LIMIT 1`, [accessKey, allowLegacyId, accessKey.toUpperCase()]);
      return mapStudent(rows[0]);
    },
    async getStudentById(studentId) {
      const [rows] = await pool.execute(`${mysqlStudentSelect()} WHERE student_id = ? LIMIT 1`, [studentId]);
      return mapStudent(rows[0]);
    },
    async markStudentViewed(studentId) {
      const [result] = await pool.execute('UPDATE students SET viewed_at = CURRENT_TIMESTAMP(3) WHERE student_id = ?', [studentId]);
      return result.affectedRows ? this.getStudentById(studentId) : null;
    },
    async lockStudentSeat(studentId, selection) {
      const [result] = await pool.execute(`UPDATE students SET seat_locked = TRUE, seat_locked_at = CURRENT_TIMESTAMP(3),
        selected_class_time = ? WHERE student_id = ?`, [JSON.stringify(selection), studentId]);
      return result.affectedRows ? this.getStudentById(studentId) : null;
    },
    async importStudents(teacherId, inputs, fileName = '') {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const ids = [...new Set(inputs.map((input) => String(input.studentId || '').trim().toUpperCase()).filter(Boolean))];
        const existingById = new Map();
        if (ids.length) {
          const placeholders = ids.map(() => '?').join(',');
          const [existingRows] = await connection.query(`${mysqlStudentSelect()} WHERE student_id IN (${placeholders}) FOR UPDATE`, ids);
          for (const row of existingRows) existingById.set(row.studentId, mapStudent(row));
        }

        const importedIds = new Set();
        for (const input of inputs) {
          const normalizedId = String(input.studentId || '').trim().toUpperCase();
          const existing = existingById.get(normalizedId);
          if (existing && existing.teacherId !== teacherId) throw ownerConflict(normalizedId);
          const student = normalizeStudent(input, existing, teacherId);
          await connection.execute(`INSERT INTO students
            (student_id, teacher_id, report_code, name, level, schedule_id, learning_data, viewed_at, seat_locked, seat_locked_at, selected_class_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE name = VALUES(name), level = VALUES(level), schedule_id = VALUES(schedule_id),
              learning_data = VALUES(learning_data), updated_at = CURRENT_TIMESTAMP(3)`, [
            student.studentId, student.teacherId, student.reportCode, student.name, student.level, student.scheduleId,
            JSON.stringify(student.learningData), student.viewedAt, student.seatLocked, student.seatLockedAt,
            student.selectedClassTime ? JSON.stringify(student.selectedClassTime) : null,
          ]);
          importedIds.add(student.studentId);
        }

        const [[countRow]] = await connection.execute('SELECT COUNT(*) AS total FROM students WHERE teacher_id = ?', [teacherId]);
        await connection.execute(`INSERT INTO import_batches (teacher_id, file_name, imported_count, total_students)
          VALUES (?, ?, ?, ?)`, [teacherId, fileName, importedIds.size, Number(countRow.total)]);
        await connection.commit();
        return { imported: importedIds.size, total: Number(countRow.total), students: await this.listStudentsByTeacher(teacherId) };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    async listImportBatches(teacherId, limit = 10) {
      const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));
      const [rows] = await pool.execute(`SELECT batch_id AS batchId, file_name AS fileName, imported_count AS importedCount,
        total_students AS totalStudents, created_at AS createdAt FROM import_batches WHERE teacher_id = ?
        ORDER BY created_at DESC LIMIT ${safeLimit}`, [teacherId]);
      return rows.map((row) => ({ ...row, createdAt: toIso(row.createdAt) }));
    },
    async addAuditLog(entry) {
      await pool.execute(`INSERT INTO audit_logs (teacher_id, action, target_type, target_id, metadata, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)`, [entry.teacherId || null, entry.action, entry.targetType || '', entry.targetId || '', JSON.stringify(entry.metadata || {}), entry.ipAddress || '']);
    },
    async listAuditLogs(teacherId, limit = 20) {
      const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
      const [rows] = await pool.execute(`SELECT audit_id AS auditId, action, target_type AS targetType, target_id AS targetId,
        metadata, ip_address AS ipAddress, created_at AS createdAt FROM audit_logs WHERE teacher_id = ?
        ORDER BY created_at DESC LIMIT ${safeLimit}`, [teacherId]);
      return rows.map((row) => ({ ...row, metadata: parseJson(row.metadata, {}), createdAt: toIso(row.createdAt) }));
    },
    async importSnapshot(teachers, students) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        for (const teacher of teachers) {
          await connection.execute(`INSERT INTO teachers
            (teacher_id, account, display_name, password_salt, password_hash, active)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE account = VALUES(account), display_name = VALUES(display_name),
              password_salt = VALUES(password_salt), password_hash = VALUES(password_hash), active = VALUES(active)`, [
            teacher.teacherId, teacher.account, teacher.displayName, teacher.passwordSalt, teacher.passwordHash, teacher.active !== false,
          ]);
        }
        for (const student of students) {
          await connection.execute(`INSERT INTO students
            (student_id, teacher_id, report_code, name, level, schedule_id, learning_data, viewed_at, seat_locked, seat_locked_at, selected_class_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE teacher_id = VALUES(teacher_id), report_code = VALUES(report_code), name = VALUES(name),
              level = VALUES(level), schedule_id = VALUES(schedule_id), learning_data = VALUES(learning_data),
              viewed_at = VALUES(viewed_at), seat_locked = VALUES(seat_locked), seat_locked_at = VALUES(seat_locked_at),
              selected_class_time = VALUES(selected_class_time)`, [
            student.studentId, student.teacherId, student.reportCode || generateReportCode(), student.name,
            student.level || '', student.scheduleId || '', JSON.stringify(student.learningData || {}), student.viewedAt || null,
            Boolean(student.seatLocked), student.seatLockedAt || null,
            student.selectedClassTime ? JSON.stringify(student.selectedClassTime) : null,
          ]);
        }
        await connection.commit();
        return { teachers: teachers.length, students: students.length };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
  };
  return store;
}

export async function createDataStore() {
  const backend = String(process.env.DATA_BACKEND || 'json').trim().toLowerCase();
  if (backend === 'mysql') return createMysqlStore();
  if (backend !== 'json') throw new Error(`Unsupported DATA_BACKEND: ${backend}`);
  return createJsonStore();
}

export function createTeacherId() {
  return `T-${randomBytes(6).toString('hex').toUpperCase()}`;
}
