import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

export class ClientTimeoutError extends Error {
	constructor() {
		super('client request timed out')
		this.name = 'ClientTimeoutError'
	}
}

export class HttpResponseError extends Error {
	constructor(
		readonly statusCode: number,
		readonly responseBody: string,
		readonly headers: Record<string, string | undefined>,
	) {
		super(`HTTP request failed with status ${statusCode}`)
		this.name = 'HttpResponseError'
	}
}

export type JsonResponse = {
	statusCode: number
	headers: Record<string, string | undefined>
	body: unknown
}

export function requestJson(
	url: string,
	options: {
		method: 'GET' | 'POST' | 'DELETE'
		headers?: Record<string, string>
		body?: unknown
		timeoutMs: number
	},
): Promise<JsonResponse> {
	return new Promise((resolve, reject) => {
		const target = new URL(url)
		const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
			target,
			{
				method: options.method,
				headers: {
					...(options.body === undefined
						? {}
						: { 'content-type': 'application/json' }),
					...options.headers,
				},
				agent: false,
			},
			(response) => {
				const chunks: Array<Buffer> = []
				response.on('data', (chunk: Buffer) => chunks.push(chunk))
				response.once('end', () => {
					const responseBody = Buffer.concat(chunks).toString('utf8')
					const statusCode = response.statusCode ?? 0
					const headers = Object.fromEntries(
						Object.entries(response.headers).map(([key, value]) => [
							key,
							Array.isArray(value) ? value.join(',') : value,
						]),
					)
					if (statusCode < 200 || statusCode >= 300) {
						reject(new HttpResponseError(statusCode, responseBody, headers))
						return
					}
					resolve({
						statusCode,
						headers,
						body: responseBody ? JSON.parse(responseBody) : null,
					})
				})
			},
		)
		request.once('error', reject)
		request.setTimeout(options.timeoutMs, () => {
			request.destroy(new ClientTimeoutError())
		})
		if (options.body !== undefined) request.write(JSON.stringify(options.body))
		request.end()
	})
}
