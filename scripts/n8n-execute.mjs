#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKFLOW_ID = 'connectorops-acmecrm-safe-retry'
const RUN_ID = 'cli-safe-retry'
const EXPECTED_EXTERNAL_ORDER_ID = 'ORDER-CLI-SAFE-RETRY'
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const controlToken = requireSecret('ACME_CONTROL_TOKEN')
const simulatorOrigin = process.env.ACME_API_ORIGIN ?? 'http://127.0.0.1:3001'

await resetRun()
await createRun()

const execution = runCompose([
	'exec',
	'-T',
	'n8n',
	'n8n',
	'execute',
	`--id=${WORKFLOW_ID}`,
	'--rawOutput',
])
const executionData = parseCliJson(execution)
const evidence = await requestJson(`/__control/runs/${RUN_ID}`)
const outcomes = evidence.requests?.map((request) => request.outcome)
const keyHashes = evidence.requests?.map(
	(request) => request.idempotencyKeyHash,
)

assert(
	executionData.finished === true,
	'n8n did not mark the workflow execution as finished',
)
assert(
	executionData.data?.resultData?.lastNodeExecuted === 'Create Order',
	'Create Order did not run',
)
assert(evidence.orders?.length === 1, 'expected exactly one persisted order')
assert(
	evidence.orders[0]?.externalOrderId === EXPECTED_EXTERNAL_ORDER_ID,
	'unexpected order result',
)
assert(
	evidence.requests?.length === 2,
	'expected a timed-out request followed by one retry',
)
assert(
	JSON.stringify(outcomes) === JSON.stringify(['created', 'replayed']),
	'unexpected outcomes',
)
assert(
	keyHashes?.length === 2 &&
		keyHashes[0] !== null &&
		keyHashes[0] === keyHashes[1],
	'retry did not preserve the idempotency key',
)

process.stdout.write(
	`${JSON.stringify(
		{
			status: 'passed',
			workflowId: WORKFLOW_ID,
			runId: RUN_ID,
			lastNodeExecuted: 'Create Order',
			attempts: evidence.requests.length,
			ordersPersisted: evidence.orders.length,
			outcomes,
			stableIdempotencyKey: true,
		},
		null,
		2,
	)}\n`,
)

async function resetRun() {
	const response = await fetch(`${simulatorOrigin}/__control/runs/${RUN_ID}`, {
		method: 'DELETE',
		headers: controlHeaders(),
	})
	if (response.status !== 204 && response.status !== 404) {
		fail(`simulator reset failed with HTTP ${response.status}`)
	}
}

async function createRun() {
	const response = await fetch(`${simulatorOrigin}/__control/runs`, {
		method: 'POST',
		headers: { ...controlHeaders(), 'content-type': 'application/json' },
		body: JSON.stringify({
			runId: RUN_ID,
			scenario: 'timeout-after-commit',
			delayMs: 400,
		}),
	})
	if (response.status !== 201) {
		fail(`simulator run creation failed with HTTP ${response.status}`)
	}
}

async function requestJson(path) {
	const response = await fetch(`${simulatorOrigin}${path}`, {
		headers: controlHeaders(),
	})
	if (!response.ok)
		fail(`simulator evidence request failed with HTTP ${response.status}`)
	return await response.json()
}

function controlHeaders() {
	return { authorization: `Bearer ${controlToken}` }
}

function runCompose(args) {
	const result = spawnSync('docker', ['compose', ...args], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		maxBuffer: 20 * 1024 * 1024,
	})
	if (result.status !== 0) {
		const diagnostic = redact(
			`${result.stdout ?? ''}\n${result.stderr ?? ''}`,
		).trim()
		fail(`n8n CLI execution failed${diagnostic ? `: ${diagnostic}` : ''}`)
	}
	return result.stdout
}

function parseCliJson(output) {
	const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
	const plainOutput = output.replaceAll(ansiPattern, '').trim()
	for (
		let index = plainOutput.indexOf('{');
		index >= 0;
		index = plainOutput.indexOf('{', index + 1)
	) {
		try {
			return JSON.parse(plainOutput.slice(index))
		} catch {
			// n8n can write startup notices before its --rawOutput JSON payload.
		}
	}
	fail('n8n CLI returned no parseable execution JSON')
}

function requireSecret(name) {
	const value = process.env[name]
	if (typeof value !== 'string' || value.length === 0) {
		fail(
			`${name} is required; provide it through the process environment, not a tracked file`,
		)
	}
	return value
}

function redact(value) {
	return value.split(controlToken).join('[REDACTED]')
}

function assert(condition, message) {
	if (!condition) fail(message)
}

function fail(message) {
	process.stderr.write(`ConnectorOps execution: ${message}\n`)
	process.exit(1)
}
