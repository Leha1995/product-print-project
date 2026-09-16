CREATE TABLE IF NOT EXISTS shared_products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    categories JSONB NOT NULL DEFAULT '[]'::jsonb,
    weight TEXT NOT NULL DEFAULT '',
    composition TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    barcode TEXT NOT NULL DEFAULT '',
    hit BOOLEAN NOT NULL DEFAULT FALSE,
    shelf_life_hours INTEGER,
    storage_text TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_products_updated ON shared_products (updated_at DESC);