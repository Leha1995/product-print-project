CREATE TABLE IF NOT EXISTS user_products (
  user_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  weight TEXT NOT NULL DEFAULT '',
  composition TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  barcode TEXT NOT NULL DEFAULT '',
  hit BOOLEAN NOT NULL DEFAULT FALSE,
  shelf_life_hours INTEGER,
  storage_text TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS user_categories (
  user_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'Utensils',
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS user_prefs (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS user_meta (
  user_id INTEGER PRIMARY KEY,
  seeded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);