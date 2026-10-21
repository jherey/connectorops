import { resolve } from 'node:path'

import { expect, test } from 'vitest'

import { PostgresSimulatorStore } from './postgres-store.js'

const databaseUrl = process.env.ACME_TEST_DATABASE_URL
const integrationTest = databaseUrl ? test : test.skip

integrationTest(
	'atomically stores an order and replays it for the same idempotency key',
	async () => {
		const store = new PostgresSimulatorStore({
			connectionString: databaseUrl!,
			migrationsDirectory: resolve(import.meta.dirname, '../migrations'),
		})
		const runId = `postgres-${crypto.randomUUID()}`
		try {
			await store.migrate()
			await store.createRun({
				runId,
				scenario: 'timeout-after-commit',
				delayMs: 1,
			})
			const request = {
				runId,
				idempotencyKey: `order:${runId}:ORDER-123`,
				order: {
					externalOrderId: 'ORDER-123',
					customerId: 'CUSTOMER-42',
					amountMinor: 10_500,
					currency: 'EUR',
				},
			}
			const first = await store.createOrder(request)
			const replay = await store.createOrder(request)

			expect(first.kind).toBe('created')
			expect(first.shouldDelay).toBe(true)
			expect(replay.kind).toBe('replayed')
			expect(replay.shouldDelay).toBe(false)
			if (first.kind === 'created' && replay.kind === 'replayed') {
				expect(replay.order.id).toBe(first.order.id)
			}

			const evidence = await store.getRunEvidence(runId)
			expect(evidence?.orders).toHaveLength(1)
			expect(evidence?.requests.map(({ outcome }) => outcome)).toEqual([
				'created',
				'replayed',
			])
		} finally {
			await store.resetRun(runId)
			await store.close()
		}
	},
)
