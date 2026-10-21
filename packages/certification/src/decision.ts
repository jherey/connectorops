import type {
	CertificationAssertion,
	CertificationReport,
	DecisionStatus,
} from './types.js'

export function decide(assertions: Array<CertificationAssertion>): {
	status: DecisionStatus
	reasonCodes: Array<string>
} {
	const required = assertions.filter(({ required }) => required)
	const incomplete = required.filter(
		({ status }) => status === 'ERROR' || status === 'NOT_RUN',
	)
	if (incomplete.length > 0) {
		return {
			status: 'INCOMPLETE',
			reasonCodes: incomplete.map(
				({ id, status }) => `REQUIRED_${status}:${id}`,
			),
		}
	}

	const failed = required.filter(({ status }) => status === 'FAIL')
	if (failed.length > 0) {
		return {
			status: 'BLOCKED',
			reasonCodes: failed.map(({ id }) => `REQUIRED_FAIL:${id}`),
		}
	}

	return { status: 'CERTIFIED', reasonCodes: [] }
}

export function assertExpectedDecision(
	report: CertificationReport,
	expected: DecisionStatus,
): void {
	if (report.decision.status !== expected) {
		throw new Error(
			`expected certification decision ${expected}, received ${report.decision.status}`,
		)
	}
}
