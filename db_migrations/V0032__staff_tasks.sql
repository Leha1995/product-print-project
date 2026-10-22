CREATE TABLE IF NOT EXISTS staff_tasks (
  id SERIAL PRIMARY KEY,
  created_by INTEGER NOT NULL,
  assignee_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'daily',
  start_time TEXT NOT NULL DEFAULT '09:00',
  task_date TEXT NULL,
  interval_min INTEGER NOT NULL DEFAULT 5,
  tune TEXT NOT NULL DEFAULT 'beep',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_tasks_assignee ON staff_tasks (assignee_id, active);

CREATE TABLE IF NOT EXISTS staff_task_done (
  task_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  done_at TIMESTAMP NOT NULL DEFAULT NOW(),
  done_by INTEGER NOT NULL,
  PRIMARY KEY (task_id, day)
);