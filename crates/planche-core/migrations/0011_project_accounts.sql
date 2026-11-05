ALTER TABLE pending_mutation ADD COLUMN project_account_id TEXT;

UPDATE pending_mutation
SET project_account_id = (SELECT value FROM kv WHERE key = 'account_id')
WHERE project_id IS NOT NULL;
