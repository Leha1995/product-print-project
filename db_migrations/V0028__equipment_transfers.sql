CREATE TABLE IF NOT EXISTS equipment_transfers (
    id SERIAL PRIMARY KEY,
    equipment_id TEXT NOT NULL,
    from_user INTEGER NOT NULL,
    to_user INTEGER NOT NULL,
    created_by INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMP,
    decided_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_equipment_transfers_to ON equipment_transfers (to_user, status);
CREATE INDEX IF NOT EXISTS idx_equipment_transfers_from ON equipment_transfers (from_user, equipment_id, status);