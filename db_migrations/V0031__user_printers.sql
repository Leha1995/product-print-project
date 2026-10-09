CREATE TABLE IF NOT EXISTS user_printers (
    user_id INTEGER PRIMARY KEY,
    printers TEXT NOT NULL DEFAULT '[]',
    updated_by INTEGER,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);