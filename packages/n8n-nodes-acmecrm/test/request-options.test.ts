import { describe, expect, it } from 'vitest';

import { toHttpRequestOptions } from '../nodes/AcmeCrm/request-options';

describe('AcmeCRM request options', () => {
	it('applies the bounded timeout without changing the stable request', () => {
		const request = {
			method: 'POST' as const,
			url: 'http://acme-api:3001/runs/run-1/v1/orders',
			headers: { 'Idempotency-Key': 'stable-key' },
			body: {
				externalOrderId: 'ORDER-123',
				customerId: 'CUSTOMER-42',
				amountMinor: 10_500,
				currency: 'EUR',
			},
		};

		expect(toHttpRequestOptions(request, 100)).toEqual({
			...request,
			json: true,
			timeout: 100,
		});
	});
});
