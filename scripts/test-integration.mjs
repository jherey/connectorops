import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const fallbackDockerConfig = resolve(projectRoot, '.cache/docker')
const dockerConfig = process.env.DOCKER_CONFIG ?? fallbackDockerConfig
const integrationProject = 'connectorops-integration'
mkdirSync(dockerConfig, { recursive: true })

function compose(args, capture = false) {
	const result = spawnSync(
		'docker',
		['compose', '--project-name', integrationProject, ...args],
		{
			cwd: projectRoot,
			encoding: capture ? 'utf8' : undefined,
			env: { ...process.env, DOCKER_CONFIG: dockerConfig },
			stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
		},
	)

	if (result.error) throw result.error
	if (result.status !== 0) {
		throw new Error(
			`docker compose --project-name ${integrationProject} ${args.join(' ')} exited with ${result.status}`,
		)
	}
	return capture ? result.stdout.trim() : ''
}

function runIntegrationTest(databaseUrl) {
	const result = spawnSync(
		'npm',
		[
			'exec',
			'--workspace',
			'@connectorops/acme-api',
			'--',
			'vitest',
			'run',
			'src/postgres-store.test.ts',
		],
		{
			cwd: projectRoot,
			env: { ...process.env, ACME_TEST_DATABASE_URL: databaseUrl },
			stdio: 'inherit',
		},
	)

	if (result.error) throw result.error
	if (result.status !== 0) {
		throw new Error(`Postgres integration test exited with ${result.status}`)
	}
}

function ensureSimulatorDatabase() {
	const user = process.env.POSTGRES_USER ?? 'connectorops'
	const database = process.env.POSTGRES_DB ?? 'n8n'
	const exists = compose(
		[
			'exec',
			'-T',
			'postgres',
			'psql',
			'--username',
			user,
			'--dbname',
			database,
			'--tuples-only',
			'--no-align',
			'--command',
			"SELECT 1 FROM pg_database WHERE datname = 'acmecrm'",
		],
		true,
	)
	if (exists !== '1') {
		compose([
			'exec',
			'-T',
			'postgres',
			'createdb',
			'--username',
			user,
			'acmecrm',
		])
	}
}

const existingContainer = compose(['ps', '--all', '--quiet', 'postgres'], true)
const runningContainer = compose(['ps', '--quiet', 'postgres'], true)
const shouldRestoreStoppedState = Boolean(
	existingContainer && !runningContainer,
)
const createdContainer = !existingContainer
const shouldStart = !runningContainer

try {
	if (shouldStart) compose(['up', '--detach', '--wait', 'postgres'])
	ensureSimulatorDatabase()

	const publishedAddress = compose(['port', 'postgres', '5432'], true)
	const separator = publishedAddress.lastIndexOf(':')
	if (separator === -1) {
		throw new Error(`Could not parse Postgres address: ${publishedAddress}`)
	}

	const host = publishedAddress.slice(0, separator)
	const port = publishedAddress.slice(separator + 1)
	const user = encodeURIComponent(process.env.POSTGRES_USER ?? 'connectorops')
	const password = encodeURIComponent(
		process.env.POSTGRES_PASSWORD ?? 'connectorops-local-only',
	)
	const databaseUrl = `postgresql://${user}:${password}@${host}:${port}/acmecrm`

	runIntegrationTest(databaseUrl)
} finally {
	if (shouldRestoreStoppedState || createdContainer) {
		compose(['stop', 'postgres'])
	}
	if (createdContainer) {
		compose(['rm', '--force', 'postgres'])
	}
}
