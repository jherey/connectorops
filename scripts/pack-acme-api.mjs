import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const outputDirectory = resolve(projectRoot, 'docker/acme-api/artifacts')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
mkdirSync(outputDirectory, { recursive: true })

const buildResult = spawnSync(
	npmCommand,
	['run', 'build:bundle', '--workspace', '@connectorops/acme-api'],
	{ cwd: projectRoot, encoding: 'utf8', stdio: 'inherit' },
)

if (buildResult.status !== 0) {
	process.exit(buildResult.status ?? 1)
}

const packResult = spawnSync(
	npmCommand,
	[
		'pack',
		resolve(projectRoot, 'apps/acme-api'),
		'--json',
		'--pack-destination',
		outputDirectory,
	],
	{ cwd: projectRoot, encoding: 'utf8' },
)

if (packResult.status !== 0) {
	process.stderr.write(packResult.stderr)
	process.exit(packResult.status ?? 1)
}

const artifacts = JSON.parse(packResult.stdout)
const filename = artifacts[0]?.filename
if (typeof filename !== 'string') {
	throw new Error('npm pack did not return a simulator artifact filename')
}

copyFileSync(
	resolve(outputDirectory, filename),
	resolve(outputDirectory, 'acme-api.tgz'),
)

console.log(`Packed simulator: docker/acme-api/artifacts/${filename}`)
