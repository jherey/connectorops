import { describe, expect, test, vi } from 'vitest';
import {
	classifyHttpError,
	createOrder,
	type CreateOrderRequest,
	type SanitizedRequestFailure,
} from '../nodes/AcmeCrm/create-order';

const input = {
	externalOrderId: 'order-123',
	customerId: 'customer-456',
	amountMinor: 12_345,
	currency: 'USD',
};

class CapturedFailure extends Error {
	constructor(readonly failure: SanitizedRequestFailure) {
		super(failure.message);
	}
}

const captureFailure = (failure: SanitizedRequestFailure): never => {
	throw new CapturedFailure(failure);
};

describe('createOrder', () => {
	test.each(['ETIMEDOUT', 'ECONNABORTED'])(
		'retries a %s timeout with the exact same safe request and returns the second response',
		async (timeoutCode) => {
			const timeout = Object.assign(new Error('secret API token: do-not-leak'), {
				code: timeoutCode,
			});
			const transport = vi
				.fn<(request: CreateOrderRequest) => Promise<{ id: string }>>()
				.mockRejectedValueOnce(timeout)
				.mockResolvedValueOnce({ id: 'acme-order-1' });
			const sleep = vi.fn().mockResolvedValue(undefined);

			await expect(
				createOrder({
					baseUrl: 'https://simulator.example/runs/run-42/',
					input,
					transport,
					sleep,
					onFailure: captureFailure,
				}),
			).resolves.toEqual({ id: 'acme-order-1' });

			expect(transport).toHaveBeenCalledTimes(2);
			const firstRequest = transport.mock.calls[0][0];
			const secondRequest = transport.mock.calls[1][0];
			expect(secondRequest).toBe(firstRequest);
			expect(firstRequest).toEqual({
				method: 'POST',
				url: 'https://simulator.example/runs/run-42/v1/orders',
				headers: { 'Idempotency-Key': expect.stringMatching(/^co_[a-f0-9]{64}$/) },
				body: input,
			});
			expect(secondRequest.url).toBe(firstRequest.url);
			expect(secondRequest.body).toEqual(firstRequest.body);
			expect(secondRequest.headers['Idempotency-Key']).toBe(
				firstRequest.headers['Idempotency-Key'],
			);
			expect(sleep).toHaveBeenCalledOnce();
		},
	);

	test('retries when n8n wraps a transport timeout as the error cause', async () => {
		const transport = vi
			.fn<(request: CreateOrderRequest) => Promise<{ id: string }>>()
			.mockRejectedValueOnce({
				cause: Object.assign(new Error('request timed out'), {
					code: 'ECONNABORTED',
				}),
			})
			.mockResolvedValueOnce({ id: 'acme-order-1' });

		await expect(
			createOrder({
				baseUrl: 'https://simulator.example/runs/run-42',
				input,
				transport,
				sleep: vi.fn().mockResolvedValue(undefined),
				onFailure: captureFailure,
			}),
		).resolves.toEqual({ id: 'acme-order-1' });

		expect(transport).toHaveBeenCalledTimes(2);
	});

	test('retries one wrapped 429 with the identical request and idempotency key', async () => {
		const wrappedRateLimit = {
			name: 'NodeApiError',
			cause: {
				statusCode: 429,
				headers: { 'Retry-After': '0' },
			},
		};
		const transport = vi
			.fn<(request: CreateOrderRequest) => Promise<{ id: string }>>()
			.mockRejectedValueOnce(wrappedRateLimit)
			.mockResolvedValueOnce({ id: 'acme-order-rate-limit' });
		const sleep = vi.fn().mockResolvedValue(undefined);

		await expect(
			createOrder({
				baseUrl: 'https://simulator.example/runs/rate-limit-run',
				input,
				transport,
				sleep,
				onFailure: captureFailure,
			}),
		).resolves.toEqual({ id: 'acme-order-rate-limit' });

		expect(classifyHttpError(wrappedRateLimit)).toEqual({
			retryable: true,
			retryAfter: '0',
		});
		expect(transport).toHaveBeenCalledTimes(2);
		const firstRequest = transport.mock.calls[0][0];
		const secondRequest = transport.mock.calls[1][0];
		expect(secondRequest).toBe(firstRequest);
		expect(secondRequest.url).toBe(firstRequest.url);
		expect(secondRequest.body).toEqual(firstRequest.body);
		expect(secondRequest.headers['Idempotency-Key']).toBe(firstRequest.headers['Idempotency-Key']);
		expect(sleep).toHaveBeenCalledOnce();
	});

	test('stops safely when an error cause chain contains a cycle', () => {
		const cyclicError: Record<string, unknown> = {};
		cyclicError.cause = cyclicError;

		expect(classifyHttpError(cyclicError)).toEqual({
			retryable: false,
			retryAfter: undefined,
		});
	});

	test('uses a stable idempotency key across repeated executions', async () => {
		const requests: CreateOrderRequest[] = [];
		const transport = vi.fn(async (request: CreateOrderRequest) => {
			requests.push(request);
			return { id: 'acme-order-1' };
		});
		const dependencies = {
			baseUrl: 'https://simulator.example/runs/run-42',
			input,
			transport,
			sleep: vi.fn(),
			onFailure: captureFailure,
		};

		await createOrder(dependencies);
		await createOrder(dependencies);

		expect(requests).toHaveLength(2);
		expect(requests[1].headers['Idempotency-Key']).toBe(requests[0].headers['Idempotency-Key']);
	});

	test('does not retry an HTTP 400 response', async () => {
		const transport = vi.fn().mockRejectedValue({
			statusCode: 400,
			message: 'request included private customer data',
		});

		await expect(
			createOrder({
				baseUrl: 'https://simulator.example/runs/run-42',
				input,
				transport,
				sleep: vi.fn(),
				onFailure: captureFailure,
			}),
		).rejects.toMatchObject({
			failure: {
				message: 'AcmeCRM request failed',
				description: 'AcmeCRM returned HTTP 400.',
				statusCode: 400,
			},
		});
		expect(transport).toHaveBeenCalledOnce();
	});

	test('sanitizes an exhausted transient failure', async () => {
		const transport = vi.fn().mockRejectedValue(
			Object.assign(new Error('Authorization: Bearer super-secret-token'), {
				code: 'ETIMEDOUT',
				response: { body: { customerEmail: 'private@example.com' } },
			}),
		);

		let captured: CapturedFailure | undefined;
		try {
			await createOrder({
				baseUrl: 'https://simulator.example/runs/run-42',
				input,
				transport,
				sleep: vi.fn(),
				onFailure: captureFailure,
			});
		} catch (error) {
			if (error instanceof CapturedFailure) captured = error;
		}

		expect(transport).toHaveBeenCalledTimes(2);
		expect(captured?.failure).toEqual({
			message: 'AcmeCRM request failed',
			description: 'The AcmeCRM request failed after the bounded retry policy was exhausted.',
			statusCode: undefined,
		});
		expect(JSON.stringify(captured?.failure)).not.toMatch(
			/super-secret-token|private@example\.com|Authorization/i,
		);
	});
});
