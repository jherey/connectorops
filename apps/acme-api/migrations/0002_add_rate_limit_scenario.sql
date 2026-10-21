ALTER TABLE certification_runs
  DROP CONSTRAINT IF EXISTS certification_runs_scenario_check;

ALTER TABLE certification_runs
  ADD CONSTRAINT certification_runs_scenario_check
  CHECK (scenario IN ('timeout-after-commit', 'rate-limit-then-success'));

ALTER TABLE captured_requests
  DROP CONSTRAINT IF EXISTS captured_requests_outcome_check;

ALTER TABLE captured_requests
  ADD CONSTRAINT captured_requests_outcome_check
  CHECK (outcome IN ('created', 'replayed', 'conflict', 'rate_limited'));
