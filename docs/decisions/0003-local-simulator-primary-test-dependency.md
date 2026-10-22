# ADR 0003: Use a local partner simulator as the primary test dependency

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

Partner sandboxes are shared, credential-gated, rate-limited, and rarely able
to reproduce "commit the write, lose the response." ConnectorOps needs the same
failure behavior in development, CI, and review environments.

## Decision

The AcmeCRM simulator is the primary automated dependency. It implements the
used contract subset, isolates state by run, persists synthetic resources,
captures sanitized requests, and exposes authenticated named fault controls.
Memory and PostgreSQL stores implement the same interface.

A real vendor sandbox is supplemental for periodic conformance, never a
prerequisite for the deterministic suite.

## Consequences

- Failure cases run without public credentials or network access.
- Safe and unsafe clients face identical partner behavior.
- The simulator can drift, so passing it is not proof of vendor compatibility.
- Contract fixtures and a future supplemental sandbox suite need clear owners.

## Alternatives rejected

A vendor sandbox cannot reproduce the required faults on demand. HTTP mocks do
not test headers, serialization, the network boundary, or captured side
effects. Both remain useful as supplemental tests.

## Validation

Both stores pass timeout and rate-limit scenarios. The safe timeout path creates
one order; the unsafe control creates two and is blocked.
