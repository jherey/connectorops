#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKFLOW_ID = 'connectorops-acmecrm-safe-retry'
const CREDENTIAL_ID = 'connectorops-acmecrm-local'
const RUN_ID = 'cli-safe-retry'
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const workflowPath = resolve(
	repositoryRoot,
	'workflows/acmecrm-safe-retry.json',
)
const apiKey = requireSecret('ACME_API_KEY')

const workflow = readFileSync(workflowPath, 'utf8')
const parsedWorkflow = JSON.parse(workflow)
if (parsedWorkflow.id !== WORKFLOW_ID) {
	fail(`Workflow fixture ID must be ${WORKFLOW_ID}`)
}

const credential = JSON.stringify([
	{
		id: CREDENTIAL_ID,
		name: 'ConnectorOps AcmeCRM local',
		type: 'acmeCrmApi',
		data: {
			baseUrl: `http://acme-api:3001/runs/${RUN_ID}`,
			apiToken: apiKey,
		},
	},
])

const secureImport =
	'set -eu; import_file="$(mktemp)"; trap \'rm -f "$import_file"\' EXIT; chmod 600 "$import_file"; cat > "$import_file"; n8n "$@" --input="$import_file"'

runCompose(
	[
		'exec',
		'-T',
		'n8n',
		'sh',
		'-c',
		secureImport,
		'connectorops-import',
		'import:credentials',
	],
	credential,
)
runCompose(
	[
		'exec',
		'-T',
		'n8n',
		'sh',
		'-c',
		secureImport,
		'connectorops-import',
		'import:workflow',
	],
	workflow,
)

process.stdout.write(
	`${JSON.stringify(
		{
			status: 'ready',
			workflowId: WORKFLOW_ID,
			credentialId: CREDENTIAL_ID,
			runId: RUN_ID,
			secretsPersistedInCheckout: false,
		},
		null,
		2,
	)}\n`,
)

function requireSecret(name) {
	const value = process.env[name]
	if (typeof value !== 'string' || value.length === 0) {
		fail(
			`${name} is required; provide it through the process environment, not a tracked file`,
		)
	}
	return value
}

function runCompose(args, input) {
	const result = spawnSync('docker', ['compose', ...args], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		input,
		maxBuffer: 10 * 1024 * 1024,
	})
	if (result.status !== 0) {
		const diagnostic = redact(
			`${result.stdout ?? ''}\n${result.stderr ?? ''}`,
		).trim()
		if (/Failed to find owner/i.test(diagnostic)) {
			fail(
				'n8n has no instance owner. Complete the one-time owner setup in the local n8n UI, then rerun this command.',
			)
		}
		fail(`n8n CLI import failed${diagnostic ? `: ${diagnostic}` : ''}`)
	}
}

function redact(value) {
	return value.split(apiKey).join('[REDACTED]')
}

function fail(message) {
	process.stderr.write(`ConnectorOps bootstrap: ${message}\n`)
	process.exit(1)
}
