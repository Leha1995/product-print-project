CREATE TABLE IF NOT EXISTS staff_task_alerts (
  task_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, day)
);