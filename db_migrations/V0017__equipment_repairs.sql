CREATE TABLE IF NOT EXISTS equipment_repairs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  equipment_id TEXT NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  returned_at TIMESTAMP NULL,
  cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_equipment_repairs_user ON equipment_repairs (user_id, equipment_id);
INSERT INTO equipment_repairs (user_id, equipment_id, sent_at)
SELECT user_id, id, COALESCE(repair_sent_at, NOW()) FROM equipment WHERE in_repair = TRUE;