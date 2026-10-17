CREATE TABLE campaign_catalogue(
 account_id TEXT NOT NULL, campaign_id TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN('product','service')),
 name TEXT NOT NULL, description TEXT NOT NULL, price TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
 archived_at TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(account_id,campaign_id,id),
 FOREIGN KEY(account_id,campaign_id) REFERENCES campaign_workspaces(account_id,id));
CREATE TABLE conversation_threads(
 account_id TEXT NOT NULL, campaign_id TEXT NOT NULL, number_id TEXT NOT NULL, id TEXT NOT NULL,
 sequence INTEGER NOT NULL DEFAULT 0, privacy_epoch INTEGER NOT NULL DEFAULT 1,
 memory_enabled INTEGER NOT NULL DEFAULT 1 CHECK(memory_enabled IN(0,1)), cipher TEXT NOT NULL DEFAULT '', expires_at INTEGER NOT NULL,
 PRIMARY KEY(account_id,id), FOREIGN KEY(account_id,campaign_id) REFERENCES campaign_workspaces(account_id,id),
 FOREIGN KEY(account_id,number_id) REFERENCES number_profiles(account_id,number_id));
CREATE TABLE conversation_jobs(
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL, campaign_id TEXT NOT NULL, number_id TEXT NOT NULL, thread_id TEXT NOT NULL,
 event_key TEXT NOT NULL, digest TEXT NOT NULL, sequence INTEGER NOT NULL, privacy_epoch INTEGER NOT NULL,
 session_id TEXT NOT NULL, number_epoch INTEGER NOT NULL, campaign_epoch INTEGER NOT NULL, publication_version INTEGER NOT NULL,
 input_cipher TEXT NOT NULL, recipient_cipher TEXT NOT NULL, output_cipher TEXT NOT NULL DEFAULT '', state TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, delivery_attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL, lease_token TEXT, lease_until INTEGER,
 key_revision INTEGER, reason TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 UNIQUE(account_id,number_id,event_key), FOREIGN KEY(account_id,thread_id) REFERENCES conversation_threads(account_id,id),
 FOREIGN KEY(account_id,campaign_id,publication_version) REFERENCES campaign_publications(account_id,campaign_id,version));
CREATE INDEX conversation_due_jobs ON conversation_jobs(state,next_attempt_at,created_at);
CREATE TABLE conversation_deliveries(
 job_id TEXT PRIMARY KEY REFERENCES conversation_jobs(id), idempotency_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state IN('queued','inflight','confirmed','unknown','captured','cancelled')), receipt TEXT,
 updated_at INTEGER NOT NULL);
CREATE TABLE conversation_alerts(
 job_id TEXT PRIMARY KEY REFERENCES conversation_jobs(id), account_id TEXT NOT NULL, campaign_id TEXT NOT NULL,
 category TEXT NOT NULL, created_at INTEGER NOT NULL, resolved_at INTEGER);
