CREATE TABLE number_engine_state(
 account_id TEXT NOT NULL,number_id TEXT NOT NULL,session_id TEXT,epoch INTEGER,
 phase TEXT NOT NULL DEFAULT 'unpaired' CHECK(phase IN('unpaired','connecting','qr_required','connected','disconnected','repairing')),
 desired INTEGER NOT NULL DEFAULT 0,synthetic INTEGER NOT NULL DEFAULT 0,paired INTEGER NOT NULL DEFAULT 0,
 auth_generation INTEGER NOT NULL DEFAULT 1,qr_cipher TEXT NOT NULL DEFAULT '',qr_expires_at INTEGER,
 retry_at INTEGER NOT NULL DEFAULT 0,retry_count INTEGER NOT NULL DEFAULT 0,reason TEXT,
 updated_at INTEGER NOT NULL,PRIMARY KEY(account_id,number_id),
 FOREIGN KEY(account_id,number_id) REFERENCES number_profiles(account_id,number_id));
CREATE TABLE number_engine_identity(
 account_id TEXT NOT NULL,number_id TEXT NOT NULL,generation INTEGER NOT NULL,identity_digest TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(account_id,number_id,generation),FOREIGN KEY(account_id,number_id) REFERENCES number_profiles(account_id,number_id));
CREATE UNIQUE INDEX number_engine_identity_active ON number_engine_identity(identity_digest) WHERE active=1;
CREATE TABLE number_auth_vault(
 account_id TEXT NOT NULL,number_id TEXT NOT NULL,generation INTEGER NOT NULL,kind TEXT NOT NULL,key_id TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,cipher TEXT NOT NULL,updated_at INTEGER NOT NULL,
 PRIMARY KEY(account_id,number_id,generation,kind,key_id),
 FOREIGN KEY(account_id,number_id) REFERENCES number_profiles(account_id,number_id));
CREATE TABLE number_socket_outbox(
 account_id TEXT NOT NULL,number_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,provider_id TEXT NOT NULL,
 auth_generation INTEGER NOT NULL,recipient_cipher TEXT NOT NULL,state TEXT NOT NULL,
 receipt TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 PRIMARY KEY(account_id,number_id,idempotency_key),UNIQUE(account_id,number_id,provider_id),
 FOREIGN KEY(account_id,number_id) REFERENCES number_profiles(account_id,number_id));
