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

No entries have been addressed yet.

## Review cadence

Review open entries at milestone boundaries. When an entry is addressed:

1. Link the documentation, test, script, or change that addressed it.
2. Move the complete entry under **Addressed friction**.
3. Record the resolution date and verify the original path again.

If the same class of friction appears twice, prefer a mechanical guardrail over
another reminder.
