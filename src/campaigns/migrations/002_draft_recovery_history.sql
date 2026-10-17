CREATE TABLE campaign_revision_history(
 account_id TEXT NOT NULL, campaign_id TEXT NOT NULL, revision INTEGER NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), created_at TEXT NOT NULL,
 PRIMARY KEY(account_id,campaign_id,revision),
 FOREIGN KEY(account_id,campaign_id) REFERENCES campaign_workspaces(account_id,id));
CREATE TRIGGER immutable_campaign_draft_history BEFORE UPDATE ON campaign_revision_history BEGIN SELECT RAISE(ABORT,'Immutable draft history'); END;
CREATE TRIGGER retain_campaign_draft_history BEFORE DELETE ON campaign_revision_history BEGIN SELECT RAISE(ABORT,'Draft recovery protected'); END;
