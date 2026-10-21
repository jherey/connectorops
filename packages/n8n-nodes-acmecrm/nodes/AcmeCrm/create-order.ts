import { createOrderIdempotencyKey } from './idempotency';
import { retryRequest, type RetryDecision, type RetryPolicy } from './retry';

export type CreateOrderInput = Readonly<{
	externalOrderId: string;
	customerId: string;
	amountMinor: number;
	currency: string;
}>;

export type CreateOrderRequest = Readonly<{
	method: 'POST';
	url: string;
	headers: Readonly<{
		'Idempotency-Key': string;
	}>;
	body: CreateOrderInput;
}>;

export type SanitizedRequestFailure = Readonly<{
	message: 'AcmeCRM request failed';
	description: string;
	statusCode?: number;
}>;

type CreateOrderDependencies<TResponse> = Readonly<{
	baseUrl: string;
	input: CreateOrderInput;
	transport: (request: CreateOrderRequest) => Promise<TResponse>;
	sleep: (delayMs: number) => Promise<void>;
	onFailure: (failure: SanitizedRequestFailure) => never;
	policy?: RetryPolicy;
}>;

export async function createOrder<TResponse>({
	baseUrl,
	input,
	transport,
	sleep,
	onFailure,
	policy,
}: CreateOrderDependencies<TResponse>): Promise<TResponse> {
	const request: CreateOrderRequest = {
		method: 'POST',
		url: `${baseUrl.replace(/\/+$/, '')}/v1/orders`,
		headers: {
			'Idempotency-Key': createOrderIdempotencyKey(input.externalOrderId),
		},
		body: input,
	};

	return await retryRequest({
		request: async () => await transport(request),
		classifyError: classifyHttpError,
		sleep,
		onGiveUp: (error) => onFailure(sanitizeRequestFailure(error)),
		policy,
	});
}

export function sanitizeRequestFailure(error: unknown): SanitizedRequestFailure {
	const statusCode = readStatusCode(error);
	return {
		message: 'AcmeCRM request failed',
		description:
			statusCode === undefined
				? 'The AcmeCRM request failed after the bounded retry policy was exhausted.'
				: `AcmeCRM returned HTTP ${statusCode}.`,
		statusCode,
	};
}

export function classifyHttpError(error: unknown): RetryDecision {
	const statusCode = readStatusCode(error);
	return {
		retryable:
			statusCode === 429 ||
			(statusCode !== undefined && statusCode >= 500) ||
			(statusCode === undefined && isRetryableNetworkError(error)),
		retryAfter: readRetryAfter(error),
	};
}

function isRetryableNetworkError(error: unknown): boolean {
	const code = readErrorCode(error);
	return [
		'ECONNABORTED',
		'ECONNRESET',
		'ETIMEDOUT',
		'ESOCKETTIMEDOUT',
		'UND_ERR_HEADERS_TIMEOUT',
	].includes(code);
}

function readErrorCode(error: unknown): string {
	return (
		readErrorChain(error, (candidate) =>
			typeof candidate.code === 'string' ? candidate.code.toUpperCase() : undefined,
		) ?? ''
	);
}

function readStatusCode(error: unknown): number | undefined {
	return readErrorChain(error, readDirectStatusCode);
}

function readRetryAfter(error: unknown): string | undefined {
	return readErrorChain(error, readDirectRetryAfter);
}

function readDirectStatusCode(error: Record<string, unknown>): number | undefined {
	if (typeof error.statusCode === 'number') return error.statusCode;
	if (typeof error.httpCode === 'number') return error.httpCode;
	if (typeof error.httpCode === 'string') {
		const parsed = Number.parseInt(error.httpCode, 10);
		if (Number.isFinite(parsed)) return parsed;
	}
	if (isRecord(error.response)) {
		if (typeof error.response.status === 'number') return error.response.status;
		if (typeof error.response.statusCode === 'number') return error.response.statusCode;
	}
	return undefined;
}

function readDirectRetryAfter(error: Record<string, unknown>): string | undefined {
	const directHeader = readRetryAfterHeader(error.headers);
	if (directHeader !== undefined) return directHeader;
	if (!isRecord(error.response)) return undefined;
	return readRetryAfterHeader(error.response.headers);
}

function readRetryAfterHeader(headers: unknown): string | undefined {
	if (!isRecord(headers)) return undefined;
	const retryAfterEntry = Object.entries(headers).find(
		([name]) => name.toLowerCase() === 'retry-after',
	);
	const retryAfter = retryAfterEntry?.[1];
	if (typeof retryAfter === 'string') return retryAfter;
	if (typeof retryAfter === 'number') return String(retryAfter);
	return undefined;
}

const MAX_ERROR_CAUSE_DEPTH = 8;

function readErrorChain<T>(
	error: unknown,
	read: (candidate: Record<string, unknown>) => T | undefined,
): T | undefined {
	const seen = new Set<unknown>();
	let candidate = error;

	for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH; depth++) {
		if (!isRecord(candidate) || seen.has(candidate)) return undefined;
		seen.add(candidate);
		const value = read(candidate);
		if (value !== undefined) return value;
		candidate = candidate.cause;
	}

	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
