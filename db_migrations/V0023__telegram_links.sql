CREATE TABLE IF NOT EXISTS telegram_links (
    user_id INTEGER PRIMARY KEY REFERENCES app_users(id),
    chat_id BIGINT NOT NULL,
    tg_name TEXT NOT NULL DEFAULT '',
    linked_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS telegram_link_codes (
    code TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_users(id),
    expires_at TIMESTAMP NOT NULL
);