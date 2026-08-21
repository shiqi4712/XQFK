import { useEffect, useMemo, useRef, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import Papa from 'papaparse';
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileDown,
  FileSpreadsheet,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShieldPlus,
  Trash2,
  Upload,
  UserCog,
  UserRound,
  Users,
  X,
} from 'lucide-react';

const DEFAULT_TEACHER_PASSWORD = 'bcm666';

const STUDENT_COLUMN_ALIASES = {
  studentId: ['用户id', '用户编号', '学生id', '学员id', '学生编号', 'studentid'],
  name: ['学员姓名', '学生姓名', '姓名', 'name'],
  teacherAccount: ['老师姓名', '教师姓名', '班主任姓名', '老师账号', '教师账号', '班主任账号', 'teacheraccount'],
  level: ['课程级别', '课程等级', 'level'],
  courseLine: ['课线', '所属课线', '课程线', '课程产品线', '产品线', 'courseline'],
  teamLeader: ['组长', '所属组长', '组长姓名', '团队组长', 'teamleader'],
  scheduleId: ['课表id', '排课id', 'scheduleid'],
  recentLessons: ['最近课程数', '最近课次', '课程数', 'recentlessons'],
  submittedAssignments: ['作业提交率', '作业提交数', '已提交作业', '提交作业数', '已交作业', 'submittedassignments'],
  studyHours: ['学习时长', '学习小时', 'studyhours'],
};

const TEACHER_COLUMN_ALIASES = {
  displayName: ['老师姓名', '教师姓名', '姓名', 'displayname', 'name'],
};

const ADMINISTRATOR_COLUMN_ALIASES = {
  account: ['管理员账号', '账号', 'account'],
  displayName: ['管理员姓名', '姓名', 'displayname', 'name'],
  password: ['初始密码', '管理员密码', '密码', 'password'],
};

const normalizeHeader = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[\s_：:·-]/g, '');

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function findColumn(headers, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.findIndex((header) => normalizedAliases.includes(normalizeHeader(header)));
}

function parseRows(rows, columnAliases) {
  if (!rows.length) throw new Error('表格中没有可导入的数据');
  const headers = rows[0];
  const columns = Object.fromEntries(
    Object.entries(columnAliases).map(([field, aliases]) => [field, findColumn(headers, aliases)]),
  );
  const dataRows = rows.slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((value) => String(value ?? '').trim()));
  if (!dataRows.length) throw new Error('表格中没有可导入的数据');
  return { headers, columns, dataRows };
}

function invalidRowsError(headers, failures, subject) {
  const error = new Error(`发现 ${failures.length} 行无效${subject}数据，已生成失败记录`);
  error.invalidRows = failures.map(({ row, rowNumber, reason }) => ({
    原始行号: rowNumber,
    失败原因: reason,
    ...Object.fromEntries(headers.map((header, index) => [String(header || `第${index + 1}列`), row[index] ?? ''])),
  }));
  throw error;
}

function rowsToStudents(rows, requireTeacherAccount) {
  const { headers, columns, dataRows } = parseRows(rows, STUDENT_COLUMN_ALIASES);
  const requiredAdminColumns = ['studentId', 'name', 'teacherAccount', 'courseLine', 'teamLeader', 'submittedAssignments'];
  if (requireTeacherAccount && requiredAdminColumns.some((field) => columns[field] < 0)) {
    throw new Error('表格必须包含“用户ID”“学员姓名”“老师姓名”“课线”“组长”“作业提交数”六列');
  }
  if (columns.studentId < 0 || columns.name < 0) {
    throw new Error('表格必须包含“用户ID”和“学员姓名”两列');
  }

  const failures = [];
  const students = dataRows.map(({ row, rowNumber }) => {
    const valueAt = (field) => columns[field] >= 0 ? row[columns[field]] : undefined;
    const importedAssignments = String(valueAt('submittedAssignments') ?? '').trim()
      ? toNumber(valueAt('submittedAssignments'), Number.NaN)
      : 3;
    const student = {
      studentId: String(valueAt('studentId') ?? '').trim().toUpperCase(),
      name: String(valueAt('name') ?? '').trim(),
      teacherAccount: String(valueAt('teacherAccount') ?? '').trim().toLowerCase(),
      level: String(valueAt('level') ?? '').trim(),
      scheduleId: String(valueAt('scheduleId') ?? '').trim(),
      recentLessons: toNumber(valueAt('recentLessons'), 3),
      submittedAssignments: importedAssignments === 0 ? 1 : importedAssignments,
      totalAssignments: 3,
      codeCorrectRate: 100,
      studyHours: toNumber(valueAt('studyHours'), 0),
    };
    if (columns.courseLine >= 0) student.courseLine = String(valueAt('courseLine') ?? '').trim();
    if (columns.teamLeader >= 0) student.teamLeader = String(valueAt('teamLeader') ?? '').trim();
    const assignmentInvalid = !Number.isInteger(importedAssignments) || importedAssignments < 0 || importedAssignments > 3;
    const reason = !student.studentId
      ? '缺少用户ID'
      : !student.name
        ? '缺少学员姓名'
        : requireTeacherAccount && !student.teacherAccount
          ? '缺少老师姓名'
          : assignmentInvalid
            ? '作业提交数必须是0、1、2或3'
            : '';
    if (reason) failures.push({ row, rowNumber, reason });
    return student;
  });
  if (failures.length) invalidRowsError(headers, failures, '学生');
  return students;
}

function rowsToTeachers(rows) {
  const { headers, columns, dataRows } = parseRows(rows, TEACHER_COLUMN_ALIASES);
  if (columns.displayName < 0) {
    throw new Error('表格必须包含“老师姓名”列');
  }

  const failures = [];
  const seen = new Set();
  const teachers = dataRows.map(({ row, rowNumber }) => {
    const displayName = String(row[columns.displayName] ?? '').trim();
    const account = displayName.toLowerCase();
    const duplicate = seen.has(account);
    if (account) seen.add(account);
    const reason = !displayName
      ? '缺少老师姓名'
      : !/^[\p{L}\p{N}._·-]{2,40}$/u.test(account)
        ? '老师姓名需为2-40位文字、字母或数字，可包含点、横线或下划线'
        : duplicate
          ? '表格中老师姓名重复'
          : '';
    if (reason) failures.push({ row, rowNumber, reason });
    return { account, displayName };
  });
  if (failures.length) invalidRowsError(headers, failures, '老师账号');
  return teachers;
}

function rowsToAdministrators(rows) {
  const { headers, columns, dataRows } = parseRows(rows, ADMINISTRATOR_COLUMN_ALIASES);
  if (columns.account < 0 || columns.displayName < 0 || columns.password < 0) {
    throw new Error('表格必须包含“管理员账号”“管理员姓名”“初始密码”三列');
  }

  const failures = [];
  const seen = new Set();
  const administrators = dataRows.map(({ row, rowNumber }) => {
    const account = String(row[columns.account] ?? '').trim().toLowerCase();
    const displayName = String(row[columns.displayName] ?? '').trim();
    const password = String(row[columns.password] ?? '');
    const duplicate = seen.has(account);
    if (account) seen.add(account);
    const reason = !account
      ? '缺少管理员账号'
      : !/^[a-z0-9._-]{3,40}$/.test(account)
        ? '账号仅支持3-40位小写字母、数字、点、横线或下划线'
        : !displayName
          ? '缺少管理员姓名'
          : password.length < 10
            ? '初始密码至少需要10位'
            : duplicate
              ? '表格中账号重复'
              : '';
    if (reason) failures.push({ row, rowNumber, reason });
    return { account, displayName, password };
  });
  if (failures.length) invalidRowsError(headers, failures, '管理员账号');
  return administrators;
}

async function readSpreadsheet(file) {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const result = Papa.parse(await file.text(), { skipEmptyLines: 'greedy' });
    if (result.errors.length) throw new Error(`CSV 解析失败：${result.errors[0].message}`);
    return result.data;
  }
  return readXlsxFile(file);
}

function formatDate(value) {
  if (!value) return '尚未发生';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function downloadCsvFile(rows, fileName) {
  const csv = `\uFEFF${Papa.unparse(rows, { newline: '\r\n' })}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function StatusCell({ active, activeLabel, inactiveLabel, timestamp }) {
  return (
    <div className={`admin-status ${active ? 'is-active' : ''}`}>
      <strong>{active ? activeLabel : inactiveLabel}</strong>
      <span>{active ? formatDate(timestamp) : '尚未发生'}</span>
    </div>
  );
}

function AdminLogin({ onLogin }) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '登录失败');
      onLogin(result.teacher);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="admin-login-shell">
      <section className="admin-login-panel">
        <div className="admin-login-copy">
          <span><ShieldCheck size={22} /></span>
          <p>CODEMAO OPERATIONS</p>
          <h1>学习计划<br />管理后台</h1>
          <strong>管理员与老师统一入口</strong>
        </div>
        <form className="admin-login-form" onSubmit={submit}>
          <div><p>安全登录</p><h2>进入工作台</h2></div>
          <label>
            <span>账号</span>
            <div><UserRound size={17} /><input value={account} onChange={(event) => setAccount(event.target.value)} autoComplete="username" required /></div>
          </label>
          <label>
            <span>登录密码</span>
            <div><KeyRound size={17} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></div>
          </label>
          {error && <p className="admin-login-error" role="alert">{error}</p>}
          <button type="submit" disabled={pending}>{pending ? '正在验证' : '登录管理后台'}</button>
          <small>系统会根据账号角色自动进入对应工作台</small>
        </form>
      </section>
    </main>
  );
}

function ModalShell({ title, eyebrow, icon: Icon, onClose, children, className = '' }) {
  useEffect(() => {
    const closeOnEscape = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="admin-dialog-backdrop" onClick={onClose}>
      <section className={`admin-form-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="admin-dialog-close" onClick={onClose} aria-label="关闭" title="关闭"><X size={17} /></button>
        <header className="admin-dialog-heading">
          <span><Icon size={19} /></span>
          <div><p>{eyebrow}</p><h2 id="admin-dialog-title">{title}</h2></div>
        </header>
        {children}
      </section>
    </div>
  );
}

function ChangePasswordDialog({ onClose, onChanged }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) return setError('两次输入的新密码不一致');
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '密码修改失败');
      onChanged();
    } catch (passwordError) {
      setError(passwordError.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <ModalShell title="修改登录密码" eyebrow="ACCOUNT SECURITY" icon={KeyRound} onClose={onClose}>
      <form className="admin-dialog-form" onSubmit={submit}>
        <label><span>当前密码</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
        <label><span>新密码</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={10} required /></label>
        <label><span>再次输入新密码</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={10} required /></label>
        {error && <p className="admin-login-error" role="alert">{error}</p>}
        <button type="submit" className="admin-dialog-submit" disabled={pending}>{pending ? '正在修改' : '确认修改密码'}</button>
      </form>
    </ModalShell>
  );
}

function AdministratorDialog({ onClose, onSaved }) {
  const [account, setAccount] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirmPassword) return setError('两次输入的初始密码不一致');
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/admin/administrators/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ administrators: [{ account, displayName, password }] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '管理员账号创建失败');
      onSaved(displayName);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <ModalShell title="新增管理员账号" eyebrow="ADMINISTRATOR ACCESS" icon={ShieldPlus} onClose={onClose}>
      <form className="admin-dialog-form" onSubmit={submit}>
        <label><span>管理员账号</span><input value={account} onChange={(event) => setAccount(event.target.value.toLowerCase())} pattern="[a-z0-9._-]{3,40}" placeholder="仅限小写字母、数字及 . _ -" autoComplete="off" required /></label>
        <label><span>管理员姓名</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="请输入姓名" autoComplete="off" required /></label>
        <label><span>初始密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} autoComplete="new-password" required /></label>
        <label><span>确认初始密码</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={10} autoComplete="new-password" required /></label>
        <p className="admin-dialog-hint">管理员可查看全部学生并管理其他账号。初始密码至少 10 位，请通过安全渠道交付。</p>
        {error && <p className="admin-login-error" role="alert">{error}</p>}
        <button type="submit" className="admin-dialog-submit" disabled={pending}>{pending ? '正在创建' : '创建管理员'}</button>
      </form>
    </ModalShell>
  );
}

function StudentDialog({ session, teachers, onClose, onSaved }) {
  const isAdmin = session.role === 'admin';
  const availableTeachers = teachers.filter((teacher) => teacher.role === 'teacher' && teacher.active);
  const [form, setForm] = useState({
    studentId: '',
    name: '',
    teacherAccount: isAdmin ? (availableTeachers[0]?.account || '') : session.account,
    level: '',
    courseLine: '',
    teamLeader: '',
    scheduleId: '',
    recentLessons: 3,
    submittedAssignments: 3,
    studyHours: '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const payload = {
        ...form,
        studentId: form.studentId.trim().toUpperCase(),
        name: form.name.trim(),
        teacherAccount: form.teacherAccount.trim().toLowerCase(),
        recentLessons: toNumber(form.recentLessons, 3),
        submittedAssignments: Number(form.submittedAssignments) === 0 ? 1 : Number(form.submittedAssignments),
        totalAssignments: 3,
        codeCorrectRate: 100,
        studyHours: toNumber(form.studyHours, 0),
      };
      const response = await fetch('/api/admin/students/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: [payload], fileName: '后台单个新增' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '学生保存失败');
      onSaved(payload.name);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <ModalShell title="单个新增学生" eyebrow={isAdmin ? 'ASSIGN STUDENT' : 'MY STUDENT'} icon={Plus} onClose={onClose} className="admin-form-dialog--wide">
      <form className="admin-dialog-form admin-dialog-form--grid" onSubmit={submit}>
        <label><span>学生 ID *</span><input value={form.studentId} onChange={update('studentId')} placeholder="例如 STU0004" required /></label>
        <label><span>学员姓名 *</span><input value={form.name} onChange={update('name')} placeholder="请输入姓名" required /></label>
        {isAdmin && (
          <label><span>归属老师 *</span><select value={form.teacherAccount} onChange={update('teacherAccount')} required><option value="">请选择老师</option>{availableTeachers.map((teacher) => <option key={teacher.teacherId} value={teacher.account}>{teacher.displayName} · {teacher.account}</option>)}</select></label>
        )}
        <label><span>课程级别</span><input value={form.level} onChange={update('level')} placeholder="例如 图形化一级" /></label>
        <label><span>课线</span><input value={form.courseLine} onChange={update('courseLine')} placeholder="请输入课线" /></label>
        <label><span>组长</span><input value={form.teamLeader} onChange={update('teamLeader')} placeholder="请输入组长姓名" /></label>
        <label><span>课表 ID</span><input value={form.scheduleId} onChange={update('scheduleId')} placeholder="选填" /></label>
        <label><span>最近课程数</span><input type="number" min="1" max="100" value={form.recentLessons} onChange={update('recentLessons')} /></label>
        <label><span>作业提交数（分母为 3）</span><select value={form.submittedAssignments} onChange={update('submittedAssignments')}><option value="3">3 次 · 100%</option><option value="2">2 次 · 67%</option><option value="1">1 次 · 33%</option><option value="0">0 次 · 按 33% 展示</option></select></label>
        <label><span>学习时长（小时）</span><input type="number" min="0" step="0.1" value={form.studyHours} onChange={update('studyHours')} placeholder="0" /></label>
        <p className="admin-dialog-hint">代码正确率固定为 100%，无需录入。学生访问码由系统自动生成。</p>
        {error && <p className="admin-login-error admin-dialog-error" role="alert">{error}</p>}
        <button type="submit" className="admin-dialog-submit" disabled={pending}>{pending ? '正在保存' : '保存学生'}</button>
      </form>
    </ModalShell>
  );
}

function TeacherWorkspace({ teachers, loading, selectedIds, onSelectionChange, onImport, onImportAdministrators, onAddAdministrator, onDelete, onResetPassword, onToggleActive, onRefresh, message }) {
  const teacherInputRef = useRef(null);
  const administratorInputRef = useRef(null);
  const regularTeachers = teachers.filter((teacher) => teacher.role === 'teacher');
  const allSelected = regularTeachers.length > 0 && regularTeachers.every((teacher) => selectedIds.includes(teacher.teacherId));

  return (
    <section className="admin-workspace" aria-labelledby="teacher-management-title">
      <header className="admin-toolbar">
        <div><p>ACCOUNT DIRECTORY</p><h2 id="teacher-management-title">账号与权限管理</h2></div>
        <div className="admin-toolbar__actions">
          <button type="button" className="admin-icon-button" onClick={onRefresh} aria-label="刷新账号" title="刷新账号"><RefreshCw size={17} /></button>
          <button type="button" className="admin-download-button" onClick={() => downloadCsvFile([{ 老师姓名: '陈老师' }], '老师名单导入模板.csv')}><FileDown size={17} /><span>老师模板</span></button>
          <button type="button" className="admin-import-button" onClick={() => teacherInputRef.current?.click()}><Upload size={17} /><span>导入老师</span></button>
          <button type="button" className="admin-download-button" onClick={() => downloadCsvFile([{ 管理员账号: 'admin02', 管理员姓名: '运营管理员', 初始密码: '请替换为至少10位密码' }], '管理员账号导入模板.csv')}><FileDown size={17} /><span>管理员模板</span></button>
          <button type="button" className="admin-add-button" onClick={onAddAdministrator}><ShieldPlus size={17} /><span>新增管理员</span></button>
          <button type="button" className="admin-admin-import-button" onClick={() => administratorInputRef.current?.click()}><Upload size={17} /><span>导入管理员</span></button>
          <input ref={teacherInputRef} type="file" accept=".xlsx,.csv" onChange={onImport} hidden />
          <input ref={administratorInputRef} type="file" accept=".xlsx,.csv" onChange={onImportAdministrators} hidden />
        </div>
      </header>
      <div className="admin-import-note admin-import-note--password"><KeyRound size={16} /><p>老师姓名同时作为登录账号，默认密码为 <strong>{DEFAULT_TEACHER_PASSWORD}</strong>；管理员导入表必须提供至少 10 位初始密码。</p></div>
      {message && <MessageBar message={message} />}
      <div className="admin-bulkbar">
        <label><input type="checkbox" checked={allSelected} onChange={(event) => onSelectionChange(event.target.checked ? regularTeachers.map((teacher) => teacher.teacherId) : [])} /><span>全选普通老师</span></label>
        <span>已选择 {selectedIds.length} 个账号</span>
        <button type="button" className="admin-danger-button" onClick={onDelete} disabled={!selectedIds.length}><Trash2 size={15} />批量删除</button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table admin-teacher-table">
          <thead><tr><th aria-label="选择" /><th>账号与角色</th><th>学生数据</th><th>账号状态</th><th>账号操作</th></tr></thead>
          <tbody>
            {!loading && teachers.map((teacher) => (
              <tr key={teacher.teacherId}>
                <td>{teacher.role === 'teacher' && <input type="checkbox" aria-label={`选择${teacher.displayName}`} checked={selectedIds.includes(teacher.teacherId)} onChange={(event) => onSelectionChange(event.target.checked ? [...selectedIds, teacher.teacherId] : selectedIds.filter((id) => id !== teacher.teacherId))} />}</td>
                <td><strong>{teacher.displayName}</strong><span>{teacher.account}</span><small>{teacher.role === 'admin' ? '系统管理员' : teacher.teacherId}</small></td>
                <td><strong>{teacher.studentCount ?? 0} 名学生</strong><span>{teacher.viewedCount ?? 0} 名家长已查看</span></td>
                <td><span className={`admin-account-state ${teacher.active ? 'is-active' : ''}`}>{teacher.active ? '正常使用' : '已停用'}</span></td>
                <td>
                  {teacher.role === 'admin' ? <span className="admin-protected-label"><ShieldCheck size={14} />受保护</span> : (
                    <div className="admin-row-actions">
                      <button type="button" onClick={() => onResetPassword(teacher)} title="重置为默认密码"><KeyRound size={14} /><span>重置密码</span></button>
                      <button type="button" onClick={() => onToggleActive(teacher)} title={teacher.active ? '停用账号' : '启用账号'}>{teacher.active ? <Ban size={14} /> : <BadgeCheck size={14} />}<span>{teacher.active ? '停用' : '启用'}</span></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="admin-table-state">正在读取老师账号...</div>}
        {!loading && !teachers.length && <div className="admin-table-state">暂无老师账号</div>}
      </div>
    </section>
  );
}

function MessageBar({ message }) {
  return (
    <div className={`admin-message admin-message--${message.type}`} role="status">
      {message.type === 'success' && <CheckCircle2 size={16} />}
      <span>{message.text}</span>
    </div>
  );
}

function StudentWorkspace({ session, students, teachers, importBatches, loading, importing, downloading, message, query, setQuery, statusFilter, setStatusFilter, onImport, onDownload, onRefresh, onAddStudent, onCopyCode }) {
  const isAdmin = session.role === 'admin';
  const inputRef = useRef(null);
  const teacherById = useMemo(() => new Map(teachers.map((teacher) => [teacher.teacherId, teacher])), [teachers]);
  const visibleStudents = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return students.filter((student) => {
      const owner = teacherById.get(student.teacherId);
      const matchesKeyword = !keyword || [student.name, student.studentId, student.reportCode, student.level, student.courseLine, student.teamLeader, owner?.displayName, owner?.account]
        .some((value) => String(value || '').toLowerCase().includes(keyword));
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'unviewed' && !student.viewedAt)
        || (statusFilter === 'viewed' && Boolean(student.viewedAt))
        || (statusFilter === 'locked' && student.seatLocked)
        || (statusFilter === 'unlocked' && !student.seatLocked);
      return matchesKeyword && matchesStatus;
    });
  }, [students, teacherById, query, statusFilter]);

  return (
    <section className="admin-workspace" aria-labelledby="student-management-title">
      <header className="admin-toolbar">
        <div><p>{isAdmin ? 'ALL STUDENTS' : 'MY STUDENTS'}</p><h2 id="student-management-title">{isAdmin ? '学生名单与访问数据' : '我的学生与跟进状态'}</h2></div>
        <div className="admin-toolbar__actions">
          <button type="button" className="admin-icon-button" onClick={onRefresh} aria-label="刷新学生数据" title="刷新学生数据"><RefreshCw size={17} /></button>
          <button type="button" className="admin-download-button" onClick={onDownload} disabled={downloading || loading}><Download size={17} /><span>{downloading ? '正在生成' : '下载数据'}</span></button>
          {isAdmin && <button type="button" className="admin-download-button" onClick={() => downloadCsvFile([{ 用户ID: 'STU0004', 学员姓名: '示例学生', 老师姓名: '陈老师', 课线: '图形化编程', 组长: '张组长', 作业提交数: 3 }], '学生名单导入模板.csv')}><FileDown size={17} /><span>下载模板</span></button>}
          {isAdmin && <button type="button" className="admin-import-button" onClick={() => inputRef.current?.click()} disabled={importing}><Upload size={17} /><span>{importing ? '正在导入' : '批量导入学生'}</span></button>}
          <button type="button" className="admin-add-button" onClick={onAddStudent}><Plus size={17} /><span>单个新增</span></button>
          <input ref={inputRef} type="file" accept=".xlsx,.csv" onChange={onImport} hidden />
        </div>
      </header>
      <div className="admin-import-note"><FileSpreadsheet size={16} /><p>{isAdmin ? '学生表需包含用户ID、学员姓名、老师姓名、课线、组长和作业提交数。' : `新增学生会自动归属 ${session.displayName}，您只能查看和维护自己的学生。`} 作业提交数填 0、1、2 或 3；填 0 时按 33% 展示，代码正确率固定为 100%。</p></div>
      {importBatches.length > 0 && <div className="admin-import-history" aria-label="最近导入记录"><strong>最近导入</strong>{importBatches.slice(0, 3).map((batch) => <span key={batch.batchId}>{batch.fileName || '未命名表格'} · {batch.importedCount} 条 · {formatDate(batch.createdAt)}</span>)}</div>}
      {message && <MessageBar message={message} />}
      <div className="admin-filterbar">
        <label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isAdmin ? '搜索学生、老师、课线或组长' : '搜索姓名、学生 ID、课线或组长'} aria-label="搜索学生" /></label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="筛选学生状态"><option value="all">全部状态</option><option value="unviewed">家长未查看</option><option value="viewed">家长已查看</option><option value="unlocked">学位未锁定</option><option value="locked">学位已锁定</option></select>
        <span>显示 {visibleStudents.length}/{students.length} 名</span>
      </div>
      <div className="admin-table-wrap">
        <table className={`admin-table admin-student-table ${isAdmin ? 'is-admin' : ''}`}>
          <thead><tr>{isAdmin && <th>课线</th>}<th>学员</th>{isAdmin && <th>归属老师</th>}{isAdmin && <th>组长</th>}<th>学习数据</th><th>家长访问</th><th>学位状态</th></tr></thead>
          <tbody>
            {!loading && visibleStudents.map((student) => {
              const owner = teacherById.get(student.teacherId);
              return (
                <tr key={student.studentId}>
                  {isAdmin && <td className={`admin-structure-cell ${student.courseLine ? '' : 'is-empty'}`}><strong>{student.courseLine || '未填写'}</strong></td>}
                  <td><strong>{student.name}</strong><span>{student.studentId}</span><button type="button" className="admin-report-code" onClick={() => onCopyCode(student.reportCode)} title="复制报告访问码"><code>{student.reportCode}</code><Copy size={11} /></button><small>{student.level || '未设置课程级别'}</small></td>
                  {isAdmin && <td><strong>{owner?.displayName || '未知老师'}</strong><span>{owner?.account || student.teacherId}</span></td>}
                  {isAdmin && <td className={`admin-structure-cell ${student.teamLeader ? '' : 'is-empty'}`}><strong>{student.teamLeader || '未填写'}</strong></td>}
                  <td><strong>{student.learningData.submittedAssignments}/3 次作业</strong><span>代码 100% · {student.learningData.studyHours} 小时</span></td>
                  <td><StatusCell active={Boolean(student.viewedAt)} activeLabel="已查看" inactiveLabel="未查看" timestamp={student.viewedAt} /></td>
                  <td><StatusCell active={student.seatLocked} activeLabel="已锁定" inactiveLabel="未锁定" timestamp={student.seatLockedAt} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && <div className="admin-table-state">正在读取学生数据...</div>}
        {!loading && !students.length && <div className="admin-table-state">暂无学生数据</div>}
        {!loading && students.length > 0 && !visibleStudents.length && <div className="admin-table-state">没有符合当前条件的学生</div>}
      </div>
    </section>
  );
}

export default function AdminView() {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [importBatches, setImportBatches] = useState([]);
  const [activeTab, setActiveTab] = useState('teachers');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [administratorDialogOpen, setAdministratorDialogOpen] = useState(false);
  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const isAdmin = session?.role === 'admin';

  const clearSession = () => {
    setSession(null);
    setStudents([]);
    setTeachers([]);
    setImportBatches([]);
    setMessage(null);
  };

  const loadData = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const requests = [fetch('/api/admin/students'), fetch('/api/admin/import-batches')];
      if (isAdmin) requests.push(fetch('/api/admin/teachers'));
      const responses = await Promise.all(requests);
      if (responses.some((response) => response.status === 401)) return clearSession();
      const data = await Promise.all(responses.map((response) => response.json()));
      const failed = responses.findIndex((response) => !response.ok);
      if (failed >= 0) throw new Error(data[failed].message || '后台数据读取失败');
      setStudents(data[0].students);
      setImportBatches(data[1].batches);
      if (isAdmin) setTeachers(data[2].teachers);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const response = await fetch('/api/admin/session');
        if (!response.ok) return;
        const result = await response.json();
        setSession(result.teacher);
        setActiveTab(result.teacher.role === 'admin' ? 'teachers' : 'students');
      } finally {
        setSessionLoading(false);
      }
    };
    restoreSession();
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session]);

  const statistics = useMemo(() => ({
    accounts: teachers.length,
    teachers: teachers.filter((teacher) => teacher.role === 'teacher').length,
    administrators: teachers.filter((teacher) => teacher.role === 'admin').length,
    total: students.length,
    viewed: students.filter((student) => student.viewedAt).length,
    locked: students.filter((student) => student.seatLocked).length,
    viewedRate: students.length ? Math.round((students.filter((student) => student.viewedAt).length / students.length) * 100) : 0,
    lockedRate: students.length ? Math.round((students.filter((student) => student.seatLocked).length / students.length) * 100) : 0,
  }), [students, teachers]);

  const importStudents = async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    setMessage(null);
    try {
      const importedStudents = rowsToStudents(await readSpreadsheet(file), isAdmin);
      const response = await fetch('/api/admin/students/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ students: importedStudents, fileName: file.name }) });
      const result = await response.json();
      if (response.status === 401) return clearSession();
      if (!response.ok) throw new Error(result.message || '学生批量导入失败');
      await loadData({ quiet: true });
      setMessage({ type: 'success', text: `已成功导入 ${result.imported} 名学生。` });
    } catch (error) {
      if (error.invalidRows) downloadCsvFile(error.invalidRows, '学生导入失败记录.csv');
      setMessage({ type: 'error', text: error.message });
    } finally {
      setImporting(false);
    }
  };

  const importTeachers = async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    setMessage(null);
    try {
      const importedTeachers = rowsToTeachers(await readSpreadsheet(file));
      const response = await fetch('/api/admin/teachers/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teachers: importedTeachers }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '老师账号导入失败');
      await loadData({ quiet: true });
      setMessage({ type: 'success', text: `已创建 ${result.imported} 个老师账号，默认密码为 ${result.defaultPassword}。` });
    } catch (error) {
      if (error.invalidRows) downloadCsvFile(error.invalidRows, '老师账号导入失败记录.csv');
      setMessage({ type: 'error', text: error.message });
    }
  };

  const importAdministrators = async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    setMessage(null);
    try {
      const administrators = rowsToAdministrators(await readSpreadsheet(file));
      const response = await fetch('/api/admin/administrators/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ administrators }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '管理员账号导入失败');
      await loadData({ quiet: true });
      setMessage({ type: 'success', text: `已创建 ${result.imported} 个管理员账号。` });
    } catch (error) {
      if (error.invalidRows) downloadCsvFile(error.invalidRows, '管理员账号导入失败记录.csv');
      setMessage({ type: 'error', text: error.message });
    }
  };

  const deleteTeachers = async () => {
    if (!selectedTeacherIds.length || !window.confirm(`确认删除已选择的 ${selectedTeacherIds.length} 个老师账号？已有学生的老师不能删除。`)) return;
    try {
      const response = await fetch('/api/admin/teachers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacherIds: selectedTeacherIds }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '老师账号删除失败');
      setSelectedTeacherIds([]);
      await loadData({ quiet: true });
      setMessage({ type: 'success', text: `已删除 ${result.deleted} 个老师账号。` });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const resetTeacherPassword = async (teacher) => {
    if (!window.confirm(`确认将 ${teacher.displayName} 的密码重置为 ${DEFAULT_TEACHER_PASSWORD}？`)) return;
    try {
      const response = await fetch(`/api/admin/teachers/${teacher.teacherId}/reset-password`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '密码重置失败');
      setMessage({ type: 'success', text: `${teacher.displayName} 的密码已重置为 ${result.defaultPassword}。` });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const toggleTeacherActive = async (teacher) => {
    try {
      const response = await fetch(`/api/admin/teachers/${teacher.teacherId}/active`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !teacher.active }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '账号状态修改失败');
      await loadData({ quiet: true });
      setMessage({ type: 'success', text: `${teacher.displayName} 已${teacher.active ? '停用' : '启用'}。` });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const downloadStudents = async () => {
    setDownloading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/students/export.csv');
      if (response.status === 401) return clearSession();
      if (!response.ok) throw new Error((await response.json()).message || '学生数据下载失败');
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || 'students.csv';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: `已下载 ${students.length} 名学生的数据。` });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setDownloading(false);
    }
  };

  const copyReportCode = async (reportCode) => {
    try {
      await navigator.clipboard.writeText(reportCode);
      setMessage({ type: 'success', text: `报告访问码 ${reportCode} 已复制。` });
    } catch {
      setMessage({ type: 'error', text: '无法自动复制，请手动选择访问码。' });
    }
  };

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => undefined);
    clearSession();
  };

  if (sessionLoading) return <main className="admin-session-loading"><ShieldCheck size={24} /><p>正在验证管理身份...</p></main>;
  if (!session) return <AdminLogin onLogin={(teacher) => { setSession(teacher); setActiveTab(teacher.role === 'admin' ? 'teachers' : 'students'); }} />;

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><p>{isAdmin ? 'SYSTEM ADMINISTRATION' : 'TEACHER WORKSPACE'}</p><h1>{isAdmin ? '英才学习计划管理员后台' : '我的学生管理后台'}</h1><span>{isAdmin ? '统一管理老师账号、学生名单与家长访问数据' : '仅展示归属于您的学生数据，可单个新增学生'}</span></div>
        <div className="admin-account">
          <div><span>{isAdmin ? <ShieldCheck size={15} /> : <UserRound size={15} />}</span><p><strong>{session.displayName}</strong><small>{isAdmin ? '系统管理员' : '授课老师'} · {session.account}</small></p></div>
          <button type="button" onClick={() => setPasswordDialogOpen(true)} title="修改密码"><Settings2 size={16} /><span>改密</span></button>
          <button type="button" onClick={logout} title="退出管理后台"><LogOut size={16} /><span>退出</span></button>
          <a href="/">学生端</a>
        </div>
      </header>

      <section className="admin-content">
        <div className={`admin-stats ${isAdmin ? 'admin-stats--four' : ''}`} aria-label="状态概览">
          {isAdmin && <article><span><UserCog size={18} /></span><div><strong>{statistics.accounts}</strong><p>{statistics.teachers} 老师 · {statistics.administrators} 管理员</p></div></article>}
          <article><span><Users size={18} /></span><div><strong>{statistics.total}</strong><p>{isAdmin ? '全部学生' : '我的学生'}</p></div></article>
          <article><span><Eye size={18} /></span><div><strong>{isAdmin ? <>{statistics.viewedRate}<small>%</small></> : statistics.viewed}</strong><p>{isAdmin ? `查看率 · ${statistics.viewed}/${statistics.total}` : '家长已查看'}</p></div></article>
          <article><span><Lock size={18} /></span><div><strong>{isAdmin ? <>{statistics.lockedRate}<small>%</small></> : statistics.locked}</strong><p>{isAdmin ? `锁定率 · ${statistics.locked}/${statistics.total}` : '已锁定学位'}</p></div></article>
        </div>

        {isAdmin && (
          <nav className="admin-tabs" aria-label="管理员功能">
            <button type="button" className={activeTab === 'teachers' ? 'is-active' : ''} onClick={() => { setActiveTab('teachers'); setMessage(null); }}><UserCog size={17} /><span>账号与权限</span></button>
            <button type="button" className={activeTab === 'students' ? 'is-active' : ''} onClick={() => { setActiveTab('students'); setMessage(null); }}><Users size={17} /><span>学生与访问数据</span></button>
          </nav>
        )}

        {isAdmin && activeTab === 'teachers' ? (
          <TeacherWorkspace teachers={teachers} loading={loading} selectedIds={selectedTeacherIds} onSelectionChange={setSelectedTeacherIds} onImport={importTeachers} onImportAdministrators={importAdministrators} onAddAdministrator={() => setAdministratorDialogOpen(true)} onDelete={deleteTeachers} onResetPassword={resetTeacherPassword} onToggleActive={toggleTeacherActive} onRefresh={() => loadData()} message={message} />
        ) : (
          <StudentWorkspace session={session} students={students} teachers={teachers} importBatches={importBatches} loading={loading} importing={importing} downloading={downloading} message={message} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onImport={importStudents} onDownload={downloadStudents} onRefresh={() => loadData()} onAddStudent={() => setStudentDialogOpen(true)} onCopyCode={copyReportCode} />
        )}
      </section>

      {passwordDialogOpen && <ChangePasswordDialog onClose={() => setPasswordDialogOpen(false)} onChanged={() => { setPasswordDialogOpen(false); setMessage({ type: 'success', text: '登录密码已修改。' }); }} />}
      {administratorDialogOpen && <AdministratorDialog onClose={() => setAdministratorDialogOpen(false)} onSaved={async (name) => { setAdministratorDialogOpen(false); await loadData({ quiet: true }); setMessage({ type: 'success', text: `${name} 的管理员账号已创建。` }); }} />}
      {studentDialogOpen && <StudentDialog session={session} teachers={teachers} onClose={() => setStudentDialogOpen(false)} onSaved={async (name) => { setStudentDialogOpen(false); await loadData({ quiet: true }); setMessage({ type: 'success', text: `${name} 已加入学生名单。` }); }} />}
    </main>
  );
}
