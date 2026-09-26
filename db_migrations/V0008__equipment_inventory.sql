CREATE TABLE IF NOT EXISTS equipment (
    id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    location TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    serial TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS equipment_code_user_idx ON equipment (user_id, code);

CREATE TABLE IF NOT EXISTS inventory_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    started_by INTEGER,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    scanned JSONB NOT NULL DEFAULT '[]'::jsonb,
    missing JSONB NOT NULL DEFAULT '[]'::jsonb,
    total INTEGER NOT NULL DEFAULT 0,
    total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    missing_price NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS inventory_sessions_user_idx ON inventory_sessions (user_id, started_at DESC);
