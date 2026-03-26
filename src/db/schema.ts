export const MIGRATIONS = [
	{
		version: 1,
		sql: `
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  clientcare_id TEXT NOT NULL UNIQUE,
  project_slug  TEXT NOT NULL,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued',
  tier          TEXT,
  task_context  TEXT,
  solver_summary    TEXT,
  solver_confidence REAL,
  files_changed     TEXT,
  solver_raw_result TEXT,
  worktree_path TEXT,
  branch_name   TEXT,
  pr_url        TEXT,
  pr_draft      INTEGER,
  comment_id    TEXT,
  queued_at     TEXT NOT NULL DEFAULT (datetime('now')),
  started_at    TEXT,
  completed_at  TEXT,
  error_message TEXT,
  error_phase   TEXT,
  claude_exit_code INTEGER,
  claude_raw_output TEXT
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_project ON tasks(project_slug);
CREATE INDEX idx_tasks_clientcare_id ON tasks(clientcare_id);

CREATE TABLE poll_state (
  project_slug   TEXT PRIMARY KEY,
  last_poll_at   TEXT NOT NULL,
  last_task_seen TEXT
);

CREATE TABLE event_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    TEXT REFERENCES tasks(id),
  event_type TEXT NOT NULL,
  payload    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_events_task ON event_log(task_id);
CREATE INDEX idx_events_type ON event_log(event_type);

CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY
);
`,
	},
]
