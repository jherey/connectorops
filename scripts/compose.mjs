import { accessSync, constants, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const fallbackDockerConfig = resolve(projectRoot, '.cache/docker')
const environment = { ...process.env }

if (!process.env.DOCKER_CONFIG && !defaultDockerConfigIsWritable()) {
	mkdirSync(fallbackDockerConfig, { recursive: true })
	environment.DOCKER_CONFIG = fallbackDockerConfig
}

const result = spawnSync('docker', ['compose', ...process.argv.slice(2)], {
	cwd: projectRoot,
	env: environment,
	stdio: 'inherit',
})

if (result.error) {
	throw result.error
}

process.exit(result.status ?? 1)

function defaultDockerConfigIsWritable() {
	const homeDirectory = homedir()
	const defaultDockerConfig = resolve(homeDirectory, '.docker')
	return existsSync(defaultDockerConfig)
		? isWritable(defaultDockerConfig)
		: isWritable(homeDirectory)
}

function isWritable(path) {
	try {
		accessSync(path, constants.W_OK)
		return true
	} catch {
		return false
	}
}
