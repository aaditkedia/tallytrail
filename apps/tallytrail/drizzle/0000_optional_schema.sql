-- OPTIONAL, not executed by the local app. Hosted repositories must add session
-- authorization and serialize overlap checks in a database transaction.
CREATE TABLE businesses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL, name text NOT NULL);
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id),
  period text NOT NULL, evidence_hash text NOT NULL CHECK (evidence_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL, total_kg numeric(20,8) NOT NULL CHECK (total_kg >= 0),
  status text NOT NULL CHECK (status IN ('draft','confirmed')), confirmed_at timestamp,
  CONSTRAINT reports_business_period UNIQUE (business_id, period)
);
CREATE TABLE offset_retirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registry_key text NOT NULL, serial_key text NOT NULL,
  grams_co2e numeric(24,0) NOT NULL CHECK (grams_co2e > 0), beneficiary text NOT NULL,
  CONSTRAINT retirements_unique_credit UNIQUE (registry_key, serial_key)
);
CREATE TABLE agent_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid REFERENCES reports(id), status text NOT NULL);
CREATE TABLE agent_steps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid NOT NULL REFERENCES agent_runs(id), seq integer NOT NULL, name text NOT NULL, output jsonb, CONSTRAINT steps_run_seq UNIQUE (run_id, seq));
