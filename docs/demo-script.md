# ConnectorOps three-minute demo

This walkthrough reflects the current implementation. Do not present the
future multi-stage canvas as shipped.

## Before recording

Run `npm run validate`, `npm run test:integration`, and
`npm run evidence:generate`. Start the stack, complete n8n owner setup, import
the workflow, and verify the exact commands. Hide credentials, URLs, unrelated
executions, and environment identifiers.

## 0:00 to 0:25, explain the risk

Show the README diagram and say:

> A partner can commit a write even when its response never reaches n8n. A
> naive retry then creates a duplicate order. ConnectorOps turns that ambiguous
> boundary into an executable release requirement.

## 0:25 to 1:15, run the n8n safe path

Show the versioned `Manual Trigger → AcmeCRM Safe Retry` workflow. Run
`npm run workflow:execute` and show its actual output.

> The execution script configures AcmeCRM to commit and delay the first response. The
> real custom node times out, unwraps n8n's transport error, and retries with
> the same idempotency key. The run passes only if we observe two attempts,
> `created → replayed`, and one partner-side order.

Make clear that setup and observation currently run in the execution script;
the canvas owns the connector invocation.

## 1:15 to 2:00, prove that the gate can fail

Open [the blocked scorecard](examples/blocked-scorecard.json) and run
`npm run evidence:generate` if it was not generated immediately beforehand.

> The negative control faces the same timeout but omits safe idempotency. It
> creates two business orders, the exactly-once requirement fails, and the
> deterministic gate returns `BLOCKED`. A score and an AI explanation cannot
> override that required failure.

## 2:00 to 2:35, show the partner evidence

Show [the partner report](examples/partner-failure-report.md).

> This report gives both teams the data needed to resolve the defect. It records
> expected and observed behavior, business impact, requested partner
> clarification, the n8n owner action, and sanitized references. It contains no
> credential or raw idempotency key.

## 2:35 to 3:00, explain the next engineering decision

Show [the delivery plan](engineering-delivery-plan.md).

> The proof is intentionally narrow and deep. Partner semantics, connector
> behavior, certification evidence, and delivery have explicit owners and
> contracts. The next product increment is to move the complete journey onto
> the n8n canvas, then add one fault at a time only when its gate can catch the
> failure it claims to prevent.

If a run fails while recording, preserve it in the friction log, diagnose it,
and record again. Never substitute stale results or invent a test count.
