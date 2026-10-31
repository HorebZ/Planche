CREATE TABLE issue_description (
    host TEXT NOT NULL,
    account_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    body TEXT,
    fetched_at TEXT,
    PRIMARY KEY (host, account_id, content_id)
);
