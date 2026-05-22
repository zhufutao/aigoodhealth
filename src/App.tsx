/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import {
  Activity,
  BookOpenText,
  Bot,
  Database,
  FileText,
  Gauge,
  Lock,
  LogOut,
  Newspaper,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import "./App.css";

type Material = {
  id: number;
  title: string;
  source_type: string;
  source_name: string;
  source_level: string;
  risk_level?: string;
  status: string;
  summary?: string;
  raw_content?: string;
  url?: string;
};

type Topic = { id: number; title: string; core_pain: string; target_user: string; risk_level: string; status: string };
type Content = { id: number; title: string; review_status: string; publish_status: string; body: string; poster_text: string };

const API = "/api";

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
        <p className="hint">开发默认账号：admin / admin123456。部署后请通过 Cloudflare 环境变量替换。</p>
      </section>
    </main>
  );
}

function Workspace({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [tab, setTab] = useState("dashboard");
  const [refresh, setRefresh] = useState(0);
  const tabs = [
    ["dashboard", "总览", Gauge],
    ["materials", "素材", Database],
    ["crawl", "权威抓取", Newspaper],
    ["topics", "选题", Sparkles],
    ["contents", "内容", FileText],
    ["metrics", "复盘", Activity],
  ] as const;

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
        {tab === "materials" && <Materials onChanged={() => setRefresh((x) => x + 1)} />}
        {tab === "crawl" && <Crawler onChanged={() => setRefresh((x) => x + 1)} />}
        {tab === "topics" && <Topics onChanged={() => setRefresh((x) => x + 1)} />}
        {tab === "contents" && <Contents onChanged={() => setRefresh((x) => x + 1)} />}
        {tab === "metrics" && <Metrics />}
      </section>
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
            <span>{item.source_name} · {item.source_level} · {item.status}</span>
          </>
        )} />
      </Panel>
    </Page>
  );
}

function Materials({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<Material[]>([]);
  const [form, setForm] = useState({ title: "", url: "", raw_content: "", manual_note: "", source_platform: "wechat" });
  const [busy, setBusy] = useState("");
  const load = () => api("/materials").then((data) => setItems(data.items));
  useEffect(() => { load(); }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy("saving");
    await api("/materials", { method: "POST", body: form });
    setForm({ title: "", url: "", raw_content: "", manual_note: "", source_platform: "wechat" });
    await load();
    onChanged();
    setBusy("");
  }

  async function parse(id: number) {
    setBusy(`parse-${id}`);
    await api(`/materials/${id}/parse`, { method: "POST" });
    await load();
    setBusy("");
  }

  async function topics(id: number) {
    setBusy(`topics-${id}`);
    await api(`/materials/${id}/generate-topics`, { method: "POST" });
    await load();
    setBusy("");
  }

  return (
    <Page title="素材库" intro="人工素材只作为选题雷达；低等级素材生成内容前要有权威依据兜底。">
      <Panel title="新增人工素材">
        <form className="grid-form" onSubmit={create}>
          <input placeholder="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <input placeholder="链接，可为空" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <select value={form.source_platform} onChange={(e) => setForm({ ...form, source_platform: e.target.value })}>
            <option value="wechat">公众号</option><option value="xiaohongshu">小红书</option><option value="zhihu">知乎</option><option value="book">书籍</option><option value="comment">评论区</option><option value="website">网页</option>
          </select>
          <textarea placeholder="正文/摘录" value={form.raw_content} onChange={(e) => setForm({ ...form, raw_content: e.target.value })} required />
          <textarea placeholder="备注" value={form.manual_note} onChange={(e) => setForm({ ...form, manual_note: e.target.value })} />
          <button className="primary" disabled={busy === "saving"}><Database size={16} /> 保存素材</button>
        </form>
      </Panel>
      <Panel title="素材列表">
        <div className="card-list">
          {items.map((item) => (
            <article className="item-card" key={item.id}>
              <div><p className="badge">{item.source_level || "C"} · {item.source_type}</p><h3>{item.title}</h3><p>{item.summary || item.raw_content?.slice(0, 120)}</p></div>
              <div className="actions">
                <button onClick={() => parse(item.id)} disabled={busy === `parse-${item.id}`}><Bot size={15} /> AI 解析</button>
                <button onClick={() => topics(item.id)} disabled={busy === `topics-${item.id}`}><Sparkles size={15} /> 生成选题</button>
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </Page>
  );
}

function Crawler({ onChanged }: { onChanged: () => void }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api("/crawl/runs").then((data) => setRuns(data.items));
  useEffect(() => { load(); }, []);
  async function run() {
    setBusy(true);
    const data = await api("/crawl/run", { method: "POST" });
    setResult(data);
    await load();
    onChanged();
    setBusy(false);
  }
  return (
    <Page title="权威抓取" intro="第一版权威来源：国家卫生健康委健康科普辟谣平台，入库为 S 级权威素材。">
      <Panel title="国家卫健委抓取">
        <div className="crawl-box">
          <div><strong>https://www.nhc.gov.cn/kppypt/index.shtml</strong><p>手动触发抓取，写入 materials，后续可直接 AI 解析和生成选题。</p></div>
          <button className="primary" onClick={run} disabled={busy}><Play size={16} /> {busy ? "抓取中" : "开始抓取"}</button>
        </div>
        {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
      </Panel>
      <Panel title="抓取记录">
        <Rows items={runs} render={(run) => (<><strong>#{run.id} {run.status}</strong><span>抓到 {run.fetched_count} / 入库 {run.inserted_count} · {run.error || run.finished_at}</span></>)} />
      </Panel>
    </Page>
  );
}

function Topics({ onChanged }: { onChanged: () => void }) {
  const data = useApi<{ items: Topic[] }>("/topics", [onChanged]);
  const [busy, setBusy] = useState("");
  async function generate(id: number) {
    setBusy(String(id));
    await api(`/topics/${id}/generate-content`, { method: "POST" });
    onChanged();
    setBusy("");
  }
  return (
    <Page title="选题库" intro="优先选择有 S/A 级素材支撑的选题，人工灵感类选题需要补权威依据。">
      <div className="card-list">
        {(data?.items || []).map((topic) => (
          <article className="item-card" key={topic.id}>
            <div><p className="badge">{topic.risk_level || "low"} · {topic.status}</p><h3>{topic.title}</h3><p>{topic.core_pain} · {topic.target_user}</p></div>
            <button onClick={() => generate(topic.id)} disabled={busy === String(topic.id)}><FileText size={15} /> 生成内容包</button>
          </article>
        ))}
      </div>
    </Page>
  );
}

function Contents({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<Content[]>([]);
  const [busy, setBusy] = useState("");
  const load = () => api("/contents").then((data) => setItems(data.items));
  useEffect(() => { load(); }, []);
  async function review(id: number) {
    setBusy(String(id));
    await api(`/contents/${id}/review`, { method: "POST" });
    await load();
    onChanged();
    setBusy("");
  }
  return (
    <Page title="内容包" intro="内容生成后必须先审核风险表达，再人工发布到公众号或小红书。">
      <div className="card-list">
        {items.map((item) => (
          <article className="item-card wide" key={item.id}>
            <div><p className="badge">{item.review_status} · {item.publish_status}</p><h3>{item.title}</h3><p>{item.body?.slice(0, 180)}</p><pre>{item.poster_text}</pre></div>
            <button onClick={() => review(item.id)} disabled={busy === String(item.id)}><ShieldCheck size={15} /> 风险审核</button>
          </article>
        ))}
      </div>
    </Page>
  );
}

function Metrics() {
  const [contents, setContents] = useState<Content[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ platform: "wechat", views: 0, likes: 0, favorites: 0, comments: 0, shares: 0, followers_gain: 0, private_messages: 0, orders: 0 });
  useEffect(() => { api("/contents").then((d) => setContents(d.items)); api("/publish-metrics").then((d) => setMetrics(d.items)); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await api("/publish-metrics", { method: "POST", body: form });
    const data = await api("/publish-metrics");
    setMetrics(data.items);
  }
  return (
    <Page title="发布复盘" intro="手动录入发布表现，后续用来判断选题、平台和内容形式的真实反馈。">
      <Panel title="录入数据">
        <form className="metric-form" onSubmit={submit}>
          <select onChange={(e) => setForm({ ...form, content_id: Number(e.target.value) })} required><option value="">选择内容</option>{contents.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
          <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}><option value="wechat">公众号</option><option value="xiaohongshu">小红书</option></select>
          {["views", "likes", "favorites", "comments", "shares", "followers_gain", "private_messages", "orders"].map((key) => <input key={key} type="number" placeholder={key} value={form[key]} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} />)}
          <input placeholder="发布链接" onChange={(e) => setForm({ ...form, publish_url: e.target.value })} />
          <button className="primary"><Activity size={16} /> 保存复盘</button>
        </form>
      </Panel>
      <Panel title="最近数据">
        <Rows items={metrics} render={(m) => (<><strong>{m.platform} · 阅读 {m.views}</strong><span>赞 {m.likes} / 藏 {m.favorites} / 转发 {m.shares} / 订单 {m.orders}</span></>)} />
      </Panel>
    </Page>
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

export default App;
