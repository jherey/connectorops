import { buildApp } from './app.js'
import { PostgresSimulatorStore } from './postgres-store.js'

const host = process.env.HOST ?? '0.0.0.0'
const port = Number.parseInt(process.env.PORT ?? '3001', 10)

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
	throw new Error('PORT must be an integer between 1 and 65535')
}

const databaseUrl = process.env.ACME_DATABASE_URL ?? process.env.DATABASE_URL
if (!databaseUrl) {
	throw new Error('ACME_DATABASE_URL or DATABASE_URL is required')
}
const controlToken = process.env.ACME_CONTROL_TOKEN
if (!controlToken) {
	throw new Error('ACME_CONTROL_TOKEN is required')
}
const partnerApiKey = process.env.ACME_API_KEY
if (!partnerApiKey) {
	throw new Error('ACME_API_KEY is required')
}

const store = new PostgresSimulatorStore({ connectionString: databaseUrl })
const app = buildApp({ logger: true, store, controlToken, partnerApiKey })

async function shutdown(signal: string) {
	app.log.info({ signal }, 'stopping acme-api')
	await app.close()
	process.exit(0)
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

async function main() {
	try {
		await store.migrate()
		await app.listen({ host, port })
	} catch (error) {
		app.log.error(error)
		process.exit(1)
	}
}

void main()
