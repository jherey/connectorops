#!/usr/bin/env node

import { assertExpectedDecision } from './decision.js'
import { certify } from './certify.js'
import type {
	CertificationProfile,
	ClientMode,
	DecisionStatus,
} from './types.js'

async function main() {
	const mode = parseMode(process.argv[2])
	const profile = parseProfile(process.argv[3])
	const expected: DecisionStatus =
		mode === 'negative-control' ? 'BLOCKED' : 'CERTIFIED'
	const baseUrl = requireEnvironment('ACME_API_BASE_URL')
	const controlToken = requireEnvironment('ACME_CONTROL_TOKEN')
	const partnerApiKey = requireEnvironment('ACME_API_KEY')

	const report = await certify({
		baseUrl,
		controlToken,
		partnerApiKey,
		mode,
		profile,
		...(process.env.CONNECTOROPS_RUN_ID
			? { runId: process.env.CONNECTOROPS_RUN_ID }
			: {}),
		...(process.env.APP_COMMIT_SHA
			? { gitSha: process.env.APP_COMMIT_SHA }
			: {}),
	})
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
	assertExpectedDecision(report, expected)
}

function parseMode(value: string | undefined): ClientMode {
	if (value === undefined || value === 'safe') return 'safe'
	if (value === 'negative-control') return value
	throw new Error(
		'usage: connectorops-certify [safe|negative-control] [timeout-after-commit|rate-limit-then-success]',
	)
}

function parseProfile(value: string | undefined): CertificationProfile {
	if (value === undefined || value === 'timeout-after-commit') {
		return 'timeout-after-commit'
	}
	if (value === 'rate-limit-then-success') return value
	throw new Error(
		'usage: connectorops-certify [safe|negative-control] [timeout-after-commit|rate-limit-then-success]',
	)
}

function requireEnvironment(name: string): string {
	const value = process.env[name]
	if (!value) throw new Error(`${name} is required`)
	return value
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : 'unknown error'
	process.stderr.write(`connectorops-certify: ${message}\n`)
	process.exitCode = 1
})
