-- Phase 3 schema from issue #6. Cache::open sets journal_mode, foreign_keys and user_version,
-- because journal_mode cannot change inside the migration transaction.
CREATE TABLE project (
	id              TEXT PRIMARY KEY,
	owner_login     TEXT NOT NULL,
	owner_kind      TEXT NOT NULL CHECK (owner_kind IN ('user', 'org')),
	number          INTEGER NOT NULL,
	title           TEXT NOT NULL,
	url             TEXT NOT NULL,
	closed          INTEGER NOT NULL DEFAULT 0,
	updated_at      TEXT NOT NULL,
	meta_synced_at  TEXT,
	items_synced_at TEXT,
	UNIQUE (owner_login, number)
);

CREATE TABLE field (
	id         TEXT PRIMARY KEY,
	project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
	name       TEXT NOT NULL,
	data_type  TEXT NOT NULL,
	position   INTEGER NOT NULL
);

CREATE TABLE field_option (
	field_id    TEXT NOT NULL REFERENCES field(id) ON DELETE CASCADE,
	id          TEXT NOT NULL,
	name        TEXT NOT NULL,
	color       TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	position    INTEGER NOT NULL,
	PRIMARY KEY (field_id, id)
);

CREATE TABLE view (
	id              TEXT PRIMARY KEY,
	project_id      TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
	number          INTEGER NOT NULL,
	name            TEXT NOT NULL,
	layout          TEXT NOT NULL CHECK (layout IN ('BOARD_LAYOUT', 'TABLE_LAYOUT', 'ROADMAP_LAYOUT')),
	filter          TEXT,
	column_field_id TEXT REFERENCES field(id) ON DELETE SET NULL,
	manual_order    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE item (
	id          TEXT PRIMARY KEY,
	project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
	position    INTEGER NOT NULL,
	kind        TEXT NOT NULL CHECK (kind IN ('ISSUE', 'PULL_REQUEST', 'DRAFT_ISSUE', 'REDACTED')),
	content_id  TEXT,
	title       TEXT NOT NULL DEFAULT '',
	number      INTEGER,
	url         TEXT,
	repo        TEXT,
	state       TEXT,
	is_draft_pr INTEGER NOT NULL DEFAULT 0,
	is_archived INTEGER NOT NULL DEFAULT 0,
	updated_at  TEXT NOT NULL,
	synced_at   TEXT NOT NULL
);
CREATE INDEX item_by_project_position ON item(project_id, position);

CREATE TABLE item_field_value (
	item_id      TEXT NOT NULL REFERENCES item(id) ON DELETE CASCADE,
	field_id     TEXT NOT NULL REFERENCES field(id) ON DELETE CASCADE,
	option_id    TEXT,
	text_value   TEXT,
	number_value REAL,
	date_value   TEXT,
	iteration_id TEXT,
	PRIMARY KEY (item_id, field_id),
	CHECK ((option_id IS NOT NULL) + (text_value IS NOT NULL) + (number_value IS NOT NULL)
	     + (date_value IS NOT NULL) + (iteration_id IS NOT NULL) = 1)
);
CREATE INDEX item_field_value_by_option ON item_field_value(field_id, option_id);

CREATE TABLE gh_user (
	id         TEXT PRIMARY KEY,
	login      TEXT NOT NULL,
	avatar_url TEXT NOT NULL
);

CREATE TABLE item_assignee (
	item_id TEXT NOT NULL REFERENCES item(id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES gh_user(id),
	PRIMARY KEY (item_id, user_id)
);

CREATE TABLE item_label (
	item_id TEXT NOT NULL REFERENCES item(id) ON DELETE CASCADE,
	name    TEXT NOT NULL,
	color   TEXT NOT NULL,
	PRIMARY KEY (item_id, name)
);

CREATE TABLE pending_mutation (
	seq        INTEGER PRIMARY KEY AUTOINCREMENT,
	project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
	item_id    TEXT,
	intent     TEXT NOT NULL,
	status     TEXT NOT NULL DEFAULT 'pending'
	           CHECK (status IN ('pending', 'in_flight', 'acked', 'unknown')),
	attempts   INTEGER NOT NULL DEFAULT 0,
	acked_at_sync INTEGER,
	last_error TEXT,
	created_at TEXT NOT NULL
);
CREATE INDEX pending_by_project ON pending_mutation(project_id, seq);

CREATE TABLE kv (
	key   TEXT PRIMARY KEY,
	value TEXT NOT NULL
);

