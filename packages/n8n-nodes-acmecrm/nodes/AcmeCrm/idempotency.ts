import { createHash } from 'node:crypto';

const IDEMPOTENCY_NAMESPACE = 'connectorops:acmecrm:create-order:v1';

export function createOrderIdempotencyKey(externalOrderId: string): string {
	const normalizedOrderId = externalOrderId.trim();
	if (normalizedOrderId.length === 0) {
		throw new Error('External order ID cannot be empty');
	}

	const digest = createHash('sha256')
		.update(`${IDEMPOTENCY_NAMESPACE}:${normalizedOrderId}`)
		.digest('hex');

	return `co_${digest}`;
}
