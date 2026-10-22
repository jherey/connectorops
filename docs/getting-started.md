# Getting started

## Prerequisites

- Node.js 24.19
- npm 11
- Docker Engine 28 or compatible
- Docker Compose v2

Use the versions declared in `.node-version` and `package.json`. ConnectorOps
uses npm workspaces; do not install with pnpm or Yarn.

Check the active versions before installing:

```bash
node --version
npm --version
```

Node must report `v24.x`. If you use nvm on macOS or Linux, switch versions
with:

```bash
nvm install 24.19.0
nvm use 24.19.0
```

The repository sets `engine-strict=true`, so `npm ci` stops with `EBADENGINE`
on Node 23, 25, 26, or any other unsupported major version.

## Install

```bash
npm ci
```

Copy `.env.example` to `.env` only when you need to override the local defaults.
The committed example contains development-only values and is not suitable for
a public deployment. `ACME_CONTROL_TOKEN` protects simulator fault controls,
and `ACME_API_KEY` represents the partner credential exercised by the custom
node. Replace both outside local development.

## Run the complete local topology

```bash
npm run dev
```

This command packs the custom AcmeCRM node into an immutable n8n image, builds
the simulator image, and starts PostgreSQL, the simulator, and one n8n process.

When startup completes:

- n8n: <http://localhost:5678>
- AcmeCRM readiness: <http://localhost:3001/healthz/readiness>

In another terminal, verify the services through their readiness endpoints.
Container status alone does not prove that the applications are ready.

```bash
npm run smoke
```

Stop the services without deleting their databases:

```bash
npm run down
```

To delete local database and n8n state, run
`docker compose down --volumes`. This is destructive and should not be the
normal stop command.

## Work on only the simulator

```bash
npm run dev --workspace @connectorops/acme-api
```

The simulator exposes liveness at `/healthz` and revision-aware readiness at
`/healthz/readiness`. Authenticated control routes configure isolated
`timeout-after-commit` and `rate-limit-then-success` runs; the partner routes
then expose those faults while recording sanitized observations.

## Validate a change

```bash
npm run validate
```

The same command runs in CI and covers formatting, linting, type checking, unit
tests, builds, and Compose configuration validation. Container startup and
readiness run in a separate CI job because they are slower.

Run the real Postgres-backed simulator integration test separately:

```bash
npm run test:integration
```

This command uses a dedicated Compose project to start only Postgres, discovers
its loopback-only published port, runs the database test, and stops only the
service it started. It does not disturb the development stack or delete either
Postgres volume.

Generate fresh safe and negative-control application evidence:

```bash
npm run evidence:generate
```

This runs executable in-memory scenarios and replaces the synthetic examples
under `docs/examples`. It fails unless the safe run is `CERTIFIED` and the
negative control is `BLOCKED`.

## Generated artifacts

`npm run artifacts:pack` creates versioned npm tarballs and stable Docker inputs
for both the custom node and simulator. These files are generated and ignored
by Git. The images install or extract only local artifacts; they never download
application dependencies at startup or build time.

## Troubleshooting and friction

Record observed slow starts, broken commands, misleading errors, and missing
documentation in [`friction-log.md`](friction-log.md). Include the command and
evidence, but never include secret values or customer payloads.
