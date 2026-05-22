/* eslint-disable @typescript-eslint/no-explicit-any */
type Env = {
  DB: D1Database;
  AI_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ARK_API_KEY?: string;
  ARK_MODEL?: string;
  ARK_IMAGE_MODEL?: string;
  ARK_BASE_URL?: string;
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
    if (path === "/sources" && method === "GET") return listSources(context);
    if (path === "/sources" && method === "POST") return createSource(context);
    if (match(path, /^\/sources\/(\d+)$/) && method === "PATCH") return updateSource(context, num(path));
    if (match(path, /^\/sources\/(\d+)$/) && method === "DELETE") return deleteRow(context.env, "sources", num(path));
    if (path === "/materials" && method === "GET") return listMaterials(context);
    if (path === "/materials" && method === "POST") return createMaterial(context);
    if (match(path, /^\/materials\/(\d+)$/) && method === "GET") return getMaterial(context, num(path));
    if (match(path, /^\/materials\/(\d+)$/) && method === "PATCH") return updateMaterial(context, num(path));
    if (match(path, /^\/materials\/(\d+)$/) && method === "DELETE") return deleteRow(context.env, "materials", num(path));
    if (match(path, /^\/materials\/(\d+)\/parse$/) && method === "POST") return parseMaterial(context, num(path));
    if (match(path, /^\/materials\/(\d+)\/generate-topics$/) && method === "POST") return generateTopics(context, num(path));
    if (path === "/crawl/run" && method === "POST") return runCrawl(context);
    if (path === "/crawl/runs" && method === "GET") return listCrawlRuns(context);
    if (path === "/topics" && method === "GET") return listTopics(context);
    if (match(path, /^\/topics\/(\d+)$/) && method === "GET") return getTopic(context, num(path));
    if (match(path, /^\/topics\/(\d+)$/) && method === "PATCH") return updateTopic(context, num(path));
    if (match(path, /^\/topics\/(\d+)$/) && method === "DELETE") return deleteRow(context.env, "topics", num(path));
    if (match(path, /^\/topics\/(\d+)\/generate-content$/) && method === "POST") return generateContent(context, num(path));
    if (path === "/contents" && method === "GET") return listContents(context);
    if (match(path, /^\/contents\/(\d+)$/) && method === "GET") return getContent(context, num(path));
    if (match(path, /^\/contents\/(\d+)$/) && method === "PATCH") return updateContent(context, num(path));
    if (match(path, /^\/contents\/(\d+)$/) && method === "DELETE") return deleteRow(context.env, "contents", num(path));
    if (match(path, /^\/contents\/(\d+)\/review$/) && method === "POST") return reviewContent(context, num(path));
    if (match(path, /^\/contents\/(\d+)\/generate-images$/) && method === "POST") return generateContentImages(context, num(path));
    if (path === "/publish-metrics" && method === "POST") return createMetrics(context);
    if (path === "/publish-metrics" && method === "GET") return listMetrics(context);
    if (match(path, /^\/publish-metrics\/(\d+)$/) && method === "PATCH") return updateMetrics(context, num(path));
    if (match(path, /^\/publish-metrics\/(\d+)$/) && method === "DELETE") return deleteRow(context.env, "publish_metrics", num(path));

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

async function listSources({ request, env }: PagesContext) {
  return paginated(env, request, "sources", "ORDER BY level, id");
}

async function createSource({ request, env }: PagesContext) {
  const body = await request.json<any>();
  const result = await env.DB.prepare(`
    INSERT INTO sources (name, type, level, url, crawl_enabled, remark)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(body.name, body.type || "official", body.level || "S", body.url || "", body.crawl_enabled ? 1 : 0, body.remark || "").run();
  return json({ id: result.meta.last_row_id });
}

async function updateSource({ request, env }: PagesContext, id: number) {
  const body = await request.json<any>();
  await env.DB.prepare(`
    UPDATE sources SET name=?, type=?, level=?, url=?, crawl_enabled=?, remark=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(body.name, body.type, body.level, body.url || "", body.crawl_enabled ? 1 : 0, body.remark || "", id).run();
  return json({ ok: true });
}

async function listMaterials({ request, env }: PagesContext) {
  return paginated(env, request, "materials", "ORDER BY id DESC");
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

async function updateMaterial({ request, env }: PagesContext, id: number) {
  const body = await request.json<any>();
  await env.DB.prepare(`
    UPDATE materials SET source_platform=?, source_name=?, source_level=?, title=?, url=?, raw_content=?, manual_note=?, status=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(
    body.source_platform || "website",
    body.source_name || "人工素材",
    body.source_level || "C",
    body.title || "",
    body.url || null,
    body.raw_content || "",
    body.manual_note || "",
    body.status || "new",
    id,
  ).run();
  return json({ ok: true });
}

async function parseMaterial({ env }: PagesContext, id: number) {
  try {
    const material = await env.DB.prepare("SELECT * FROM materials WHERE id = ?").bind(id).first<any>();
    if (!material) return json({ error: "素材不存在" }, 404);
    const parsed = await parseWithAi(env, material);
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
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
}

async function generateTopics({ env }: PagesContext, materialId: number) {
  try {
    const material = await env.DB.prepare("SELECT * FROM materials WHERE id = ?").bind(materialId).first<any>();
    if (!material) return json({ error: "素材不存在" }, 404);
    const topics = await topicsWithAi(env, material);
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
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
}

async function listTopics({ request, env }: PagesContext) {
  return paginated(env, request, "topics", "ORDER BY id DESC");
}

async function getTopic({ env }: PagesContext, id: number) {
  const item = await env.DB.prepare("SELECT * FROM topics WHERE id = ?").bind(id).first();
  return item ? json({ item }) : json({ error: "NOT_FOUND" }, 404);
}

async function updateTopic({ request, env }: PagesContext, id: number) {
  const body = await request.json<any>();
  await env.DB.prepare(`
    UPDATE topics SET title=?, core_pain=?, target_user=?, content_angle=?, risk_level=?, status=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(body.title || "", body.core_pain || "", body.target_user || "", body.content_angle || "", body.risk_level || "low", body.status || "candidate", id).run();
  return json({ ok: true });
}

async function generateContent({ env }: PagesContext, topicId: number) {
  try {
    const topic = await env.DB.prepare("SELECT * FROM topics WHERE id = ?").bind(topicId).first<any>();
    if (!topic) return json({ error: "选题不存在" }, 404);
    const ids = safeJsonParse<number[]>(topic.related_material_ids, []);
    const materials = ids.length ? (await env.DB.prepare(`SELECT * FROM materials WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results : [];
    const content = await contentWithAi(env, topic, materials || []);
    const result = await env.DB.prepare(`
      INSERT INTO contents (topic_id, platform, content_type, title, body, poster_text, card_text, recipe_json, image_prompt, risk_warnings)
      VALUES (?, 'multi', 'content_pack', ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      topicId,
      content.wechat_titles?.[0] || topic.title,
      content.wechat_article,
      asText(content.poster_text),
      JSON.stringify(content.xiaohongshu_cards),
      JSON.stringify(content.recipe),
      content.image_prompt,
      JSON.stringify([...(content.risk_warnings || []), content.medical_disclaimer].filter(Boolean)),
    ).run();
    await env.DB.prepare("UPDATE topics SET status='generated', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(topicId).run();
    return json({ id: result.meta.last_row_id, item: content });
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
}

async function listContents({ request, env }: PagesContext) {
  return paginated(env, request, "contents", "ORDER BY id DESC");
}

async function getContent({ env }: PagesContext, id: number) {
  const item = await env.DB.prepare("SELECT * FROM contents WHERE id = ?").bind(id).first();
  const reviews = await env.DB.prepare("SELECT * FROM content_reviews WHERE content_id = ? ORDER BY id DESC").bind(id).all();
  const images = await env.DB.prepare("SELECT * FROM content_images WHERE content_id = ? ORDER BY image_type, card_index, id").bind(id).all();
  return item ? json({ item, reviews: reviews.results || [], images: images.results || [] }) : json({ error: "NOT_FOUND" }, 404);
}

async function updateContent({ request, env }: PagesContext, id: number) {
  const body = await request.json<any>();
  await env.DB.prepare(`
    UPDATE contents SET title=?, body=?, poster_text=?, card_text=?, recipe_json=?, image_prompt=?, risk_warnings=?, review_status=?, publish_status=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(
    body.title || "",
    body.body || "",
    body.poster_text || "",
    body.card_text || "[]",
    body.recipe_json || "[]",
    body.image_prompt || "",
    body.risk_warnings || "[]",
    body.review_status || "pending",
    body.publish_status || "draft",
    id,
  ).run();
  return json({ ok: true });
}

async function reviewContent({ env }: PagesContext, contentId: number) {
  try {
    const content = await env.DB.prepare("SELECT * FROM contents WHERE id = ?").bind(contentId).first<any>();
    if (!content) return json({ error: "内容不存在" }, 404);
    const text = [content.title, content.body, content.poster_text, content.card_text, content.risk_warnings].join("\n");
    const review = await reviewWithAi(env, text);
    await env.DB.prepare(`
      INSERT INTO content_reviews (content_id, risk_level, problem_sentences, suggested_rewrites, missing_disclaimer)
      VALUES (?, ?, ?, ?, ?)
    `).bind(contentId, review.risk_level, JSON.stringify(review.problem_sentences), JSON.stringify(review.suggested_rewrites), review.missing_disclaimer ? 1 : 0).run();
    await env.DB.prepare("UPDATE contents SET review_status=? WHERE id=?").bind(review.risk_level === "high" ? "needs_edit" : "passed", contentId).run();
    return json({ item: review });
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
}

async function generateContentImages({ request, env }: PagesContext, contentId: number) {
  try {
    const body = await request.json<any>().catch(() => ({}));
    const mode = body.mode || "all";
    const content = await env.DB.prepare("SELECT * FROM contents WHERE id = ?").bind(contentId).first<any>();
    if (!content) return json({ error: "内容不存在" }, 404);
    const cards = safeJsonParse<any[]>(content.card_text, []);
    const poster = safeJsonParse<any>(content.poster_text, null);
    const tasks: { image_type: string; card_index: number | null; prompt: string }[] = [];

    if (mode === "all" || mode === "poster") {
      tasks.push({
        image_type: "poster",
        card_index: null,
        prompt: buildPosterImagePrompt(poster, content.image_prompt),
      });
    }
    if (mode === "all" || mode === "xiaohongshu") {
      cards.slice(0, 6).forEach((card, index) => {
        tasks.push({
          image_type: "xiaohongshu_card",
          card_index: index + 1,
          prompt: buildCardImagePrompt(card, index + 1),
        });
      });
    }

    const results = [];
    for (const task of tasks) {
      const url = await callArkImage(env, task.prompt);
      await env.DB.prepare(`
        INSERT INTO content_images (content_id, image_type, card_index, prompt, image_url, status)
        VALUES (?, ?, ?, ?, ?, 'generated')
      `).bind(contentId, task.image_type, task.card_index, task.prompt, url).run();
      results.push({ ...task, image_url: url });
    }
    return json({ items: results });
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
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

async function listMetrics({ request, env }: PagesContext) {
  return paginated(env, request, "publish_metrics", "ORDER BY id DESC");
}

async function updateMetrics({ request, env }: PagesContext, id: number) {
  const body = await request.json<any>();
  await env.DB.prepare(`
    UPDATE publish_metrics SET content_id=?, platform=?, publish_url=?, published_at=?, views=?, likes=?, favorites=?, comments=?, shares=?, followers_gain=?, private_messages=?, orders=?, note=?
    WHERE id=?
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
    id,
  ).run();
  return json({ ok: true });
}

async function deleteRow(env: Env, table: string, id: number) {
  const allowed = new Set(["sources", "materials", "topics", "contents", "publish_metrics"]);
  if (!allowed.has(table)) return json({ error: "不允许删除该表" }, 400);
  await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  return json({ ok: true });
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

async function listCrawlRuns({ request, env }: PagesContext) {
  return paginated(env, request, "crawl_runs", "ORDER BY id DESC");
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

async function parseWithAi(env: Env, material: any) {
  const prompt = `请把以下健康养生素材解析成结构化 JSON。

必须注意：
1. 不要截取原文开头当摘要，要用自己的话概括核心信息。
2. 人工素材只能作为选题灵感，不能直接作为健康依据。
3. 标出诊断化、疗效化、夸张化、绝对化风险。
4. 给出后续需要匹配的权威关键词。
5. 只输出 JSON。

JSON 字段：
{
  "summary": "80-160字，提炼核心观点和可用角度",
  "keywords": ["关键词"],
  "topic_tags": ["主题标签"],
  "target_users": ["目标人群"],
  "food_ingredients": ["食材"],
  "core_pain": "用户痛点",
  "suitable_for_recipe": true,
  "suitable_for_poster": true,
  "suitable_for_xiaohongshu": true,
  "suitable_for_wechat_article": true,
  "risk_level": "low/medium/high",
  "risk_notes": ["风险说明"],
  "official_match_keywords": ["权威匹配关键词"],
  "candidate_topics": ["可选题方向"]
}

素材 JSON：
${JSON.stringify(material).slice(0, 14000)}`;
  return requireObject(await callAI(env, prompt), "AI 解析结果不是合法 JSON 对象");
}

async function topicsWithAi(env: Env, material: any) {
  const prompt = `你是面向公众号和小红书的上班族中式养生食谱选题编辑。
请基于以下素材生成 3-5 个候选选题。

要求：
1. 选题面向久坐、外卖多、睡眠浅、熬夜、想养生但没时间的人。
2. 选题要有痛点，但不能恐吓、不能治疗承诺。
3. 人工素材只可用作灵感；若素材不是权威来源，content_angle 中必须提醒需要补权威依据。
4. 尽量转成食谱、清单、图卡、海报或一周食谱。
5. 禁止使用“救命、救星、告别、拯救、搞定、福音、必看、来袭、调理异常、轻松调理”等标题党和医疗暗示表达。
6. 只输出 JSON。

输出 JSON：
{
  "candidate_topics": [
    {
      "title": "",
      "core_pain": "",
      "target_user": "",
      "content_angle": "",
      "content_types": ["公众号长文", "小红书图卡", "海报文案"],
      "topic_tags": ["标签"],
      "risk_level": "low/medium/high",
      "reason": ""
    }
  ]
}

素材 JSON：
${JSON.stringify(material).slice(0, 14000)}`;
  const ai = requireObject(await callAI(env, prompt), "AI 选题结果不是合法 JSON 对象");
  const topics = ai.candidate_topics;
  if (!Array.isArray(topics) || topics.length === 0) throw new Error("AI 没有返回 candidate_topics");
  return topics.slice(0, 5).map(sanitizeTopic);
}

async function contentWithAi(env: Env, topic: any, materials: any[]) {
  const prompt = `请基于选题和关联素材，生成可人工审核后发布的完整内容包。

硬性要求：
1. 生成公众号文章，不是摘要，包含标题、导语、小标题、正文、结尾提醒。
2. 生成小红书 6 图卡文案，每张卡要有标题和正文，适合直接排版成图。
3. 生成单张海报文案，标题、副标题、3-5 个短要点、底部提醒。
4. 如适合，生成一周食谱或至少 3 天食谱。
5. 生成图片 prompt，但图片中不要包含中文文字。
6. 不得使用“专治、根治、治愈、7天见效、湿气全无、排毒、刮油、神方、秘方、一定有效、所有人都适合”等表达。
7. 不得使用“救命、救星、告别、搞定、轻松调理、调理异常、拯救、必看、来袭、福音”等营销化或医疗暗示表达。
8. 对经期、睡眠、脾胃等问题只能写“日常饮食参考/生活方式参考”，不能写成改善、调理、解决异常。
9. 必须包含“日常饮食参考”“不替代医疗建议”“有明显不适建议就医”等边界。
10. 只输出 JSON。

输出 JSON：
{
  "wechat_titles": ["公众号标题1", "公众号标题2", "公众号标题3"],
  "xiaohongshu_titles": ["小红书标题1", "小红书标题2", "小红书标题3"],
  "wechat_article": "完整公众号 Markdown 正文",
  "xiaohongshu_cards": [
    {"card": 1, "title": "封面标题", "body": "图卡正文"},
    {"card": 2, "title": "", "body": ""}
  ],
  "poster_text": {
    "title": "",
    "subtitle": "",
    "points": ["", ""],
    "disclaimer": ""
  },
  "recipe": [
    {"day": "周一", "breakfast": "", "lunch": "", "dinner": "", "note": ""}
  ],
  "image_prompt": "English prompt for food photography or poster background, no Chinese text",
  "risk_warnings": ["风险提醒"],
  "medical_disclaimer": ""
}

选题：
${JSON.stringify(topic)}

关联素材：
${JSON.stringify(materials).slice(0, 18000)}`;
  const ai = requireObject(await callAI(env, prompt), "AI 内容包结果不是合法 JSON 对象");
  if (!ai.wechat_article || !Array.isArray(ai.xiaohongshu_cards)) throw new Error("AI 内容包缺少公众号正文或小红书图卡");
  return sanitizeContent(ai);
}

async function reviewWithAi(env: Env, text: string) {
  const prompt = `请审核以下健康养生内容，找出风险表达，并输出 JSON。

重点检查：
- 医疗承诺
- 绝对化表达
- 恐吓式表达
- 食谱替代治疗
- 中医概念过度诊断化
- 特殊人群提醒遗漏

输出 JSON：
{
  "risk_level": "low/medium/high",
  "problem_sentences": ["问题句"],
  "suggested_rewrites": [{"from": "原表达", "to": "替代表达"}],
  "missing_disclaimer": true
}

内容：
${text.slice(0, 18000)}`;
  return requireObject(await callAI(env, prompt), "AI 审核结果不是合法 JSON 对象");
}

async function callAI(env: Env, prompt: string) {
  const provider = (env.AI_PROVIDER || "ark").toLowerCase();
  if (provider === "openai") return callOpenAI(env, prompt);
  return callArk(env, prompt);
}

async function callArk(env: Env, prompt: string) {
  if (!env.ARK_API_KEY) {
    throw new Error("未配置 ARK_API_KEY，无法调用火山方舟。请在 Cloudflare Pages 环境变量中添加 ARK_API_KEY。");
  }
  const baseUrl = (env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
  const model = env.ARK_MODEL || "doubao-seed-1-6-250615";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.ARK_API_KEY}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "你是健康养生食谱内容系统的 AI 助手。你只输出可解析 JSON，不输出 markdown，不输出解释文字。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`火山方舟调用失败：${res.status} ${errorText.slice(0, 500)}`);
  }
  const data = await res.json<any>();
  return safeJsonParse(data.choices?.[0]?.message?.content, null);
}

async function callArkImage(env: Env, prompt: string) {
  if (!env.ARK_API_KEY) {
    throw new Error("未配置 ARK_API_KEY，无法调用火山方舟图片生成。");
  }
  const model = env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128";
  const baseUrl = (env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.ARK_API_KEY}` },
    body: JSON.stringify({
      model,
      prompt,
      response_format: "url",
      size: "1920x1920",
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`火山方舟图片生成失败：${res.status} ${errorText.slice(0, 500)}`);
  }
  const data = await res.json<any>();
  const url = data.data?.[0]?.url || data.data?.[0]?.b64_json;
  if (!url) throw new Error("火山方舟图片生成没有返回图片 URL");
  return url;
}

async function callOpenAI(env: Env, prompt: string) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("未配置 OPENAI_API_KEY，无法进行真实 AI 调用。请在 Cloudflare Pages 环境变量中添加 OPENAI_API_KEY。");
  }
  const model = env.OPENAI_MODEL || "gpt-5.2";
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: "你是健康养生食谱内容系统的 AI 助手。你只输出可解析 JSON，不输出 markdown，不输出解释文字。" },
        { role: "user", content: prompt },
      ],
      text: { format: { type: "json_object" } },
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI 调用失败：${res.status} ${errorText.slice(0, 500)}`);
  }
  const data = await res.json<any>();
  return safeJsonParse(extractOutputText(data), null);
}

function extractOutputText(data: any) {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks: string[] = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function requireObject(value: any, message: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value;
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

async function paginated(env: Env, request: Request, table: string, orderBy: string) {
  const allowed = new Set(["sources", "materials", "topics", "contents", "publish_metrics", "crawl_runs"]);
  if (!allowed.has(table)) return json({ error: "不允许查询该表" }, 400);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = 20;
  const offset = (page - 1) * pageSize;
  const total = await scalar(env, `SELECT COUNT(*) FROM ${table}`);
  const rows = await env.DB.prepare(`SELECT * FROM ${table} ${orderBy} LIMIT ? OFFSET ?`).bind(pageSize, offset).all();
  return json({ items: rows.results || [], page, pageSize, total, totalPages: Math.max(1, Math.ceil(Number(total) / pageSize)) });
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

function asText(value: any) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeTopic(topic: any) {
  return {
    ...topic,
    title: sanitizeHealthText(topic.title || ""),
    core_pain: sanitizeHealthText(topic.core_pain || ""),
    content_angle: sanitizeHealthText(topic.content_angle || ""),
    reason: sanitizeHealthText(topic.reason || ""),
  };
}

function sanitizeContent(content: any) {
  return JSON.parse(sanitizeHealthText(JSON.stringify(content)));
}

function sanitizeHealthText(text: string) {
  return text
    .replace(/救命/g, "日常参考")
    .replace(/救星/g, "参考清单")
    .replace(/告别/g, "减少困扰")
    .replace(/拯救/g, "作为参考")
    .replace(/轻松调理异常/g, "作为日常饮食参考")
    .replace(/调理异常/g, "日常参考")
    .replace(/轻松搞定/g, "日常参考")
    .replace(/搞定/g, "参考")
    .replace(/必看/g, "可参考")
    .replace(/福音/g, "参考")
    .replace(/来袭/g, "到来")
    .replace(/改善/g, "作为生活方式调整参考")
    .replace(/调理/g, "日常参考")
    .replace(/治疗/g, "就医咨询")
    .replace(/疗效/g, "参考价值");
}

function buildPosterImagePrompt(poster: any, fallbackPrompt?: string) {
  const title = poster?.title || "healthy Chinese meal poster";
  const subtitle = poster?.subtitle || "";
  return [
    "Create a clean vertical editorial poster background for a Chinese healthy home-style recipe content card.",
    "No text, no letters, no Chinese characters in the image.",
    "Warm natural daylight, modern lifestyle, restrained colors, appetizing but not commercial.",
    `Theme: ${title}. ${subtitle}`,
    fallbackPrompt ? `Visual reference: ${fallbackPrompt}` : "",
  ].filter(Boolean).join(" ");
}

function buildCardImagePrompt(card: any, index: number) {
  const title = card?.title || `card ${index}`;
  const body = card?.body || card?.text || "";
  return [
    "Create a square background illustration/photo for a Xiaohongshu health recipe card.",
    "No text, no letters, no Chinese characters in the image.",
    "Soft natural food photography or tasteful editorial illustration, clean composition with space for text overlay.",
    `Card topic: ${title}. ${String(body).slice(0, 180)}`,
  ].join(" ");
}

