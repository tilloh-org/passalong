import { describe, expect, it } from 'vitest';
import { hashPassword, validatePassword, verifyPassword, verifyPasswordSync } from './password';

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

	it('synchronously verifies bootstrap passwords against existing hashes', async () => {
		const storedHash = await hashPassword('not-a-real-bootstrap-password');

		expect(verifyPasswordSync('not-a-real-bootstrap-password', storedHash)).toBe(true);
		expect(verifyPasswordSync('not-the-bootstrap-password', storedHash)).toBe(false);
	});
});
