ALTER TABLE equipment_tasks ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'task';

INSERT INTO equipment_tasks (user_id, equipment_id, technician_id, created_by, description, photos, priority, created_at, kind)
SELECT e.user_id, e.id, NULL, e.user_id,
       'Ремонт: ' || e.name || COALESCE(NULLIF(E'\n' || (
           SELECT r.description FROM equipment_repairs r
           WHERE r.user_id = e.user_id AND r.equipment_id = e.id AND r.returned_at IS NULL
           ORDER BY r.sent_at DESC LIMIT 1), E'\n'), ''),
       COALESCE((SELECT r.photos FROM equipment_repairs r
           WHERE r.user_id = e.user_id AND r.equipment_id = e.id AND r.returned_at IS NULL
           ORDER BY r.sent_at DESC LIMIT 1), '[]'::jsonb),
       'soon', COALESCE(e.repair_sent_at, NOW()), 'repair'
FROM equipment e
WHERE e.in_repair = TRUE AND e.active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM equipment_tasks t
    WHERE t.user_id = e.user_id AND t.equipment_id = e.id AND t.status = 'open'
  );