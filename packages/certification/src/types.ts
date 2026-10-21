export type ClientMode = 'safe' | 'negative-control'
export type CertificationProfile =
	'timeout-after-commit' | 'rate-limit-then-success'
export type AssertionStatus = 'PASS' | 'FAIL' | 'ERROR' | 'NOT_RUN'
export type DecisionStatus = 'CERTIFIED' | 'BLOCKED' | 'INCOMPLETE'

export type CertificationAssertion = {
	id: string
	required: boolean
	status: AssertionStatus
	expected: unknown
	actual: unknown
	evidenceRefs: Array<string>
	message?: string
}

export type CertificationReport = {
	schemaVersion: '1.0'
	generatedAt: string
	run: {
		id: string
		profileId: 'acme-order-v1' | 'acme-order-rate-limit-v1'
		connectorVersion: string
		gitSha: string
		startedAt: string
		completedAt: string
	}
	scenario: {
		id: CertificationProfile
		operation: 'order.create'
		externalReference: string
		clientMode: ClientMode
	}
	observations: {
		clientAttempts: number
		firstAttemptTimedOut: boolean
		rateLimitObserved: boolean
		retryAfterSeconds: number | null
		terminalHttpStatus: number | null
		partnerRequests: number | null
		committedOrders: number | null
	}
	assertions: Array<CertificationAssertion>
	evidenceRefs: Array<string>
	decision: {
		status: DecisionStatus
		reasonCodes: Array<string>
	}
}

export type CertificationOptions = {
	baseUrl: string
	controlToken: string
	partnerApiKey: string
	mode?: ClientMode
	profile?: CertificationProfile
	runId?: string
	delayMs?: number
	requestTimeoutMs?: number
	retryTimeoutMs?: number
	connectorVersion?: string
	gitSha?: string
	order?: {
		externalOrderId: string
		customerId: string
		amountMinor: number
		currency: string
	}
}

export type PartnerEvidence = {
	run: {
		runId: string
		scenario: CertificationProfile
		delayMs: number
		faultTriggeredAt: string | null
		createdAt: string
	}
	orders: Array<{ id: string; externalOrderId: string }>
	requests: Array<{
		id: string
		idempotencyKeyHash: string | null
		requestHash: string
		outcome: 'created' | 'replayed' | 'conflict' | 'rate_limited'
		statusCode: number
		orderId: string | null
	}>
}
