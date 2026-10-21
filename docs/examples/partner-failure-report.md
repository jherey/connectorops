# Partner failure report: duplicate order after ambiguous timeout

> Generated example from the deliberately unsafe control. It contains synthetic data only.

| Field | Value |
| --- | --- |
| Decision | `BLOCKED` |
| Scenario | `timeout-after-commit` |
| Operation | `order.create` |
| Run | `example-unsafe-timeout` |
| Failed requirement | `exactly-once` |
| Expected | `{"committedOrders":1}` |
| Observed | `{"committedOrders":2}` |

## Impact

One intended order produced 2 partner-side orders after the first response timed out. Certification is blocked because retrying without a stable idempotency key can duplicate a customer's business operation.

## Requested partner alignment

Confirm that the create-order endpoint honors a caller-provided idempotency key for an ambiguous timeout and returns the original operation when that key and request body are replayed.

## n8n owner action

Keep the key stable across bounded retries, retain the negative-control regression, and rerun the same scenario before release. Correlate using the sanitized evidence references in [the blocked scorecard](blocked-scorecard.json).

No credentials, raw idempotency keys, or customer data are included.
