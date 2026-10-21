export type RetryPolicy = Readonly<{
	maxAttempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
}>;

export const DEFAULT_RETRY_POLICY: RetryPolicy = Object.freeze({
	maxAttempts: 2,
	baseDelayMs: 250,
	maxDelayMs: 5_000,
});

export type RetryDecision = Readonly<{
	retryable: boolean;
	retryAfter?: string;
}>;

type RetryDependencies<T> = Readonly<{
	request: (attempt: number) => Promise<T>;
	classifyError: (error: unknown) => RetryDecision;
	onGiveUp: (error: unknown) => never;
	sleep: (delayMs: number) => Promise<void>;
	policy?: RetryPolicy;
	now?: () => number;
}>;

export async function retryRequest<T>({
	request,
	classifyError,
	onGiveUp,
	sleep,
	policy = DEFAULT_RETRY_POLICY,
	now = Date.now,
}: RetryDependencies<T>): Promise<T> {
	assertRetryPolicy(policy);

	for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
		try {
			return await request(attempt);
		} catch (error) {
			const decision = classifyError(error);
			const hasAnotherAttempt = attempt < policy.maxAttempts;
			if (!decision.retryable || !hasAnotherAttempt) {
				return onGiveUp(error);
			}

			const delayMs = calculateRetryDelayMs({
				retryNumber: attempt,
				retryAfter: decision.retryAfter,
				policy,
				nowMs: now(),
			});
			if (delayMs === null) {
				return onGiveUp(error);
			}

			await sleep(delayMs);
		}
	}

	return onGiveUp(new Error('Retry loop exhausted without returning or throwing'));
}

export function calculateRetryDelayMs({
	retryNumber,
	retryAfter,
	policy = DEFAULT_RETRY_POLICY,
	nowMs = Date.now(),
}: Readonly<{
	retryNumber: number;
	retryAfter?: string;
	policy?: RetryPolicy;
	nowMs?: number;
}>): number | null {
	assertRetryPolicy(policy);
	if (!Number.isInteger(retryNumber) || retryNumber < 1) {
		throw new Error('Retry number must be a positive integer');
	}

	const exponentialDelay = Math.min(policy.baseDelayMs * 2 ** (retryNumber - 1), policy.maxDelayMs);
	const requestedDelay = parseRetryAfterMs(retryAfter, nowMs);

	if (requestedDelay === undefined) {
		return exponentialDelay;
	}
	if (requestedDelay > policy.maxDelayMs) {
		return null;
	}

	return Math.max(exponentialDelay, requestedDelay);
}

export function parseRetryAfterMs(
	value: string | undefined,
	nowMs = Date.now(),
): number | undefined {
	if (value === undefined) return undefined;

	const trimmed = value.trim();
	if (/^\d+$/.test(trimmed)) {
		return Number(trimmed) * 1_000;
	}

	const dateMs = Date.parse(trimmed);
	if (Number.isNaN(dateMs)) return undefined;

	return Math.max(0, dateMs - nowMs);
}

function assertRetryPolicy(policy: RetryPolicy): void {
	if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
		throw new Error('Maximum attempts must be a positive integer');
	}
	if (!Number.isFinite(policy.baseDelayMs) || policy.baseDelayMs < 0) {
		throw new Error('Base delay must be a non-negative number');
	}
	if (!Number.isFinite(policy.maxDelayMs) || policy.maxDelayMs < policy.baseDelayMs) {
		throw new Error('Maximum delay must be at least the base delay');
	}
}
