# Friction log

This log records moments where developing, testing, deploying, or understanding
ConnectorOps takes more effort than it reasonably should.

The purpose is not to create a complaint backlog or immediately automate every
rough edge. We first preserve evidence, then decide whether the best response is
better documentation, a clearer error, a script, a test, an architectural
change, or no change at all.

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

### F-001: Selected repository has no remotely available branch

- **Observed:** 2026-10-21
- **Context:** Preparing the cloud development environment for the selected
  `jherey/n8n` repository at `main`
- **Friction:** The checkout contained no project files, and the requested
  remote branch did not exist.
- **Evidence:** `git ls-remote origin` returned no references;
  `git fetch --dry-run origin main` returned
  `fatal: couldn't find remote ref main`; local `HEAD` is unborn.
- **Impact:** Dependencies, startup, and tests could not be discovered or run.
- **Workaround:** Product discovery and documentation continued in the unborn
  local checkout.
- **Next action:** Rename the GitHub repository to `connectorops`, establish a
  `main` branch with the approved project foundation, and update the cloud
  environment repository selection.
- **Status:** Open

### F-002: The repository identity does not match the product

- **Observed:** 2026-10-21
- **Context:** Documenting ConnectorOps in a repository named `n8n`
- **Friction:** The repository name suggests a fork of the n8n platform rather
  than a separate connector-readiness product.
- **Evidence:** The configured remote is `jherey/n8n`, while all project
  documentation and the proposed package names use `ConnectorOps`.
- **Impact:** Reviewers may misunderstand the project's purpose, and future
  package/deployment naming would require avoidable migration work.
- **Workaround:** Use `ConnectorOps` consistently in documentation and avoid
  publishing packages or deployment resources under the old name.
- **Next action:** Rename the empty remote before the first published project
  commit.
- **Status:** Open

## Addressed friction

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
