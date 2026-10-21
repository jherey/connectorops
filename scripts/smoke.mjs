const targets = [
	{
		name: 'AcmeCRM simulator',
		url:
			process.env.ACME_API_HEALTH_URL ??
			'http://127.0.0.1:3001/healthz/readiness',
	},
	{
		name: 'n8n',
		url:
			process.env.N8N_HEALTH_URL ?? 'http://127.0.0.1:5678/healthz/readiness',
	},
]

const timeoutMs = 90_000
const pollMs = 1_000

async function waitForTarget(target) {
	const deadline = Date.now() + timeoutMs
	let lastError = 'no response'

	while (Date.now() < deadline) {
		try {
			const response = await fetch(target.url, {
				signal: AbortSignal.timeout(5_000),
			})
			if (response.ok) {
				console.log(`${target.name} ready: ${target.url}`)
				return
			}
			lastError = `HTTP ${response.status}`
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error)
		}

		await new Promise((resolvePoll) => setTimeout(resolvePoll, pollMs))
	}

	throw new Error(`${target.name} did not become ready: ${lastError}`)
}

await Promise.all(targets.map(waitForTarget))
