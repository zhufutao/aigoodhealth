/* eslint-disable @typescript-eslint/no-explicit-any */
type Env = {
  DB: D1Database;
  OPENAI_API_KEY?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
};

type PagesContext = {
  request: Request;
  env: Env;
  params: { path?: string | string[] };
};

const SOURCE_NAME = "国家卫生健康委健康科普辟谣平台";
const SOURCE_URL = "https://www.nhc.gov.cn/kppypt/index.shtml";
const FALLBACK_NHC_LIST = "https://www.nhc.gov.cn/wjw/spaqyyy/list.shtml";
const PBKDF2_ITERATIONS = 100000;
const NHC_SEED_ITEMS = [
  {
    title: "国民营养健康指导委员会办公室关于印发“健康饮食、合理膳食”核心信息的通知",
    url: "https://www.nhc.gov.cn/sps/c100088/202505/6b7a718abd4848e8a3e98fc561a8858b.shtml",
    published_at: "2025-05-16",
    content: "国家卫生健康委相关通知围绕“健康饮食、合理膳食”主题，倡导增加蔬菜水果、全谷物和水产品摄入，引导形成合理膳食结构。该素材可作为上班族日常饮食参考、食物多样、少油少盐和家常食谱内容的权威依据。",
  },
  {
    title: "合理膳食健康教育核心信息及释义",
    url: "https://www.nhc.gov.cn/xcs/cbcl/201706/d7d8ff3889be445b8bfb86a5efea952f.shtml",
    published_at: "2017-06-14",
    content: "国家卫生健康委发布的合理膳食健康教育核心信息强调食物多样、平衡膳食、清淡饮食，建议减少过多食盐、烹调油和脂肪摄入，选择新鲜卫生的食物和适宜烹调方式。",
  },
];
const encoder = new TextEncoder();

export async function onRequest(context: PagesContext): Promise<Response> {
  try {
    const path = "/" + ([] as string[]).concat(context.params.path || []).join("/");
    const method = context.request.method;

    if (method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
    if (path === "/auth/login" && method === "POST") return login(context);
    if (path === "/auth/logout" && method === "POST") return logout();

    const user = await requireUser(context);
    if (!user) return json({ error: "UNAUTHORIZED" }, 401);
    if (path === "/auth/me" && method === "GET") return json({ user });
    if (path === "/dashboard/summary" && method === "GET") return dashboard(context.env);
    if (path === "/sources" && method === "GET") return listSources(context.env);
    if (path === "/materials" && method === "GET") return listMaterials(context.env);
    if (path === "/materials" && method === "POST") return createMaterial(context);
    if (match(path, /^\/materials\/(\d+)$/) && method === "GET") return getMaterial(context, num(path));
    if (match(path, /^\/materials\/(\d+)\/parse$/) && method === "POST") return parseMaterial(context, num(path));
    if (match(path, /^\/materials\/(\d+)\/generate-topics$/) && method === "POST") return generateTopics(context, num(path));
    if (path === "/crawl/run" && method === "POST") return runCrawl(context);
    if (path === "/crawl/runs" && method === "GET") return listCrawlRuns(context.env);
    if (path === "/topics" && method === "GET") return listTopics(context.env);
    if (match(path, /^\/topics\/(\d+)\/generate-content$/) && method === "POST") return generateContent(context, num(path));
    if (path === "/contents" && method === "GET") return listContents(context.env);
    if (match(path, /^\/contents\/(\d+)\/review$/) && method === "POST") return reviewContent(context, num(path));
    if (path === "/publish-metrics" && method === "POST") return createMetrics(context);
    if (path === "/publish-metrics" && method === "GET") return listMetrics(context.env);

    return json({ error: "NOT_FOUND", path }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

async function login({ request, env }: PagesContext) {
  await ensureDefaultAdmin(env);
  const body = await request.json<{ username: string; password: string }>();
  const row = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(body.username).first<any>();
  if (!row) return json({ error: "用户名或密码不正确" }, 401);
  const ok = await verifyPassword(body.password, row.password_hash);
  if (!ok) return json({ error: "用户名或密码不正确" }, 401);
  const token = await signSession({ id: row.id, username: row.username, role: row.role }, env);
  return json(
    { user: { id: row.id, username: row.username, role: row.role } },
    200,
    { "Set-Cookie": `agh_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800` },
  );
}

function logout() {
  return json({ ok: true }, 200, { "Set-Cookie": "agh_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0" });
}

async function requireUser({ request, env }: PagesContext) {
  await ensureDefaultAdmin(env);
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("agh_session="))?.slice(12);
  if (!token) return null;
  return verifySession(token, env);
}

async function ensureDefaultAdmin(env: Env) {
  const count = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first<{ count: number }>();
  if ((count?.count || 0) > 0) return;
  const username = env.ADMIN_USERNAME || "admin";
  const password = env.ADMIN_PASSWORD || "admin123456";
  const hash = await hashPassword(password);
  await env.DB.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')").bind(username, hash).run();
}

async function dashboard(env: Env) {
  const [materials, topics, contents, metrics, risks] = await Promise.all([
    scalar(env, "SELECT COUNT(*) FROM materials"),
    scalar(env, "SELECT COUNT(*) FROM topics"),
    scalar(env, "SELECT COUNT(*) FROM contents"),
    scalar(env, "SELECT COUNT(*) FROM publish_metrics"),
    scalar(env, "SELECT COUNT(*) FROM materials WHERE risk_level IN ('medium','high')"),
  ]);
  const latest = await env.DB.prepare("SELECT * FROM materials ORDER BY id DESC LIMIT 6").all();
  return json({ materials, topics, contents, metrics, risks, latest: latest.results || [] });
}

async function listSources(env: Env) {
  const rows = await env.DB.prepare("SELECT * FROM sources ORDER BY level, id").all();
  return json({ items: rows.results || [] });
}

async function listMaterials(env: Env) {
  const rows = await env.DB.prepare("SELECT * FROM materials ORDER BY id DESC LIMIT 100").all();
  return json({ items: rows.results || [] });
}

async function getMaterial({ env }: PagesContext, id: number) {
  const item = await env.DB.prepare("SELECT * FROM materials WHERE id = ?").bind(id).first();
  return item ? json({ item }) : json({ error: "NOT_FOUND" }, 404);
}

async function createMaterial({ request, env }: PagesContext) {
  const body = await request.json<any>();
  const result = await env.DB.prepare(`
    INSERT INTO materials (source_type, source_platform, source_name, source_level, title, url, raw_content, manual_note, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')
  `).bind(
    body.source_type || "manual_input",
    body.source_platform || "website",
    body.source_name || "人工素材",
    body.source_level || "C",
    body.title || "",
    body.url || null,
    body.raw_content || "",
    body.manual_note || "",
  ).run();
  return json({ id: result.meta.last_row_id });
}

async function parseMaterial({ env }: PagesContext, id: number) {
  const material = await env.DB.prepare("SELECT * FROM materials WHERE id = ?").bind(id).first<any>();
  if (!material) return json({ error: "素材不存在" }, 404);
  const parsed = await parseWithAiOrFallback(env, material);
  await env.DB.prepare(`
    UPDATE materials SET summary=?, keywords=?, topic_tags=?, target_users=?, food_ingredients=?,
      suitable_for_recipe=?, suitable_for_poster=?, suitable_for_xiaohongshu=?, suitable_for_wechat_article=?,
      risk_level=?, risk_notes=?, official_match_keywords=?, status='parsed', updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(
    parsed.summary,
    JSON.stringify(parsed.keywords),
    JSON.stringify(parsed.topic_tags),
    JSON.stringify(parsed.target_users),
    JSON.stringify(parsed.food_ingredients),
    parsed.suitable_for_recipe ? 1 : 0,
    parsed.suitable_for_poster ? 1 : 0,
    parsed.suitable_for_xiaohongshu ? 1 : 0,
    parsed.suitable_for_wechat_article ? 1 : 0,
    parsed.risk_level,
    JSON.stringify(parsed.risk_notes),
    JSON.stringify(parsed.official_match_keywords),
    id,
  ).run();
  return json({ item: parsed });
}

async function generateTopics({ env }: PagesContext, materialId: number) {
  const material = await env.DB.prepare("SELECT * FROM materials WHERE id = ?").bind(materialId).first<any>();
  if (!material) return json({ error: "素材不存在" }, 404);
  const topics = await topicsWithAiOrFallback(env, material);
  for (const topic of topics) {
    await env.DB.prepare(`
      INSERT INTO topics (title, core_pain, target_user, topic_tags, related_material_ids, official_source_count, manual_source_count, content_angle, recipe_potential, poster_potential, risk_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      topic.title,
      topic.core_pain,
      topic.target_user,
      JSON.stringify(topic.topic_tags || []),
      JSON.stringify([materialId]),
      material.source_type === "official_auto" ? 1 : 0,
      material.source_type === "manual_input" ? 1 : 0,
      topic.content_angle,
      1,
      1,
      topic.risk_level || "low",
    ).run();
  }
  await env.DB.prepare("UPDATE materials SET status='topic_generated', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(materialId).run();
  return json({ items: topics });
}

async function listTopics(env: Env) {
  const rows = await env.DB.prepare("SELECT * FROM topics ORDER BY id DESC LIMIT 100").all();
  return json({ items: rows.results || [] });
}

async function generateContent({ env }: PagesContext, topicId: number) {
  const topic = await env.DB.prepare("SELECT * FROM topics WHERE id = ?").bind(topicId).first<any>();
  if (!topic) return json({ error: "选题不存在" }, 404);
  const ids = safeJsonParse<number[]>(topic.related_material_ids, []);
  const materials = ids.length ? (await env.DB.prepare(`SELECT * FROM materials WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results : [];
  const content = await contentWithAiOrFallback(env, topic, materials || []);
  const result = await env.DB.prepare(`
    INSERT INTO contents (topic_id, platform, content_type, title, body, poster_text, card_text, recipe_json, image_prompt, risk_warnings)
    VALUES (?, 'multi', 'content_pack', ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    topicId,
    content.wechat_titles?.[0] || topic.title,
    content.wechat_article,
    content.poster_text,
    JSON.stringify(content.xiaohongshu_cards),
    JSON.stringify(content.recipe),
    content.image_prompt,
    JSON.stringify([...(content.risk_warnings || []), content.medical_disclaimer].filter(Boolean)),
  ).run();
  await env.DB.prepare("UPDATE topics SET status='generated', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(topicId).run();
  return json({ id: result.meta.last_row_id, item: content });
}

async function listContents(env: Env) {
  const rows = await env.DB.prepare("SELECT * FROM contents ORDER BY id DESC LIMIT 100").all();
  return json({ items: rows.results || [] });
}

async function reviewContent({ env }: PagesContext, contentId: number) {
  const content = await env.DB.prepare("SELECT * FROM contents WHERE id = ?").bind(contentId).first<any>();
  if (!content) return json({ error: "内容不存在" }, 404);
  const text = [content.title, content.body, content.poster_text, content.card_text, content.risk_warnings].join("\n");
  const review = await reviewWithAiOrFallback(env, text);
  await env.DB.prepare(`
    INSERT INTO content_reviews (content_id, risk_level, problem_sentences, suggested_rewrites, missing_disclaimer)
    VALUES (?, ?, ?, ?, ?)
  `).bind(contentId, review.risk_level, JSON.stringify(review.problem_sentences), JSON.stringify(review.suggested_rewrites), review.missing_disclaimer ? 1 : 0).run();
  await env.DB.prepare("UPDATE contents SET review_status=? WHERE id=?").bind(review.risk_level === "high" ? "needs_edit" : "passed", contentId).run();
  return json({ item: review });
}

async function createMetrics({ request, env }: PagesContext) {
  const body = await request.json<any>();
  const result = await env.DB.prepare(`
    INSERT INTO publish_metrics (content_id, platform, publish_url, published_at, views, likes, favorites, comments, shares, followers_gain, private_messages, orders, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.content_id,
    body.platform,
    body.publish_url || "",
    body.published_at || new Date().toISOString().slice(0, 10),
    body.views || 0,
    body.likes || 0,
    body.favorites || 0,
    body.comments || 0,
    body.shares || 0,
    body.followers_gain || 0,
    body.private_messages || 0,
    body.orders || 0,
    body.note || "",
  ).run();
  return json({ id: result.meta.last_row_id });
}

async function listMetrics(env: Env) {
  const rows = await env.DB.prepare("SELECT * FROM publish_metrics ORDER BY id DESC LIMIT 100").all();
  return json({ items: rows.results || [] });
}

async function runCrawl({ env }: PagesContext) {
  const source = await env.DB.prepare("SELECT * FROM sources WHERE id = 1").first<any>();
  const run = await env.DB.prepare("INSERT INTO crawl_runs (source_id, source_name) VALUES (?, ?)").bind(source?.id || 1, SOURCE_NAME).run();
  const runId = run.meta.last_row_id;
  try {
    const items = await crawlNhc();
    let inserted = 0;
    for (const item of items) {
      const result = await env.DB.prepare(`
        INSERT OR IGNORE INTO materials (source_type, source_platform, source_name, source_level, title, url, published_at, raw_content, summary, topic_tags, status)
        VALUES ('official_auto', 'official', ?, 'S', ?, ?, ?, ?, ?, ?, 'new')
      `).bind(SOURCE_NAME, item.title, item.url, item.published_at, item.content, item.summary, JSON.stringify(item.tags)).run();
      inserted += result.meta.changes || 0;
    }
    await env.DB.prepare("UPDATE crawl_runs SET status='success', finished_at=CURRENT_TIMESTAMP, fetched_count=?, inserted_count=? WHERE id=?").bind(items.length, inserted, runId).run();
    return json({ run_id: runId, fetched_count: items.length, inserted_count: inserted, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare("UPDATE crawl_runs SET status='failed', finished_at=CURRENT_TIMESTAMP, error=? WHERE id=?").bind(message, runId).run();
    return json({ run_id: runId, error: message }, 500);
  }
}

async function listCrawlRuns(env: Env) {
  const rows = await env.DB.prepare("SELECT * FROM crawl_runs ORDER BY id DESC LIMIT 20").all();
  return json({ items: rows.results || [] });
}

async function crawlNhc() {
  let note = "";
  let links: { title: string; url: string }[] = [];
  try {
    const platformHtml = await fetchText(SOURCE_URL);
    links = extractLinks(platformHtml, SOURCE_URL).filter((item) => /营养|食品|膳食|食谱|饮食|体重|中医药|慢性病/.test(item.title));
  } catch (error) {
    note = `健康科普辟谣平台页面抓取受限：${error instanceof Error ? error.message : String(error)}。`;
  }
  if (links.length === 0) {
    note += "健康科普辟谣平台页面未直接暴露列表，使用国家卫健委同域食品安全与营养公开栏目兜底。";
    try {
      const fallbackHtml = await fetchText(FALLBACK_NHC_LIST);
      links = extractLinks(fallbackHtml, FALLBACK_NHC_LIST).slice(0, 8);
    } catch (error) {
      note += `同域栏目抓取受限：${error instanceof Error ? error.message : String(error)}。使用内置国家卫健委权威地址种子完成流程验证。`;
    }
  }
  const items = [];
  if (links.length === 0) {
    return NHC_SEED_ITEMS.map((item) => ({
      ...item,
      summary: `${note}${item.content.slice(0, 260)}`,
      tags: ["国家卫健委", "权威素材", "膳食营养和食品安全"],
    }));
  }
  for (const link of links.slice(0, 6)) {
    const html = await fetchText(link.url);
    const text = cleanHtml(html);
    const date = html.match(/发布时间[:：]\s*([0-9-]{10})/)?.[1] || link.title.match(/(20\d{2}-\d{2}-\d{2})/)?.[1] || "";
    items.push({
      title: normalizeTitle(link.title),
      url: link.url,
      published_at: date,
      content: text.slice(0, 5000),
      summary: `${note}${text.slice(0, 260)}`,
      tags: ["国家卫健委", "权威素材", "膳食营养和食品安全"],
    });
  }
  if (items.length === 0) throw new Error("未能从国家卫健委页面解析到可入库内容");
  return items;
}

function extractLinks(html: string, base: string) {
  const out: { title: string; url: string }[] = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const title = cleanHtml(match[2]).replace(/\s+/g, " ").trim();
    if (!title || title.length < 4) continue;
    if (!/\.shtml/.test(match[1])) continue;
    out.push({ title, url: new URL(match[1], base).toString() });
  }
  return uniqueBy(out, (item) => item.url);
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 aigoodhealth-crawler/1.0",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`抓取失败 ${res.status}: ${url}`);
  return res.text();
}

function cleanHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&ldquo;|&rdquo;/g, "“")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function parseWithAiOrFallback(env: Env, material: any) {
  const prompt = `你是健康养生内容编辑助手。请解析素材，输出 JSON，字段 summary, keywords, topic_tags, target_users, food_ingredients, core_pain, suitable_for_recipe, suitable_for_poster, suitable_for_xiaohongshu, suitable_for_wechat_article, risk_level, risk_notes, official_match_keywords, candidate_topics。素材：${JSON.stringify(material).slice(0, 9000)}`;
  const ai = await callOpenAI(env, prompt);
  if (ai) return ai;
  const text = `${material.title || ""}\n${material.raw_content || material.summary || ""}`;
  const risks = findRiskTerms(text);
  return {
    summary: text.slice(0, 180) || "待补充摘要",
    keywords: pickKeywords(text),
    topic_tags: ["上班族饮食", "健康科普", material.source_type === "official_auto" ? "权威依据" : "选题灵感"],
    target_users: ["久坐上班族", "外卖较多的人", "想做日常饮食调整的人"],
    food_ingredients: [],
    core_pain: "想用更稳妥的日常饮食方式改善生活状态",
    suitable_for_recipe: true,
    suitable_for_poster: true,
    suitable_for_xiaohongshu: true,
    suitable_for_wechat_article: true,
    risk_level: risks.length ? "medium" : "low",
    risk_notes: risks,
    official_match_keywords: ["合理膳食", "食物多样", "少油少盐", "膳食指南"],
    candidate_topics: [],
  };
}

async function topicsWithAiOrFallback(env: Env, material: any) {
  const prompt = `你是面向上班族中式养生食谱号的选题编辑。基于素材生成 5 个选题，输出 {"candidate_topics":[{"title":"","core_pain":"","target_user":"","content_angle":"","content_types":[],"risk_level":"","reason":""}]}。素材：${JSON.stringify(material).slice(0, 9000)}`;
  const ai = await callOpenAI(env, prompt);
  const topics = ai?.candidate_topics;
  if (Array.isArray(topics) && topics.length) return topics.map((t: any) => ({ ...t, topic_tags: ["上班族饮食", "中式家常", "日常饮食参考"] }));
  const base = material.title || "合理膳食";
  return [
    { title: `外卖吃多了，上班族晚餐先做 4 个减法`, core_pain: "晚餐重口、油盐偏多", target_user: "外卖多的上班族", content_angle: `结合「${base}」转成家常晚餐清单`, topic_tags: ["晚餐", "少油少盐"], risk_level: "low" },
    { title: `一周轻负担家常饭：照着这个思路搭配就好`, core_pain: "想吃得清淡但不知道怎么搭", target_user: "想养生但没时间的人", content_angle: "用权威膳食原则拆成一周食谱", topic_tags: ["一周食谱", "家常"], risk_level: "low" },
    { title: `久坐上班族的午餐盒：主食、蔬菜、蛋白质怎么放`, core_pain: "午餐结构单一", target_user: "久坐上班族", content_angle: "把合理膳食变成饭盒比例", topic_tags: ["午餐", "饭盒"], risk_level: "low" },
  ];
}

async function contentWithAiOrFallback(env: Env, topic: any, materials: any[]) {
  const prompt = `请基于选题和素材生成内容包，输出 JSON：wechat_titles, xiaohongshu_titles, wechat_article, xiaohongshu_cards, poster_text, recipe, image_prompt, risk_warnings, medical_disclaimer。禁止专治、根治、治愈、7天见效、湿气全无、排毒、刮油、神方、秘方。选题：${JSON.stringify(topic)} 素材：${JSON.stringify(materials).slice(0, 12000)}`;
  const ai = await callOpenAI(env, prompt);
  if (ai?.wechat_article) return ai;
  return {
    wechat_titles: [topic.title, `${topic.title}，日常饮食参考版`, `给上班族的清淡吃法清单`],
    xiaohongshu_titles: [topic.title, "上班族家常饮食参考", "外卖多的人可以看看"],
    wechat_article: `# ${topic.title}\n\n这份内容基于权威健康科普原则整理，适合作为日常饮食参考。\n\n## 为什么值得做\n${topic.core_pain || "很多上班族饮食节奏快，容易油盐偏多、蔬菜不足。"}\n\n## 家常做法\n1. 每餐先保证一份蔬菜。\n2. 主食尽量粗细搭配。\n3. 蛋白质选择鸡蛋、鱼虾、豆制品、瘦肉等常见食材。\n4. 调味少油少盐，避免把清淡饮食写成治疗方案。\n\n## 边界提醒\n仅作日常饮食参考，不替代医疗建议。有明显不适、基础疾病、孕期、儿童、老人或特殊饮食限制，请按医生或营养师建议调整。`,
    xiaohongshu_cards: ["封面：" + topic.title, "痛点：外卖多、晚餐重口、蔬菜少", "原则：食物多样，少油少盐", "搭配：主食+蔬菜+蛋白质", "食谱：清炒时蔬、番茄豆腐汤、杂粮饭", "提醒：不替代医疗建议"],
    poster_text: `${topic.title}\n主食粗细搭配 / 每餐一份蔬菜 / 蛋白质别省 / 少油少盐\n仅作日常饮食参考，不替代医疗建议。`,
    recipe: [
      { day: "周一", dinner: "杂粮饭 + 番茄豆腐汤 + 清炒油麦菜" },
      { day: "周二", dinner: "米饭 + 香菇鸡胸肉 + 凉拌黄瓜" },
      { day: "周三", dinner: "红薯 + 西兰花虾仁 + 紫菜蛋花汤" },
    ],
    image_prompt: "A clean editorial food photography scene with Chinese home-style dinner, vegetables, grains and tofu, natural daylight, no text in image",
    risk_warnings: ["避免使用治疗承诺和绝对化表达。"],
    medical_disclaimer: "仅作日常饮食参考，不替代医疗建议。有明显不适建议就医。",
  };
}

async function reviewWithAiOrFallback(env: Env, text: string) {
  const prompt = `请审核健康养生内容，输出 JSON：risk_level, problem_sentences, suggested_rewrites, missing_disclaimer。内容：${text.slice(0, 12000)}`;
  const ai = await callOpenAI(env, prompt);
  if (ai?.risk_level) return ai;
  const problems = findRiskTerms(text);
  return {
    risk_level: problems.length ? "medium" : "low",
    problem_sentences: problems,
    suggested_rewrites: problems.map((term) => ({ from: term, to: "日常饮食参考/生活方式调整的一部分" })),
    missing_disclaimer: !/不替代医疗建议|建议就医|医生|营养师/.test(text),
  };
}

async function callOpenAI(env: Env, prompt: string) {
  if (!env.OPENAI_API_KEY) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: "你只输出可解析 JSON，不输出 markdown。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json<any>();
  return safeJsonParse(data.choices?.[0]?.message?.content, null);
}

function findRiskTerms(text: string) {
  return ["专治", "根治", "治愈", "7天见效", "湿气全无", "排毒", "刮油", "神方", "秘方", "一定有效", "所有人都适合", "不吃药也能好"].filter((term) => text.includes(term));
}

function pickKeywords(text: string) {
  return ["合理膳食", "蔬菜", "水果", "全谷物", "少油少盐", "上班族", "家常饭"].filter((term) => text.includes(term) || Math.random() > 0.65).slice(0, 5);
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256);
  return `pbkdf2$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string) {
  const [, salt64, hash64] = stored.split("$");
  const salt = fromB64(salt64);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256);
  return b64(new Uint8Array(bits)) === hash64;
}

async function signSession(payload: any, env: Env) {
  const body = btoa(JSON.stringify({ ...payload, exp: Date.now() + 7 * 86400_000 }));
  const sig = await hmac(body, env.SESSION_SECRET || "dev-secret");
  return `${body}.${sig}`;
}

async function verifySession(token: string, env: Env) {
  const [body, sig] = token.split(".");
  if (!body || !sig || await hmac(body, env.SESSION_SECRET || "dev-secret") !== sig) return null;
  const payload = JSON.parse(atob(body));
  if (payload.exp < Date.now()) return null;
  return { id: payload.id, username: payload.username, role: payload.role };
}

async function hmac(text: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(text))));
}

function b64(bytes: Uint8Array) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
}

async function scalar(env: Env, sql: string) {
  const row = await env.DB.prepare(sql).first<any>();
  return Object.values(row || {})[0] || 0;
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(), ...headers },
  });
}

function corsHeaders() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS" };
}

function safeJsonParse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

function match(path: string, re: RegExp) {
  return re.test(path);
}

function num(path: string) {
  return Number(path.match(/\d+/)?.[0]);
}

function uniqueBy<T>(items: T[], fn: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = fn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeTitle(title: string) {
  return title.replace(/\d{4}-\d{2}-\d{2}/g, "").replace(/\s+/g, " ").trim();
}
