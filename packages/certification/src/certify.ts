import { randomUUID } from 'node:crypto'

import { decide } from './decision.js'
import { ClientTimeoutError, HttpResponseError, requestJson } from './http.js'
import type {
	CertificationAssertion,
	CertificationOptions,
	CertificationReport,
	PartnerEvidence,
} from './types.js'

const defaultOrder = {
	externalOrderId: 'ORDER-123',
	customerId: 'CUSTOMER-42',
	amountMinor: 10_500,
	currency: 'EUR',
}

export async function certify(
	options: CertificationOptions,
): Promise<CertificationReport> {
	const startedAt = new Date().toISOString()
	const runId = options.runId ?? `run_${randomUUID()}`
	const mode = options.mode ?? 'safe'
	const profile = options.profile ?? 'timeout-after-commit'
	const order = options.order ?? defaultOrder
	const baseUrl = options.baseUrl.replace(/\/$/, '')
	const timeoutMs = options.requestTimeoutMs ?? 40
	const delayMs = options.delayMs ?? Math.max(timeoutMs * 5, 250)
	const retryTimeoutMs = options.retryTimeoutMs ?? Math.max(delayMs * 2, 2_000)

	try {
		await requestJson(`${baseUrl}/__control/runs`, {
			method: 'POST',
			headers: { authorization: `Bearer ${options.controlToken}` },
			body: {
				runId,
				scenario: profile,
				...(profile === 'timeout-after-commit' ? { delayMs } : {}),
			},
			timeoutMs: retryTimeoutMs,
		})
	} catch (error) {
		const pendingAssertionIds =
			profile === 'timeout-after-commit'
				? [
						'timeout-observed',
						'terminal-response',
						'two-attempts-recorded',
						'exactly-once',
					]
				: [
						'rate-limit-observed',
						'terminal-response',
						'two-attempts-recorded',
						'rate-limit-outcome-sequence',
						'stable-idempotency-evidence',
						'exactly-once',
					]
		const assertions: Array<CertificationAssertion> = [
			{
				id: 'run-configured',
				required: true,
				status: 'ERROR',
				expected: { configured: true },
				actual: { configured: false },
				evidenceRefs: [],
				message: errorMessage(error),
			},
			...pendingAssertionIds.map((id): CertificationAssertion => ({
				id,
				required: true,
				status: 'NOT_RUN',
				expected: { completed: true },
				actual: { completed: false },
				evidenceRefs: [],
			})),
		]
		return createReport({
			options,
			runId,
			mode,
			profile,
			externalReference: order.externalOrderId,
			startedAt,
			observations: {
				clientAttempts: 0,
				firstAttemptTimedOut: false,
				rateLimitObserved: false,
				retryAfterSeconds: null,
				terminalHttpStatus: null,
				partnerRequests: null,
				committedOrders: null,
			},
			assertions,
			evidenceRefs: [],
		})
	}

	const orderUrl = `${baseUrl}/runs/${runId}/v1/orders`
	const stableKey = `order:${runId}:${order.externalOrderId}`
	const partnerHeaders = {
		'x-api-key': options.partnerApiKey,
		...(mode === 'safe' ? { 'idempotency-key': stableKey } : {}),
	}
	let clientAttempts = 1
	let firstAttemptTimedOut = false
	let rateLimitObserved = false
	let retryAfterSeconds: number | null = null
	let terminalHttpStatus: number | null = null
	let terminalError: string | null = null

	try {
		const first = await requestJson(orderUrl, {
			method: 'POST',
			headers: partnerHeaders,
			body: order,
			timeoutMs,
		})
		terminalHttpStatus = first.statusCode
	} catch (error) {
		if (
			profile === 'timeout-after-commit' &&
			error instanceof ClientTimeoutError
		) {
			firstAttemptTimedOut = true
			clientAttempts = 2
			try {
				const retry = await requestJson(orderUrl, {
					method: 'POST',
					headers: partnerHeaders,
					body: order,
					timeoutMs: retryTimeoutMs,
				})
				terminalHttpStatus = retry.statusCode
			} catch (retryError) {
				terminalError = errorMessage(retryError)
			}
		} else if (
			profile === 'rate-limit-then-success' &&
			error instanceof HttpResponseError &&
			error.statusCode === 429
		) {
			rateLimitObserved = true
			retryAfterSeconds = parseRetryAfter(error.headers['retry-after'])
			clientAttempts = 2
			if (retryAfterSeconds !== null) {
				const retryDelayMs = retryAfterSeconds * 1_000
				await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
			}
			try {
				const retry = await requestJson(orderUrl, {
					method: 'POST',
					headers: partnerHeaders,
					body: order,
					timeoutMs: retryTimeoutMs,
				})
				terminalHttpStatus = retry.statusCode
			} catch (retryError) {
				terminalError = errorMessage(retryError)
			}
		} else {
			terminalError = errorMessage(error)
		}
	}

	let evidence: PartnerEvidence | null = null
	let evidenceError: string | null = null
	try {
		const response = await requestJson(`${baseUrl}/__control/runs/${runId}`, {
			method: 'GET',
			headers: { authorization: `Bearer ${options.controlToken}` },
			timeoutMs: retryTimeoutMs,
		})
		evidence = response.body as PartnerEvidence
	} catch (error) {
		evidenceError = errorMessage(error)
	}

	const evidenceRefs = evidence
		? [
				...evidence.requests.map(({ id }) => `request:${id}`),
				...evidence.orders.map(({ id }) => `order:${id}`),
			]
		: []
	const assertions = buildAssertions({
		clientAttempts,
		firstAttemptTimedOut,
		rateLimitObserved,
		retryAfterSeconds,
		profile,
		terminalHttpStatus,
		terminalError,
		evidence,
		evidenceError,
		evidenceRefs,
	})

	return createReport({
		options,
		runId,
		mode,
		profile,
		externalReference: order.externalOrderId,
		startedAt,
		observations: {
			clientAttempts,
			firstAttemptTimedOut,
			rateLimitObserved,
			retryAfterSeconds,
			terminalHttpStatus,
			partnerRequests: evidence?.requests.length ?? null,
			committedOrders: evidence?.orders.length ?? null,
		},
		assertions,
		evidenceRefs,
	})
}

function createReport(input: {
	options: CertificationOptions
	runId: string
	mode: NonNullable<CertificationOptions['mode']>
	profile: NonNullable<CertificationOptions['profile']>
	externalReference: string
	startedAt: string
	observations: CertificationReport['observations']
	assertions: Array<CertificationAssertion>
	evidenceRefs: Array<string>
}): CertificationReport {
	return {
		schemaVersion: '1.0',
		generatedAt: new Date().toISOString(),
		run: {
			id: input.runId,
			profileId:
				input.profile === 'timeout-after-commit'
					? 'acme-order-v1'
					: 'acme-order-rate-limit-v1',
			connectorVersion: input.options.connectorVersion ?? 'development',
			gitSha:
				input.options.gitSha ?? process.env.APP_COMMIT_SHA ?? 'development',
			startedAt: input.startedAt,
			completedAt: new Date().toISOString(),
		},
		scenario: {
			id: input.profile,
			operation: 'order.create',
			externalReference: input.externalReference,
			clientMode: input.mode,
		},
		observations: input.observations,
		assertions: input.assertions,
		evidenceRefs: input.evidenceRefs,
		decision: decide(input.assertions),
	}
}

function buildAssertions(input: {
	clientAttempts: number
	firstAttemptTimedOut: boolean
	rateLimitObserved: boolean
	retryAfterSeconds: number | null
	profile: NonNullable<CertificationOptions['profile']>
	terminalHttpStatus: number | null
	terminalError: string | null
	evidence: PartnerEvidence | null
	evidenceError: string | null
	evidenceRefs: Array<string>
}): Array<CertificationAssertion> {
	const evidenceStatus = input.evidenceError
		? 'ERROR'
		: input.evidence
			? 'PASS'
			: 'NOT_RUN'
	const shared: Array<CertificationAssertion> = [
		{
			id: 'run-configured',
			required: true,
			status: 'PASS',
			expected: { configured: true },
			actual: { configured: true },
			evidenceRefs: input.evidenceRefs,
		},
		{
			id: 'terminal-response',
			required: true,
			status: input.terminalError
				? 'ERROR'
				: input.terminalHttpStatus
					? 'PASS'
					: 'NOT_RUN',
			expected: { successfulResponse: true },
			actual: input.terminalError
				? { error: input.terminalError }
				: { statusCode: input.terminalHttpStatus },
			evidenceRefs: input.evidenceRefs,
		},
		{
			id: 'two-attempts-recorded',
			required: true,
			status:
				evidenceStatus === 'PASS'
					? input.clientAttempts === 2 && input.evidence!.requests.length === 2
						? 'PASS'
						: 'FAIL'
					: evidenceStatus,
			expected: { clientAttempts: 2, partnerRequests: 2 },
			actual: {
				clientAttempts: input.clientAttempts,
				partnerRequests: input.evidence?.requests.length ?? null,
			},
			evidenceRefs: input.evidenceRefs,
			...(input.evidenceError ? { message: input.evidenceError } : {}),
		},
	]

	const exactlyOnce: CertificationAssertion = {
		id: 'exactly-once',
		required: true,
		status:
			evidenceStatus === 'PASS'
				? input.evidence!.orders.length === 1
					? 'PASS'
					: 'FAIL'
				: evidenceStatus,
		expected: { committedOrders: 1 },
		actual: { committedOrders: input.evidence?.orders.length ?? null },
		evidenceRefs: input.evidenceRefs,
		...(input.evidenceError ? { message: input.evidenceError } : {}),
	}

	if (input.profile === 'timeout-after-commit') {
		shared.splice(1, 0, {
			id: 'timeout-observed',
			required: true,
			status: input.firstAttemptTimedOut ? 'PASS' : 'FAIL',
			expected: true,
			actual: input.firstAttemptTimedOut,
			evidenceRefs: input.evidenceRefs,
		})
		return [...shared, exactlyOnce]
	}

	const requests = input.evidence?.requests ?? []
	const keyHashes = requests.map(({ idempotencyKeyHash }) => idempotencyKeyHash)
	const stableKeyObserved =
		keyHashes.length === 2 &&
		keyHashes[0] !== null &&
		keyHashes[0] === keyHashes[1]
	const outcomeSequence = requests.map(({ outcome }) => outcome)
	return [
		shared[0]!,
		{
			id: 'rate-limit-observed',
			required: true,
			status:
				input.rateLimitObserved && input.retryAfterSeconds === 0
					? 'PASS'
					: 'FAIL',
			expected: { statusCode: 429, retryAfterSeconds: 0 },
			actual: {
				observed: input.rateLimitObserved,
				retryAfterSeconds: input.retryAfterSeconds,
			},
			evidenceRefs: input.evidenceRefs,
		},
		...shared.slice(1),
		{
			id: 'rate-limit-outcome-sequence',
			required: true,
			status:
				evidenceStatus === 'PASS'
					? outcomeSequence.join(',') === 'rate_limited,created'
						? 'PASS'
						: 'FAIL'
					: evidenceStatus,
			expected: ['rate_limited', 'created'],
			actual: outcomeSequence,
			evidenceRefs: input.evidenceRefs,
		},
		{
			id: 'stable-idempotency-evidence',
			required: true,
			status:
				evidenceStatus === 'PASS'
					? stableKeyObserved
						? 'PASS'
						: 'FAIL'
					: evidenceStatus,
			expected: { sameNonNullKeyHash: true },
			actual: { sameNonNullKeyHash: stableKeyObserved },
			evidenceRefs: input.evidenceRefs,
		},
		exactlyOnce,
	]
}

function parseRetryAfter(value: string | undefined): number | null {
	if (value === undefined || value.trim() === '') return null
	const seconds = Number(value)
	return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'unknown error'
}
