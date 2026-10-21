# ConnectorOps

> Enterprise readiness, resilience testing, and continuous certification for
> n8n connectors.

ConnectorOps is a driving test for software integrations. It exercises an n8n
connector against realistic partner API failures—expired credentials, rate
limits, duplicate webhooks, slow responses, pagination, and contract drift—and
produces evidence showing whether the connector is safe to release.

The project is designed around a simple belief:

> An enterprise connector is not production-ready when its happy path works. It
> is ready when failures are predictable, observable, and recoverable.

## The use case

Imagine a team preparing an n8n connector for a fictional enterprise platform,
AcmeCRM. Creating a customer successfully proves the happy path, but it does not
answer the questions an enterprise customer or technology partner will ask:

- What happens when an OAuth token expires during a long-running job?
- Does the connector respect the partner's rate-limit instructions?
- Can duplicate webhooks create duplicate orders?
- Can it traverse a large paginated dataset without losing records?
- Does a breaking API change fail clearly before reaching customers?
- Do logs and reports avoid exposing credentials and customer data?

ConnectorOps runs these scenarios, records the observed behavior, and produces
a readiness scorecard. A failed requirement blocks certification and includes
enough evidence for an engineer, product manager, and external partner to make
the next decision together.

Read the full [product use case](docs/product-use-case.md).

## Demonstration

The initial demonstration follows one connector through a release decision:

1. Run the certification workflow against the AcmeCRM simulator.
2. Verify authentication, pagination, webhook, and bulk-operation behavior.
3. Inject a burst of `429` responses and a breaking response-schema change.
4. Confirm that the connector honors `Retry-After` while the contract test
   catches the incompatible response.
5. Block certification and generate an evidence bundle for the owning engineer
   and partner.
6. Apply an approved compatibility mapping and rerun certification.
7. Issue a passing scorecard only when the release criteria are satisfied.

Example output:

```text
Authentication refresh             PASS
Cursor pagination                  PASS
Rate-limit handling                PASS
Duplicate webhook protection       FAIL
Sensitive-data logging             PASS
Schema compatibility               FAIL

Certification: BLOCKED
```

## Proposed system

```text
                         +-----------------------+
                         | AcmeCRM API simulator |
                         | faults + captured I/O |
                         +-----------+-----------+
                                     ^
                                     |
+-------------------+      +---------+----------+      +------------------+
| Scenario catalog  +----->+ n8n certification +----->+ Evidence + score |
| and release rules |      | workflows + node   |      | and release gate |
+-------------------+      +---------+----------+      +------------------+
                                     |
                                     v
                         +-----------+-----------+
                         | PostgreSQL state      |
                         | runs + assertions     |
                         +-----------------------+
```

The first version intentionally contains one realistic connector rather than
many shallow integrations:

- A TypeScript AcmeCRM API simulator with controllable failure modes
- A custom n8n community node with credentials and representative operations
- Certification, webhook, failure-triage, and contract-canary workflows
- PostgreSQL-backed certification state and evidence
- Unit, integration, and a small number of end-to-end journey tests
- A deterministic release decision; optional AI may explain contract changes,
  but it cannot override the gate

## Deployment

Local development and CI run the entire system in containers. A public demo
uses the same images with managed PostgreSQL. A production-shaped reference
deployment can separate n8n's main process from queue workers and add Redis
when workload measurements justify it.

See [deployment](docs/deployment.md) for the environments, component topology,
security boundaries, health checks, and release flow.

## Engineering approach

ConnectorOps borrows several ideas from
[Epicflare](https://github.com/epicweb-dev/epicflare): one obvious development
command, local third-party simulators, isolated preview environments,
high-signal journey tests, explicit architecture documentation, and deployment
health checks tied to the exact revision being released.

See [engineering principles](docs/engineering-principles.md) for what we are
adopting, what we are adapting, and what we are deliberately not copying.

We record slow starts, broken commands, unclear behavior, and missing guidance
in the [friction log](docs/friction-log.md). The log captures observed problems
before we decide whether the right response is documentation, automation, a
test, or a product change.

## Project status

ConnectorOps is currently in product-definition and architecture planning. The
next milestone is a thin vertical slice: create one customer through the custom
node, certify its timeout and duplicate-delivery behavior, and produce the first
readiness report.

