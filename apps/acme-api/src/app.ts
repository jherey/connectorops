import { randomUUID, timingSafeEqual } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

import Fastify, { type FastifyInstance } from 'fastify'

import type { OrderInput, Scenario } from './model.js'
import {
	MemorySimulatorStore,
	RunAlreadyExistsError,
	type SimulatorStore,
} from './store.js'

export type BuildAppOptions = {
	buildSha?: string
	logger?: boolean
	store?: SimulatorStore
	controlToken?: string
	partnerApiKey?: string
	defaultDelayMs?: number
}

type RunParams = { runId: string }
type CreateRunBody = {
	runId?: string
	scenario: Scenario
	delayMs?: number
}

const runIdPattern = '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
	const buildSha =
		options.buildSha ?? process.env.APP_COMMIT_SHA ?? 'development'
	const store = options.store ?? new MemorySimulatorStore()
	const controlToken =
		options.controlToken ??
		process.env.ACME_CONTROL_TOKEN ??
		'local-control-token'
	const partnerApiKey =
		options.partnerApiKey ?? process.env.ACME_API_KEY ?? 'local-partner-key'
	const defaultDelayMs = options.defaultDelayMs ?? 750
	const app = Fastify({
		logger: options.logger
			? {
					redact: [
						'req.headers.authorization',
						'req.headers.cookie',
						'req.headers.x-api-key',
						'req.headers.idempotency-key',
					],
				}
			: false,
	})

	app.addHook('onClose', async () => store.close())

	app.get('/healthz', async () => ({ ok: true, service: 'acme-api' }))

	app.get('/healthz/readiness', async (_request, reply) => {
		const ready = await store.isReady()
		return reply.code(ready ? 200 : 503).send({
			ok: ready,
			service: 'acme-api',
			commitSha: buildSha,
		})
	})

	app.post<{ Body: CreateRunBody }>(
		'/__control/runs',
		{
			schema: {
				body: {
					type: 'object',
					additionalProperties: false,
					required: ['scenario'],
					properties: {
						runId: { type: 'string', pattern: runIdPattern },
						scenario: {
							type: 'string',
							enum: ['timeout-after-commit', 'rate-limit-then-success'],
						},
						delayMs: { type: 'integer', minimum: 0, maximum: 60_000 },
					},
				},
			},
		},
		async (request, reply) => {
			if (!isBearerAuthorized(request.headers.authorization, controlToken)) {
				return reply.code(401).send({ error: 'unauthorized' })
			}

			try {
				const run = await store.createRun({
					runId: request.body.runId ?? `run_${randomUUID()}`,
					scenario: request.body.scenario,
					delayMs: request.body.delayMs ?? defaultDelayMs,
				})
				return reply.code(201).send(run)
			} catch (error) {
				if (error instanceof RunAlreadyExistsError) {
					return reply.code(409).send({ error: 'run_already_exists' })
				}
				throw error
			}
		},
	)

	app.get<{ Params: RunParams }>(
		'/__control/runs/:runId',
		{ schema: { params: runParamsSchema } },
		async (request, reply) => {
			if (!isBearerAuthorized(request.headers.authorization, controlToken)) {
				return reply.code(401).send({ error: 'unauthorized' })
			}
			const evidence = await store.getRunEvidence(request.params.runId)
			return evidence ?? reply.code(404).send({ error: 'run_not_found' })
		},
	)

	app.delete<{ Params: RunParams }>(
		'/__control/runs/:runId',
		{ schema: { params: runParamsSchema } },
		async (request, reply) => {
			if (!isBearerAuthorized(request.headers.authorization, controlToken)) {
				return reply.code(401).send({ error: 'unauthorized' })
			}
			const deleted = await store.resetRun(request.params.runId)
			return deleted
				? reply.code(204).send()
				: reply.code(404).send({ error: 'run_not_found' })
		},
	)

	app.get<{ Params: RunParams }>(
		'/runs/:runId/v1/auth/test',
		{ schema: { params: runParamsSchema } },
		async (request, reply) => {
			if (!isApiKeyAuthorized(request.headers['x-api-key'], partnerApiKey)) {
				return reply.code(401).send({ error: 'invalid_api_key' })
			}
			const evidence = await store.getRunEvidence(request.params.runId)
			return evidence
				? { ok: true, runId: request.params.runId }
				: reply.code(404).send({ error: 'run_not_found' })
		},
	)

	app.post<{ Params: RunParams; Body: OrderInput }>(
		'/runs/:runId/v1/orders',
		{
			schema: {
				params: runParamsSchema,
				body: {
					type: 'object',
					additionalProperties: false,
					required: [
						'externalOrderId',
						'customerId',
						'amountMinor',
						'currency',
					],
					properties: {
						externalOrderId: { type: 'string', minLength: 1, maxLength: 128 },
						customerId: { type: 'string', minLength: 1, maxLength: 128 },
						amountMinor: { type: 'integer', minimum: 1 },
						currency: {
							type: 'string',
							pattern: '^[A-Z]{3}$',
						},
					},
				},
			},
		},
		async (request, reply) => {
			if (!isApiKeyAuthorized(request.headers['x-api-key'], partnerApiKey)) {
				return reply.code(401).send({ error: 'invalid_api_key' })
			}

			const header = request.headers['idempotency-key']
			const idempotencyKey = Array.isArray(header) ? header[0] : header
			if (idempotencyKey && idempotencyKey.length > 256) {
				return reply.code(400).send({ error: 'invalid_idempotency_key' })
			}

			const result = await store.createOrder({
				runId: request.params.runId,
				...(idempotencyKey ? { idempotencyKey } : {}),
				order: request.body,
			})
			if (result.kind === 'run-not-found') {
				return reply.code(404).send({ error: 'run_not_found' })
			}
			if (result.kind === 'conflict') {
				return reply.code(409).send({ error: 'idempotency_key_reused' })
			}
			if (result.kind === 'rate-limited') {
				return reply
					.header('retry-after', '0')
					.code(429)
					.send({ error: 'rate_limited' })
			}

			if (result.shouldDelay) {
				const evidence = await store.getRunEvidence(request.params.runId)
				await delay(evidence?.run.delayMs ?? defaultDelayMs)
			}
			if (result.kind === 'replayed') {
				reply.header('idempotency-replayed', 'true')
			}
			return reply
				.code(result.kind === 'created' ? 201 : 200)
				.send(result.order)
		},
	)

	return app
}

const runParamsSchema = {
	type: 'object',
	required: ['runId'],
	properties: { runId: { type: 'string', pattern: runIdPattern } },
} as const

function isBearerAuthorized(
	authorization: string | undefined,
	expectedToken: string,
): boolean {
	const prefix = 'Bearer '
	if (!authorization?.startsWith(prefix)) return false
	return safeEqual(authorization.slice(prefix.length), expectedToken)
}

function isApiKeyAuthorized(
	value: string | Array<string> | undefined,
	expectedKey: string,
): boolean {
	return typeof value === 'string' && safeEqual(value, expectedKey)
}

function safeEqual(actual: string, expected: string): boolean {
	const actualBytes = Buffer.from(actual)
	const expectedBytes = Buffer.from(expected)
	return (
		actualBytes.length === expectedBytes.length &&
		timingSafeEqual(actualBytes, expectedBytes)
	)
}
