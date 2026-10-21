import { request as httpRequest } from 'node:http'

import { afterEach, describe, expect, test } from 'vitest'

import { buildApp } from './app.js'
import { sha256 } from './model.js'

const apps = new Set<ReturnType<typeof buildApp>>()
const controlToken = 'test-control-token'
const partnerApiKey = 'test-partner-key'

afterEach(async () => {
	await Promise.all([...apps].map(async (app) => app.close()))
	apps.clear()
})

function createApp() {
	const app = buildApp({
		buildSha: 'test-sha',
		controlToken,
		partnerApiKey,
		defaultDelayMs: 0,
	})
	apps.add(app)
	return app
}

async function createRun(app: ReturnType<typeof buildApp>, runId = 'run-one') {
	return app.inject({
		method: 'POST',
		url: '/__control/runs',
		headers: { authorization: `Bearer ${controlToken}` },
		payload: { runId, scenario: 'timeout-after-commit', delayMs: 0 },
	})
}

const order = {
	externalOrderId: 'ORDER-123',
	customerId: 'CUSTOMER-42',
	amountMinor: 10_500,
	currency: 'EUR',
}

describe('health endpoints', () => {
	test('reports that the process is alive', async () => {
		const response = await createApp().inject({
			method: 'GET',
			url: '/healthz',
		})
		expect(response.statusCode).toBe(200)
		expect(response.json()).toEqual({ ok: true, service: 'acme-api' })
	})

	test('reports readiness for the exact build revision', async () => {
		const response = await createApp().inject({
			method: 'GET',
			url: '/healthz/readiness',
		})
		expect(response.statusCode).toBe(200)
		expect(response.json()).toEqual({
			ok: true,
			service: 'acme-api',
			commitSha: 'test-sha',
		})
	})
})

describe('run-scoped simulation', () => {
	test('requires separate credentials for control and partner APIs', async () => {
		const app = createApp()
		const unauthorizedControl = await app.inject({
			method: 'POST',
			url: '/__control/runs',
			payload: { scenario: 'timeout-after-commit' },
		})
		expect(unauthorizedControl.statusCode).toBe(401)
		await createRun(app)

		const unauthorizedPartner = await app.inject({
			method: 'GET',
			url: '/runs/run-one/v1/auth/test',
		})
		expect(unauthorizedPartner.statusCode).toBe(401)
		const authorizedPartner = await app.inject({
			method: 'GET',
			url: '/runs/run-one/v1/auth/test',
			headers: { 'x-api-key': partnerApiKey },
		})
		expect(authorizedPartner.statusCode).toBe(200)
	})

	test('replays the original order for the same key and canonical payload', async () => {
		const app = createApp()
		await createRun(app)
		const request = {
			method: 'POST' as const,
			url: '/runs/run-one/v1/orders',
			headers: {
				'x-api-key': partnerApiKey,
				'idempotency-key': 'order:run-one:ORDER-123',
			},
			payload: order,
		}
		const first = await app.inject(request)
		const second = await app.inject(request)

		expect(first.statusCode).toBe(201)
		expect(second.statusCode).toBe(200)
		expect(second.headers['idempotency-replayed']).toBe('true')
		expect(second.json()).toEqual(first.json())

		const evidence = await app.inject({
			method: 'GET',
			url: '/__control/runs/run-one',
			headers: { authorization: `Bearer ${controlToken}` },
		})
		expect(evidence.json().orders).toHaveLength(1)
		expect(
			evidence
				.json()
				.requests.map((entry: { outcome: string }) => entry.outcome),
		).toEqual(['created', 'replayed'])
		expect(evidence.body).not.toContain('order:run-one:ORDER-123')
		expect(evidence.json().requests[0].idempotencyKeyHash).toBe(
			sha256('order:run-one:ORDER-123'),
		)
	})

	test('rate limits the first attempt without creating an order, then succeeds', async () => {
		const app = createApp()
		const createdRun = await app.inject({
			method: 'POST',
			url: '/__control/runs',
			headers: { authorization: `Bearer ${controlToken}` },
			payload: {
				runId: 'rate-limit-run',
				scenario: 'rate-limit-then-success',
			},
		})
		expect(createdRun.statusCode).toBe(201)

		const request = {
			method: 'POST' as const,
			url: '/runs/rate-limit-run/v1/orders',
			headers: {
				'x-api-key': partnerApiKey,
				'idempotency-key': 'order:rate-limit-run:ORDER-123',
			},
			payload: order,
		}
		const first = await app.inject(request)
		const second = await app.inject(request)

		expect(first.statusCode).toBe(429)
		expect(first.headers['retry-after']).toBe('0')
		expect(first.json()).toEqual({ error: 'rate_limited' })
		expect(second.statusCode).toBe(201)

		const evidence = await app.inject({
			method: 'GET',
			url: '/__control/runs/rate-limit-run',
			headers: { authorization: `Bearer ${controlToken}` },
		})
		expect(evidence.json().orders).toHaveLength(1)
		expect(
			evidence
				.json()
				.requests.map((entry: { outcome: string }) => entry.outcome),
		).toEqual(['rate_limited', 'created'])
		expect(
			evidence
				.json()
				.requests.map((entry: { statusCode: number }) => entry.statusCode),
		).toEqual([429, 201])
		expect(evidence.json().requests[0].orderId).toBeNull()
		expect(evidence.json().requests[1].orderId).toBe(second.json().id)
	})

	test('commits before a real client timeout and makes the retry replayable', async () => {
		const app = createApp()
		await app.listen({ host: '127.0.0.1', port: 0 })
		const address = app.server.address()
		if (!address || typeof address === 'string') {
			throw new Error('expected an assigned TCP port')
		}
		await app.inject({
			method: 'POST',
			url: '/__control/runs',
			headers: { authorization: `Bearer ${controlToken}` },
			payload: {
				runId: 'timeout-run',
				scenario: 'timeout-after-commit',
				delayMs: 300,
			},
		})

		const url = `http://127.0.0.1:${address.port}/runs/timeout-run/v1/orders`
		const headers = {
			'content-type': 'application/json',
			'x-api-key': partnerApiKey,
			'idempotency-key': 'order:timeout-run:ORDER-123',
		}
		await expect(postOrder(url, headers, 30)).rejects.toThrow('client timeout')

		const retry = await postOrder(url, headers)
		expect(retry.statusCode).toBe(200)
		expect(retry.headers['idempotency-replayed']).toBe('true')

		const evidence = await app.inject({
			method: 'GET',
			url: '/__control/runs/timeout-run',
			headers: { authorization: `Bearer ${controlToken}` },
		})
		expect(evidence.json().orders).toHaveLength(1)
	})

	test('rejects reuse of a key with a different payload', async () => {
		const app = createApp()
		await createRun(app)
		const headers = {
			'x-api-key': partnerApiKey,
			'idempotency-key': 'same-key',
		}
		await app.inject({
			method: 'POST',
			url: '/runs/run-one/v1/orders',
			headers,
			payload: order,
		})
		const conflict = await app.inject({
			method: 'POST',
			url: '/runs/run-one/v1/orders',
			headers,
			payload: { ...order, amountMinor: order.amountMinor + 1 },
		})
		expect(conflict.statusCode).toBe(409)
		expect(conflict.json()).toEqual({ error: 'idempotency_key_reused' })
	})

	test('creates duplicates when an unsafe retry omits an idempotency key', async () => {
		const app = createApp()
		await createRun(app)
		for (let attempt = 0; attempt < 2; attempt += 1) {
			await app.inject({
				method: 'POST',
				url: '/runs/run-one/v1/orders',
				headers: { 'x-api-key': partnerApiKey },
				payload: order,
			})
		}
		const evidence = await app.inject({
			method: 'GET',
			url: '/__control/runs/run-one',
			headers: { authorization: `Bearer ${controlToken}` },
		})
		expect(evidence.json().orders).toHaveLength(2)
	})

	test('resets only the selected run', async () => {
		const app = createApp()
		await createRun(app, 'run-one')
		await createRun(app, 'run-two')
		const deleted = await app.inject({
			method: 'DELETE',
			url: '/__control/runs/run-one',
			headers: { authorization: `Bearer ${controlToken}` },
		})
		expect(deleted.statusCode).toBe(204)

		const missing = await app.inject({
			method: 'GET',
			url: '/runs/run-one/v1/auth/test',
			headers: { 'x-api-key': partnerApiKey },
		})
		expect(missing.statusCode).toBe(404)
		const retained = await app.inject({
			method: 'GET',
			url: '/runs/run-two/v1/auth/test',
			headers: { 'x-api-key': partnerApiKey },
		})
		expect(retained.statusCode).toBe(200)
	})
})

function postOrder(
	url: string,
	headers: Record<string, string>,
	timeoutMs?: number,
): Promise<{
	statusCode: number
	headers: Record<string, string | undefined>
}> {
	return new Promise((resolve, reject) => {
		const request = httpRequest(
			url,
			{ method: 'POST', headers, agent: false },
			(response) => {
				response.resume()
				response.once('end', () => {
					resolve({
						statusCode: response.statusCode ?? 0,
						headers: Object.fromEntries(
							Object.entries(response.headers).map(([key, value]) => [
								key,
								Array.isArray(value) ? value.join(',') : value,
							]),
						),
					})
				})
			},
		)
		request.once('error', reject)
		if (timeoutMs !== undefined) {
			request.setTimeout(timeoutMs, () =>
				request.destroy(new Error('client timeout')),
			)
		}
		request.end(JSON.stringify(order))
	})
}
