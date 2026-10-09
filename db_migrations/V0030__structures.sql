CREATE TABLE IF NOT EXISTS structures (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS structure_members (
    structure_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (structure_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_structure_members_user ON structure_members (user_id);

ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS structure_id INTEGER;
ALTER TABLE shared_products ADD COLUMN IF NOT EXISTS structure_id INTEGER;

INSERT INTO structures (name)
SELECT 'Автосуши Автопицца' WHERE NOT EXISTS (SELECT 1 FROM structures);

INSERT INTO structure_members (structure_id, user_id)
SELECT (SELECT MIN(id) FROM structures), u.id FROM app_users u
WHERE u.role <> 'superadmin'
ON CONFLICT DO NOTHING;

UPDATE shared_products SET structure_id = (SELECT MIN(id) FROM structures) WHERE structure_id IS NULL;
UPDATE app_sessions SET structure_id = (SELECT MIN(id) FROM structures) WHERE structure_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_shared_products_structure ON shared_products (structure_id);