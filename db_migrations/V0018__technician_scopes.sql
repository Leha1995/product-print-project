CREATE TABLE IF NOT EXISTS technician_scopes (
  technician_id INTEGER NOT NULL,
  head_id INTEGER NOT NULL,
  PRIMARY KEY (technician_id, head_id)
);
INSERT INTO technician_scopes (technician_id, head_id)
SELECT id, manager_id FROM app_users WHERE role = 'technician' AND manager_id IS NOT NULL
ON CONFLICT DO NOTHING;