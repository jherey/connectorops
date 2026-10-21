CREATE TABLE IF NOT EXISTS certification_runs (
  run_id TEXT PRIMARY KEY,
  scenario TEXT NOT NULL CHECK (scenario IN ('timeout-after-commit')),
  delay_ms INTEGER NOT NULL CHECK (delay_ms >= 0 AND delay_ms <= 60000),
  fault_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES certification_runs(run_id) ON DELETE CASCADE,
  external_order_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS orders_run_external_idx
  ON orders (run_id, external_order_id);

CREATE TABLE IF NOT EXISTS idempotency_requests (
  run_id TEXT NOT NULL REFERENCES certification_runs(run_id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS captured_requests (
  id UUID PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES certification_runs(run_id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  idempotency_key_hash TEXT,
  request_hash TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('created', 'replayed', 'conflict')),
  status_code INTEGER NOT NULL,
  order_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS captured_requests_run_idx
  ON captured_requests (run_id, occurred_at, id);
