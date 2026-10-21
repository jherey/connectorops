# Version-controlled n8n workflows

`acmecrm-safe-retry.json` is the credential-scrubbed export for the first
ConnectorOps vertical slice. Its workflow, node, and credential-reference IDs
are fixed so repeated CLI imports update the same records.

The export contains only a credential ID and display name. The bootstrap script
builds the actual credential in memory from `ACME_API_KEY`, sends it to a
permission-restricted temporary file inside the n8n container, imports it, and
deletes the file on exit. It never writes the key to this checkout or prints it.

Before the first import, finish n8n's instance-owner setup in the local UI. n8n
2.44.5 refuses workflow and credential CLI imports when its database has no
owner and personal project. The scripts deliberately do not check in or invent
an owner password to bypass that security boundary.

Run the repeatable journey after the Compose services are healthy:

```bash
ACME_API_KEY='<local partner key>' node scripts/n8n-bootstrap.mjs
ACME_CONTROL_TOKEN='<local control token>' node scripts/n8n-execute.mjs
```

The workflow sets a 100 ms request timeout while the execution script configures
the simulator's first response for a 400 ms delay. The AcmeCRM node passes that
timeout to n8n's HTTP transport, recognizes n8n's wrapped timeout error, and
retries with the same idempotency key. The execution script fails unless it
observes `created` followed by `replayed` and exactly one persisted order.
