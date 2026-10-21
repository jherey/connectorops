import { randomUUID } from 'node:crypto'

import { decide } from './decision.js'
import { ClientTimeoutError, requestJson } from './http.js'
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
	const order = options.order ?? defaultOrder
	const baseUrl = options.baseUrl.replace(/\/$/, '')
	const timeoutMs = options.requestTimeoutMs ?? 40
	const delayMs = options.delayMs ?? Math.max(timeoutMs * 5, 250)
	const retryTimeoutMs = options.retryTimeoutMs ?? Math.max(delayMs * 2, 2_000)

	try {
		await requestJson(`${baseUrl}/__control/runs`, {
			method: 'POST',
			headers: { authorization: `Bearer ${options.controlToken}` },
			body: { runId, scenario: 'timeout-after-commit', delayMs },
			timeoutMs: retryTimeoutMs,
		})
	} catch (error) {
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
			...[
				'timeout-observed',
				'terminal-response',
				'two-attempts-recorded',
				'exactly-once',
			].map((id): CertificationAssertion => ({
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
			externalReference: order.externalOrderId,
			startedAt,
			observations: {
				clientAttempts: 0,
				firstAttemptTimedOut: false,
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
		if (error instanceof ClientTimeoutError) {
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
		externalReference: order.externalOrderId,
		startedAt,
		observations: {
			clientAttempts,
			firstAttemptTimedOut,
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
			profileId: 'acme-order-v1',
			connectorVersion: input.options.connectorVersion ?? 'development',
			gitSha:
				input.options.gitSha ?? process.env.APP_COMMIT_SHA ?? 'development',
			startedAt: input.startedAt,
			completedAt: new Date().toISOString(),
		},
		scenario: {
			id: 'timeout-after-commit',
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
	return [
		{
			id: 'run-configured',
			required: true,
			status: 'PASS',
			expected: { configured: true },
			actual: { configured: true },
			evidenceRefs: input.evidenceRefs,
		},
		{
			id: 'timeout-observed',
			required: true,
			status: input.firstAttemptTimedOut ? 'PASS' : 'FAIL',
			expected: true,
			actual: input.firstAttemptTimedOut,
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
		{
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
		},
	]
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'unknown error'
}
