CREATE TABLE issue_comment (
    account_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'uncertain', 'sent', 'failed')),
    error TEXT,
    entry TEXT,
    unconfirmed_reads INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, request_id)
);
CREATE INDEX comments_by_issue ON issue_comment(account_id, content_id, seq);
