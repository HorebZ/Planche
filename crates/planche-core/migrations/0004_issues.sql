CREATE TABLE issue (
    host TEXT NOT NULL,
    account_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    content TEXT,
    complete INTEGER NOT NULL DEFAULT 0,
    permissions TEXT,
    fetched_at TEXT,
    revision INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (host, account_id, content_id)
);

ALTER TABLE pending_mutation RENAME TO project_mutation;
DROP INDEX pending_by_project;

CREATE TABLE pending_mutation (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT REFERENCES project(id) ON DELETE CASCADE,
    item_id TEXT,
    account_id TEXT,
    content_id TEXT,
    intent TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_flight', 'acked', 'unknown')),
    attempts INTEGER NOT NULL DEFAULT 0,
    acked_at_sync INTEGER,
    last_error TEXT,
    created_at TEXT NOT NULL,
    CHECK ((project_id IS NOT NULL AND account_id IS NULL AND content_id IS NULL)
        OR (project_id IS NULL AND item_id IS NULL AND account_id IS NOT NULL AND content_id IS NOT NULL))
);

INSERT INTO pending_mutation (seq, project_id, item_id, intent, status, attempts, acked_at_sync, last_error, created_at)
SELECT seq, project_id, item_id, intent, status, attempts, acked_at_sync, last_error, created_at
FROM project_mutation;
UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'project_mutation'), 0))
WHERE name = 'pending_mutation';
DROP TABLE project_mutation;

CREATE INDEX pending_by_project ON pending_mutation(project_id, seq);
CREATE INDEX pending_by_account ON pending_mutation(account_id, seq) WHERE project_id IS NULL;
