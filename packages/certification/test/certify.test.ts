import { afterEach, expect, test } from 'vitest'

import { buildApp } from '../../../apps/acme-api/src/app.js'
import { MemorySimulatorStore } from '../../../apps/acme-api/src/store.js'
import { assertExpectedDecision, certify, decide } from '../src/index.js'
import type { CertificationAssertion } from '../src/types.js'

const runningApps = new Set<ReturnType<typeof buildApp>>()
const controlToken = 'control-token-that-must-not-leak'
const partnerApiKey = 'partner-key-that-must-not-leak'

afterEach(async () => {
	await Promise.all([...runningApps].map(async (app) => app.close()))
	runningApps.clear()
})

async function startSimulator() {
	const app = buildApp({
		store: new MemorySimulatorStore(),
		controlToken,
		partnerApiKey,
	})
	runningApps.add(app)
	await app.listen({ host: '127.0.0.1', port: 0 })
	const address = app.server.address()
	if (!address || typeof address === 'string') {
		throw new Error('expected an assigned TCP port')
	}
	return `http://127.0.0.1:${address.port}`
}

test('safe client retries with one stable key and certifies exactly-once behavior', async () => {
	const baseUrl = await startSimulator()
	const report = await certify({
		baseUrl,
		controlToken,
		partnerApiKey,
		mode: 'safe',
		runId: 'safe-run',
		delayMs: 150,
		requestTimeoutMs: 20,
	})

	expect(report.decision).toEqual({ status: 'CERTIFIED', reasonCodes: [] })
	expect(report.observations).toMatchObject({
		clientAttempts: 2,
		firstAttemptTimedOut: true,
		partnerRequests: 2,
		committedOrders: 1,
	})
	expect(report.assertions.every(({ status }) => status === 'PASS')).toBe(true)
	expect(report.evidenceRefs).toHaveLength(3)

	const serialized = JSON.stringify(report)
	expect(serialized).not.toContain(controlToken)
	expect(serialized).not.toContain(partnerApiKey)
	expect(serialized).not.toContain('order:safe-run:ORDER-123')
})

test('unsafe negative control creates duplicates and produces an expected BLOCKED result', async () => {
	const baseUrl = await startSimulator()
	const report = await certify({
		baseUrl,
		controlToken,
		partnerApiKey,
		mode: 'negative-control',
		runId: 'negative-control-run',
		delayMs: 150,
		requestTimeoutMs: 20,
	})

	expect(report.observations).toMatchObject({
		clientAttempts: 2,
		firstAttemptTimedOut: true,
		partnerRequests: 2,
		committedOrders: 2,
	})
	expect(
		report.assertions.find(({ id }) => id === 'exactly-once')?.status,
	).toBe('FAIL')
	expect(report.decision).toEqual({
		status: 'BLOCKED',
		reasonCodes: ['REQUIRED_FAIL:exactly-once'],
	})

	// BLOCKED is the expected negative-control outcome, so this must not throw.
	expect(() => assertExpectedDecision(report, 'BLOCKED')).not.toThrow()
})

test('decision rules preserve FAIL, ERROR, and NOT_RUN as distinct outcomes', () => {
	const assertion = (
		status: CertificationAssertion['status'],
	): CertificationAssertion => ({
		id: `assertion-${status}`,
		required: true,
		status,
		expected: true,
		actual: false,
		evidenceRefs: [],
	})

	expect(decide([assertion('PASS')]).status).toBe('CERTIFIED')
	expect(decide([assertion('FAIL')]).status).toBe('BLOCKED')
	expect(decide([assertion('ERROR')]).status).toBe('INCOMPLETE')
	expect(decide([assertion('NOT_RUN')]).status).toBe('INCOMPLETE')
	expect(decide([assertion('FAIL'), assertion('ERROR')]).status).toBe(
		'INCOMPLETE',
	)
})

test('configuration failure produces an INCOMPLETE report instead of a false failure', async () => {
	const baseUrl = await startSimulator()
	const report = await certify({
		baseUrl,
		controlToken: 'incorrect-control-token',
		partnerApiKey,
		runId: 'configuration-error-run',
	})

	expect(report.decision.status).toBe('INCOMPLETE')
	expect(
		report.assertions.find(({ id }) => id === 'run-configured')?.status,
	).toBe('ERROR')
	expect(
		report.assertions
			.filter(({ id }) => id !== 'run-configured')
			.every(({ status }) => status === 'NOT_RUN'),
	).toBe(true)
	expect(JSON.stringify(report)).not.toContain('incorrect-control-token')
})
