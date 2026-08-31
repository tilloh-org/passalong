import { describe, expect, it } from 'vitest';
import { hashPassword, needsPasswordRehash, validatePassword, verifyPassword, verifyPasswordSync } from './password';

describe('password hashing', () => {
	it('verifies only the original password', async () => {
		// arrange
		const password = 'careful-secret';
		const invalidPassword = 'wrong-secret';

		// act
		const storedHash = await hashPassword(password);
		const isOriginalPasswordValid = verifyPassword(password, storedHash);
		const isInvalidPasswordValid = verifyPassword(invalidPassword, storedHash);

		// assume
		await expect(isOriginalPasswordValid).resolves.toBe(true);
		await expect(isInvalidPasswordValid).resolves.toBe(false);
	});

	it('accepts passwords only within the registration policy bounds', () => {
		// arrange
		const tooShortPassword = 'a'.repeat(11);
		const minimumLengthPassword = 'a'.repeat(12);
		const maximumLengthPassword = 'a'.repeat(128);
		const tooLongPassword = 'a'.repeat(129);

		// act
		const validationOutcomes = [
			() => validatePassword(tooShortPassword),
			() => validatePassword(minimumLengthPassword),
			() => validatePassword(maximumLengthPassword),
			() => validatePassword(tooLongPassword)
		].map((validate) => {
			try {
				validate();
				return undefined;
			} catch (error) {
				return error;
			}
		});

		// assume
		expect(validationOutcomes[0]).toMatchObject({ message: 'Password must be 12 to 128 characters long.' });
		expect(validationOutcomes[1]).toBeUndefined();
		expect(validationOutcomes[2]).toBeUndefined();
		expect(validationOutcomes[3]).toMatchObject({ message: 'Password must be 12 to 128 characters long.' });
	});

	it('stores current hashes with explicitly allowed versioned parameters', async () => {
		// arrange
		const password = 'careful-secret';

		// act
		const storedHash = await hashPassword(password);
		const requiresRehash = needsPasswordRehash(storedHash);

		// assume
		expect(storedHash).toMatch(/^scrypt\$v1\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
		expect(requiresRehash).toBe(false);
	});

	it('supports legacy native scrypt hashes and marks them for transparent rehashing', async () => {
		// arrange
		const password = 'careful-secret';
		const [, , , , , salt, encodedKey] = (await hashPassword(password)).split('$');
		const legacyHash = `scrypt$${salt}$${encodedKey}`;

		// act
		const isLegacyPasswordValid = verifyPassword(password, legacyHash);
		const isLegacyPasswordSynchronouslyValid = verifyPasswordSync(password, legacyHash);
		const requiresRehash = needsPasswordRehash(legacyHash);

		// assume
		await expect(isLegacyPasswordValid).resolves.toBe(true);
		expect(isLegacyPasswordSynchronouslyValid).toBe(true);
		expect(requiresRehash).toBe(true);
	});

	it('rejects malformed or unsafe password storage values without throwing', async () => {
		// arrange
		const password = 'careful-secret';
		const malformedStoredHashes = [
			'scrypt$v1$1048576$8$1$MTIzNDU2Nzg5MDEyMzQ1Ng$UJxyDTFa1s4wRzUMU2Q1Qj_CoTXQjdhiIsfZa32CA8_6pMzwKjZqWTKM36GAEhU2gCTRX70bXUUeJUATz6W8ww',
			'scrypt$v1$16384$8$1$not_base64!$also-not-base64!',
			'scrypt$not_base64!$also-not-base64!',
			'argon2$anything'
		];

		// act
		const verificationResults = await Promise.all(
			malformedStoredHashes.map(async (storedHash) => ({
				asynchronous: await verifyPassword(password, storedHash),
				synchronous: verifyPasswordSync(password, storedHash)
			}))
		);

		// assume
		for (const verificationResult of verificationResults) {
			expect(verificationResult.asynchronous).toBe(false);
			expect(verificationResult.synchronous).toBe(false);
		}
	});

	it('synchronously verifies bootstrap passwords against supported hashes', async () => {
		// arrange
		const password = 'not-a-real-bootstrap-password';
		const invalidPassword = 'not-the-bootstrap-password';

		// act
		const storedHash = await hashPassword(password);
		const isBootstrapPasswordValid = verifyPasswordSync(password, storedHash);
		const isInvalidBootstrapPasswordValid = verifyPasswordSync(invalidPassword, storedHash);

		// assume
		expect(isBootstrapPasswordValid).toBe(true);
		expect(isInvalidBootstrapPasswordValid).toBe(false);
	});
});
