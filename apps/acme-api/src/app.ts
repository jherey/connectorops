import Fastify, { type FastifyInstance } from 'fastify'

export type BuildAppOptions = {
	buildSha?: string
	logger?: boolean
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
	const buildSha =
		options.buildSha ?? process.env.APP_COMMIT_SHA ?? 'development'
	const app = Fastify({
		logger: options.logger
			? {
					redact: [
						'req.headers.authorization',
						'req.headers.cookie',
						'req.headers.x-api-key',
					],
				}
			: false,
	})

	app.get('/healthz', async () => ({
		ok: true,
		service: 'acme-api',
	}))

	app.get('/healthz/readiness', async () => ({
		ok: true,
		service: 'acme-api',
		commitSha: buildSha,
	}))

	return app
}
