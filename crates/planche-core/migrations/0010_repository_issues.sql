CREATE TABLE repository_issue_cache (
    account_id TEXT NOT NULL,
    repository_id TEXT NOT NULL,
    filter TEXT NOT NULL,
    revision INTEGER NOT NULL,
    data TEXT,
    PRIMARY KEY (account_id, repository_id, filter)
);
CREATE TABLE repository_issue_shortcut (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    repository_id TEXT NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE,
    filter TEXT NOT NULL,
    UNIQUE (account_id, repository_id, name)
);
