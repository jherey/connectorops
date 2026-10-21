import { afterEach, describe, expect, test } from 'vitest'

import { buildApp } from './app.js'

const apps = new Set<ReturnType<typeof buildApp>>()

afterEach(async () => {
	await Promise.all([...apps].map(async (app) => app.close()))
	apps.clear()
})

describe('health endpoints', () => {
	test('reports that the process is alive', async () => {
		const app = buildApp()
		apps.add(app)
		const response = await app.inject({ method: 'GET', url: '/healthz' })

		expect(response.statusCode).toBe(200)
		expect(response.json()).toEqual({ ok: true, service: 'acme-api' })
	})

	test('reports readiness for the exact build revision', async () => {
		const app = buildApp({ buildSha: 'test-sha' })
		apps.add(app)
		const response = await app.inject({
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
