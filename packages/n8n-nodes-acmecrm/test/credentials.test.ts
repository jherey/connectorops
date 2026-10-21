import { describe, expect, test } from 'vitest';
import { AcmeCrmApi } from '../credentials/AcmeCrmApi.credentials';

describe('AcmeCRM credentials', () => {
	test('authenticates business requests with only the X-API-Key header', () => {
		const credentials = new AcmeCrmApi();

		expect(credentials.authenticate).toEqual({
			type: 'generic',
			properties: {
				headers: {
					'X-API-Key': '={{$credentials.apiToken}}',
				},
			},
		});
		expect(JSON.stringify(credentials.authenticate)).not.toContain('Authorization');
		expect(JSON.stringify(credentials.authenticate)).not.toContain('Bearer');
	});
});
