import {
	hashIdempotencyKey,
	hashOrderInput,
	newId,
	type CapturedRequest,
	type CreateOrderResult,
	type Order,
	type OrderInput,
	type Run,
	type RunEvidence,
	type Scenario,
} from './model.js'

export type CreateRunInput = {
	runId: string
	scenario: Scenario
	delayMs: number
}

export type CreateOrderInput = {
	runId: string
	idempotencyKey?: string
	order: OrderInput
}

export interface SimulatorStore {
	isReady(): Promise<boolean>
	createRun(input: CreateRunInput): Promise<Run>
	resetRun(runId: string): Promise<boolean>
	getRunEvidence(runId: string): Promise<RunEvidence | null>
	createOrder(input: CreateOrderInput): Promise<CreateOrderResult>
	close(): Promise<void>
}

export class RunAlreadyExistsError extends Error {}

type MemoryRun = {
	run: Run
	orders: Array<Order>
	requests: Array<CapturedRequest>
	idempotency: Map<string, { requestHash: string; order: Order }>
}

export class MemorySimulatorStore implements SimulatorStore {
	readonly #runs = new Map<string, MemoryRun>()

	async isReady(): Promise<boolean> {
		return true
	}

	async createRun(input: CreateRunInput): Promise<Run> {
		if (this.#runs.has(input.runId)) {
			throw new RunAlreadyExistsError(`run already exists: ${input.runId}`)
		}

		const run: Run = {
			runId: input.runId,
			scenario: input.scenario,
			delayMs: input.delayMs,
			faultTriggeredAt: null,
			createdAt: new Date().toISOString(),
		}
		this.#runs.set(input.runId, {
			run,
			orders: [],
			requests: [],
			idempotency: new Map(),
		})
		return structuredClone(run)
	}

	async resetRun(runId: string): Promise<boolean> {
		return this.#runs.delete(runId)
	}

	async getRunEvidence(runId: string): Promise<RunEvidence | null> {
		const state = this.#runs.get(runId)
		if (!state) return null
		return structuredClone({
			run: state.run,
			orders: state.orders,
			requests: state.requests,
		})
	}

	async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
		const state = this.#runs.get(input.runId)
		if (!state) return { kind: 'run-not-found', shouldDelay: false }

		const requestHash = hashOrderInput(input.order)
		const existing = input.idempotencyKey
			? state.idempotency.get(input.idempotencyKey)
			: undefined

		if (existing && existing.requestHash !== requestHash) {
			state.requests.push(capture(input, requestHash, 'conflict', 409, null))
			return { kind: 'conflict', shouldDelay: false }
		}

		if (existing) {
			state.requests.push(
				capture(input, requestHash, 'replayed', 200, existing.order.id),
			)
			return {
				kind: 'replayed',
				order: structuredClone(existing.order),
				shouldDelay: false,
			}
		}

		if (
			state.run.scenario === 'rate-limit-then-success' &&
			state.run.faultTriggeredAt === null
		) {
			state.run.faultTriggeredAt = new Date().toISOString()
			state.requests.push(
				capture(input, requestHash, 'rate_limited', 429, null),
			)
			return { kind: 'rate-limited', shouldDelay: false }
		}

		const order: Order = {
			id: newId(),
			...input.order,
			createdAt: new Date().toISOString(),
		}
		state.orders.push(order)
		if (input.idempotencyKey) {
			state.idempotency.set(input.idempotencyKey, { requestHash, order })
		}

		const shouldDelay =
			state.run.scenario === 'timeout-after-commit' &&
			state.run.faultTriggeredAt === null
		if (shouldDelay) state.run.faultTriggeredAt = new Date().toISOString()
		state.requests.push(capture(input, requestHash, 'created', 201, order.id))

		return {
			kind: 'created',
			order: structuredClone(order),
			shouldDelay,
		}
	}

	async close(): Promise<void> {}
}

function capture(
	input: CreateOrderInput,
	requestHash: string,
	outcome: CapturedRequest['outcome'],
	statusCode: number,
	orderId: string | null,
): CapturedRequest {
	return {
		id: newId(),
		method: 'POST',
		path: `/runs/${input.runId}/v1/orders`,
		idempotencyKeyHash: hashIdempotencyKey(input.idempotencyKey),
		requestHash,
		outcome,
		statusCode,
		orderId,
		occurredAt: new Date().toISOString(),
	}
}
