ALTER TABLE app_users ADD COLUMN IF NOT EXISTS manager_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_app_users_manager ON app_users(manager_id);