CREATE TABLE campaign_accounts(account_id TEXT PRIMARY KEY);
CREATE TABLE campaign_workspaces(
 account_id TEXT NOT NULL REFERENCES campaign_accounts(account_id), id TEXT NOT NULL,
 name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', timezone TEXT NOT NULL DEFAULT 'UTC',
 lifecycle TEXT NOT NULL DEFAULT 'active' CHECK(lifecycle IN('active','paused','archived','pending_deletion')),
 revision INTEGER NOT NULL DEFAULT 1, published_version INTEGER, execution_epoch INTEGER NOT NULL DEFAULT 1,
 work_hold INTEGER NOT NULL DEFAULT 1 CHECK(work_hold IN(0,1)), deleted_at TEXT, recover_until TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(account_id,id), UNIQUE(id));
CREATE TABLE campaign_drafts(
 account_id TEXT NOT NULL, campaign_id TEXT NOT NULL, config TEXT NOT NULL CHECK(json_valid(config)),
 PRIMARY KEY(account_id,campaign_id), FOREIGN KEY(account_id,campaign_id) REFERENCES campaign_workspaces(account_id,id));
CREATE TABLE campaign_publications(
 account_id TEXT NOT NULL, campaign_id TEXT NOT NULL, version INTEGER NOT NULL,
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), source_revision INTEGER NOT NULL, restored_from INTEGER,
 created_at TEXT NOT NULL, PRIMARY KEY(account_id,campaign_id,version),
 FOREIGN KEY(account_id,campaign_id) REFERENCES campaign_workspaces(account_id,id));
CREATE TRIGGER immutable_campaign_publication BEFORE UPDATE ON campaign_publications BEGIN SELECT RAISE(ABORT,'Immutable publication'); END;
CREATE TRIGGER retain_campaign_publication BEFORE DELETE ON campaign_publications BEGIN SELECT RAISE(ABORT,'Publication recovery protected'); END;
CREATE TABLE campaign_documents(
 account_id TEXT NOT NULL, campaign_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
 format TEXT NOT NULL, digest TEXT NOT NULL, bytes BLOB NOT NULL,
 state TEXT NOT NULL CHECK(state IN('processing','ready','failed','removed')),
 extracted TEXT NOT NULL DEFAULT '', error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(account_id,campaign_id,id), FOREIGN KEY(account_id,campaign_id) REFERENCES campaign_workspaces(account_id,id));
CREATE TABLE campaign_knowledge(
 account_id TEXT NOT NULL, campaign_id TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL,
 title TEXT NOT NULL, fields TEXT NOT NULL CHECK(json_valid(fields)), text_content TEXT NOT NULL,
 enabled INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1, document_id TEXT, removed_at TEXT, updated_at TEXT NOT NULL,
 PRIMARY KEY(account_id,campaign_id,id), FOREIGN KEY(account_id,campaign_id) REFERENCES campaign_workspaces(account_id,id),
 FOREIGN KEY(account_id,campaign_id,document_id) REFERENCES campaign_documents(account_id,campaign_id,id));
CREATE TABLE campaign_audit(
 account_id TEXT NOT NULL, campaign_id TEXT NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT,
 action TEXT NOT NULL, metadata TEXT NOT NULL CHECK(json_valid(metadata)), created_at TEXT NOT NULL,
 FOREIGN KEY(account_id,campaign_id) REFERENCES campaign_workspaces(account_id,id));
CREATE TABLE campaign_number_registry(
 account_id TEXT NOT NULL REFERENCES campaign_accounts(account_id), id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('disconnected','authorization_required','recovery_required','removed')),
 PRIMARY KEY(account_id,id), UNIQUE(id));
CREATE TABLE campaign_number_assignments(
 account_id TEXT NOT NULL, number_id TEXT NOT NULL, campaign_id TEXT NOT NULL, assigned_at TEXT NOT NULL,
 PRIMARY KEY(account_id,number_id), FOREIGN KEY(account_id,number_id) REFERENCES campaign_number_registry(account_id,id),
 FOREIGN KEY(account_id,campaign_id) REFERENCES campaign_workspaces(account_id,id));
CREATE INDEX campaign_owner_lifecycle ON campaign_workspaces(account_id,lifecycle,updated_at);
CREATE INDEX campaign_knowledge_scope ON campaign_knowledge(account_id,campaign_id,removed_at);
