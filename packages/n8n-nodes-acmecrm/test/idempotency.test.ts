import { describe, expect, test } from 'vitest';
import { createOrderIdempotencyKey } from '../nodes/AcmeCrm/idempotency';

describe('createOrderIdempotencyKey', () => {
	test('returns the same non-identifying key for the same external order ID', () => {
		const first = createOrderIdempotencyKey(' order-123 ');
		const second = createOrderIdempotencyKey('order-123');

		expect(first).toBe(second);
		expect(first).toMatch(/^co_[a-f0-9]{64}$/);
		expect(first).not.toContain('order-123');
	});

	test('returns different keys for different orders', () => {
		expect(createOrderIdempotencyKey('order-123')).not.toBe(createOrderIdempotencyKey('order-124'));
	});

	test('rejects an empty external order ID', () => {
		expect(() => createOrderIdempotencyKey('   ')).toThrow('cannot be empty');
	});
});
