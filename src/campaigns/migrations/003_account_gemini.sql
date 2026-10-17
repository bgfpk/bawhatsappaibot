CREATE TABLE account_gemini_settings (
  account_id TEXT PRIMARY KEY REFERENCES campaign_accounts(account_id),
  encrypted_key TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
  model TEXT, verified_at TEXT, last_test_at TEXT,
  test_status TEXT NOT NULL DEFAULT 'untested', error_category TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE gemini_request_audit (
  account_id TEXT NOT NULL REFERENCES campaign_accounts(account_id), id TEXT NOT NULL,
  campaign_id TEXT, operation TEXT NOT NULL, status TEXT NOT NULL,
  model TEXT, usage TEXT, error_category TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  provider_response_id TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY(account_id,id),
  FOREIGN KEY(account_id,campaign_id) REFERENCES campaign_workspaces(account_id,id)
);
