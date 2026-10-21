# ADR 0001: Separate n8n orchestration from TypeScript protocol behavior

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

ConnectorOps needs a visible n8n journey and low-level partner behavior such as
authentication, idempotency, serialization, retries, and error normalization.
Putting everything in workflows weakens typing and reuse; putting everything in
code hides the product journey.

## Decision

n8n owns human-visible sequencing, approvals, and result routing. TypeScript
owns partner-protocol correctness, structured evidence, and deterministic
assertions. Their boundary is a small versioned operation/result contract;
workflows do not parse log strings or recreate HTTP behavior in Code nodes.

The current vertical slice applies this incrementally: the workflow invokes the
real custom node, while the execution harness configures the fault and verifies
partner state. Moving setup, observation, and routing onto the canvas requires
the same contracts and is future work.

## Boundary rule

If behavior answers **how to communicate correctly with the partner API**, it
belongs in TypeScript. If it answers **how a certification journey progresses
or where its result goes**, it belongs in n8n.

## Consequences

- Protocol behavior has strict types, focused tests, and reusable helpers.
- The connector invocation remains inspectable in n8n.
- Workflow/result contracts must be versioned and tested.
- Some orchestration is still in the execution harness; documentation must not
  depict the target workflow as already implemented.

## Alternatives rejected

- **All workflow:** hard to type, test, and reuse partner semantics.
- **All TypeScript:** reduces n8n to a launcher and hides the product journey.

## Validation

The workflow uses the custom node's public operation and contains no duplicated
HTTP logic. Its execution must prove two attempts, a stable key, and one order.
