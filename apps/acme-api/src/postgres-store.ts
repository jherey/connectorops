import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import pg from 'pg'

import {
	hashIdempotencyKey,
	hashOrderInput,
	newId,
	type CapturedRequest,
	type CreateOrderResult,
	type Order,
	type Run,
	type RunEvidence,
} from './model.js'
import {
	RunAlreadyExistsError,
	type CreateOrderInput,
	type CreateRunInput,
	type SimulatorStore,
} from './store.js'

const { Pool } = pg

export type PostgresSimulatorStoreOptions = {
	connectionString: string
	migrationsDirectory?: string
}

export class PostgresSimulatorStore implements SimulatorStore {
	readonly #pool: pg.Pool
	readonly #migrationsDirectory: string

	constructor(options: PostgresSimulatorStoreOptions) {
		this.#pool = new Pool({ connectionString: options.connectionString })
		this.#migrationsDirectory =
			options.migrationsDirectory ??
			process.env.ACME_MIGRATIONS_DIR ??
			resolve(process.cwd(), 'migrations')
	}

	async migrate(): Promise<void> {
		const migration = await readFile(
			resolve(this.#migrationsDirectory, '0001_init.sql'),
			'utf8',
		)
		await this.#pool.query(migration)
	}

	async isReady(): Promise<boolean> {
		try {
			await this.#pool.query('SELECT 1')
			return true
		} catch {
			return false
		}
	}

	async createRun(input: CreateRunInput): Promise<Run> {
		try {
			const result = await this.#pool.query<RunRow>(
				`INSERT INTO certification_runs (run_id, scenario, delay_ms)
				 VALUES ($1, $2, $3)
				 RETURNING run_id, scenario, delay_ms, fault_triggered_at, created_at`,
				[input.runId, input.scenario, input.delayMs],
			)
			return mapRun(result.rows[0]!)
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new RunAlreadyExistsError(`run already exists: ${input.runId}`)
			}
			throw error
		}
	}

	async resetRun(runId: string): Promise<boolean> {
		const result = await this.#pool.query(
			'DELETE FROM certification_runs WHERE run_id = $1',
			[runId],
		)
		return result.rowCount === 1
	}

	async getRunEvidence(runId: string): Promise<RunEvidence | null> {
		const runResult = await this.#pool.query<RunRow>(
			`SELECT run_id, scenario, delay_ms, fault_triggered_at, created_at
			 FROM certification_runs WHERE run_id = $1`,
			[runId],
		)
		const runRow = runResult.rows[0]
		if (!runRow) return null

		const [orders, requests] = await Promise.all([
			this.#pool.query<OrderRow>(
				`SELECT id, external_order_id, customer_id, amount_minor, currency, created_at
				 FROM orders WHERE run_id = $1 ORDER BY created_at, id`,
				[runId],
			),
			this.#pool.query<CapturedRequestRow>(
				`SELECT id, method, path, idempotency_key_hash, request_hash,
				        outcome, status_code, order_id, occurred_at
				 FROM captured_requests WHERE run_id = $1 ORDER BY occurred_at, id`,
				[runId],
			),
		])

		return {
			run: mapRun(runRow),
			orders: orders.rows.map(mapOrder),
			requests: requests.rows.map(mapRequest),
		}
	}

	async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
		const client = await this.#pool.connect()
		try {
			await client.query('BEGIN')
			const runResult = await client.query<RunRow>(
				`SELECT run_id, scenario, delay_ms, fault_triggered_at, created_at
				 FROM certification_runs WHERE run_id = $1 FOR UPDATE`,
				[input.runId],
			)
			const run = runResult.rows[0]
			if (!run) {
				await client.query('ROLLBACK')
				return { kind: 'run-not-found', shouldDelay: false }
			}

			const requestHash = hashOrderInput(input.order)
			if (input.idempotencyKey) {
				const existing = await client.query<IdempotencyRow>(
					`SELECT request_hash, response_body
					 FROM idempotency_requests
					 WHERE run_id = $1 AND idempotency_key = $2`,
					[input.runId, input.idempotencyKey],
				)
				const row = existing.rows[0]
				if (row) {
					if (row.request_hash !== requestHash) {
						await insertCapture(
							client,
							input,
							requestHash,
							'conflict',
							409,
							null,
						)
						await client.query('COMMIT')
						return { kind: 'conflict', shouldDelay: false }
					}

					const order = row.response_body
					await insertCapture(
						client,
						input,
						requestHash,
						'replayed',
						200,
						order.id,
					)
					await client.query('COMMIT')
					return { kind: 'replayed', order, shouldDelay: false }
				}
			}

			const order: Order = {
				id: newId(),
				...input.order,
				createdAt: new Date().toISOString(),
			}
			await client.query(
				`INSERT INTO orders
				 (id, run_id, external_order_id, customer_id, amount_minor, currency, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				[
					order.id,
					input.runId,
					order.externalOrderId,
					order.customerId,
					order.amountMinor,
					order.currency,
					order.createdAt,
				],
			)

			if (input.idempotencyKey) {
				await client.query(
					`INSERT INTO idempotency_requests
					 (run_id, idempotency_key, request_hash, status_code, response_body, order_id)
					 VALUES ($1, $2, $3, 201, $4, $5)`,
					[input.runId, input.idempotencyKey, requestHash, order, order.id],
				)
			}

			const shouldDelay = run.fault_triggered_at === null
			if (shouldDelay) {
				await client.query(
					`UPDATE certification_runs SET fault_triggered_at = CURRENT_TIMESTAMP
					 WHERE run_id = $1`,
					[input.runId],
				)
			}
			await insertCapture(client, input, requestHash, 'created', 201, order.id)
			await client.query('COMMIT')
			return { kind: 'created', order, shouldDelay }
		} catch (error) {
			await client.query('ROLLBACK')
			throw error
		} finally {
			client.release()
		}
	}

	async close(): Promise<void> {
		await this.#pool.end()
	}
}

type RunRow = {
	run_id: string
	scenario: Run['scenario']
	delay_ms: number
	fault_triggered_at: Date | string | null
	created_at: Date | string
}

type OrderRow = {
	id: string
	external_order_id: string
	customer_id: string
	amount_minor: number
	currency: string
	created_at: Date | string
}

type IdempotencyRow = {
	request_hash: string
	response_body: Order
}

type CapturedRequestRow = {
	id: string
	method: 'POST'
	path: string
	idempotency_key_hash: string | null
	request_hash: string
	outcome: CapturedRequest['outcome']
	status_code: number
	order_id: string | null
	occurred_at: Date | string
}

function mapRun(row: RunRow): Run {
	return {
		runId: row.run_id,
		scenario: row.scenario,
		delayMs: row.delay_ms,
		faultTriggeredAt: toIso(row.fault_triggered_at),
		createdAt: toIso(row.created_at)!,
	}
}

function mapOrder(row: OrderRow): Order {
	return {
		id: row.id,
		externalOrderId: row.external_order_id,
		customerId: row.customer_id,
		amountMinor: row.amount_minor,
		currency: row.currency,
		createdAt: toIso(row.created_at)!,
	}
}

function mapRequest(row: CapturedRequestRow): CapturedRequest {
	return {
		id: row.id,
		method: row.method,
		path: row.path,
		idempotencyKeyHash: row.idempotency_key_hash,
		requestHash: row.request_hash,
		outcome: row.outcome,
		statusCode: row.status_code,
		orderId: row.order_id,
		occurredAt: toIso(row.occurred_at)!,
	}
}

async function insertCapture(
	client: pg.PoolClient,
	input: CreateOrderInput,
	requestHash: string,
	outcome: CapturedRequest['outcome'],
	statusCode: number,
	orderId: string | null,
): Promise<void> {
	await client.query(
		`INSERT INTO captured_requests
		 (id, run_id, method, path, idempotency_key_hash, request_hash,
		  outcome, status_code, order_id)
		 VALUES ($1, $2, 'POST', $3, $4, $5, $6, $7, $8)`,
		[
			newId(),
			input.runId,
			`/runs/${input.runId}/v1/orders`,
			hashIdempotencyKey(input.idempotencyKey),
			requestHash,
			outcome,
			statusCode,
			orderId,
		],
	)
}

function toIso(value: Date | string | null): string | null {
	if (value === null) return null
	return value instanceof Date
		? value.toISOString()
		: new Date(value).toISOString()
}

function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: string }).code === '23505'
	)
}
