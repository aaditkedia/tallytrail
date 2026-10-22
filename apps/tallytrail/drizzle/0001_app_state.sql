CREATE TABLE IF NOT EXISTS app_state (
  owner_id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  reports jsonb NOT NULL DEFAULT '[]'::jsonb,
  offsets jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_files (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  sha256 text NOT NULL,
  mime text NOT NULL,
  bytes integer NOT NULL,
  stored_at timestamptz NOT NULL,
  blob_url text
);

CREATE UNIQUE INDEX IF NOT EXISTS evidence_owner_id ON evidence_files (owner_id, id);
