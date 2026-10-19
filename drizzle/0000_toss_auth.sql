CREATE TABLE provider_tokens (
 client_id TEXT PRIMARY KEY NOT NULL,
 access_token TEXT,
 expires_at INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0
);
