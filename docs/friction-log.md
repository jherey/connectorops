# Friction log

This log records failed commands, slow setup, missing instructions, and
environment differences encountered while building ConnectorOps. Each entry
includes evidence and a next action.

## How to log friction

Add an entry when you encounter an actual problem, including:

- Slow or confusing setup
- A documented command that does not work
- An error that does not explain the next action
- Missing, stale, or contradictory documentation
- Repeated manual coordination
- Local, CI, preview, or production behavior that unexpectedly differs
- A task that requires knowledge available only in a person's memory or chat

Do not log hypothetical risks here. Put those in the risk register or an
architecture decision record.

## Entry template

```markdown
### F-XXX: Short title

- **Observed:** YYYY-MM-DD
- **Context:** What the person was trying to accomplish
- **Friction:** What slowed or blocked the work
- **Evidence:** Command, duration, error, or reproducible observation
- **Impact:** Who or what was affected
- **Workaround:** What allowed progress, if anything
- **Next action:** The smallest useful follow-up
- **Status:** Open, investigating, addressed, or accepted
```

Never include credentials, tokens, private customer data, or complete sensitive
payloads in an entry.

## Open friction

### F-009: Certification tests import simulator source through a relative path

- **Observed:** 2026-10-22
- **Context:** Testing the certification engine against the in-memory AcmeCRM
  simulator
- **Friction:** The simulator has no supported test-server export, so the
  certification test reaches across workspace boundaries into application
  source using `../../../apps/acme-api/src/...` imports.
- **Evidence:** `packages/certification/test/certify.test.ts` imports `buildApp`
  and `MemorySimulatorStore` directly from `apps/acme-api/src`.
- **Impact:** Internal simulator file moves can break certification tests, and
  the supported boundary between the application and certification packages is
  unclear.
- **Workaround:** Keep the relative import test-only; production certification
  code does not depend on AcmeCRM simulator internals.
- **Next action:** Define a stable test-server export, either from
  `@connectorops/acme-api` or a dedicated test-support workspace, before more
  certification suites reuse these helpers.
- **Status:** Open

## Addressed friction

### F-015: `npm ci` failed when the shell used Node 26

- **Observed:** 2026-10-22
- **Resolved:** 2026-10-22
- **Context:** Installing dependencies on macOS after cloning the repository
- **Friction:** The shell used Node `26.3.1`, but the project supports Node 24.
  npm stopped before installing packages because `engine-strict=true`.
- **Evidence:** `npm ci` returned `EBADENGINE`, with a required range of
  `>=24 <25` and an actual Node version of `26.3.1`.
- **Impact:** Local setup could not continue until the active Node version
  matched the repository requirement.
- **Resolution:** The setup guide now puts version checks and the nvm commands
  immediately before installation. Switch to Node `24.19.0`, verify
  `node --version`, and rerun `npm ci`.
- **Status:** Addressed

### F-014: Evidence generation left tracked files unformatted

- **Observed:** 2026-10-22
- **Resolved:** 2026-10-22
- **Context:** Running the code-quality job after regenerating application
  evidence
- **Friction:** The evidence script wrote JSON with two-space indentation and
  emitted Markdown without applying the repository's Prettier configuration.
- **Evidence:** GitHub Actions failed `npm run format:check` for
  `blocked-scorecard.json`, `certified-scorecard.json`, and
  `partner-failure-report.md`.
- **Impact:** The code-quality job failed even though the generated reports
  contained valid evidence.
- **Resolution:** The generator now resolves the repository's Prettier settings
  and formats each JSON and Markdown file before writing it. Running
  `npm run evidence:generate && npm run format:check` now succeeds.
- **Status:** Addressed

### F-001: Selected repository had no remotely available branch

- **Observed:** 2026-10-21
- **Resolved:** 2026-10-22
- **Context:** Preparing the cloud environment for `jherey/n8n` at `main`
- **Friction:** The remote had no project files or branches.
- **Evidence:** `git ls-remote origin` returned no references, and
  `git fetch --dry-run origin main` could not find `main`.
- **Impact:** The environment had no dependencies, startup command, or tests.
- **Resolution:** Build the project on a local `main` branch, rename the GitHub
  repository to `jherey/connectorops`, and push the tested history. The remote
  `HEAD` now resolves to `refs/heads/main`.
- **Status:** Addressed

### F-002: The repository name did not match the product

- **Observed:** 2026-10-21
- **Resolved:** 2026-10-22
- **Context:** Building ConnectorOps in a repository named `n8n`
- **Friction:** The old name suggested a fork of n8n rather than a separate
  connector certification project.
- **Evidence:** The local packages used `ConnectorOps` while the remote URL was
  `jherey/n8n`.
- **Impact:** A reviewer could misunderstand the project's purpose.
- **Resolution:** Rename the repository to `jherey/connectorops` and update the
  Git remote before publishing `main`.
- **Status:** Addressed

### F-013: Non-success HTTP responses discarded retry guidance

- **Observed:** 2026-10-22
- **Resolved:** 2026-10-22
- **Context:** Adding deterministic certification for partner rate limiting
- **Friction:** The certification HTTP helper retained response headers only on
  successful requests, so a `429` response's `Retry-After` instruction was not
  available to the retry policy or the evidence report.
- **Evidence:** The first rate-limit scenario could identify HTTP 429 but could
  not distinguish a standards-compliant response from one without retry
  guidance.
- **Impact:** ConnectorOps could have certified a retry without proving that the
  connector honored the partner contract.
- **Resolution:** Non-success responses now carry normalized response headers;
  the rate-limit profile requires `Retry-After: 0`, a stable idempotency-key
  hash, the `rate_limited` to `created` sequence, and exactly one order.
- **Status:** Addressed

### F-012: n8n wraps transport error codes in `NodeApiError.cause`

- **Observed:** 2026-10-22
- **Context:** Executing the timeout-after-commit workflow with n8n 2.44.5
- **Friction:** The simulator committed the order and the 100 ms client timeout
  fired, but the connector did not retry because it inspected only the wrapper
  error while `ECONNABORTED` was stored on its nested cause.
- **Evidence:** The first live workflow run recorded one `created` request and
  one order, then ended with the connector's sanitized exhausted-policy error.
- **Resolution:** Traverse the error cause chain without cycles when reading
  transport codes; add direct Axios and n8n-wrapped timeout regression tests.
- **Status:** Addressed

### F-011: The custom-node pack command could archive stale build output

- **Observed:** 2026-10-22
- **Context:** Repacking the connector after fixing timeout classification
- **Friction:** Source tests passed, but the installed tarball still contained
  the previous compiled JavaScript because `node:pack` did not build first.
- **Evidence:** The source and package timestamps changed while
  `dist/nodes/AcmeCrm/create-order.js` did not contain the new timeout code.
- **Resolution:** Make `scripts/pack-n8n-node.mjs` run the node build before
  every pack, so an immutable artifact cannot silently lag its source.
- **Status:** Addressed

### F-010: Cloud Docker exhausted root inodes with the VFS storage driver

- **Observed:** 2026-10-22
- **Context:** Rebuilding and recreating the local Compose stack in the cloud
- **Friction:** The root filesystem had free bytes but no free inodes. Docker's
  VFS driver deep-copied the large n8n image and failed while creating container
  init layers with `no space left on device`.
- **Evidence:** `df -i /workspace` reached 100%, while `/tmp` retained over four
  million free inodes. The immutable images built successfully; container
  creation failed during the layer copy.
- **Workaround:** Validate the same pinned n8n package and packed community node
  from `/tmp`, with Postgres in Docker and the simulator in the same bounded
  validation process. Standard Docker hosts continue to use Compose.
- **Next action:** Give the cloud Docker data root a filesystem with a larger
  inode budget or a copy-on-write storage driver before requiring Compose E2E
  on this runner.
- **Status:** Open (environment constraint)

### F-003: The default npm cache directory was unavailable in the cloud image

- **Observed:** 2026-10-22
- **Resolved:** 2026-10-22
- **Context:** Querying package metadata before creating the workspace lockfile
- **Friction:** npm could not create `/home/agent/.npm/_cacache` because the
  expected parent cache directory was absent in the cloud environment.
- **Evidence:** npm returned `ENOENT` for `/home/agent/.npm/_cacache` before
  making the registry request useful.
- **Impact:** Package discovery and installation commands failed before project
  code could be validated.
- **Resolution:** `.npmrc` now uses an ignored repository-local cache. A clean
  `npm ci` installed 657 packages successfully without an environment override.
- **Status:** Addressed

### F-004: Docker expected a writable home-directory configuration

- **Observed:** 2026-10-22
- **Resolved:** 2026-10-22
- **Context:** Building the AcmeCRM simulator image in the cloud environment
- **Friction:** Docker Buildx tried to create `/home/agent/.docker/buildx`, but
  the cloud filesystem exposes that location as read-only.
- **Evidence:** `docker compose build acme-api` failed with
  `mkdir /home/agent/.docker/buildx: read-only file system`.
- **Impact:** Container builds failed before reading the project Dockerfile.
- **Resolution:** Project Compose commands now run through
  `scripts/compose.mjs`, which preserves an explicit `DOCKER_CONFIG` and
  otherwise creates an ignored repository-local configuration directory.
- **Status:** Addressed

### F-005: The primary n8n container registry was unavailable from cloud builds

- **Observed:** 2026-10-22
- **Resolved:** 2026-10-22
- **Context:** Building the pinned custom n8n image
- **Friction:** The environment denied manifest access to the primary
  `docker.n8n.io` registry before the Dockerfile could run.
- **Evidence:** BuildKit returned `Forbidden` for the pinned `2.44.5` manifest.
- **Impact:** The reproducible n8n image could not be built from the primary
  registry in this cloud environment.
- **Resolution:** The Dockerfile uses n8n's official Docker Hub image mirror,
  `n8nio/n8n:2.44.5`, while retaining the exact version pin.
- **Status:** Addressed

### F-006: Generated executable files lost their executable bit

- **Observed:** 2026-10-22
- **Resolved:** 2026-10-22
- **Context:** Starting Postgres with the repository-provided database
  initialization script
- **Friction:** The generated shell script was mounted with mode `0600`, so the
  Postgres entrypoint skipped it instead of creating the simulator database.
- **Evidence:** The first Compose startup did not create the `acmecrm` database;
  `stat` showed that `docker/postgres/init-databases.sh` was not executable.
- **Impact:** The simulator could not become ready on a clean environment.
- **Resolution:** The script is checked in with executable mode and clean-volume
  startup now creates both databases successfully.
- **Status:** Addressed

### F-007: Container builds could not reach the npm registry

- **Observed:** 2026-10-22
- **Resolved:** 2026-10-22
- **Context:** Building the AcmeCRM simulator and custom n8n images
- **Friction:** Docker build containers could not resolve the npm registry, even
  though dependency installation worked from the host environment.
- **Evidence:** In-container `npm ci` stalled and failed while resolving registry
  packages; the same lockfile completed with host `npm ci`.
- **Impact:** A conventional multi-stage Docker build was not reproducible in
  this cloud environment.
- **Resolution:** Host-side packing creates deterministic ignored artifacts. The
  AcmeCRM simulator is bundled into a standalone server, and both images install
  or copy only those packed artifacts without registry access.
- **Status:** Addressed

### F-008: Integration tests collided with the development Compose project

- **Observed:** 2026-10-22
- **Resolved:** 2026-10-22
- **Context:** Running the real Postgres simulator-store integration test while
  another development task had Postgres running
- **Friction:** The existing container predated the loopback port mapping, so
  Compose reported `:0` and the test constructed an invalid database URL.
- **Evidence:** The first `npm run test:integration` failed with `Invalid URL`;
  `docker compose port postgres 5432` returned `:0` for the existing container.
- **Impact:** Integration tests could either fail unpredictably or disturb a
  developer's running stack by recreating its database container.
- **Resolution:** The integration runner uses a dedicated Compose project,
  discovers its dynamic loopback port, ensures the simulator database exists,
  and removes only the container it started while preserving volumes. Two
  consecutive runs passed without changing the development Postgres service.
- **Status:** Addressed

## Review cadence

Review open entries at milestone boundaries. When an entry is addressed:

1. Link the documentation, test, script, or change that addressed it.
2. Move the complete entry under **Addressed friction**.
3. Record the resolution date and verify the original path again.

If the same class of friction appears twice, prefer a mechanical guardrail over
another reminder.
