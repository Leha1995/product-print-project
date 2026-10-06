ALTER TABLE equipment_transfers ADD COLUMN IF NOT EXISTS equipment_name TEXT NOT NULL DEFAULT '';
ALTER TABLE equipment_transfers ADD COLUMN IF NOT EXISTS equipment_code TEXT NOT NULL DEFAULT '';
ALTER TABLE equipment_transfers ADD COLUMN IF NOT EXISTS equipment_price NUMERIC(12,2) NOT NULL DEFAULT 0;

UPDATE equipment_transfers t SET equipment_name = e.name, equipment_code = e.code, equipment_price = COALESCE(e.price, 0)
FROM equipment e
WHERE t.equipment_name = '' AND e.id = t.equipment_id AND e.user_id IN (t.from_user, t.to_user);