/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import {
  Activity,
  BookOpenText,
  Bot,
  Database,
  Edit3,
  Eye,
  FileText,
  Gauge,
  Lock,
  LogOut,
  Newspaper,
  Play,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import MDEditor from "@uiw/react-md-editor";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import "./App.css";

type Material = {
  id: number;
  title: string;
  source_type: string;
  source_platform: string;
  source_name: string;
  source_level: string;
  risk_level?: string;
  status: string;
  summary?: string;
  raw_content?: string;
  manual_note?: string;
  url?: string;
  keywords?: string;
  topic_tags?: string;
  target_users?: string;
  food_ingredients?: string;
  risk_notes?: string;
  official_match_keywords?: string;
  created_at?: string;
  updated_at?: string;
};

type Source = { id: number; name: string; type: string; level: string; url: string; crawl_enabled: number; remark?: string; created_at?: string; updated_at?: string };
type Topic = { id: number; title: string; core_pain: string; target_user: string; content_angle?: string; risk_level: string; status: string; created_at?: string; updated_at?: string };
type Content = { id: number; title: string; review_status: string; publish_status: string; body: string; poster_text: string; card_text?: string; recipe_json?: string; image_prompt?: string; risk_warnings?: string; created_at?: string; updated_at?: string };
type Metric = { id: number; content_id: number; platform: string; publish_url?: string; published_at?: string; views: number; likes: number; favorites: number; comments: number; shares: number; followers_gain: number; private_messages: number; orders: number; note?: string; created_at?: string };
type TaskState = { open: boolean; title: string; status: "running" | "success" | "error"; message?: string };
type TabKey = "dashboard" | "materials" | "crawl" | "topics" | "contents" | "metrics";
type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };

const API = "/api";

const sourceLevelMap: Record<string, string> = {
  S: "S级 权威机构",
  A: "A级 专业机构",
  B: "B级 主流媒体",
  C: "C级 人工灵感",
  D: "D级 高风险参考",
};
const sourceTypeMap: Record<string, string> = {
  manual_input: "人工素材",
  official_auto: "权威抓取",
  user_idea: "用户想法",
};
const statusMap: Record<string, string> = {
  new: "待解析",
  parsed: "已解析",
  topic_generated: "已生成选题",
  discarded: "已弃用",
  candidate: "候选",
  selected: "已选中",
  generated: "已生成内容",
  published: "已发布",
  draft: "草稿",
  pending: "待审核",
  passed: "审核通过",
  rejected: "审核拒绝",
  needs_edit: "需修改",
  archived: "已归档",
  success: "成功",
  failed: "失败",
  running: "运行中",
};
const riskMap: Record<string, string> = { low: "低风险", medium: "中风险", high: "高风险" };

function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/auth/me").then((data) => setUser(data.user)).catch(() => null).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="boot">载入后台...</div>;
  if (!user) return <Login onLogin={setUser} />;
  return <Workspace user={user} onLogout={() => setUser(null)} />;
}

function Login({ onLogin }: { onLogin: (user: any) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123456");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api("/auth/login", { method: "POST", body: { username, password } });
      onLogin(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand-mark"><ShieldCheck size={28} /></div>
        <p className="eyebrow">AIGoodHealth</p>
        <h1>养生食谱内容生成后台</h1>
        <p className="login-copy">人工素材做选题雷达，权威资料做内容边界，AI 只负责初稿和结构化。</p>
        <form onSubmit={submit}>
          <label>管理员账号<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          <label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit"><Lock size={16} /> 登录后台</button>
        </form>
      </section>
    </main>
  );
}

function Workspace({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [refresh, setRefresh] = useState(0);
  const [task, setTask] = useState<TaskState>({ open: false, title: "", status: "running" });
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const tabs = [
    ["dashboard", "总览", Gauge],
    ["materials", "素材", Database],
    ["crawl", "权威抓取", Newspaper],
    ["topics", "选题", Sparkles],
    ["contents", "内容", FileText],
    ["metrics", "复盘", Activity],
  ] as const;

  async function runTask<T>(title: string, fn: () => Promise<T>, done?: (result: T) => void) {
    setTask({ open: true, title, status: "running" });
    try {
      const result = await fn();
      setTask({ open: true, title, status: "success", message: "已完成" });
      setRefresh((x) => x + 1);
      done?.(result);
      window.setTimeout(() => setTask((prev) => prev.status === "success" ? { ...prev, open: false } : prev), 850);
      return result;
    } catch (err) {
      setTask({ open: true, title, status: "error", message: err instanceof Error ? err.message : "操作失败" });
      throw err;
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    onLogout();
  }

  return (
    <main className="app-shell">
      <aside>
        <div className="aside-title"><BookOpenText /> <span>食养编辑台</span></div>
        <nav>
          {tabs.map(([key, label, Icon]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><Icon size={17} /> {label}</button>
          ))}
        </nav>
        <button className="logout" onClick={logout}><LogOut size={16} /> {user.username}</button>
      </aside>
      <section className="stage">
        {tab === "dashboard" && <Dashboard refresh={refresh} />}
        {tab === "materials" && <Materials refresh={refresh} runTask={runTask} goTab={setTab} confirm={setConfirm} />}
        {tab === "crawl" && <Crawler refresh={refresh} runTask={runTask} goTab={setTab} />}
        {tab === "topics" && <Topics refresh={refresh} runTask={runTask} goTab={setTab} confirm={setConfirm} />}
        {tab === "contents" && <Contents refresh={refresh} runTask={runTask} confirm={setConfirm} />}
        {tab === "metrics" && <Metrics refresh={refresh} runTask={runTask} confirm={setConfirm} />}
      </section>
      {task.open && <TaskModal task={task} onClose={() => setTask({ ...task, open: false })} />}
      {confirm && <ConfirmModal title={confirm.title} message={confirm.message} onCancel={() => setConfirm(null)} onConfirm={() => { const action = confirm.onConfirm; setConfirm(null); action(); }} />}
    </main>
  );
}

function Dashboard({ refresh }: { refresh: number }) {
  const data = useApi<any>("/dashboard/summary", [refresh]);
  return (
    <Page title="今日工作台" intro="先把内容生产闭环跑通：素材、权威依据、选题、内容、审核、复盘。">
      <div className="stats">
        <Stat label="素材" value={data?.materials} />
        <Stat label="选题" value={data?.topics} />
        <Stat label="内容包" value={data?.contents} />
        <Stat label="复盘记录" value={data?.metrics} />
        <Stat label="需关注风险" value={data?.risks} tone="warn" />
      </div>
      <Panel title="最近素材">
        <Rows items={data?.latest || []} render={(item: Material) => (
          <>
            <strong>{item.title || "未命名素材"}</strong>
            <span>{levelText(item.source_level)} · {statusText(item.status)} · 创建 {dateText(item.created_at)}</span>
          </>
        )} />
      </Panel>
    </Page>
  );
}

function Materials({ refresh, runTask, goTab, confirm }: { refresh: number; runTask: any; goTab: (tab: TabKey) => void; confirm: any }) {
  const [items, setItems] = useState<Material[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [selected, setSelected] = useState<Material | null>(null);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState({ title: "", url: "", raw_content: "", manual_note: "", source_platform: "wechat", source_level: "C" });
  const load = () => api(`/materials?page=${page}`).then((data) => { setItems(data.items); setMeta(data); });
  useEffect(() => { load(); }, [refresh, page]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    await runTask("保存人工素材", async () => {
      await api("/materials", { method: "POST", body: form });
      setForm({ title: "", url: "", raw_content: "", manual_note: "", source_platform: "wechat", source_level: "C" });
      await load();
    });
  }

  async function parse(item: Material) {
    await runTask("AI 正在解析素材", async () => {
      await api(`/materials/${item.id}/parse`, { method: "POST" });
      const detail = await api(`/materials/${item.id}`);
      await load();
      setSelected(detail.item);
      return detail.item;
    });
  }

  async function topics(item: Material) {
    await runTask("正在生成候选选题", async () => {
      await api(`/materials/${item.id}/generate-topics`, { method: "POST" });
      await load();
    }, () => goTab("topics"));
  }

  return (
    <Page title="素材库" intro="人工素材只作为选题雷达；低等级素材生成内容前要有权威依据兜底。">
      <Panel title="新增人工素材">
        <form className="grid-form" onSubmit={create}>
          <input placeholder="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <input placeholder="链接，可为空" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <select value={form.source_level} onChange={(e) => setForm({ ...form, source_level: e.target.value })}>
            <option value="C">C级 人工灵感</option><option value="B">B级 主流媒体</option><option value="A">A级 专业机构</option><option value="S">S级 权威机构</option><option value="D">D级 高风险参考</option>
          </select>
          <select value={form.source_platform} onChange={(e) => setForm({ ...form, source_platform: e.target.value })}>
            <option value="wechat">公众号</option><option value="xiaohongshu">小红书</option><option value="zhihu">知乎</option><option value="book">书籍</option><option value="comment">评论区</option><option value="website">网页</option>
          </select>
          <textarea placeholder="正文/摘录" value={form.raw_content} onChange={(e) => setForm({ ...form, raw_content: e.target.value })} required />
          <textarea placeholder="备注" value={form.manual_note} onChange={(e) => setForm({ ...form, manual_note: e.target.value })} />
          <button className="primary"><Database size={16} /> 保存素材</button>
        </form>
      </Panel>
      <Panel title="素材列表">
        <div className="card-list">
          {items.map((item) => (
            <article className="item-card" key={item.id}>
              <div>
                <p className="badge">{levelText(item.source_level)} · {sourceTypeText(item.source_type)} · {statusText(item.status)}</p>
                <h3>{item.title}</h3>
                <p>{item.summary || item.raw_content?.slice(0, 120)}</p>
                <Meta created={item.created_at} updated={item.updated_at} />
              </div>
              <div className="actions">
                <button onClick={() => setSelected(item)}><Eye size={15} /> 查看</button>
                <button onClick={() => setEditing(item)}><Edit3 size={15} /> 编辑</button>
                <button onClick={() => parse(item)}><Bot size={15} /> AI解析</button>
                <button onClick={() => topics(item)}><Sparkles size={15} /> 生成选题</button>
                <button className="danger" onClick={() => confirm({ title: "确认删除素材", message: `确定删除「${item.title}」吗？删除后不可恢复。`, onConfirm: () => runTask("删除素材", async () => { await api(`/materials/${item.id}`, { method: "DELETE" }); await load(); }) })}><Trash2 size={15} /> 删除</button>
              </div>
            </article>
          ))}
        </div>
        <Pagination meta={meta} onPage={setPage} />
      </Panel>
      {selected && <MaterialDetail item={selected} onClose={() => setSelected(null)} />}
      {editing && <MaterialEditor item={editing} onClose={() => setEditing(null)} onSave={(body) => runTask("保存素材修改", async () => { await api(`/materials/${editing.id}`, { method: "PATCH", body }); setEditing(null); await load(); })} />}
    </Page>
  );
}

function Crawler({ refresh, runTask, goTab }: { refresh: number; runTask: any; goTab: (tab: TabKey) => void }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [runPage, setRunPage] = useState(1);
  const [sourcePage, setSourcePage] = useState(1);
  const [runMeta, setRunMeta] = useState<PageMeta | null>(null);
  const [sourceMeta, setSourceMeta] = useState<PageMeta | null>(null);
  const [result, setResult] = useState<any>(null);
  const [editing, setEditing] = useState<Source | null>(null);
  const load = async () => {
    const [runData, sourceData] = await Promise.all([api(`/crawl/runs?page=${runPage}`), api(`/sources?page=${sourcePage}`)]);
    setRuns(runData.items);
    setSources(sourceData.items);
    setRunMeta(runData);
    setSourceMeta(sourceData);
  };
  useEffect(() => { load(); }, [refresh, runPage, sourcePage]);

  async function run() {
    await runTask("正在抓取国家卫健委权威素材", async () => {
      const data = await api("/crawl/run", { method: "POST" });
      setResult(data);
      await load();
      return data;
    }, () => goTab("materials"));
  }

  return (
    <Page title="权威抓取" intro="第一版权威来源：国家卫生健康委健康科普辟谣平台，入库为 S 级权威素材。">
      <Panel title="国家卫健委抓取">
        <div className="crawl-box">
          <div><strong>https://www.nhc.gov.cn/kppypt/index.shtml</strong><p>手动触发抓取，写入素材库，完成后自动跳到素材界面。</p></div>
          <button className="primary" onClick={run}><Play size={16} /> 开始抓取</button>
        </div>
        {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
      </Panel>
      <Panel title="来源列表">
        <Rows items={sources} render={(source) => (
          <>
            <strong>{source.name}</strong>
            <span>{levelText(source.level)} · {source.type} · 创建 {dateText(source.created_at)}</span>
            <span className="row-actions"><button onClick={() => setEditing(source)}><Edit3 size={14} /> 编辑</button></span>
          </>
        )} />
        <Pagination meta={sourceMeta} onPage={setSourcePage} />
      </Panel>
      <Panel title="抓取记录">
        <Rows items={runs} render={(run) => (<><strong>#{run.id} {statusText(run.status)}</strong><span>抓到 {run.fetched_count} / 入库 {run.inserted_count} · {dateText(run.started_at)} · {run.error || run.finished_at}</span></>)} />
        <Pagination meta={runMeta} onPage={setRunPage} />
      </Panel>
      {editing && <SourceEditor item={editing} onClose={() => setEditing(null)} onSave={(body) => runTask("保存来源修改", async () => { await api(`/sources/${editing.id}`, { method: "PATCH", body }); setEditing(null); await load(); })} />}
    </Page>
  );
}

function Topics({ refresh, runTask, goTab, confirm }: { refresh: number; runTask: any; goTab: (tab: TabKey) => void; confirm: any }) {
  const [items, setItems] = useState<Topic[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [editing, setEditing] = useState<Topic | null>(null);
  const load = () => api(`/topics?page=${page}`).then((data) => { setItems(data.items); setMeta(data); });
  useEffect(() => { load(); }, [refresh, page]);
  async function generate(topic: Topic) {
    await runTask("正在生成内容包", async () => {
      await api(`/topics/${topic.id}/generate-content`, { method: "POST" });
      await load();
    }, () => goTab("contents"));
  }
  return (
    <Page title="选题库" intro="生成选题后会来到这里；优先选择有 S/A 级素材支撑的选题。">
      <div className="card-list">
        {items.map((topic) => (
          <article className="item-card" key={topic.id}>
            <div>
              <p className="badge">{riskText(topic.risk_level)} · {statusText(topic.status)}</p>
              <h3>{topic.title}</h3>
              <p>{topic.core_pain} · {topic.target_user}</p>
              <Meta created={topic.created_at} updated={topic.updated_at} />
            </div>
            <div className="actions">
              <button onClick={() => setEditing(topic)}><Edit3 size={15} /> 编辑</button>
              <button onClick={() => generate(topic)}><FileText size={15} /> 生成内容包</button>
              <button className="danger" onClick={() => confirm({ title: "确认删除选题", message: `确定删除「${topic.title}」吗？删除后不可恢复。`, onConfirm: () => runTask("删除选题", async () => { await api(`/topics/${topic.id}`, { method: "DELETE" }); await load(); }) })}><Trash2 size={15} /> 删除</button>
            </div>
          </article>
        ))}
      </div>
      <Pagination meta={meta} onPage={setPage} />
      {editing && <TopicEditor item={editing} onClose={() => setEditing(null)} onSave={(body) => runTask("保存选题修改", async () => { await api(`/topics/${editing.id}`, { method: "PATCH", body }); setEditing(null); await load(); })} />}
    </Page>
  );
}

function Contents({ refresh, runTask, confirm }: { refresh: number; runTask: any; confirm: any }) {
  const [items, setItems] = useState<Content[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [editing, setEditing] = useState<Content | null>(null);
  const load = () => api(`/contents?page=${page}`).then((data) => { setItems(data.items); setMeta(data); });
  useEffect(() => { load(); }, [refresh, page]);
  async function openDetail(id: number) {
    const detail = await api(`/contents/${id}`);
    setSelected(detail);
  }
  async function review(item: Content) {
    await runTask("正在进行风险审核", async () => {
      const reviewResult = await api(`/contents/${item.id}/review`, { method: "POST" });
      await load();
      const detail = await api(`/contents/${item.id}`);
      setSelected({ ...detail, latestReview: reviewResult.item });
    });
  }
  return (
    <Page title="内容包" intro="点击查看可以分别看到公众号正文、小红书图卡、海报文案、一周食谱、图片 prompt 和审核结果。">
      <div className="card-list">
        {items.map((item) => (
          <article className="item-card wide" key={item.id}>
            <div>
              <p className="badge">{statusText(item.review_status)} · {statusText(item.publish_status)}</p>
              <h3>{item.title}</h3>
              <p>{item.body?.slice(0, 140)}</p>
              <Meta created={item.created_at} updated={item.updated_at} />
            </div>
            <div className="actions">
              <button onClick={() => openDetail(item.id)}><Eye size={15} /> 查看</button>
              <button onClick={() => setEditing(item)}><Edit3 size={15} /> 编辑</button>
              <button onClick={() => review(item)}><ShieldCheck size={15} /> 风险审核</button>
              <button className="danger" onClick={() => confirm({ title: "确认删除内容包", message: `确定删除「${item.title}」吗？删除后不可恢复。`, onConfirm: () => runTask("删除内容包", async () => { await api(`/contents/${item.id}`, { method: "DELETE" }); await load(); }) })}><Trash2 size={15} /> 删除</button>
            </div>
          </article>
        ))}
      </div>
      <Pagination meta={meta} onPage={setPage} />
      {selected && <ContentDetail detail={selected} onClose={() => setSelected(null)} />}
      {editing && <ContentEditor item={editing} onClose={() => setEditing(null)} onSave={(body) => runTask("保存内容修改", async () => { await api(`/contents/${editing.id}`, { method: "PATCH", body }); setEditing(null); await load(); })} />}
    </Page>
  );
}

function Metrics({ refresh, runTask, confirm }: { refresh: number; runTask: any; confirm: any }) {
  const [contents, setContents] = useState<Content[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [editing, setEditing] = useState<Metric | null>(null);
  const [form, setForm] = useState<any>({ platform: "wechat", views: 0, likes: 0, favorites: 0, comments: 0, shares: 0, followers_gain: 0, private_messages: 0, orders: 0 });
  const load = async () => {
    const [contentData, metricData] = await Promise.all([api("/contents?page=1"), api(`/publish-metrics?page=${page}`)]);
    setContents(contentData.items);
    setMetrics(metricData.items);
    setMeta(metricData);
  };
  useEffect(() => { load(); }, [refresh, page]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await runTask("保存发布复盘", async () => {
      await api("/publish-metrics", { method: "POST", body: form });
      await load();
    });
  }
  return (
    <Page title="发布复盘" intro="手动录入发布表现，后续用来判断选题、平台和内容形式的真实反馈。">
      <Panel title="录入数据">
        <form className="metric-form" onSubmit={submit}>
          <select onChange={(e) => setForm({ ...form, content_id: Number(e.target.value) })} required><option value="">选择内容</option>{contents.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
          <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}><option value="wechat">公众号</option><option value="xiaohongshu">小红书</option></select>
          {["views", "likes", "favorites", "comments", "shares", "followers_gain", "private_messages", "orders"].map((key) => <input key={key} type="number" placeholder={metricLabel(key)} value={form[key]} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />)}
          <input placeholder="发布链接" onChange={(e) => setForm({ ...form, publish_url: e.target.value })} />
          <button className="primary"><Activity size={16} /> 保存复盘</button>
        </form>
      </Panel>
      <Panel title="最近数据">
        <Rows items={metrics} render={(m) => (<><strong>{platformText(m.platform)} · 阅读 {m.views}</strong><span>赞 {m.likes} / 藏 {m.favorites} / 转发 {m.shares} / 订单 {m.orders} · 创建 {dateText(m.created_at)}</span><span className="row-actions"><button onClick={() => setEditing(m)}><Edit3 size={14} /> 编辑</button><button className="danger" onClick={() => confirm({ title: "确认删除复盘记录", message: `确定删除这条 ${platformText(m.platform)} 复盘数据吗？删除后不可恢复。`, onConfirm: () => runTask("删除复盘", async () => { await api(`/publish-metrics/${m.id}`, { method: "DELETE" }); await load(); }) })}><Trash2 size={14} /> 删除</button></span></>)} />
        <Pagination meta={meta} onPage={setPage} />
      </Panel>
      {editing && <MetricEditor item={editing} contents={contents} onClose={() => setEditing(null)} onSave={(body) => runTask("保存复盘修改", async () => { await api(`/publish-metrics/${editing.id}`, { method: "PATCH", body }); setEditing(null); await load(); })} />}
    </Page>
  );
}

function MaterialDetail({ item, onClose }: { item: Material; onClose: () => void }) {
  return (
    <Drawer title="素材详情" onClose={onClose}>
      <h2>{item.title}</h2>
      <p className="badge">{levelText(item.source_level)} · {sourceTypeText(item.source_type)} · {statusText(item.status)}</p>
      <Meta created={item.created_at} updated={item.updated_at} />
      <DetailBlock title="AI 摘要" content={item.summary || "尚未解析"} />
      <DetailBlock title="关键词" content={jsonText(item.keywords)} />
      <DetailBlock title="主题标签" content={jsonText(item.topic_tags)} />
      <DetailBlock title="目标人群" content={jsonText(item.target_users)} />
      <DetailBlock title="食材" content={jsonText(item.food_ingredients)} />
      <DetailBlock title="风险说明" content={jsonText(item.risk_notes)} />
      <DetailBlock title="权威匹配关键词" content={jsonText(item.official_match_keywords)} />
      <DetailBlock title="原始内容" content={item.raw_content || ""} markdown />
    </Drawer>
  );
}

function ContentDetail({ detail, onClose }: { detail: any; onClose: () => void }) {
  const item: Content = detail.item;
  const cards = safeArray(item.card_text);
  const recipe = safeArray(item.recipe_json);
  const warnings = safeArray(item.risk_warnings);
  const poster = parsePoster(item.poster_text);
  return (
    <Drawer title="内容包详情" onClose={onClose} wide>
      <h2>{item.title}</h2>
      <p className="badge">{statusText(item.review_status)} · {statusText(item.publish_status)}</p>
      <Meta created={item.created_at} updated={item.updated_at} />
      <div className="detail-grid">
        <DetailBlock title="公众号正文" content={item.body} markdown />
        <section className="detail-block">
          <h3>小红书 6 图卡</h3>
          <div className="cards-preview">{cards.map((card, index) => <div className="mini-card" key={index}><span>图 {index + 1}</span><h4>{cardTitle(card)}</h4><p>{cardBody(card)}</p></div>)}</div>
        </section>
        <section className="detail-block">
          <h3>单张海报预览</h3>
          <div className="poster-preview">
            <p className="poster-kicker">日常饮食参考</p>
            <h2>{poster.title}</h2>
            <p>{poster.subtitle}</p>
            <ul>{poster.points.map((point: string, index: number) => <li key={index}>{point}</li>)}</ul>
            <small>{poster.disclaimer || "仅作日常饮食参考，不替代医疗建议。"}</small>
          </div>
        </section>
        <DetailBlock title="单张海报文案" content={item.poster_text} markdown />
        <section className="detail-block">
          <h3>一周食谱/食谱表</h3>
          <pre>{JSON.stringify(recipe, null, 2)}</pre>
        </section>
        <section className="detail-block">
          <h3>图片区域</h3>
          <div className="image-placeholder">
            <p>当前版本尚未接入图片生成接口，这里展示可用于生成图片的 Prompt。</p>
          </div>
          <pre>{item.image_prompt || "暂无图片 Prompt"}</pre>
        </section>
        <section className="detail-block">
          <h3>风险提醒</h3>
          <pre>{JSON.stringify(warnings, null, 2)}</pre>
        </section>
        <section className="detail-block full">
          <h3>审核记录</h3>
          <Rows items={detail.reviews || []} render={(r: any) => <><strong>{riskText(r.risk_level)} · {dateText(r.created_at)}</strong><span>{jsonText(r.problem_sentences) || "无问题句"}</span></>} />
          {detail.latestReview && <pre>{JSON.stringify(detail.latestReview, null, 2)}</pre>}
        </section>
      </div>
    </Drawer>
  );
}

function MaterialEditor({ item, onClose, onSave }: { item: Material; onClose: () => void; onSave: (body: any) => void }) {
  const [form, setForm] = useState<any>({ ...item });
  return <EditorShell title="编辑素材" onClose={onClose} onSave={() => onSave(form)}>
    <input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
    <input value={form.url || ""} onChange={(e) => setForm({ ...form, url: e.target.value })} />
    <select value={form.source_level || "C"} onChange={(e) => setForm({ ...form, source_level: e.target.value })}><option value="S">S级 权威机构</option><option value="A">A级 专业机构</option><option value="B">B级 主流媒体</option><option value="C">C级 人工灵感</option><option value="D">D级 高风险参考</option></select>
    <label>原始内容<RichEditor value={form.raw_content || ""} onChange={(value) => setForm({ ...form, raw_content: value })} /></label>
    <label>备注<RichEditor value={form.manual_note || ""} onChange={(value) => setForm({ ...form, manual_note: value })} height={260} /></label>
  </EditorShell>;
}

function SourceEditor({ item, onClose, onSave }: { item: Source; onClose: () => void; onSave: (body: any) => void }) {
  const [form, setForm] = useState<any>({ ...item, crawl_enabled: Boolean(item.crawl_enabled) });
  return <EditorShell title="编辑来源" onClose={onClose} onSave={() => onSave(form)}>
    <input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
    <input value={form.url || ""} onChange={(e) => setForm({ ...form, url: e.target.value })} />
    <select value={form.level || "S"} onChange={(e) => setForm({ ...form, level: e.target.value })}><option value="S">S级 权威机构</option><option value="A">A级 专业机构</option><option value="B">B级 主流媒体</option><option value="C">C级 人工灵感</option><option value="D">D级 高风险参考</option></select>
    <textarea value={form.remark || ""} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
  </EditorShell>;
}

function TopicEditor({ item, onClose, onSave }: { item: Topic; onClose: () => void; onSave: (body: any) => void }) {
  const [form, setForm] = useState<any>({ ...item });
  return <EditorShell title="编辑选题" onClose={onClose} onSave={() => onSave(form)}>
    <input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
    <input value={form.core_pain || ""} onChange={(e) => setForm({ ...form, core_pain: e.target.value })} />
    <input value={form.target_user || ""} onChange={(e) => setForm({ ...form, target_user: e.target.value })} />
    <textarea value={form.content_angle || ""} onChange={(e) => setForm({ ...form, content_angle: e.target.value })} />
  </EditorShell>;
}

function ContentEditor({ item, onClose, onSave }: { item: Content; onClose: () => void; onSave: (body: any) => void }) {
  const [form, setForm] = useState<any>({ ...item });
  return <EditorShell title="编辑内容包" onClose={onClose} onSave={() => onSave(form)}>
    <input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
    <label>公众号正文<RichEditor value={form.body || ""} onChange={(value) => setForm({ ...form, body: value })} /></label>
    <label>小红书图卡 JSON<RichEditor value={form.card_text || ""} onChange={(value) => setForm({ ...form, card_text: value })} /></label>
    <label>海报文案<RichEditor value={form.poster_text || ""} onChange={(value) => setForm({ ...form, poster_text: value })} height={300} /></label>
    <label>食谱 JSON<RichEditor value={form.recipe_json || ""} onChange={(value) => setForm({ ...form, recipe_json: value })} height={300} /></label>
    <label>图片 Prompt<RichEditor value={form.image_prompt || ""} onChange={(value) => setForm({ ...form, image_prompt: value })} height={220} /></label>
  </EditorShell>;
}

function MetricEditor({ item, contents, onClose, onSave }: { item: Metric; contents: Content[]; onClose: () => void; onSave: (body: any) => void }) {
  const [form, setForm] = useState<any>({ ...item });
  return <EditorShell title="编辑复盘数据" onClose={onClose} onSave={() => onSave(form)}>
    <select value={form.content_id} onChange={(e) => setForm({ ...form, content_id: Number(e.target.value) })}>{contents.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
    <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}><option value="wechat">公众号</option><option value="xiaohongshu">小红书</option></select>
    {["views", "likes", "favorites", "comments", "shares", "followers_gain", "private_messages", "orders"].map((key) => <input key={key} type="number" placeholder={metricLabel(key)} value={form[key] || 0} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />)}
  </EditorShell>;
}

function EditorShell({ title, children, onClose, onSave }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void }) {
  return <Drawer title={title} onClose={onClose}><div className="editor-form">{children}<button className="primary" onClick={onSave}><Save size={16} /> 保存</button></div></Drawer>;
}

function TaskModal({ task, onClose }: { task: TaskState; onClose: () => void }) {
  return (
    <div className="modal-mask">
      <section className={`task-modal ${task.status}`}>
        <div className="task-head"><strong>{task.title}</strong>{task.status !== "running" && <button onClick={onClose}><X size={16} /></button>}</div>
        <div className="progress"><span /></div>
        <p>{task.status === "running" ? "处理中，请稍候..." : task.message}</p>
      </section>
    </div>
  );
}

function ConfirmModal({ title, message, onCancel, onConfirm }: { title: string; message: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-mask">
      <section className="task-modal confirm">
        <div className="task-head"><strong>{title}</strong><button onClick={onCancel}><X size={16} /></button></div>
        <p>{message}</p>
        <div className="confirm-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary danger-primary" onClick={onConfirm}><Trash2 size={16} /> 确认删除</button>
        </div>
      </section>
    </div>
  );
}

function Drawer({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="drawer-mask">
      <section className={`drawer ${wide ? "wide-drawer" : ""}`}>
        <div className="drawer-head"><strong>{title}</strong><button onClick={onClose}><X size={16} /></button></div>
        {children}
      </section>
    </div>
  );
}

function DetailBlock({ title, content, markdown }: { title: string; content: string; markdown?: boolean }) {
  return <section className="detail-block" data-color-mode="light"><h3>{title}</h3>{markdown ? <div className="markdown-view"><MDEditor.Markdown source={content || "暂无"} /></div> : <pre>{content || "暂无"}</pre>}</section>;
}

function RichEditor({ value, onChange, height = 420 }: { value: string; onChange: (value: string) => void; height?: number }) {
  return (
    <div className="rich-editor" data-color-mode="light">
      <MDEditor value={value} onChange={(next) => onChange(next || "")} height={height} preview="edit" />
    </div>
  );
}

function Page({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return <div className="page"><header><p className="eyebrow">MVP Console</p><h1>{title}</h1><p>{intro}</p></header>{children}</div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

function Stat({ label, value, tone }: { label: string; value?: number; tone?: string }) {
  return <div className={`stat ${tone || ""}`}><span>{label}</span><strong>{value ?? "-"}</strong></div>;
}

function Rows<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  if (!items.length) return <p className="empty">暂无数据</p>;
  return <div className="rows">{items.map((item, index) => <div className="row" key={index}>{render(item)}</div>)}</div>;
}

function Pagination({ meta, onPage }: { meta: PageMeta | null; onPage: (page: number) => void }) {
  if (!meta || meta.total <= meta.pageSize) return null;
  return (
    <div className="pagination">
      <span>共 {meta.total} 条 · 每页 {meta.pageSize} 条 · 第 {meta.page} / {meta.totalPages} 页</span>
      <div>
        <button disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>上一页</button>
        <button disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>下一页</button>
      </div>
    </div>
  );
}

function Meta({ created, updated }: { created?: string; updated?: string }) {
  return <p className="meta">创建：{dateText(created)} · 更新：{dateText(updated)}</p>;
}

function useApi<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const depsKey = JSON.stringify(deps);
  useEffect(() => { api(path).then(setData); }, [path, depsKey]);
  return data;
}

async function api(path: string, options: { method?: string; body?: unknown } = {}) {
  const res = await fetch(API + path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

function sourceTypeText(value?: string) { return sourceTypeMap[value || ""] || value || "未知来源"; }
function levelText(value?: string) { return sourceLevelMap[value || ""] || value || "未分级"; }
function statusText(value?: string) { return statusMap[value || ""] || value || "未知状态"; }
function riskText(value?: string) { return riskMap[value || ""] || value || "未评估"; }
function platformText(value?: string) { return value === "wechat" ? "公众号" : value === "xiaohongshu" ? "小红书" : value || "未知平台"; }
function metricLabel(value: string) {
  return ({ views: "阅读", likes: "点赞", favorites: "收藏", comments: "评论", shares: "转发", followers_gain: "涨粉", private_messages: "私信", orders: "订单" } as Record<string, string>)[value] || value;
}
function dateText(value?: string) {
  if (!value) return "无";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
function safeArray(text?: string) {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text.split("\n").filter(Boolean);
  }
}
function jsonText(text?: string) {
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.join("、") : JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

function cardTitle(card: unknown) {
  if (card && typeof card === "object" && "title" in card) return String((card as any).title || "");
  return "";
}

function cardBody(card: unknown) {
  if (card && typeof card === "object") {
    const value = card as any;
    return String(value.body || value.text || JSON.stringify(value, null, 2));
  }
  return String(card || "");
}

function parsePoster(text?: string) {
  const fallback = { title: "海报标题", subtitle: "", points: [] as string[], disclaimer: "仅作日常饮食参考，不替代医疗建议。" };
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return {
      title: parsed.title || fallback.title,
      subtitle: parsed.subtitle || "",
      points: Array.isArray(parsed.points) ? parsed.points : [],
      disclaimer: parsed.disclaimer || fallback.disclaimer,
    };
  } catch {
    const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    return {
      title: lines[0] || fallback.title,
      subtitle: lines[1] || "",
      points: lines.slice(2, 7),
      disclaimer: lines.find((line) => /不替代|就医|参考/.test(line)) || fallback.disclaimer,
    };
  }
}

export default App;
