CREATE TABLE users (
  id TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
  friend_status TEXT NOT NULL DEFAULT 'unknown' CHECK(friend_status IN ('unknown','following','blocked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  session_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at_utc INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  timezone TEXT NOT NULL,
  rule_json TEXT NOT NULL,
  next_fire_at_utc INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','canceled')),
  origin TEXT NOT NULL CHECK(origin IN ('pwa','line')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE reminder_occurrences (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  scheduled_at_utc INTEGER NOT NULL,
  next_attempt_at_utc INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','retry','sent','acknowledged','failed','canceled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until_utc INTEGER,
  claim_token TEXT,
  line_retry_key TEXT NOT NULL UNIQUE,
  line_message_id TEXT,
  snoozed_from_id TEXT REFERENCES reminder_occurrences(id),
  sent_at_utc INTEGER,
  last_error TEXT,
  UNIQUE(reminder_id, scheduled_at_utc)
);

CREATE TABLE incoming_events (
  webhook_event_id TEXT PRIMARY KEY,
  line_user_id TEXT,
  event_type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','queued','processing','processed','failed')),
  payload_json TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  last_error TEXT
);

CREATE TABLE pending_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at_utc INTEGER NOT NULL,
  consumed_at_utc INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_reminders_user_status ON reminders(user_id, status, next_fire_at_utc);
CREATE INDEX idx_occurrences_due ON reminder_occurrences(status, next_attempt_at_utc);
CREATE INDEX idx_occurrences_reminder ON reminder_occurrences(reminder_id, scheduled_at_utc DESC);
CREATE INDEX idx_pending_actions_expiry ON pending_actions(expires_at_utc);
