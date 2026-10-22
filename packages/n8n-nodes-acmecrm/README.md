# n8n-nodes-acmecrm

The AcmeCRM community node used by ConnectorOps certification scenarios.

The node deliberately represents production-safe connector behavior. Fault
injection and broken control cases belong to the AcmeCRM simulator, not to a
runtime option on this node.

## Operations

### Create an order

Creates an order using a stable, non-identifying idempotency key derived from
the external order ID. Transient failures use bounded retries and honor a
bounded `Retry-After` response rather than retrying earlier than requested.
