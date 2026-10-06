CREATE TABLE IF NOT EXISTS accountant_technicians (
  accountant_id INTEGER NOT NULL,
  technician_id INTEGER NOT NULL,
  PRIMARY KEY (accountant_id, technician_id)
);