import { describe, expect, test, vi } from 'vitest';
import {
	calculateRetryDelayMs,
	parseRetryAfterMs,
	retryRequest,
	type RetryPolicy,
} from '../nodes/AcmeCrm/retry';

const policy: RetryPolicy = {
	maxAttempts: 3,
	baseDelayMs: 100,
	maxDelayMs: 2_000,
};

describe('Retry-After parsing', () => {
	test('parses delta seconds', () => {
		expect(parseRetryAfterMs('2', 0)).toBe(2_000);
	});

	test('parses an HTTP date relative to the supplied clock', () => {
		const now = Date.parse('2026-10-22T10:00:00.000Z');
		expect(parseRetryAfterMs('Thu, 22 Oct 2026 10:00:02 GMT', now)).toBe(2_000);
	});

	test('ignores an invalid value', () => {
		expect(parseRetryAfterMs('later', 0)).toBeUndefined();
	});
});

describe('calculateRetryDelayMs', () => {
	test('uses bounded exponential backoff without a server instruction', () => {
		expect(calculateRetryDelayMs({ retryNumber: 1, policy })).toBe(100);
		expect(calculateRetryDelayMs({ retryNumber: 2, policy })).toBe(200);
	});

	test('does not retry earlier than Retry-After', () => {
		expect(calculateRetryDelayMs({ retryNumber: 1, retryAfter: '1', policy })).toBe(1_000);
	});

	test('refuses a retry that exceeds the bounded delay budget', () => {
		expect(calculateRetryDelayMs({ retryNumber: 1, retryAfter: '5', policy })).toBeNull();
	});
});

describe('retryRequest', () => {
	test('retries a classified transient failure and returns the eventual response', async () => {
		const transientError = new Error('rate limited');
		const request = vi.fn().mockRejectedValueOnce(transientError).mockResolvedValue({ id: '1' });
		const sleep = vi.fn().mockResolvedValue(undefined);

		await expect(
			retryRequest({
				request,
				classifyError: () => ({ retryable: true, retryAfter: '1' }),
				onGiveUp: (error) => {
					throw error;
				},
				sleep,
				policy,
			}),
		).resolves.toEqual({ id: '1' });
		expect(request).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledWith(1_000);
	});

	test('does not retry a permanent failure', async () => {
		const permanentError = new Error('bad request');
		const request = vi.fn().mockRejectedValue(permanentError);

		await expect(
			retryRequest({
				request,
				classifyError: () => ({ retryable: false }),
				onGiveUp: (error) => {
					throw error;
				},
				sleep: vi.fn(),
				policy,
			}),
		).rejects.toBe(permanentError);
		expect(request).toHaveBeenCalledOnce();
	});
});
