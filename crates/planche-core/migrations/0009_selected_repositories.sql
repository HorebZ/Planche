CREATE TABLE selected_repository (
    account_id TEXT NOT NULL,
    repository_id TEXT NOT NULL,
    data TEXT NOT NULL,
    unavailable INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL,
    PRIMARY KEY (account_id, repository_id)
);
