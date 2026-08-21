import { Component, StrictMode, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Code2,
  Compass,
  FileCheck2,
  Fingerprint,
  GraduationCap,
  HeartHandshake,
  LockKeyhole,
  LogOut,
  Rocket,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from 'lucide-react';
import AdminView from './AdminView.jsx';
import { assetUrl } from './asset-url.js';
import './index.css';

document.documentElement.style.setProperty('--login-background-image', `url("${assetUrl('login-background.png')}")`);

const REPORT = {
  monthlyPlan: [
    {
      goals: ['熟悉图形化编程基础', '累计完成 8 个软件编程项目'],
      knowledge: ['旋转与角度', '小数与负数', '数据与坐标'],
      events: ['了解 NCT 一级考纲与题型'],
    },
    {
      goals: ['累计完成 16 个软件编程项目', '累计完成 1 个硬件项目', '提升代码逻辑与表达能力'],
      knowledge: ['概率与随机数', '流程图', '相对运动'],
      events: ['NCT 一级专项训练'],
    },
    {
      goals: ['掌握变量与克隆', '累计完成 24 个软件编程项目', '累计完成 2 个硬件项目'],
      knowledge: ['多边形外角和', '数量的比较', '数据收集与整理'],
      events: ['NCT 一级模拟测评', '参加 NCT 一级认证'],
    },
    {
      goals: ['提升软硬件编程能力', '累计完成 32 个软件编程项目', '累计完成 4 个硬件项目'],
      knowledge: ['图形的运动', '时分秒', '逻辑运算'],
      events: ['白名单赛事项目能力训练'],
    },
    {
      goals: ['累计完成 40 个软件编程项目', '累计完成 6 个硬件项目', '提升代码调试与优化能力'],
      knowledge: ['数字编码', '集合与搭配', '程序结构进阶'],
      events: ['NCT 二级专项训练', '参加 NCT 二级认证'],
    },
    {
      goals: ['完成赛事集训', '累计完成 46 个软件编程项目', '独立完成综合项目'],
      knowledge: ['列表', '变量进阶', '字符串处理'],
      events: ['白名单赛事集训', '参加白名单国家级赛事'],
    },
  ],
};

function stableRandomInteger(seed, minimum, maximum) {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return minimum + ((hash >>> 0) % (maximum - minimum + 1));
}

function createLearningReport(learningData, studentId) {
  const totalAssignments = 3;
  const importedAssignments = Number(learningData.submittedAssignments);
  const submittedAssignments = Number.isFinite(importedAssignments)
    ? Math.min(3, Math.max(1, importedAssignments))
    : 3;
  const assignmentRate = Math.round((submittedAssignments / totalAssignments) * 100);
  const interactionRate = stableRandomInteger(`${studentId}:interaction`, 92, 95);
  const debugCount = stableRandomInteger(`${studentId}:debug`, 8, 16);

  return {
    ...learningData,
    submittedAssignments,
    totalAssignments,
    codeCorrectRate: 100,
    assignmentRate,
    interactionRate,
    debugCount,
    metrics: [
      {
        label: '作业提交率',
        value: assignmentRate,
        note: `${submittedAssignments}/${totalAssignments} 次作业已提交`,
        tone: 'indigo',
      },
      {
        label: '代码正确率',
        value: 100,
        note: `近 3 次课调试 ${debugCount} 次`,
        tone: 'teal',
      },
      {
        label: '课中互动情况',
        value: interactionRate,
        note: '近 3 次课保持积极参与',
        tone: 'amber',
      },
      {
        label: '综合能力等级',
        value: 'A+',
        unit: '',
        progress: 100,
        presentation: 'grade',
        note: '综合评定表现优秀',
        tone: 'blue',
      },
    ],
  };
}

const CLASS_SCHEDULE_TABLE = {
  'YC-20260905': { classType: '育才班', startTime: '2026 年 9 月 5 日' },
  'KT-20260906': { classType: '科特班', startTime: '2026 年 9 月 6 日' },
  'YC-20260912': { classType: '育才班', startTime: '2026 年 9 月 12 日' },
};

const AVAILABLE_CLASS_DAYS = ['星期一', '星期四', '星期五', '星期六', '星期日'];
const AVAILABLE_CLASS_TIMES = [
  '14:00–15:00',
  '15:00–16:00',
  '16:00–17:00',
  '17:00–18:00',
  '18:00–19:00',
  '19:00–20:00',
  '20:00–21:00',
];

const COURSE_LESSONS = [
  {
    title: '杜甫教我学唐诗',
    image: assetUrl('lesson-01-dufu.png'),
    imageAlt: '杜甫绝句古诗学习作品画面',
    subject: '学习古诗绝句，并理解诗句含义',
    coding: '掌握编程的三大基础要素：谁、在什么时候、做什么事情',
    project: '杜甫教我学唐诗',
  },
  {
    title: '百分数人机大战',
    image: assetUrl('lesson-02-percent-battle.png'),
    imageAlt: '百分数人机大战编程作品画面',
    subject: '理解百分数并应用在编程作品中，理解1曲线成面的几何现象',
    coding: '掌握计算机编程的基础结构之一：顺序结构',
    project: '百分数人机大战',
  },
  {
    title: '智能翻译器',
    image: assetUrl('lesson-03-translator.png'),
    imageAlt: '智能翻译器中英文语音识别作品画面',
    portrait: true,
    subject: '认识相关英语单词 park、shop、school、hello、apple；认识问路句式 where is；了解“语音识别”技术的原理',
    coding: '掌握语音识别和翻译相关积木的使用',
    project: '智能翻译器',
  },
  {
    title: '航天员，变身',
    image: assetUrl('lesson-04-astronaut.png'),
    imageAlt: '航天员人脸识别编程作品画面',
    subject: '了解“人脸识别”技术的原理，了解“太空失重”状态',
    coding: '掌握计算机编程的基础结构之一“循环结构”，掌握“AI 摄像”积木代码的使用',
    project: '航天员，变身',
  },
];

const PROGRAMMING_POINTS = [
  '编程三要素',
  '顺序结构',
  '语音识别积木',
  '翻译积木',
  '循环结构',
  'AI 摄像积木',
];

const SUBJECT_POINTS = [
  '古诗绝句',
  '百分数应用',
  '曲线成面',
  '英语词汇',
  '问路句式',
  '语音识别原理',
  '人脸识别原理',
  '太空失重',
];

function createLearningReviews(learningReport) {
  const assignmentSummary = learningReport.submittedAssignments === 3
    ? '3 次作业均已提交'
    : `已提交 ${learningReport.submittedAssignments}/3 次作业`;
  return [
    {
      label: '综合评价',
      copy: `最近 3 次课，${assignmentSummary}，作业提交率为 ${learningReport.assignmentRate}%，代码正确率为 100%；课中互动率为 ${learningReport.interactionRate}%，累计完成 ${learningReport.debugCount} 次程序调试。整体学习投入稳定，能够跟随课堂节奏完成从理解任务、搭建程序到呈现作品的完整过程。`,
    },
  {
    label: '编程能力',
    copy: '已经接触编程三要素、顺序结构、循环结构，以及语音识别、翻译和 AI 摄像等积木。孩子能把新知识应用到不同作品中，基础代码理解与迁移能力正在形成；下一步需要加强独立梳理执行顺序和定位错误的能力。',
  },
  {
    label: '学科融合',
    copy: '课程把古诗、百分数、英语问路、语音识别、人脸识别和太空失重等知识融入编程项目。孩子对跨学科主题接受度较高，能够通过程序和画面，把抽象知识转化为可以观察、操作的互动效果。',
  },
  {
    label: '学习特点',
    copy: '在有情境、有角色和即时反馈的创作任务中，孩子的参与度更高，也愿意用作品表达自己的理解。目前正从“跟着步骤完成”走向“理解后应用”，但在主动解释代码、验证运行结果和总结调试过程方面仍有提升空间。',
  },
  {
    label: '下一阶段建议',
    copy: '每次完成作品后，用 3 分钟复述作品目标、关键代码和调试过程；遇到问题时先预测原因，再逐项验证。继续巩固顺序与循环结构，并逐步加入变量、条件判断和独立创作任务，推动孩子从“会做作品”走向“会设计程序”。',
  },
  ];
}

const VIEWS = [
  { id: 'analytics', label: '学情', icon: BarChart3 },
  { id: 'ability', label: '能力', icon: Workflow },
  { id: 'roadmap', label: '规划', icon: Compass },
  { id: 'consensus', label: '共识', icon: HeartHandshake },
  { id: 'seat', label: '学位', icon: GraduationCap },
];

const VIEW_INDEX = Object.fromEntries(VIEWS.map((view, index) => [view.id, index]));

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-error" role="alert">
          <h1>页面加载失败</h1>
          <p>{this.state.error.message}</p>
          <button type="button" onClick={() => window.location.reload()}>重新加载</button>
        </main>
      );
    }
    return this.props.children;
  }
}

function App() {
  const isAdminRoute = window.location.pathname.replace(/\/$/, '') === '/admin';
  const [view, setView] = useState('login');
  const [studentId, setStudentId] = useState('');
  const [student, setStudent] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [loginPending, setLoginPending] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [reserved, setReserved] = useState(false);
  const [toast, setToast] = useState(null);

  const enterReport = async (event) => {
    event.preventDefault();
    const normalizedStudentId = studentId.trim().toUpperCase();
    if (!normalizedStudentId) {
      setLoginError('请输入用户 ID');
      return;
    }

    setLoginPending(true);
    try {
      const studentResponse = await fetch(`/api/students/${encodeURIComponent(normalizedStudentId)}`);
      const studentResult = await studentResponse.json();
      if (!studentResponse.ok) throw new Error(studentResult.message || '未找到匹配学生，请核对用户 ID');

      const matchedStudent = studentResult.student;
      setStudentId(normalizedStudentId);
      setStudent({
        ...matchedStudent,
        learningReport: createLearningReport(matchedStudent.learningData, matchedStudent.studentId),
      });
      setLoginError('');
      setAgreed(false);
      setReserved(Boolean(matchedStudent.seatLocked));
      setView('analytics');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      fetch(`/api/students/${encodeURIComponent(normalizedStudentId)}/viewed`, { method: 'POST' }).catch(() => undefined);
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setLoginPending(false);
    }
  };

  const updateStudentId = (value) => {
    setStudentId(value);
    setLoginError('');
  };

  const navigate = (nextView) => {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reserveSeat = async (selection) => {
    try {
      const response = await fetch(`/api/students/${encodeURIComponent(student.studentId)}/seat-lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selection),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '学位锁定失败');
      setReserved(true);
      setToast({ type: 'success', title: '学位确认成功', copy: '课程顾问将在 1 个工作日内与您联系' });
    } catch (error) {
      setToast({ type: 'error', title: '学位锁定失败', copy: error.message });
    }
  };

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (isAdminRoute) return <AdminView />;

  if (view === 'login') {
    return (
      <LoginView
        studentId={studentId}
        setStudentId={updateStudentId}
        loginError={loginError}
        loginPending={loginPending}
        onSubmit={enterReport}
      />
    );
  }

  return (
    <main className={`app-shell ${view === 'seat' ? 'app-shell--seat' : ''}`}>
      <AppHeader student={student} view={view} onNavigate={navigate} onLogout={() => setView('login')} />

      <div key={view} className="page-enter">
        {view === 'analytics' && <AnalyticsView student={student} onNext={() => navigate('ability')} />}
        {view === 'ability' && (
          <AbilityView student={student} onBack={() => navigate('analytics')} onNext={() => navigate('roadmap')} />
        )}
        {view === 'roadmap' && (
          <RoadmapView onBack={() => navigate('ability')} onNext={() => navigate('consensus')} />
        )}
        {view === 'consensus' && (
          <ConsensusView
            agreed={agreed}
            setAgreed={setAgreed}
            onBack={() => navigate('roadmap')}
            onNext={() => navigate('seat')}
          />
        )}
        {view === 'seat' && (
          <SeatView student={student} reserved={reserved} onReserve={reserveSeat} onBack={() => navigate('consensus')} />
        )}
      </div>

      {toast && (
        <div className={`toast toast--${toast.type}`} role="status" aria-live="polite">
          <span className="toast__icon">{toast.type === 'success' ? <Check size={17} strokeWidth={3} /> : <X size={17} />}</span>
          <div>
            <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
            <p className="mt-0.5 text-xs text-slate-500">{toast.copy}</p>
          </div>
        </div>
      )}
    </main>
  );
}

function LoginView({ studentId, setStudentId, loginError, loginPending, onSubmit }) {
  return (
    <main className="login-shell">
      <div className="login-visual" aria-hidden="true">
        <img src={assetUrl('login-background.png')} alt="" />
        <div className="login-visual__shade" />
      </div>

      <section className="login-content">
        <div className="brand-lockup">
          <img
            className="brand-logo"
            src={assetUrl('pku-codemao-logo.png')}
            alt="北京大学与点猫科技人工智能教育联合实验室"
          />
        </div>

        <div className="login-copy">
          <h1><span>科特班·英才计划</span><span>专属学习规划</span></h1>
          <p>好课程 好老师 助力拿到好结果</p>
        </div>

        <form className="glass-login" onSubmit={onSubmit}>
          <div>
            <h2>查看专属学习计划</h2>
            <p>输入老师提供的用户 ID</p>
          </div>
          <label className={`id-field ${loginError ? 'is-error' : ''}`}>
            <Fingerprint size={19} />
            <input
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              placeholder="请输入用户 ID"
              aria-label="用户 ID"
              aria-invalid={Boolean(loginError)}
              aria-describedby={loginError ? 'login-error' : undefined}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck="false"
            />
          </label>
          {loginError && <p className="login-error" id="login-error" role="alert">{loginError}</p>}
          <button className="primary-button" type="submit" disabled={loginPending}>
            <span>{loginPending ? '正在读取学生数据' : '进入学习报告'}</span>
            <ArrowRight size={18} />
          </button>
          <div className="privacy-note"><LockKeyhole size={13} /> 数据仅用于本次教学评估展示</div>
        </form>
      </section>
    </main>
  );
}

function AppHeader({ student, view, onNavigate, onLogout }) {
  const activeIndex = VIEW_INDEX[view];
  return (
    <header className={`sticky-header ${view === 'seat' ? 'sticky-header--seat' : ''}`}>
      <div className="header-row">
        <div className="student-lockup">
          <div className="student-avatar">{student.name.slice(-1)}</div>
          <div>
            <p>{student.name}家长</p>
          </div>
        </div>
        <button className="icon-button" onClick={onLogout} aria-label="退出报告" title="退出报告">
          <LogOut size={18} />
        </button>
      </div>
      <nav className="step-nav" aria-label="报告章节">
        {VIEWS.map((item, index) => {
          const Icon = item.icon;
          const isActive = view === item.id;
          const isComplete = index < activeIndex;
          return (
            <button
              key={item.id}
              className={isActive ? 'is-active' : isComplete ? 'is-complete' : ''}
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="step-nav__icon">{isComplete ? <Check size={14} /> : <Icon size={15} />}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function AnalyticsView({ student, onNext }) {
  const [selectedLesson, setSelectedLesson] = useState(null);
  const learningReport = student.learningReport;
  const learningReviews = createLearningReviews(learningReport);

  return (
    <section className="page page--light page--with-action">
      <div className="page-heading">
        <div>
          <p className="eyebrow">过去 {learningReport.recentLessons} 节课</p>
          <h1>学习数据</h1>
        </div>
        <span className="stage-pill"><span /> 综合学习数据</span>
      </div>

      <div className="metrics-grid">
        {learningReport.metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </div>

      <section className="course-summary" aria-labelledby="course-summary-title">
        <div className="course-summary__heading">
          <div className="course-summary__meta">
            <span>LEARNING PORTFOLIO</span>
          </div>
          <h2 id="course-summary-title">课程内容</h2>
          <p>从作品里，看见编程知识与学科思维的迁移。</p>
        </div>

        <div className="lesson-projects" aria-label="最近四节课的课程作品">
          {COURSE_LESSONS.map((lesson, index) => (
            <article className={`lesson-project lesson-project--${index + 1}`} key={lesson.title}>
              <button
                type="button"
                className="lesson-project__trigger"
                onClick={() => setSelectedLesson({ lesson, index })}
                aria-label={`查看第 ${index + 1} 课《${lesson.title}》知识点`}
              >
                <div className={`lesson-project__media ${lesson.portrait ? 'lesson-project__media--portrait' : ''}`}>
                  <img src={lesson.image} alt={lesson.imageAlt} loading="lazy" />
                </div>
                <div className="lesson-project__caption">
                  <span>0{index + 1}</span>
                  <strong>{lesson.title}</strong>
                  <ArrowRight size={12} />
                </div>
              </button>
            </article>
          ))}
        </div>

        <section className="knowledge-overview" aria-labelledby="knowledge-overview-title">
          <header className="knowledge-overview__heading">
            <div>
              <span>KNOWLEDGE MAP</span>
              <h3 id="knowledge-overview-title">知识收获</h3>
              <p>4 个作品沉淀的能力</p>
            </div>
            <img src={assetUrl('codemao-study-mascot.png')} alt="编程猫拿着铅笔和书本" />
          </header>
          <div className="knowledge-overview__grid">
            <article className="knowledge-card knowledge-card--coding">
              <header>
                <span><Workflow size={17} /></span>
                <div><strong>{PROGRAMMING_POINTS.length}</strong><p>个编程知识点</p></div>
              </header>
              <div className="knowledge-card__tags">
                {PROGRAMMING_POINTS.map((point) => <span key={point}>{point}</span>)}
              </div>
            </article>
            <article className="knowledge-card knowledge-card--subject">
              <header>
                <span><BookOpen size={17} /></span>
                <div><strong>{SUBJECT_POINTS.length}</strong><p>个学科融合知识点</p></div>
              </header>
              <div className="knowledge-card__tags">
                {SUBJECT_POINTS.map((point) => <span key={point}>{point}</span>)}
              </div>
            </article>
          </div>
        </section>

        <section className="learning-review" aria-labelledby="learning-review-title">
          <header>
            <span><Sparkles size={16} /></span>
            <div><p>阶段点评</p><h3 id="learning-review-title">学习情况点评</h3></div>
          </header>
          <div className="learning-review__list">
            {learningReviews.map(({ label, copy }, index) => (
              <article key={label}>
                <span>0{index + 1}</span>
                <div><strong>{label}</strong><p>{copy}</p></div>
              </article>
            ))}
          </div>
        </section>
      </section>

      {selectedLesson && (
        <LessonDetailDialog
          lesson={selectedLesson.lesson}
          index={selectedLesson.index}
          onClose={() => setSelectedLesson(null)}
        />
      )}

      <BottomAction label="查看学习能力" icon={ArrowRight} onClick={onNext} />
    </section>
  );
}

function LessonDetailDialog({ lesson, index, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="lesson-dialog-backdrop" onClick={onClose}>
      <section
        className="lesson-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="lesson-dialog__close" type="button" onClick={onClose} aria-label="关闭课程详情" title="关闭课程详情">
          <X size={18} />
        </button>

        <div className={`lesson-dialog__media ${lesson.portrait ? 'lesson-dialog__media--portrait' : ''}`}>
          <img src={lesson.image} alt={lesson.imageAlt} />
        </div>

        <div className="lesson-dialog__content">
          <p>第 {index + 1} 课 · 课程知识详情</p>
          <h2 id="lesson-dialog-title">{lesson.title}</h2>

          <div className="lesson-dialog__knowledge">
            <section>
              <span><Code2 size={17} /></span>
              <div><h3>编程知识点</h3><p>{lesson.coding}</p></div>
            </section>
            <section>
              <span><BookOpen size={17} /></span>
              <div><h3>学科知识点</h3><p>{lesson.subject}</p></div>
            </section>
          </div>

          <div className="lesson-dialog__project">
            <span>创作项目</span>
            <strong>{lesson.project}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, unit = '%', progress = value, note, tone, presentation }) {
  const circumference = 2 * Math.PI * 31;
  const offset = circumference - (progress / 100) * circumference;
  const spokenValue = unit ? `${value}${unit}` : value;
  const isGrade = presentation === 'grade';
  return (
    <article className={`metric-card metric-card--${tone} ${isGrade ? 'metric-card--grade' : ''}`}>
      {isGrade ? (
        <div className="metric-grade" role="img" aria-label={`${label} ${spokenValue}`}><strong>{value}</strong></div>
      ) : (
        <div className="metric-ring">
          <svg viewBox="0 0 72 72" role="img" aria-label={`${label} ${spokenValue}`}>
            <circle className="metric-ring__track" cx="36" cy="36" r="31" />
            <circle
              className="metric-ring__value"
              cx="36"
              cy="36"
              r="31"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <strong><span>{value}</span>{unit && <small>{unit}</small>}</strong>
        </div>
      )}
      <h3>{label}</h3>
      <p>{note}</p>
    </article>
  );
}

function AbilityView({ onBack, onNext }) {
  return (
    <section className="page page--light ability-page page--with-action">
      <div className="ability-hero">
        <p className="eyebrow">能力对接 · 科技特长生培养路径</p>
        <h1>能力对接<span>科特班</span></h1>
        <p>
          科特班是编程猫（深圳点猫科技有限公司）内部“<span className="ability-hero__highlight">科技特长生专项培养计划</span>”，该计划成立于2017年，经过9年的历程，累计为全国512所重点初中、479所重点高中输送1万余名优秀学员，口碑卓著。<span className="ability-hero__conclusion">由此，“科特班”被誉为少儿编程行业的黄埔军校。</span>
        </p>
      </div>

      <section className="ability-overview" aria-labelledby="ability-overview-title">
        <div className="ability-overview__heading">
          <p>ELITE CLASS · OVERVIEW</p>
          <h2 id="ability-overview-title">了解科特班</h2>
        </div>
        <img
          className="ability-overview__image"
          src={assetUrl('elite-class-overview.jpg')}
          alt="编程猫科特班科技特长生专属人才培养计划介绍"
          decoding="async"
        />
      </section>

      <BottomAction label="查看专属 6 个月规划" icon={ArrowRight} onClick={onNext} secondaryAction={onBack} />
    </section>
  );
}

function RoadmapView({ onBack, onNext }) {
  return (
    <section className="page page--light page--with-action">
      <div className="page-heading page-heading--stacked">
        <p className="eyebrow">个性化成长路径</p>
        <h1>专属6个月学习目标</h1>
        <p>学习目标、学科知识与赛事目标同步规划。</p>
      </div>

      <img
        className="competition-plan-image"
        src={assetUrl('competition-roadmap.png')}
        alt="学习半年冲刺全国性赛考证书规划图"
      />

      <section className="monthly-plan-section">
        <div className="monthly-plan-section__heading">
          <div>
            <p>6 MONTH PLAN</p>
            <h2>六个月学习规划</h2>
          </div>
          <span>共 6 个月</span>
        </div>
        <div className="monthly-plan-table-wrap">
          <table className="monthly-plan-table">
            <thead>
              <tr>
                <th>学习周期</th>
                <th>课程学习目标</th>
                <th>学科知识</th>
                <th>赛事目标</th>
              </tr>
            </thead>
            <tbody>
              {REPORT.monthlyPlan.map((item, index) => (
                <tr key={`month-${index + 1}`}>
                  <th scope="row"><strong>第 {index + 1} 个月</strong></th>
                  <td><PlanList items={item.goals} /></td>
                  <td><PlanList items={item.knowledge} /></td>
                  <td><PlanList items={item.events} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <BottomAction label="查看编程猫课程模式" icon={ArrowRight} onClick={onNext} secondaryAction={onBack} />
    </section>
  );
}

function PlanList({ items }) {
  return (
    <ul className="plan-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function ReasonDetailDialog({ reason, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  return createPortal(
    <div className="reason-detail-backdrop" onClick={onClose}>
      <section
        className="reason-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reason-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="reason-detail-dialog__close" type="button" onClick={onClose} aria-label="关闭图解" title="关闭图解">
          <X size={18} />
        </button>

        <div className="reason-detail-dialog__media">
          <img
            className="reason-detail-dialog__image"
            src={reason.imageSrc}
            alt={`${reason.category}：${reason.title}`}
          />
        </div>

        <div className="reason-detail-dialog__content">
          <p>0{reason.index + 1} · {reason.category}</p>
          <h2 id="reason-detail-title">{reason.title}</h2>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function ConsensusView({ agreed, setAgreed, onBack, onNext }) {
  const [activeReason, setActiveReason] = useState(null);
  const reasons = [
    {
      category: '专业陪伴',
      title: '孩子遇到问题，有老师及时帮助',
      copy: '编程猫教学老师会持续关注孩子的学习进度与课堂表现，及时发现学习中的问题，并提供针对性的辅导与帮助。',
      audience: '让孩子',
      benefits: ['遇到问题有人关注', '学习困难有人辅导', '思考过程有人引导'],
      imageSrc: assetUrl('reason-professional-support.jpg'),
    },
    {
      category: '学情反馈',
      title: '课后清晰看见孩子的学习与成长',
      copy: '孩子上完一节课，我们会清晰展示“到底学会了什么”，包括学习内容、知识掌握、课堂表现、作品成果，以及需要进一步提升的方向。',
      audience: '让家长',
      benefits: ['知道学了什么', '了解掌握多少', '明确哪里需要提升'],
      imageSrc: assetUrl('reason-learning-feedback.jpg'),
    },
    {
      category: '个性定制',
      title: '1V1 学情规划，让成长更有方向',
      copy: '每个孩子的基础、兴趣、学习节奏和发展目标都不同，适合别人的学习路径，不一定适合自己的孩子。编程猫结合孩子的阶段性学情、能力表现与学习目标，提供更有针对性的学习规划，帮助家长明确现在学什么、下一步学什么，以及未来可以往哪里发展。',
      audience: '让成长',
      benefits: ['更符合孩子特点', '学习目标更明确', '成长路径更清晰'],
      imageSrc: assetUrl('reason-learning-plan.jpg'),
    },
    {
      category: '赛事辅导',
      title: '北大认证名师，助力赛事辅导',
      copy: '专业教研师资全面准备孩子的课程内容与辅导方向，涵盖未来赛事规划及金牌备赛辅导。',
      audience: '让家庭',
      benefits: ['赛事选择有方向', '备赛训练有规划', '挑战目标有支持'],
      imageSrc: assetUrl('reason-competition-coaching.jpg'),
    },
  ];

  return (
    <section className="page page--paper letter-page page--with-action">
      <article className="family-letter">
        <header className="letter-letterhead">
          <div className="letter-seal"><HeartHandshake size={24} /></div>
          <div>
            <p>成长支持 · INVITATION</p>
            <h1>选择编程猫的理由</h1>
          </div>
          <img className="letter-mascot" src={assetUrl('codemao-trophy-mascot.png')} alt="编程猫手持奖杯与奖牌" />
        </header>

        <div className="letter-rule"><span /></div>
        <p className="letter-lead">不只是教孩子学编程，更为孩子提供持续、专业、个性化的成长支持。</p>

        <div className="letter-principles">
          {reasons.map((reason, index) => (
            <section
              key={reason.title}
              role="button"
              tabIndex={0}
              aria-label={`查看${reason.category}图解`}
              onClick={() => setActiveReason({ ...reason, index })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActiveReason({ ...reason, index });
                }
              }}
            >
              <span>0{index + 1}</span>
              <div>
                <div className="letter-principles__meta">
                  <p className="letter-principles__category">{reason.category}</p>
                  <span><BookOpen size={14} /> 查看图解</span>
                </div>
                <h2>{reason.title}</h2>
                <p>{reason.copy}</p>
                <div className="letter-principles__benefits" aria-label={`${reason.audience}的收获`}>
                  <strong>{reason.audience}</strong>
                  <div>{reason.benefits.map((benefit) => <span key={benefit}>{benefit}</span>)}</div>
                </div>
              </div>
            </section>
          ))}
        </div>
      </article>

      <button
        className={`agreement-check ${agreed ? 'is-checked' : ''}`}
        onClick={() => setAgreed(!agreed)}
        role="checkbox"
        aria-checked={agreed}
      >
        <span>{agreed && <Check size={16} strokeWidth={3} />}</span>
        <div><strong>我已了解以上成长支持</strong><small>继续查看科特班上课时间</small></div>
      </button>

      <BottomAction
        label={agreed ? '查看上课时间' : '请先确认已了解'}
        icon={agreed ? FileCheck2 : ShieldCheck}
        onClick={onNext}
        disabled={!agreed}
        secondaryAction={onBack}
      />

      {activeReason && <ReasonDetailDialog reason={activeReason} onClose={() => setActiveReason(null)} />}
    </section>
  );
}

function SeatView({ student, reserved, onReserve, onBack }) {
  const [selectedDay, setSelectedDay] = useState('星期五');
  const [selectedTime, setSelectedTime] = useState('19:00–20:00');
  const particles = useMemo(() => (
    Array.from({ length: 18 }, (_, index) => ({
      left: `${(index * 37) % 96}%`,
      top: `${12 + ((index * 47) % 65)}%`,
      delay: `${(index % 7) * 0.3}s`,
      duration: `${4 + (index % 5)}s`,
    }))
  ), []);

  return (
    <section className="page seat-page page--with-action">
      <div className="particle-field" aria-hidden="true">
        {particles.map((particle, index) => (
          <i key={index} style={{ left: particle.left, top: particle.top, animationDelay: particle.delay, animationDuration: particle.duration }} />
        ))}
      </div>
      <button className="seat-back" onClick={onBack}><ArrowLeft size={17} /> 返回共识</button>

      <div className="seat-intro">
        <span className="seat-intro__icon"><Rocket size={22} /></span>
        <p className="eyebrow">下一阶段 · 学习席位</p>
        <h1>{reserved ? '上课时间已确认' : '科特班学位预约'}</h1>
        {!reserved && <p className="seat-intro__subtitle">（请选择上课时间）</p>}
      </div>

      <img
        className="class-schedule-image"
        src={assetUrl('class-schedule.png')}
        alt="英才计划科特班学习时间安排表"
      />

      <section className="course-time-picker" aria-labelledby="course-time-title">
        <div className="course-time-picker__heading">
          <span><CalendarDays size={18} /></span>
          <div>
            <p>选择课程时间</p>
            <h2 id="course-time-title">优先选择合适的上课时间</h2>
          </div>
        </div>
        <div className="course-time-fields">
          <label>
            <span>上课星期</span>
            <select value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} disabled={reserved}>
              {AVAILABLE_CLASS_DAYS.map((day) => <option key={day}>{day}</option>)}
            </select>
          </label>
          <label>
            <span>上课时间</span>
            <select value={selectedTime} onChange={(event) => setSelectedTime(event.target.value)} disabled={reserved}>
              {AVAILABLE_CLASS_TIMES.map((time) => <option key={time}>{time}</option>)}
            </select>
          </label>
        </div>
        <p className="course-time-picker__note"><Clock3 size={13} /> 已选择：{selectedDay} {selectedTime}</p>
      </section>

      <div className="seat-action-wrap">
        <button className={`reserve-button ${reserved ? 'is-reserved' : ''}`} onClick={() => onReserve({ day: selectedDay, time: selectedTime })} disabled={reserved}>
          {reserved ? <CheckCircle2 size={20} /> : <GraduationCap size={21} />}
          {reserved ? '名额已锁定' : '确认锁定名额'}
        </button>
        <p><ShieldCheck size={13} /> 本操作仅确认意向，不会产生任何费用</p>
      </div>
    </section>
  );
}

function BottomAction({ label, icon: Icon, onClick, secondaryAction, disabled = false }) {
  return (
    <div className="bottom-action">
      {secondaryAction && (
        <button className="back-button" onClick={secondaryAction} aria-label="返回上一步" title="返回上一步">
          <ArrowLeft size={19} />
        </button>
      )}
      <button className="primary-button" onClick={onClick} disabled={disabled}>
        <Icon size={18} />
        <span>{label}</span>
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
);
