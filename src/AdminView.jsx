import { useEffect, useMemo, useRef, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import Papa from 'papaparse';
import {
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  KeyRound,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react';

const COLUMN_ALIASES = {
  studentId: ['学生id', '学员id', '学生编号', 'studentid'],
  name: ['学员姓名', '学生姓名', '姓名', 'name'],
  level: ['课程级别', '课程等级', 'level'],
  scheduleId: ['课表id', '排课id', 'scheduleid'],
  recentLessons: ['最近课程数', '最近课次', '课程数', 'recentlessons'],
  submittedAssignments: ['已提交作业', '提交作业数', '已交作业', 'submittedassignments'],
  totalAssignments: ['作业总数', '应交作业', 'totalassignments'],
  codeCorrectRate: ['代码正确率', '正确率', 'codecorrectrate'],
  studyHours: ['学习时长', '学习小时', 'studyhours'],
};

const normalizeHeader = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[\s_：:·-]/g, '');

const toNumber = (value, fallback = 0) => {
  if (typeof value === 'string' && value.trim().endsWith('%')) {
    const percentage = Number(value.trim().slice(0, -1));
    return Number.isFinite(percentage) ? percentage : fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toPercentage = (value, fallback = 100) => {
  const number = toNumber(value, fallback);
  return number > 0 && number <= 1 ? number * 100 : number;
};

function findColumn(headers, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.findIndex((header) => normalizedAliases.includes(normalizeHeader(header)));
}

function rowsToStudents(rows) {
  if (!rows.length) throw new Error('表格中没有可导入的数据');
  const headers = rows[0];
  const columns = Object.fromEntries(
    Object.entries(COLUMN_ALIASES).map(([field, aliases]) => [field, findColumn(headers, aliases)]),
  );
  if (columns.studentId < 0 || columns.name < 0) {
    throw new Error('表格必须包含“学生ID”和“学员姓名”两列');
  }

  const valueAt = (row, field) => columns[field] >= 0 ? row[columns[field]] : undefined;
  const invalidRows = [];
  const students = rows.slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((value) => String(value ?? '').trim()))
    .map(({ row, rowNumber }) => {
      const totalAssignments = toNumber(valueAt(row, 'totalAssignments'), 3);
      const student = {
        studentId: String(valueAt(row, 'studentId') ?? '').trim().toUpperCase(),
        name: String(valueAt(row, 'name') ?? '').trim(),
        level: String(valueAt(row, 'level') ?? '').trim(),
        scheduleId: String(valueAt(row, 'scheduleId') ?? '').trim(),
        recentLessons: toNumber(valueAt(row, 'recentLessons'), 3),
        submittedAssignments: toNumber(valueAt(row, 'submittedAssignments'), totalAssignments),
        totalAssignments,
        codeCorrectRate: toPercentage(valueAt(row, 'codeCorrectRate'), 100),
        studyHours: toNumber(valueAt(row, 'studyHours'), 0),
      };
      if (!student.studentId || !student.name) {
        invalidRows.push({
          原始行号: rowNumber,
          失败原因: !student.studentId ? '缺少学生ID' : '缺少学员姓名',
          ...Object.fromEntries(headers.map((header, columnIndex) => [String(header || `第${columnIndex + 1}列`), row[columnIndex] ?? ''])),
        });
      }
      return student;
    });

  if (!students.length) throw new Error('表格中没有有效的学生记录');
  if (invalidRows.length) {
    const error = new Error(`发现 ${invalidRows.length} 行无效数据，已生成失败记录`);
    error.invalidRows = invalidRows;
    throw error;
  }
  return students.filter((student) => student.studentId && student.name);
}

async function parseImportFile(file) {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = await file.text();
    const result = Papa.parse(text, { skipEmptyLines: 'greedy' });
    if (result.errors.length) throw new Error(`CSV 解析失败：${result.errors[0].message}`);
    return rowsToStudents(result.data);
  }
  return rowsToStudents(await readXlsxFile(file));
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

function StatusCell({ active, activeLabel, inactiveLabel, timestamp }) {
  return (
    <div className={`admin-status ${active ? 'is-active' : ''}`}>
      <strong>{active ? activeLabel : inactiveLabel}</strong>
      <span>{active ? formatDate(timestamp) : '尚未发生'}</span>
    </div>
  );
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

function TeacherLogin({ onLogin }) {
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
          <p>TEACHER WORKSPACE</p>
          <h1>教师管理后台</h1>
          <strong>每位老师只管理自己的学生数据</strong>
        </div>

        <form className="admin-login-form" onSubmit={submit}>
          <div>
            <p>安全登录</p>
            <h2>进入我的学生工作台</h2>
          </div>
          <label>
            <span>教师账号</span>
            <div><UserRound size={17} /><input value={account} onChange={(event) => setAccount(event.target.value)} autoComplete="username" required /></div>
          </label>
          <label>
            <span>登录密码</span>
            <div><KeyRound size={17} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></div>
          </label>
          {error && <p className="admin-login-error" role="alert">{error}</p>}
          <button type="submit" disabled={pending}>{pending ? '正在验证' : '登录管理后台'}</button>
          <small>账号由系统管理员统一创建和分配</small>
        </form>
      </section>
    </main>
  );
}

function ChangePasswordDialog({ onClose, onChanged }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const submit = async (event) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
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
    <div className="admin-dialog-backdrop" onClick={onClose}>
      <form className="admin-password-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-password-title" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="admin-dialog-close" onClick={onClose} aria-label="关闭修改密码" title="关闭修改密码"><X size={17} /></button>
        <div className="admin-password-dialog__heading"><span><KeyRound size={19} /></span><div><p>ACCOUNT SECURITY</p><h2 id="admin-password-title">修改登录密码</h2></div></div>
        <label><span>当前密码</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
        <label><span>新密码</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={10} required /></label>
        <label><span>再次输入新密码</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={10} required /></label>
        {error && <p className="admin-login-error" role="alert">{error}</p>}
        <button type="submit" className="admin-password-submit" disabled={pending}>{pending ? '正在修改' : '确认修改密码'}</button>
      </form>
    </div>
  );
}

export default function AdminView() {
  const inputRef = useRef(null);
  const [teacher, setTeacher] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [importBatches, setImportBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  const clearSession = () => {
    setTeacher(null);
    setStudents([]);
    setImportBatches([]);
    setMessage(null);
  };

  const loadStudents = async () => {
    setLoading(true);
    try {
      const [studentsResponse, batchesResponse] = await Promise.all([
        fetch('/api/admin/students'),
        fetch('/api/admin/import-batches'),
      ]);
      if (studentsResponse.status === 401 || batchesResponse.status === 401) {
        clearSession();
        return;
      }
      const [studentsData, batchesData] = await Promise.all([studentsResponse.json(), batchesResponse.json()]);
      if (!studentsResponse.ok) throw new Error(studentsData.message || '无法读取后台学生数据');
      if (!batchesResponse.ok) throw new Error(batchesData.message || '无法读取导入记录');
      setStudents(studentsData.students);
      setImportBatches(batchesData.batches);
      setMessage(null);
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
        setTeacher(result.teacher);
      } finally {
        setSessionLoading(false);
      }
    };
    restoreSession();
  }, []);

  useEffect(() => {
    if (teacher) loadStudents();
  }, [teacher]);

  const statistics = useMemo(() => ({
    total: students.length,
    viewed: students.filter((student) => student.viewedAt).length,
    locked: students.filter((student) => student.seatLocked).length,
  }), [students]);

  const visibleStudents = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return students.filter((student) => {
      const matchesKeyword = !keyword || [student.name, student.studentId, student.reportCode, student.level]
        .some((value) => String(value || '').toLowerCase().includes(keyword));
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'unviewed' && !student.viewedAt)
        || (statusFilter === 'viewed' && Boolean(student.viewedAt))
        || (statusFilter === 'locked' && student.seatLocked)
        || (statusFilter === 'unlocked' && !student.seatLocked);
      return matchesKeyword && matchesStatus;
    });
  }, [students, query, statusFilter]);

  const importSpreadsheet = async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    setMessage(null);
    try {
      const importedStudents = await parseImportFile(file);
      const response = await fetch('/api/admin/students/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: importedStudents, fileName: file.name }),
      });
      const result = await response.json();
      if (response.status === 401) {
        clearSession();
        return;
      }
      if (!response.ok) throw new Error(result.message || '批量导入失败');
      setStudents(result.students);
      const batchesResponse = await fetch('/api/admin/import-batches');
      if (batchesResponse.ok) setImportBatches((await batchesResponse.json()).batches);
      setMessage({ type: 'success', text: `已导入 ${result.imported} 条记录，您的后台现有 ${result.total} 名学员。` });
    } catch (error) {
      if (error.invalidRows) downloadCsvFile(error.invalidRows, '学生导入失败记录.csv');
      setMessage({ type: 'error', text: error.message });
    } finally {
      setImporting(false);
    }
  };

  const downloadStudents = async () => {
    setDownloading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/students/export.csv');
      if (response.status === 401) {
        clearSession();
        return;
      }
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || '学生数据下载失败');
      }
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
      setMessage({ type: 'success', text: `已下载 ${students.length} 名学员的数据。` });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setDownloading(false);
    }
  };

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => undefined);
    clearSession();
  };

  const copyReportCode = async (reportCode) => {
    try {
      await navigator.clipboard.writeText(reportCode);
      setMessage({ type: 'success', text: `报告访问码 ${reportCode} 已复制。` });
    } catch {
      setMessage({ type: 'error', text: '无法自动复制，请手动选择访问码。' });
    }
  };

  if (sessionLoading) {
    return <main className="admin-session-loading"><ShieldCheck size={24} /><p>正在验证教师身份...</p></main>;
  }

  if (!teacher) return <TeacherLogin onLogin={setTeacher} />;

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p>LEARNING PLAN ADMIN</p>
          <h1>英才学习计划管理后台</h1>
          <span>批量维护本人学生数据，跟踪家长查看与学位锁定状态</span>
        </div>
        <div className="admin-account">
          <div><span><UserRound size={15} /></span><p><strong>{teacher.displayName}</strong><small>{teacher.teacherId}</small></p></div>
          <button type="button" onClick={() => setPasswordDialogOpen(true)} title="修改密码"><Settings2 size={16} /><span>改密</span></button>
          <button type="button" onClick={logout} title="退出管理后台"><LogOut size={16} /><span>退出</span></button>
          <a href="/">返回学生端</a>
        </div>
      </header>

      <section className="admin-content">
        <div className="admin-stats" aria-label="状态概览">
          <article>
            <span><Users size={18} /></span>
            <div><strong>{statistics.total}</strong><p>我的学生</p></div>
          </article>
          <article>
            <span><Eye size={18} /></span>
            <div><strong>{statistics.viewed}</strong><p>家长已查看</p></div>
          </article>
          <article>
            <span><Lock size={18} /></span>
            <div><strong>{statistics.locked}</strong><p>已锁定学位</p></div>
          </article>
        </div>

        <section className="admin-workspace" aria-labelledby="student-management-title">
          <header className="admin-toolbar">
            <div>
              <p>MY STUDENTS</p>
              <h2 id="student-management-title">我的学生与跟进状态</h2>
            </div>
            <div className="admin-toolbar__actions">
              <button type="button" className="admin-icon-button" onClick={loadStudents} aria-label="刷新学生数据" title="刷新学生数据">
                <RefreshCw size={17} />
              </button>
              <button type="button" className="admin-download-button" onClick={downloadStudents} disabled={downloading || loading}>
                <Download size={17} />
                <span>{downloading ? '正在生成' : '下载 CSV'}</span>
              </button>
              <button type="button" className="admin-import-button" onClick={() => inputRef.current?.click()} disabled={importing}>
                <Upload size={17} />
                <span>{importing ? '正在导入' : '批量导入'}</span>
              </button>
              <input ref={inputRef} type="file" accept=".xlsx,.csv" onChange={importSpreadsheet} hidden />
            </div>
          </header>

          <div className="admin-import-note">
            <FileSpreadsheet size={16} />
            <p>导入数据将自动归属 {teacher.displayName}。支持 XLSX、CSV；必填列：学生ID、学员姓名；可选列：课程级别、课表ID、最近课程数、已提交作业、作业总数、代码正确率、学习时长。</p>
          </div>

          {importBatches.length > 0 && (
            <div className="admin-import-history" aria-label="最近导入记录">
              <strong>最近导入</strong>
              {importBatches.slice(0, 3).map((batch) => (
                <span key={batch.batchId}>{batch.fileName || '未命名表格'} · {batch.importedCount} 条 · {formatDate(batch.createdAt)}</span>
              ))}
            </div>
          )}

          {message && (
            <div className={`admin-message admin-message--${message.type}`} role="status">
              {message.type === 'success' && <CheckCircle2 size={16} />}
              <span>{message.text}</span>
            </div>
          )}

          <div className="admin-filterbar">
            <label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、学生 ID、访问码" aria-label="搜索学生" /></label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="筛选学生状态">
              <option value="all">全部状态</option>
              <option value="unviewed">家长未查看</option>
              <option value="viewed">家长已查看</option>
              <option value="unlocked">学位未锁定</option>
              <option value="locked">学位已锁定</option>
            </select>
            <span>显示 {visibleStudents.length}/{students.length} 名</span>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>学员</th>
                  <th>学习数据</th>
                  <th>家长查看</th>
                  <th>学位状态</th>
                </tr>
              </thead>
              <tbody>
                {!loading && visibleStudents.map((student) => (
                  <tr key={student.studentId}>
                    <td>
                      <strong>{student.name}</strong>
                      <span>{student.studentId}</span>
                      <button type="button" className="admin-report-code" onClick={() => copyReportCode(student.reportCode)} title="复制报告访问码"><code>{student.reportCode}</code><Copy size={11} /></button>
                      <small>{student.level || '未设置课程级别'}</small>
                    </td>
                    <td>
                      <strong>{student.learningData.submittedAssignments}/{student.learningData.totalAssignments} 次作业</strong>
                      <span>代码 {student.learningData.codeCorrectRate}% · {student.learningData.studyHours} 小时</span>
                    </td>
                    <td><StatusCell active={Boolean(student.viewedAt)} activeLabel="已查看" inactiveLabel="未查看" timestamp={student.viewedAt} /></td>
                    <td><StatusCell active={student.seatLocked} activeLabel="已锁定" inactiveLabel="未锁定" timestamp={student.seatLockedAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && <div className="admin-table-state">正在读取本人学生数据...</div>}
            {!loading && !students.length && <div className="admin-table-state">暂无归属于您的学生数据</div>}
            {!loading && students.length > 0 && !visibleStudents.length && <div className="admin-table-state">没有符合当前条件的学生</div>}
          </div>
        </section>
      </section>
      {passwordDialogOpen && <ChangePasswordDialog onClose={() => setPasswordDialogOpen(false)} onChanged={() => { setPasswordDialogOpen(false); setMessage({ type: 'success', text: '登录密码已修改。' }); }} />}
    </main>
  );
}
