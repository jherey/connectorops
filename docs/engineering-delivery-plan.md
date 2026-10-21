# ConnectorOps engineering delivery plan

## Outcome and scope

Prove whether an n8n connector handles ambiguous partner failures safely. The
reference scenario commits an AcmeCRM order before the response is lost. The
safe connector must retry without duplication; the unsafe control must show
that ConnectorOps catches the defect.

This delivery does not attempt multiple real connectors, a general
observability platform, a bespoke dashboard, autonomous remediation, or
Kubernetes before measured demand.

## Ownership model

| Workstream        | Accountable role                               | Published contract                                   |
| ----------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Partner simulator | Partner/simulator engineer                     | API schema, named faults, observation API            |
| Connector         | Connector engineer                             | Typed operations, normalized errors, retry semantics |
| Certification     | Certification engineer                         | Assertions, decisions, evidence schema               |
| Delivery          | Platform owner                                 | Reproducible commands, images, health evidence       |
| Alignment         | Engineering manager with Product/partner peers | Scope, risks, decisions, launch call                 |

One person may own several workstreams; the interfaces remain explicit so work
can be delegated without losing accountability.

## Evidence gates

1. **Foundation:** pinned tools, lockfile, one start path, CI, friction log.
2. **Safe vertical slice:** committed write plus timeout, stable retry key,
   exactly one business order.
3. **Negative control:** same fault, unsafe retry, duplicate side effect,
   required assertion blocked.
4. **Real n8n journey:** versioned workflow invokes the packaged custom node;
   execution harness proves partner effects and contains no secrets.
5. **Second deep scenario:** standards-based rate-limit response, stable retry,
   memory/PostgreSQL parity, safe and unsafe decisions.
6. **Application package:** generated scorecards, partner report, ADRs, demo
   script, limitations, and reproducible commands.

Each gate is merged only after its repository-wide validation passes.

## Integration checkpoints

1. Agree the scenario, operation, observation, and evidence contracts.
2. Prove the custom node can cross the real simulator boundary.
3. Inspect captured attempts and business side effects for the safe path.
4. Verify the same harness detects the negative control.
5. Review the evidence package against explicit policy, not a polished demo.

## Key risks

| Risk                | Signal                      | Mitigation                                    | Owner                   |
| ------------------- | --------------------------- | --------------------------------------------- | ----------------------- |
| Simulator drift     | Sandbox differs             | Version fixtures; supplemental conformance    | Simulator owner         |
| Node/workflow drift | Workflow parses internals   | Public contract and journey test              | Connector/certification |
| False confidence    | Tests inspect status only   | Assert partner-side business state            | Certification owner     |
| Duplicate writes    | More than one order         | Stable key and negative control               | Connector owner         |
| Evidence leaks      | Secrets appear in artifacts | Boundary redaction and forbidden-value tests  | Connector/certification |
| Environment drift   | Local-only success          | Same artifacts and scenarios; revision health | Platform owner          |
| Scope expansion     | Dashboard starts first      | Require evidence gate before expansion        | Engineering manager     |

## Next increments

Move scenario setup, observation, and gate routing visibly into n8n while
preserving the tested TypeScript contracts. Then add one scenario at a time:
credential refresh, pagination, webhook deduplication, async polling, and
contract drift. Each scenario must include a defect that the gate demonstrably
catches before it counts as coverage.

## Definition of done

A reviewer can reproduce safe and blocked outcomes, understand the business
impact, trace decisions to sanitized evidence, and see the ownership boundaries
without relying on undocumented knowledge.
