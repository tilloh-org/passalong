import { describe, expect, it } from 'vitest';
import { classifyImportedPasswordHash, hashPassword } from '$lib/server/password';

describe('imported password hash classification', () => {
	it('accepts a native scrypt hash so it can be carried over', async () => {
		// arrange
		const stored = await hashPassword('a-known-passphrase');

		// act
		const classification = classifyImportedPasswordHash(stored);

		// assume
		expect(classification).toEqual({ usable: true, value: stored });
	});

	it('refuses a foreign werkzeug hash instead of storing it', () => {
		// act — a typical Marktbude-style werkzeug value
		const classification = classifyImportedPasswordHash('pbkdf2:sha256:600000$salt$digestvalue');

		// assume
		expect(classification.usable).toBe(false);
		expect(classification.usable === false && classification.reason).toMatch(/not a native/i);
	});

	it('refuses an empty hash', () => {
		// act
		const classification = classifyImportedPasswordHash('');

		// assume
		expect(classification.usable).toBe(false);
	});

	it('refuses a missing hash', () => {
		// act
		const classification = classifyImportedPasswordHash(null);

		// assume
		expect(classification.usable).toBe(false);
	});

	it('refuses a native-looking value with unsupported parameters', () => {
		// act — well-formed field count but parameters outside the allowed set
		const classification = classifyImportedPasswordHash('scrypt$v1$999999$8$1$c2FsdA$a2V5');

		// assume
		expect(classification.usable).toBe(false);
	});

	it('refuses a native-looking value with a tampered key length', () => {
		// act
		const classification = classifyImportedPasswordHash('scrypt$v1$16384$8$1$c2FsdA$dG9vLXNob3J0');

		// assume
		expect(classification.usable).toBe(false);
	});

	it('never returns the stored value when the hash is refused', () => {
		// act
		const classification = classifyImportedPasswordHash('pbkdf2:sha256:600000$salt$digestvalue');

		// assume
		expect(classification.usable).toBe(false);
		expect('value' in classification && classification.value).toBeFalsy();
	});
});
