import type { IHttpRequestOptions } from 'n8n-workflow';

import type { CreateOrderRequest } from './create-order';

export function toHttpRequestOptions(
	request: CreateOrderRequest,
	timeout: number,
): IHttpRequestOptions {
	return {
		method: request.method,
		url: request.url,
		headers: request.headers,
		body: request.body,
		json: true,
		timeout,
	};
}
