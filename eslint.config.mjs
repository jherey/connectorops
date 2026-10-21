import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
	{
		ignores: [
			'.npm-cache/**',
			'**/dist-bundle/**',
			'**/dist/**',
			'coverage/**',
			'docker/n8n/artifacts/**',
			'node_modules/**',
		],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			globals: {
				AbortSignal: 'readonly',
				Buffer: 'readonly',
				URL: 'readonly',
				clearTimeout: 'readonly',
				console: 'readonly',
				exports: 'readonly',
				fetch: 'readonly',
				module: 'readonly',
				process: 'readonly',
				require: 'readonly',
				setTimeout: 'readonly',
			},
		},
	},
)
