CREATE TABLE IF NOT EXISTS daily_reports (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);