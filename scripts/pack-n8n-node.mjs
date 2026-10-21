import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const outputDirectory = resolve(projectRoot, 'docker/n8n/artifacts')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
mkdirSync(outputDirectory, { recursive: true })

const result = spawnSync(
	npmCommand,
	[
		'pack',
		resolve(projectRoot, 'packages/n8n-nodes-acmecrm'),
		'--json',
		'--pack-destination',
		outputDirectory,
	],
	{ cwd: projectRoot, encoding: 'utf8' },
)

if (result.status !== 0) {
	process.stderr.write(result.stderr)
	process.exit(result.status ?? 1)
}

const packResult = JSON.parse(result.stdout)
const filename = packResult[0]?.filename
if (typeof filename !== 'string') {
	throw new Error('npm pack did not return an artifact filename')
}

copyFileSync(
	resolve(outputDirectory, filename),
	resolve(outputDirectory, 'n8n-nodes-acmecrm.tgz'),
)

console.log(`Packed custom node: docker/n8n/artifacts/${filename}`)
