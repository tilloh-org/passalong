import { describe, expect, it } from 'vitest';
import { hashPassword, needsPasswordRehash, validatePassword, verifyPassword, verifyPasswordSync } from './password';

describe('password hashing', () => {
	it('verifies only the original password', async () => {
		const storedHash = await hashPassword('careful-secret');

		await expect(verifyPassword('careful-secret', storedHash)).resolves.toBe(true);
		await expect(verifyPassword('wrong-secret', storedHash)).resolves.toBe(false);
	});

	it('accepts passwords only within the registration policy bounds', () => {
		expect(() => validatePassword('a'.repeat(11))).toThrow('Password must be 12 to 128 characters long.');
		expect(() => validatePassword('a'.repeat(12))).not.toThrow();
		expect(() => validatePassword('a'.repeat(128))).not.toThrow();
		expect(() => validatePassword('a'.repeat(129))).toThrow('Password must be 12 to 128 characters long.');
	});

	it('stores current hashes with explicitly allowed versioned parameters', async () => {
		const storedHash = await hashPassword('careful-secret');

		expect(storedHash).toMatch(/^scrypt\$v1\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
		expect(needsPasswordRehash(storedHash)).toBe(false);
	});

	it('supports legacy native scrypt hashes and marks them for transparent rehashing', async () => {
		const [, , , , , salt, encodedKey] = (await hashPassword('careful-secret')).split('$');
		const legacyHash = `scrypt$${salt}$${encodedKey}`;

		await expect(verifyPassword('careful-secret', legacyHash)).resolves.toBe(true);
		expect(verifyPasswordSync('careful-secret', legacyHash)).toBe(true);
		expect(needsPasswordRehash(legacyHash)).toBe(true);
	});

	it('rejects malformed or unsafe password storage values without throwing', async () => {
		for (const storedHash of [
			'scrypt$v1$1048576$8$1$MTIzNDU2Nzg5MDEyMzQ1Ng$UJxyDTFa1s4wRzUMU2Q1Qj_CoTXQjdhiIsfZa32CA8_6pMzwKjZqWTKM36GAEhU2gCTRX70bXUUeJUATz6W8ww',
			'scrypt$v1$16384$8$1$not_base64!$also-not-base64!',
			'scrypt$not_base64!$also-not-base64!',
			'argon2$anything'
		]) {
			await expect(verifyPassword('careful-secret', storedHash)).resolves.toBe(false);
			expect(verifyPasswordSync('careful-secret', storedHash)).toBe(false);
		}
	});

	it('synchronously verifies bootstrap passwords against supported hashes', async () => {
		const storedHash = await hashPassword('not-a-real-bootstrap-password');

		expect(verifyPasswordSync('not-a-real-bootstrap-password', storedHash)).toBe(true);
		expect(verifyPasswordSync('not-the-bootstrap-password', storedHash)).toBe(false);
	});
});
