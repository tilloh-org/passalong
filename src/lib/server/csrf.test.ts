import { describe, expect, it } from 'vitest';
import { hasSameOrigin } from './csrf';

describe('same-origin form protection', () => {
	it('allows an unsafe request with an exact matching Origin', () => {
		const request = new Request('https://collection.example/?/login', {
			method: 'POST',
			headers: { Origin: 'https://collection.example' }
		});

		expect(hasSameOrigin(request, new URL(request.url))).toBe(true);
	});

	it('rejects unsafe requests with missing or mismatched Origin headers', () => {
		const target = new URL('https://collection.example/?/login');

		expect(hasSameOrigin(new Request(target, { method: 'POST' }), target)).toBe(false);
		expect(
			hasSameOrigin(
				new Request(target, { method: 'POST', headers: { Origin: 'https://attacker.example' } }),
				target
			)
		).toBe(false);
	});

	it('does not require an Origin header for safe requests', () => {
		const request = new Request('https://collection.example/');

		expect(hasSameOrigin(request, new URL(request.url))).toBe(true);
	});
});
