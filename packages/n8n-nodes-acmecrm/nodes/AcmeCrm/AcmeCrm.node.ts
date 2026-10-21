import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';
import { createOrder, type CreateOrderRequest, type SanitizedRequestFailure } from './create-order';
import { toHttpRequestOptions } from './request-options';

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
			{
				displayName: 'Request Timeout (Ms)',
				name: 'requestTimeoutMs',
				type: 'number',
				required: true,
				typeOptions: { minValue: 50, maxValue: 120_000, numberStepSize: 50 },
				default: 5_000,
				description:
					'Maximum time to wait for each HTTP attempt. Retries reuse the same idempotency key.',
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
				const requestTimeoutMs = requireRequestTimeout(
					this,
					this.getNodeParameter('requestTimeoutMs', itemIndex),
					itemIndex,
				);
				const response = await createOrder<CreateOrderResponse>({
					baseUrl,
					input: { externalOrderId, customerId, amountMinor, currency },
					transport: async (request) => await executeRequest.call(this, request, requestTimeoutMs),
					sleep,
					onFailure: (failure) => {
						throw createHttpNodeError(this, failure, itemIndex);
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

function requireRequestTimeout(
	context: IExecuteFunctions,
	value: unknown,
	itemIndex: number,
): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 50 || value > 120_000) {
		throw new NodeOperationError(
			context.getNode(),
			'Request Timeout (ms) must be an integer between 50 and 120000',
			{ itemIndex },
		);
	}
	return value;
}

function createHttpNodeError(
	context: IExecuteFunctions,
	failure: SanitizedRequestFailure,
	itemIndex: number,
): NodeApiError {
	const errorResponse: JsonObject = {
		message: failure.message,
		description: failure.description,
	};
	return new NodeApiError(context.getNode(), errorResponse, {
		itemIndex,
		httpCode: failure.statusCode === undefined ? undefined : String(failure.statusCode),
	});
}

async function executeRequest(
	this: IExecuteFunctions,
	request: CreateOrderRequest,
	timeout: number,
): Promise<CreateOrderResponse> {
	const options = toHttpRequestOptions(request, timeout);
	return (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'acmeCrmApi',
		options,
	)) as CreateOrderResponse;
}

function toNodeError(
	this: IExecuteFunctions,
	error: unknown,
	itemIndex: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) return error;
	return new NodeOperationError(this.getNode(), 'AcmeCRM operation failed', { itemIndex });
}
