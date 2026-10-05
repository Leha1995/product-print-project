CREATE TABLE IF NOT EXISTS equipment_tasks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  equipment_id TEXT NULL,
  technician_id INTEGER NULL,
  created_by INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  done_at TIMESTAMP NULL,
  done_by INTEGER NULL,
  done_comment TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_equipment_tasks_user ON equipment_tasks (user_id, status);