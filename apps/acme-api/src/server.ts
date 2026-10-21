import { buildApp } from './app.js'

const host = process.env.HOST ?? '0.0.0.0'
const port = Number.parseInt(process.env.PORT ?? '3001', 10)

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
	throw new Error('PORT must be an integer between 1 and 65535')
}

const app = buildApp({ logger: true })

async function shutdown(signal: string) {
	app.log.info({ signal }, 'stopping acme-api')
	await app.close()
	process.exit(0)
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

async function main() {
	try {
		await app.listen({ host, port })
	} catch (error) {
		app.log.error(error)
		process.exit(1)
	}
}

void main()
