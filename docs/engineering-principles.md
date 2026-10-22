# Engineering principles adapted from Epicflare

This project takes inspiration from
[epicweb-dev/epicflare](https://github.com/epicweb-dev/epicflare), especially
its repository-local guidance, local mock services, validation workflow,
isolated previews, generated deployment configuration, and revision-aware
health checks.

We are adopting the principles, not cloning Epicflare's Cloudflare-specific
architecture. ConnectorOps is an n8n and container-based system, so its runtime
choices remain independent.

## 1. Provide one documented development path

Epicflare provides one development entry point that starts the app and its mock
dependencies. ConnectorOps documents install, startup, workflow import, and
certification commands in one guide.

The commands must work without prompts in CI. A new developer should not need
hidden resource identifiers or undocumented terminal sessions.

## 2. Maintain the partner simulator as a service

Epicflare's third-party mocks run locally and in preview environments, keep
their own state, and expose endpoints for inspecting test activity. The
AcmeCRM simulator follows the same pattern:

- Mirror realistic API semantics instead of returning hard-coded success.
- Persist captured requests separately from application data.
- Offer an authenticated dashboard for inspecting synthetic activity.
- Make failure modes controllable through an explicit scenario API.
- Run the same simulator implementation locally, in CI, and in previews.

This makes demonstrations reproducible and removes public API availability from
the test result.

## 3. Keep application and test infrastructure isolated

Epicflare gives each mock service its own database. ConnectorOps should keep
the simulator's captured requests and injected faults separate from n8n's
metadata and certification records. This prevents test-only tables and cleanup
operations from contaminating application state.

Preview environments also need distinct databases, credentials, and service
names. A pull request must not be able to alter another preview or the public
demo.

## 4. Prefer deterministic offline tests

Epicflare favors local fakes and focused end-to-end journeys over tests that
depend on public services. This is essential for ConnectorOps: a connector
certification test must fail because behavior changed, not because a vendor
sandbox was unavailable.

Use:

- Fast unit tests for retry, pagination, redaction, and policy logic
- Integration tests at the custom-node/API boundary
- A small number of end-to-end tests for complete certification journeys
- Explicit fixtures rather than hidden global test setup

Tests should describe business-observable behavior, such as "a timed-out create
produces exactly one order," rather than implementation details.

## 5. Automate repeated review checks

Epicflare's repository guidance moves repeated review feedback from
documentation into tests, lint rules, or scripts. ConnectorOps uses the same
sequence:

1. Document the expected pattern.
2. Add a regression test when it can fail behaviorally.
3. Add a static check when the rule can be checked mechanically.
4. Encode repeated multi-step work in a command.

If reviewers repeatedly remind contributors to redact tokens, add a mandatory
certification assertion. Do not add another paragraph to a style guide.

## 6. Keep repository guidance navigable

Epicflare uses a short `AGENTS.md` as an index and places detailed instructions
in focused documents. ConnectorOps should do the same once implementation
begins:

- Keep top-level contributor guidance brief.
- Document setup, testing, architecture, and release behavior near their
  code or configuration that they describe.
- Update documentation in the same change as the behavior it describes.
- Assume knowledge that exists only in chat will be lost.

## 7. Use one repository validation command

The repository should have one validation command that runs the relevant
format, lint, type, build, and test gates. Individual checks remain available
for fast iteration, but contributors and reviewers should not need to guess
what "ready" means.

Failures should identify the scenario, observed behavior, expected behavior,
correlation ID, and likely remediation. A green check without evidence is less
useful than a small, inspectable result.

## 8. Create disposable previews

Epicflare provisions isolated resources for pull-request previews and deletes
them when the pull request closes. ConnectorOps should eventually deploy:

- A uniquely named n8n preview
- A matching AcmeCRM simulator
- Isolated PostgreSQL state
- Synthetic seed data and preview-only credentials

Cleanup is part of the preview lifecycle, not a periodic manual task.

For the first milestone, CI containers provide most of this value without the
cost of public previews. Preview infrastructure is added when reviewers need to
interact with changes before merge.

## 9. Verify the deployed revision

Epicflare's post-deploy health check validates both readiness and the exact Git
SHA. ConnectorOps should expose a small readiness response containing service
health, schema readiness, and build revision. Deployment succeeds only when the
expected revision answers successfully.

This prevents an old healthy instance from being mistaken for a successful new
deployment.

## 10. Generate environment-specific configuration

Epicflare avoids committing live resource identifiers and generates deployment
configuration in CI. ConnectorOps should version the shape of its configuration
while injecting environment-specific endpoints, resource names, and secrets at
deployment time.

Generated configuration must be inspectable, excluded from source control when
it contains environment bindings, and reproducible from declared inputs.

## What we are not copying

- Cloudflare Workers, D1, KV, and Durable Objects are appropriate for
  Epicflare, but not required for an n8n container deployment.
- Bun may be evaluated when implementation starts; it is not adopted merely
  because Epicflare uses it.
- A full preview platform is deferred until the first workflow works.
- ConnectorOps will not inherit framework abstractions that do not contribute
  to connector certification.

ConnectorOps applies the parts that can be checked in this repository. Local
and CI tests use the same simulator, architecture decisions are versioned, and
health checks report the deployed revision.
