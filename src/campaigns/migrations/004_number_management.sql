CREATE TABLE number_profiles(
 account_id TEXT NOT NULL, number_id TEXT NOT NULL, name TEXT NOT NULL,
 encrypted_identity TEXT NOT NULL DEFAULT '', identity_digest TEXT, masked_identity TEXT NOT NULL DEFAULT '',
 creation_key TEXT NOT NULL, creation_digest TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, session_epoch INTEGER NOT NULL DEFAULT 1,
 removed_at TEXT, recover_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(account_id,number_id), UNIQUE(account_id,creation_key), FOREIGN KEY(account_id,number_id) REFERENCES campaign_number_registry(account_id,id));
CREATE UNIQUE INDEX number_identity_unique ON number_profiles(account_id,identity_digest) WHERE identity_digest IS NOT NULL AND removed_at IS NULL;
CREATE TABLE number_connection_sessions(
 account_id TEXT NOT NULL, number_id TEXT NOT NULL, id TEXT NOT NULL UNIQUE, epoch INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN('disconnected','pending','unavailable','connected','revoked')),
 adapter_id TEXT, authorization_reference TEXT, synthetic INTEGER NOT NULL DEFAULT 0 CHECK(synthetic IN(0,1)),
 event_sequence INTEGER NOT NULL DEFAULT 0, authorization_expires_at INTEGER, lease_until INTEGER,
 reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, ended_at TEXT,
 PRIMARY KEY(account_id,number_id,id), FOREIGN KEY(account_id,number_id) REFERENCES number_profiles(account_id,number_id));
CREATE UNIQUE INDEX one_current_number_session ON number_connection_sessions(account_id,number_id) WHERE ended_at IS NULL;
CREATE TABLE number_management_audit(
 account_id TEXT NOT NULL, number_id TEXT NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT,
 action TEXT NOT NULL, metadata TEXT NOT NULL CHECK(json_valid(metadata)), created_at TEXT NOT NULL,
 FOREIGN KEY(account_id,number_id) REFERENCES number_profiles(account_id,number_id));
CREATE TABLE number_assignment_history(
 account_id TEXT NOT NULL, number_id TEXT NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT,
 from_campaign TEXT, to_campaign TEXT, epoch INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(account_id,number_id) REFERENCES number_profiles(account_id,number_id),
 FOREIGN KEY(account_id,from_campaign) REFERENCES campaign_workspaces(account_id,id),
 FOREIGN KEY(account_id,to_campaign) REFERENCES campaign_workspaces(account_id,id));
CREATE TABLE number_adapter_events(
 account_id TEXT NOT NULL, number_id TEXT NOT NULL, event_id TEXT NOT NULL, session_id TEXT NOT NULL,
 sequence INTEGER NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(account_id,number_id,event_id),
 FOREIGN KEY(account_id,number_id,session_id) REFERENCES number_connection_sessions(account_id,number_id,id));
CREATE TABLE number_message_guards(
 account_id TEXT NOT NULL, number_id TEXT NOT NULL, id TEXT NOT NULL, direction TEXT NOT NULL CHECK(direction IN('inbound','outbound')),
 provider_message_id TEXT NOT NULL, campaign_id TEXT NOT NULL, session_id TEXT NOT NULL, epoch INTEGER NOT NULL,
 publication_version INTEGER, campaign_epoch INTEGER NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'held' CHECK(state IN('held','uncertain','confirmed')),
 reason TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(account_id,number_id,direction,provider_message_id), UNIQUE(id),
 FOREIGN KEY(account_id,number_id,session_id) REFERENCES number_connection_sessions(account_id,number_id,id),
 FOREIGN KEY(account_id,campaign_id,publication_version) REFERENCES campaign_publications(account_id,campaign_id,version));
INSERT INTO number_profiles(account_id,number_id,name,creation_key,creation_digest,removed_at,created_at,updated_at)
 SELECT account_id,id,'Saved number',id,'',CASE WHEN status='removed' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END,
 strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM campaign_number_registry;
INSERT INTO number_assignment_history(account_id,number_id,to_campaign,epoch,reason,created_at)
 SELECT account_id,number_id,campaign_id,1,'existing_assignment_preserved',assigned_at FROM campaign_number_assignments;
