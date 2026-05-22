CREATE TABLE IF NOT EXISTS content_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  image_type TEXT NOT NULL,
  card_index INTEGER,
  prompt TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'generated',
  error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

