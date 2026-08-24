import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
	it('verifies only the original password', async () => {
		const storedHash = await hashPassword('careful-secret');

		await expect(verifyPassword('careful-secret', storedHash)).resolves.toBe(true);
		await expect(verifyPassword('wrong-secret', storedHash)).resolves.toBe(false);
	});
});
