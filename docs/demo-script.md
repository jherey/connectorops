# ConnectorOps three-minute demo

This walkthrough reflects the current implementation. Do not present the
future multi-stage canvas as shipped.

## Before recording

Run `npm run validate`, `npm run test:integration`, and
`npm run evidence:generate`. Start the stack, complete n8n owner setup, import
the workflow, and verify the exact commands. Hide credentials, URLs, unrelated
executions, and environment identifiers.

## 0:00–0:25 — The risk

Show the README diagram and say:

> A partner can commit a write even when its response never reaches n8n. A
> naive retry then creates a duplicate order. ConnectorOps turns that ambiguous
> boundary into an executable release requirement.

## 0:25–1:15 — The real n8n safe path

Show the versioned `Manual Trigger → AcmeCRM Safe Retry` workflow. Run
`npm run workflow:execute` and show its actual output.

> The harness configures AcmeCRM to commit and delay the first response. The
> real custom node times out, unwraps n8n's transport error, and retries with
> the same idempotency key. The run passes only if we observe two attempts,
> `created → replayed`, and one partner-side order.

Make clear that setup and observation currently live in the execution harness;
the canvas owns the connector invocation.

## 1:15–2:00 — Prove the gate can fail

Open [the blocked scorecard](examples/blocked-scorecard.json) and run
`npm run evidence:generate` if it was not generated immediately beforehand.

> The negative control faces the same timeout but omits safe idempotency. It
> creates two business orders, the exactly-once requirement fails, and the
> deterministic gate returns `BLOCKED`. A score and an AI explanation cannot
> override that required failure.

## 2:00–2:35 — Cross-company evidence

Show [the partner report](examples/partner-failure-report.md).

> This is designed for resolution, not just diagnosis: expected and observed
> behavior, business impact, requested partner clarification, n8n owner action,
> and sanitized references. No credential or raw idempotency key is present.

## 2:35–3:00 — Management judgment

Show [the delivery plan](engineering-delivery-plan.md).

> The proof is intentionally narrow and deep. Partner semantics, connector
> behavior, certification evidence, and delivery have explicit owners and
> contracts. The next product increment is to move the complete journey onto
> the n8n canvas, then add one fault at a time only when its gate can catch the
> failure it claims to prevent.

If a run fails while recording, preserve it in the friction log, diagnose it,
and record again. Never substitute stale results or invent a test count.
