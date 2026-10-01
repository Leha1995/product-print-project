CREATE TABLE IF NOT EXISTS print_keys (
    owner_id INTEGER PRIMARY KEY,
    key VARCHAR(64) NOT NULL UNIQUE,
    last_seen TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS print_jobs (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    printer_ip VARCHAR(64) NOT NULL,
    printer_port INTEGER NOT NULL DEFAULT 9100,
    data TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    error TEXT NOT NULL DEFAULT '',
    created_by INTEGER NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    taken_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS print_jobs_owner_status ON print_jobs (owner_id, status);