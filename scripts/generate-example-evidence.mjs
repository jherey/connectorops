import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { format, resolveConfig } from 'prettier'

import { buildApp } from '../apps/acme-api/dist/app.js'
import { MemorySimulatorStore } from '../apps/acme-api/dist/store.js'
import { certify } from '../packages/certification/dist/index.js'

const controlToken = 'example-control-token'
const partnerApiKey = 'example-partner-key'
const outputDirectory = resolve('docs/examples')
const app = buildApp({
	store: new MemorySimulatorStore(),
	controlToken,
	partnerApiKey,
})

try {
	await app.listen({ host: '127.0.0.1', port: 0 })
	const address = app.server.address()
	if (!address || typeof address === 'string') {
		throw new Error('expected an assigned TCP port')
	}
	const baseUrl = `http://127.0.0.1:${address.port}`
	const common = {
		baseUrl,
		controlToken,
		partnerApiKey,
		delayMs: 150,
		requestTimeoutMs: 20,
		retryTimeoutMs: 2_000,
		connectorVersion: '0.1.0',
		gitSha: process.env.APP_COMMIT_SHA ?? 'application-package-example',
	}

	const safe = await certify({
		...common,
		mode: 'safe',
		runId: 'example-safe-timeout',
	})
	const negativeControl = await certify({
		...common,
		mode: 'negative-control',
		runId: 'example-unsafe-timeout',
	})

	if (safe.decision.status !== 'CERTIFIED') {
		throw new Error(`safe example was ${safe.decision.status}`)
	}
	if (negativeControl.decision.status !== 'BLOCKED') {
		throw new Error(`negative control was ${negativeControl.decision.status}`)
	}
	const serializedReports = JSON.stringify([safe, negativeControl])
	if (
		serializedReports.includes(controlToken) ||
		serializedReports.includes(partnerApiKey)
	) {
		throw new Error('generated evidence contains a configured secret')
	}

	await mkdir(outputDirectory, { recursive: true })
	await Promise.all([
		writeJson('certified-scorecard.json', safe),
		writeJson('blocked-scorecard.json', negativeControl),
		writeFormatted(
			'partner-failure-report.md',
			partnerFailureReport(negativeControl),
		),
	])
	process.stdout.write(
		`Generated ${safe.decision.status} and ${negativeControl.decision.status} examples in docs/examples\n`,
	)
} finally {
	await app.close()
}

async function writeJson(fileName, value) {
	await writeFormatted(fileName, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeFormatted(fileName, value) {
	const filePath = resolve(outputDirectory, fileName)
	const config = (await resolveConfig(filePath)) ?? {}
	await writeFile(
		filePath,
		await format(value, { ...config, filepath: filePath }),
	)
}

function partnerFailureReport(report) {
	const failure = report.assertions.find(({ status }) => status === 'FAIL')
	if (!failure)
		throw new Error('negative control did not produce a failed assertion')

	return `# Partner failure report: duplicate order after ambiguous timeout

> Generated example from the unsafe test client. It contains synthetic data only.

| Field | Value |
| --- | --- |
| Decision | \`${report.decision.status}\` |
| Scenario | \`${report.scenario.id}\` |
| Operation | \`${report.scenario.operation}\` |
| Run | \`${report.run.id}\` |
| Failed requirement | \`${failure.id}\` |
| Expected | \`${JSON.stringify(failure.expected)}\` |
| Observed | \`${JSON.stringify(failure.actual)}\` |

## Impact

One intended order produced ${report.observations.committedOrders} partner-side orders after the first response timed out. Certification is blocked because retrying without a stable idempotency key can duplicate a customer's business operation.

## Requested partner alignment

Confirm that the create-order endpoint honors a caller-provided idempotency key for an ambiguous timeout and returns the original operation when that key and request body are replayed.

## n8n owner action

Keep the key stable across bounded retries, retain the negative-control regression, and rerun the same scenario before release. Correlate using the sanitized evidence references in [the blocked scorecard](blocked-scorecard.json).

No credentials, raw idempotency keys, or customer data are included.
`
}
