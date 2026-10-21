import type {
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';
import { createOrderIdempotencyKey } from './idempotency';
import { retryRequest, type RetryDecision } from './retry';

type CreateOrderResponse = JsonObject & {
	id: string;
};

export class AcmeCrm implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AcmeCRM',
		name: 'acmeCrm',
		icon: { light: 'file:../../icons/acmecrm.svg', dark: 'file:../../icons/acmecrm.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Use AcmeCRM with production-safe retries and idempotency',
		defaults: {
			name: 'AcmeCRM',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'acmeCrmApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Order', value: 'order' }],
				default: 'order',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['order'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create an order idempotently',
						action: 'Create an order',
					},
				],
				default: 'create',
			},
			{
				displayName: 'External Order ID',
				name: 'externalOrderId',
				type: 'string',
				required: true,
				default: '',
				description: 'Stable order identifier from the source system',
			},
			{
				displayName: 'Customer ID',
				name: 'customerId',
				type: 'string',
				required: true,
				default: '',
			},
			{
				displayName: 'Amount (Minor Units)',
				name: 'amountMinor',
				type: 'number',
				required: true,
				typeOptions: { minValue: 1, numberStepSize: 1 },
				default: 1,
				description: 'Order amount in the smallest currency unit, such as cents',
			},
			{
				displayName: 'Currency',
				name: 'currency',
				type: 'string',
				required: true,
				default: 'USD',
				description: 'Three-letter ISO 4217 currency code',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const inputs = this.getInputData();
		const results: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('acmeCrmApi');
		const baseUrl = normalizeBaseUrl(this, credentials.baseUrl);

		for (let itemIndex = 0; itemIndex < inputs.length; itemIndex++) {
			try {
				const externalOrderId = requireText(
					this,
					this.getNodeParameter('externalOrderId', itemIndex),
					'External Order ID',
					itemIndex,
				);
				const customerId = requireText(
					this,
					this.getNodeParameter('customerId', itemIndex),
					'Customer ID',
					itemIndex,
				);
				const amountMinor = requirePositiveInteger(
					this,
					this.getNodeParameter('amountMinor', itemIndex),
					itemIndex,
				);
				const currency = requireCurrency(
					this,
					this.getNodeParameter('currency', itemIndex),
					itemIndex,
				);
				const idempotencyKey = createOrderIdempotencyKey(externalOrderId);

				const response = await retryRequest<CreateOrderResponse>({
					request: async () => {
						const request: IHttpRequestOptions = {
							method: 'POST',
							url: `${baseUrl}/v1/orders`,
							headers: {
								'Idempotency-Key': idempotencyKey,
							},
							body: {
								externalOrderId,
								customerId,
								amountMinor,
								currency,
							},
							json: true,
						};

						return (await this.helpers.httpRequestWithAuthentication.call(
							this,
							'acmeCrmApi',
							request,
						)) as CreateOrderResponse;
					},
					classifyError: classifyHttpError,
					sleep,
					onGiveUp: (error) => {
						throw createHttpNodeError(this, error, itemIndex);
					},
				});

				results.push({ json: response, pairedItem: itemIndex });
			} catch (error) {
				const nodeError = toNodeError.call(this, error, itemIndex);
				if (this.continueOnFail()) {
					results.push({ json: inputs[itemIndex].json, error: nodeError, pairedItem: itemIndex });
					continue;
				}
				throw nodeError;
			}
		}

		return [results];
	}
}

function normalizeBaseUrl(context: IExecuteFunctions, value: unknown): string {
	if (typeof value !== 'string') {
		throw new NodeOperationError(context.getNode(), 'AcmeCRM Base URL must be a string');
	}
	const trimmed = value.trim().replace(/\/+$/, '');
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new NodeOperationError(
			context.getNode(),
			'AcmeCRM Base URL must be a valid absolute URL',
		);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new NodeOperationError(context.getNode(), 'AcmeCRM Base URL must use HTTP or HTTPS');
	}
	return trimmed;
}

function requireText(
	context: IExecuteFunctions,
	value: unknown,
	displayName: string,
	itemIndex: number,
): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new NodeOperationError(context.getNode(), `${displayName} cannot be empty`, {
			itemIndex,
		});
	}
	return value.trim();
}

function requirePositiveInteger(
	context: IExecuteFunctions,
	value: unknown,
	itemIndex: number,
): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
		throw new NodeOperationError(
			context.getNode(),
			'Amount (Minor Units) must be a positive integer',
			{ itemIndex },
		);
	}
	return value;
}

function requireCurrency(context: IExecuteFunctions, value: unknown, itemIndex: number): string {
	if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value.trim())) {
		throw new NodeOperationError(
			context.getNode(),
			'Currency must be a three-letter ISO 4217 code',
			{ itemIndex },
		);
	}
	return value.trim().toUpperCase();
}

function classifyHttpError(error: unknown): RetryDecision {
	const statusCode = readStatusCode(error);
	return {
		retryable:
			statusCode === 429 ||
			(statusCode !== undefined && statusCode >= 500) ||
			(statusCode === undefined && isRetryableNetworkError(error)),
		retryAfter: readRetryAfter(error),
	};
}

function isRetryableNetworkError(error: unknown): boolean {
	if (!isRecord(error)) return false;
	const code = typeof error.code === 'string' ? error.code.toUpperCase() : '';
	return ['ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(code);
}

function createHttpNodeError(
	context: IExecuteFunctions,
	error: unknown,
	itemIndex: number,
): NodeApiError {
	const statusCode = readStatusCode(error);
	const errorResponse: JsonObject = {
		message: 'AcmeCRM request failed',
		description:
			statusCode === undefined
				? 'The AcmeCRM request failed after the bounded retry policy was exhausted.'
				: `AcmeCRM returned HTTP ${statusCode} after the bounded retry policy was exhausted.`,
	};
	return new NodeApiError(context.getNode(), errorResponse, {
		itemIndex,
		httpCode: statusCode === undefined ? undefined : String(statusCode),
	});
}

function readStatusCode(error: unknown): number | undefined {
	if (!isRecord(error)) return undefined;
	if (typeof error.statusCode === 'number') return error.statusCode;
	if (typeof error.httpCode === 'number') return error.httpCode;
	if (typeof error.httpCode === 'string') {
		const parsed = Number.parseInt(error.httpCode, 10);
		if (Number.isFinite(parsed)) return parsed;
	}
	if (isRecord(error.response) && typeof error.response.status === 'number') {
		return error.response.status;
	}
	return undefined;
}

function readRetryAfter(error: unknown): string | undefined {
	if (!isRecord(error) || !isRecord(error.response) || !isRecord(error.response.headers)) {
		return undefined;
	}
	const retryAfter = error.response.headers['retry-after'];
	if (typeof retryAfter === 'string') return retryAfter;
	if (typeof retryAfter === 'number') return String(retryAfter);
	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function toNodeError(
	this: IExecuteFunctions,
	error: unknown,
	itemIndex: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) return error;
	if (isRecord(error) && readStatusCode(error) !== undefined) {
		return new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex });
	}
	return new NodeOperationError(
		this.getNode(),
		error instanceof Error ? error : 'AcmeCRM operation failed',
		{ itemIndex },
	);
}
