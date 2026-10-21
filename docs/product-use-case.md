# ConnectorOps product use case

## Summary

ConnectorOps gives integration teams and technology partners a shared,
evidence-based definition of "production-ready." It continuously exercises an
n8n connector against realistic success and failure conditions, then produces
a scorecard that either permits or blocks a release.

It is not a generic API monitoring product and it is not a replacement for the
connector's own unit tests. Its purpose is to validate the behavior visible at
the boundary between n8n and a partner platform.

## The customer problem

The happy path of an integration is often easy to demonstrate. Production
failures emerge from the boundaries:

- Authentication expires or gets revoked.
- Partner APIs throttle traffic using different rules and headers.
- Pagination changes under a growing dataset.
- Webhooks arrive late, twice, or out of order.
- A request succeeds remotely but its response is lost.
- Long-running operations finish asynchronously.
- API fields change without the connector changing at the same time.
- Error messages contain too little context—or too much sensitive context.

Each issue can cross company boundaries. Without repeatable evidence, an n8n
engineer and partner engineer may disagree about the cause, expected behavior,
or release risk. ConnectorOps makes those expectations executable.

## Primary users

### Integration engineer

Runs focused scenarios while implementing a node, receives actionable failures,
and can reproduce partner behavior locally without depending on a shared
sandbox.

### Engineering manager

Uses a consistent readiness rubric across a portfolio of integrations, sees
where risk is concentrated, and can make explicit trade-offs between release
speed and reliability.

### Partner engineer

Receives a small evidence bundle containing the request correlation ID,
scenario, timestamps, sanitized response, expected contract, and suggested
next action.

### Product manager

Sees which customer journeys are ready, which are blocked, and why, without
having to interpret raw test logs.

## Core journey

1. An engineer selects a connector version and certification profile.
2. ConnectorOps configures the partner simulator for a known scenario.
3. An n8n workflow invokes the connector as a user would.
4. Assertions compare business-visible behavior with the release contract.
5. ConnectorOps stores sanitized evidence and a correlation ID.
6. The policy engine calculates the readiness result.
7. Failed requirements are assigned to the appropriate n8n or partner owner.
8. After a fix or approved contract change, the same scenarios are rerun.

## First certification profile

The first profile targets an AcmeCRM `Customer` and `Order` connector.

| Capability | Scenario | Required behavior |
| --- | --- | --- |
| Authentication | Token expires during pagination | Refresh once and continue without losing or duplicating records |
| Rate limits | API returns `429` and `Retry-After` | Wait as directed and retry within the configured budget |
| Pagination | Dataset spans multiple cursor pages | Return every unique record exactly once |
| Idempotency | Create succeeds but response times out | Retry safely and create one remote order |
| Webhooks | Event is duplicated and delivered out of order | Process once or expose an explicit ordering limitation |
| Async jobs | Export remains pending before completion | Poll with bounded backoff and stop at a clear timeout |
| Contract drift | Required response field changes type | Block certification with a precise compatibility error |
| Security | Errors include tokens or sensitive fields upstream | Redact secrets and configured sensitive fields from evidence |

## Readiness model

Certification is deterministic. Each required scenario is either passed,
failed, or not run. A required failure or missing result blocks release.

An initial scorecard groups results into five dimensions:

1. **Correctness** — operations produce the expected business outcome.
2. **Resilience** — transient failures recover without corrupting state.
3. **Security** — credentials and sensitive payload fields remain protected.
4. **Scale** — pagination, bulk operations, and throttling remain bounded.
5. **Operability** — failures carry correlation IDs and actionable evidence.

A numeric score may help compare runs, but it never converts a required failure
into a pass.

## The role of AI

AI is optional and advisory. It may summarize an API contract diff, identify
likely affected node operations, or draft partner-facing language from recorded
evidence. It may not execute credentials, change a release policy, or turn a
failed deterministic assertion into a pass.

This boundary lets the project explore AI-native product opportunities without
placing an enterprise release decision behind a nondeterministic model.

## Success measures

The first milestone succeeds when it can demonstrate that:

- A new developer can start the system and run certification from documented
  commands.
- The timeout-after-success scenario creates exactly one remote order.
- Duplicate webhook delivery creates exactly one observable side effect.
- Rate-limit behavior can be measured rather than inferred from logs.
- A contract-breaking change blocks certification with useful evidence.
- The complete certification run is reproducible in CI without public APIs.

## Non-goals for the first version

- Certifying every n8n connector
- Replacing n8n's test framework or partner contract tests
- Building a general-purpose observability platform
- Automatically repairing or deploying connectors
- Supporting real customer data
- Building a large dashboard before the scorecard workflow is useful

## Why this is valuable beyond the demonstration

The reusable asset is not the fictional AcmeCRM node. It is the operating model:
a scenario contract, a repeatable simulator, a shared readiness rubric, and an
evidence format that helps an integration team and a strategic partner resolve
failures together.

