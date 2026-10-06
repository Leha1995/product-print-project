CREATE TABLE IF NOT EXISTS accountant_scopes (
  accountant_id INTEGER NOT NULL,
  admin_id INTEGER NOT NULL,
  PRIMARY KEY (accountant_id, admin_id)
);