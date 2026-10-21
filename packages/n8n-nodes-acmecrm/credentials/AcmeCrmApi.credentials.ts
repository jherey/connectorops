import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class AcmeCrmApi implements ICredentialType {
	name = 'acmeCrmApi';

	displayName = 'AcmeCRM API';

	icon: Icon = { light: 'file:../icons/acmecrm.svg', dark: 'file:../icons/acmecrm.dark.svg' };

	documentationUrl = 'https://github.com/jherey/connectorops#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			placeholder: 'https://api.acmecrm.example',
			required: true,
			description: 'Base URL of the AcmeCRM API or ConnectorOps simulator',
		},
		{
			displayName: 'API Key',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'API key sent to AcmeCRM business endpoints',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/v1/auth/test',
			method: 'GET',
		},
	};
}
