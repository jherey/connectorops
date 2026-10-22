# Deployment

ConnectorOps has three deployment profiles. They use the same application
images with different infrastructure requirements.

## 1. Local development and CI

The complete system runs with Docker Compose:

```text
Browser
   |
   v
n8n (single process) --------> AcmeCRM simulator
   |                                  |
   +------------> PostgreSQL <--------+
```

Services:

- `n8n`: the editor, webhook endpoints, and workflow execution
- `postgres`: n8n metadata plus ConnectorOps certification state in separate
  databases or schemas
- `acme-api`: the TypeScript partner simulator and captured-request dashboard
- `report`: a possible scorecard UI. The current version generates files and
  does not run this service.

The custom ConnectorOps node is built into the n8n development image. Seeded
fixtures and imported workflow definitions make the demo reproducible.

This profile omits Redis and separate n8n workers. One n8n process can run the
current certification workload.

## 2. Public portfolio demo

The portfolio deployment uses a container platform such as Fly.io, Railway, or
Render plus managed PostgreSQL:

```text
                         +----------------------+
Internet -> TLS proxy -> | n8n demo instance    |
                         +----------+-----------+
                                    |
                   +----------------+----------------+
                   v                                 v
          Managed PostgreSQL               AcmeCRM simulator
```

The n8n editor must not be anonymously writable. The demo should use platform
authentication or n8n user management, restrict inbound webhooks to documented
demo endpoints, and contain no real customer data or production credentials.

The simulator is safe to expose only with authentication and request-size/rate
limits. Its fault-control endpoints require a separate admin credential from
the credential used by the custom node.

Use this profile for a public application demo. It keeps PostgreSQL managed and
runs the same application images used in local testing.

## 3. Production-shaped reference

If the project needs to demonstrate horizontal execution, n8n can run in queue
mode:

```text
                           +------------------+
Internet -> TLS/ingress -> | n8n main/webhook |
                           +---------+--------+
                                     |
                              Redis job queue
                                /         \
                               v           v
                         n8n worker 1   n8n worker 2
                                \         /
                                 v       v
                              PostgreSQL
```

In this profile:

- The main n8n service handles the editor, API, and workflow scheduling.
- Independently scalable workers execute certification jobs.
- Redis transports queued executions.
- PostgreSQL is the durable system of record.
- The custom node is baked into every n8n image, including workers.
- The AcmeCRM simulator remains a non-production test dependency; it is not on
  the path of real customer workflows.

Queue mode is a later capability, not an MVP requirement. We add it only after
measuring a workload that benefits from parallel workers.

## Configuration and secrets

Configuration is divided by responsibility:

| Kind                  | Examples                                        | Storage                                           |
| --------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Non-secret config     | base URLs, retry budgets, certification profile | environment variables or versioned config         |
| Runtime secrets       | database password, n8n encryption key           | deployment secret manager                         |
| n8n credentials       | partner OAuth client and access credentials     | n8n credential store, encrypted with a stable key |
| Test-only credentials | simulator API and fault-control tokens          | isolated preview/local secrets                    |

Secrets are never committed, written into workflow exports, or copied into test
fixtures. The n8n encryption key must remain stable across restarts and workers;
losing it makes stored n8n credentials unusable.

## Images and artifacts

The build produces immutable images tagged with a Git commit SHA.

| Image                         | Contents                               |
| ----------------------------- | -------------------------------------- |
| `connectorops-n8n:<sha>`      | The pinned n8n version and custom node |
| `connectorops-acme-api:<sha>` | The partner simulator                  |
| `connectorops-report:<sha>`   | Reserved for a future report service   |

Workflow exports, scenario definitions, database migrations, and node source
remain version-controlled. Runtime data and secrets do not.

## Release flow

1. Install dependencies from the lockfile.
2. Run formatting, linting, type checks, unit tests, and integration tests.
3. Start the local topology and run the high-signal certification journey.
4. Build immutable images.
5. For pull requests, deploy an isolated preview and seed synthetic data.
6. Verify readiness endpoints and the deployed Git SHA.
7. Promote the already-tested image to the demo or production environment.
8. Retain evidence for the release and clean up temporary preview resources.

The health check proves both service readiness and revision identity. A running
container alone is not considered a successful deployment.

## Recovery

- Database migrations are forward-only and tested against a copy of synthetic
  data before deployment.
- Application rollback redeploys the previous immutable image.
- Destructive schema changes require an expand-and-contract migration so the
  previous and new image can coexist during rollout.
- Certification runs are idempotent and have unique run IDs, so a deployment
  retry does not merge evidence from separate attempts.
