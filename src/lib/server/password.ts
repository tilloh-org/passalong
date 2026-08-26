import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;

/**
 * Derive a password key using Node's memory-hard scrypt implementation.
 *
 * @param {string} password - The untrusted plaintext password.
 * @param {string} salt - A unique, base64url-encoded salt.
 * @returns {Promise<Buffer>} The derived password key.
 */
function derivePasswordKey(password: string, salt: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, keyLength, (error, key) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(key as Buffer);
		});
	});
}

/**
 * Hash a password with a randomly generated salt for durable storage.
 *
 * @param {string} password - The plaintext password to protect.
 * @returns {Promise<string>} A versioned scrypt storage value.
 */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16).toString('base64url');
	const key = await derivePasswordKey(password, salt);
	return `scrypt$${salt}$${key.toString('base64url')}`;
}

/**
 * Compare a plaintext password to a stored scrypt storage value.
 *
 * @param {string} password - The plaintext password submitted during login.
 * @param {string} storedHash - The stored scrypt value.
 * @returns {Promise<boolean>} Whether the password is valid.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
	const [algorithm, salt, encodedKey] = storedHash.split('$');
	if (algorithm !== 'scrypt' || !salt || !encodedKey) {
		return false;
	}

	const expectedKey = Buffer.from(encodedKey, 'base64url');
	const actualKey = await derivePasswordKey(password, salt);
	return expectedKey.length === actualKey.length && timingSafeEqual(expectedKey, actualKey);
}
