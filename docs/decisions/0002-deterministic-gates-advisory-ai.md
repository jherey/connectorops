# ADR 0002: Keep certification gates deterministic and AI advisory

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

Certification is release control. The same evidence must yield the same result,
and a reviewer must be able to trace it to explicit policy.

## Decision

Required scenarios use deterministic `PASS`, `FAIL`, `ERROR`, or `NOT_RUN`
assertions. A required failure produces `BLOCKED`; an error or missing required
result produces `INCOMPLETE`. A score or model cannot override either outcome.

AI is optional and may summarize sanitized evidence, identify likely affected
operations, or draft an escalation. It may not receive secrets, modify policy,
change assertions, release software, or turn a blocked run into a certified one.
Certification continues to work when no model is configured.

## Consequences

- Decisions are reproducible, auditable, and fully testable offline.
- New gates require explicit assertions rather than prompt changes.
- Future advisory output needs schema validation, redaction, and clear labeling.

## Alternatives rejected

An LLM cannot decide readiness because the result would vary for the same
evidence. Excluding all AI use would also remove a possible tool for summarizing
sanitized evidence. The decision keeps that summary separate from the gate.

## Validation

Safe and negative-control evidence deterministically produce `CERTIFIED` and
`BLOCKED`. Tests cover precedence among `FAIL`, `ERROR`, and `NOT_RUN` without a
model or public network.
