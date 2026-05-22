CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  level TEXT NOT NULL,
  url TEXT,
  crawl_enabled INTEGER DEFAULT 0,
  remark TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_platform TEXT,
  source_name TEXT,
  source_level TEXT,
  title TEXT,
  url TEXT UNIQUE,
  published_at TEXT,
  raw_content TEXT,
  manual_note TEXT,
  summary TEXT,
  keywords TEXT,
  topic_tags TEXT,
  target_users TEXT,
  food_ingredients TEXT,
  suitable_for_recipe INTEGER DEFAULT 0,
  suitable_for_poster INTEGER DEFAULT 0,
  suitable_for_xiaohongshu INTEGER DEFAULT 0,
  suitable_for_wechat_article INTEGER DEFAULT 0,
  risk_level TEXT,
  risk_notes TEXT,
  official_match_keywords TEXT,
  matched_official_material_ids TEXT,
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  core_pain TEXT,
  target_user TEXT,
  topic_tags TEXT,
  related_material_ids TEXT,
  official_source_count INTEGER DEFAULT 0,
  manual_source_count INTEGER DEFAULT 0,
  content_angle TEXT,
  recipe_potential INTEGER DEFAULT 0,
  poster_potential INTEGER DEFAULT 0,
  risk_level TEXT,
  status TEXT DEFAULT 'candidate',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER,
  platform TEXT,
  content_type TEXT,
  title TEXT,
  body TEXT,
  poster_text TEXT,
  card_text TEXT,
  recipe_json TEXT,
  image_prompt TEXT,
  risk_warnings TEXT,
  review_status TEXT DEFAULT 'pending',
  publish_status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS publish_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER,
  platform TEXT,
  publish_url TEXT,
  published_at TEXT,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  favorites INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  followers_gain INTEGER DEFAULT 0,
  private_messages INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER,
  source_name TEXT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  status TEXT DEFAULT 'running',
  fetched_count INTEGER DEFAULT 0,
  inserted_count INTEGER DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS content_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER,
  risk_level TEXT,
  problem_sentences TEXT,
  suggested_rewrites TEXT,
  missing_disclaimer INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL,
  target_table TEXT,
  target_id INTEGER,
  status TEXT DEFAULT 'queued',
  input_summary TEXT,
  output_json TEXT,
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO sources (id, name, type, level, url, crawl_enabled, remark)
VALUES (
  1,
  '国家卫生健康委健康科普辟谣平台',
  'official',
  'S',
  'https://www.nhc.gov.cn/kppypt/index.shtml',
  1,
  '第一版权威抓取来源；如平台页不暴露列表，抓取器会记录并使用国家卫健委同域公开健康知识栏目兜底。'
);

