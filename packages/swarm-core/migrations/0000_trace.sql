CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'awaiting_approval')),
  input_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE TABLE IF NOT EXISTS agent_steps (
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  input_hash text,
  output jsonb,
  tool_calls jsonb NOT NULL DEFAULT '[]',
  latency_ms integer,
  tokens integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, seq)
);
