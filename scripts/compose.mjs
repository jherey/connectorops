import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const fallbackDockerConfig = resolve(projectRoot, '.cache/docker')
const dockerConfig = process.env.DOCKER_CONFIG ?? fallbackDockerConfig
mkdirSync(dockerConfig, { recursive: true })

const result = spawnSync('docker', ['compose', ...process.argv.slice(2)], {
	cwd: projectRoot,
	env: { ...process.env, DOCKER_CONFIG: dockerConfig },
	stdio: 'inherit',
})

if (result.error) {
	throw result.error
}

process.exit(result.status ?? 1)
