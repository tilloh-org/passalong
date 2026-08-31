import { describe, expect, it } from 'vitest';
import { hasSameOrigin } from './csrf';

describe('same-origin form protection', () => {
	it('allows an unsafe request with an exact matching Origin', () => {
		// arrange
		const request = new Request('https://collection.example/?/login', {
			method: 'POST',
			headers: { Origin: 'https://collection.example' }
		});

		// act
		const hasMatchingOrigin = hasSameOrigin(request, new URL(request.url));

		// assume
		expect(hasMatchingOrigin).toBe(true);
	});

	it('rejects unsafe requests with missing or mismatched Origin headers', () => {
		// arrange
		const target = new URL('https://collection.example/?/login');
		const missingOriginRequest = new Request(target, { method: 'POST' });
		const mismatchedOriginRequest = new Request(target, {
			method: 'POST',
			headers: { Origin: 'https://attacker.example' }
		});

		// act
		const hasMissingOrigin = hasSameOrigin(missingOriginRequest, target);
		const hasMismatchedOrigin = hasSameOrigin(mismatchedOriginRequest, target);

		// assume
		expect(hasMissingOrigin).toBe(false);
		expect(hasMismatchedOrigin).toBe(false);
	});

	it('does not require an Origin header for safe requests', () => {
		// arrange
		const request = new Request('https://collection.example/');

		// act
		const hasSameRequestOrigin = hasSameOrigin(request, new URL(request.url));

		// assume
		expect(hasSameRequestOrigin).toBe(true);
	});
});
