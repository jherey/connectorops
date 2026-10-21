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

function classifyHttpError(error: unknown): RetryDecision {
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
	if (!isRecord(error)) return false;
	const code = typeof error.code === 'string' ? error.code.toUpperCase() : '';
	return ['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(code);
}

function readStatusCode(error: unknown): number | undefined {
	if (!isRecord(error)) return undefined;
	if (typeof error.statusCode === 'number') return error.statusCode;
	if (typeof error.httpCode === 'number') return error.httpCode;
	if (typeof error.httpCode === 'string') {
		const parsed = Number.parseInt(error.httpCode, 10);
		if (Number.isFinite(parsed)) return parsed;
	}
	if (isRecord(error.response) && typeof error.response.status === 'number') {
		return error.response.status;
	}
	return undefined;
}

function readRetryAfter(error: unknown): string | undefined {
	if (!isRecord(error) || !isRecord(error.response) || !isRecord(error.response.headers)) {
		return undefined;
	}
	const retryAfter = error.response.headers['retry-after'];
	if (typeof retryAfter === 'string') return retryAfter;
	if (typeof retryAfter === 'number') return String(retryAfter);
	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
