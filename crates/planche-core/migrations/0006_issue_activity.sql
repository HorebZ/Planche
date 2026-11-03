CREATE TABLE issue_activity (
    host TEXT NOT NULL,
    account_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    activity TEXT,
    fetched_at TEXT,
    PRIMARY KEY (host, account_id, content_id)
);
