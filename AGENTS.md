# ConnectorOps agent index

Keep this file short. Detailed guidance belongs in focused documents under
`docs/` and should change in the same pull request as the behavior it describes.

## Start here

- Product and demo: [`README.md`](README.md)
- Local setup: [`docs/getting-started.md`](docs/getting-started.md)
- Deployment: [`docs/deployment.md`](docs/deployment.md)
- Engineering principles: [`docs/engineering-principles.md`](docs/engineering-principles.md)
- Observed development friction: [`docs/friction-log.md`](docs/friction-log.md)

## Working agreement

- Use the repository-pinned Node and npm versions.
- Install with `npm ci`; do not change the lockfile unintentionally.
- Run `npm run validate` before requesting review.
- Keep workflow exports free of credentials and customer data.
- Prefer deterministic local simulators over public third-party services.
- Record observed slow starts, broken commands, or missing guidance in the
  friction log at `docs/friction-log.md`. Promote repeated friction into a
  test, check, or script.
