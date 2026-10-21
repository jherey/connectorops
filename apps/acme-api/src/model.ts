import { createHash, randomUUID } from 'node:crypto'

export type Scenario = 'timeout-after-commit' | 'rate-limit-then-success'

export type Run = {
	runId: string
	scenario: Scenario
	delayMs: number
	faultTriggeredAt: string | null
	createdAt: string
}

export type OrderInput = {
	externalOrderId: string
	customerId: string
	amountMinor: number
	currency: string
}

export type Order = OrderInput & {
	id: string
	createdAt: string
}

export type CapturedRequest = {
	id: string
	method: 'POST'
	path: string
	idempotencyKeyHash: string | null
	requestHash: string
	outcome: 'created' | 'replayed' | 'conflict' | 'rate_limited'
	statusCode: number
	orderId: string | null
	occurredAt: string
}

export type RunEvidence = {
	run: Run
	orders: Array<Order>
	requests: Array<CapturedRequest>
}

export type CreateOrderResult =
	| {
			kind: 'created' | 'replayed'
			order: Order
			shouldDelay: boolean
	  }
	| { kind: 'conflict'; shouldDelay: false }
	| { kind: 'rate-limited'; shouldDelay: false }
	| { kind: 'run-not-found'; shouldDelay: false }

export function canonicalize(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) {
		return `[${value.map((entry) => canonicalize(entry)).join(',')}]`
	}

	const entries = Object.entries(value as Record<string, unknown>).sort(
		([left], [right]) => left.localeCompare(right),
	)
	return `{${entries
		.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
		.join(',')}}`
}

export function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex')
}

export function hashOrderInput(input: OrderInput): string {
	return sha256(canonicalize(input))
}

export function hashIdempotencyKey(key: string | undefined): string | null {
	return key ? sha256(key) : null
}

export function newId(): string {
	return randomUUID()
}
