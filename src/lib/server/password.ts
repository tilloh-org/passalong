import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { maximumPasswordLength, minimumPasswordLength } from '$lib/password-policy';

const keyLength = 64;
const saltLength = 16;
const legacyPasswordHashPartCount = 3;
const versionedPasswordHashPartCount = 7;
const maximumPasswordHashLength = 512;
const scryptMemoryLimitBytes = 64 * 1024 * 1024;
const currentScryptParameters = { N: 16_384, r: 8, p: 1 } as const;
const allowedScryptParameters = [currentScryptParameters] as const;
const encodedKeyPattern = /^[A-Za-z0-9_-]+$/;
const positiveIntegerPattern = /^[1-9]\d*$/;

interface PasswordHashParameters {
	N: number;
	r: number;
	p: number;
}

interface ParsedPasswordHash {
	legacy: boolean;
	parameters: PasswordHashParameters;
	salt: Buffer;
	expectedKey: Buffer;
}

/**
 * Validate the shared password policy used for registration and bootstrap provisioning.
 *
 * @param {string} password - Plaintext password to validate.
 * @returns {void}
 * @throws {Error} When the password is outside the supported bounds.
 */
export function validatePassword(password: string): void {
	if (password.length < minimumPasswordLength || password.length > maximumPasswordLength) {
		throw new Error(`Password must be ${minimumPasswordLength} to ${maximumPasswordLength} characters long.`);
	}
}

/**
 * Hash a password with current, explicitly parameterized scrypt storage.
 *
 * @param {string} password - The plaintext password to protect.
 * @returns {Promise<string>} A versioned scrypt storage value.
 */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(saltLength);
	const key = await derivePasswordKey(password, salt, currentScryptParameters);
	return `scrypt$v1$${currentScryptParameters.N}$${currentScryptParameters.r}$${currentScryptParameters.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/**
 * Compare a plaintext password to a safely parsed supported scrypt storage value.
 *
 * @param {string} password - The plaintext password submitted during login.
 * @param {string} storedHash - The stored scrypt value.
 * @returns {Promise<boolean>} Whether the password is valid.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
	const parsedHash = parsePasswordHash(storedHash);
	if (!parsedHash || !isSafePasswordInput(password)) {
		return false;
	}

	try {
		const actualKey = await derivePasswordKey(password, parsedHash.salt, parsedHash.parameters);
		return timingSafeEqual(parsedHash.expectedKey, actualKey);
	} catch {
		return false;
	}
}

/**
 * Determine whether a valid stored hash should be upgraded after successful verification.
 *
 * @param {string} storedHash - The stored password hash.
 * @returns {boolean} Whether the supported hash uses the legacy native format.
 */
export function needsPasswordRehash(storedHash: string): boolean {
	return parsePasswordHash(storedHash)?.legacy === true;
}

/**
 * Verify a bootstrap password synchronously before an account-provisioning transaction begins.
 *
 * @param {string} password - Plaintext password from the bootstrap manifest.
 * @param {string} storedHash - Existing supported scrypt storage value.
 * @returns {boolean} Whether the password matches the existing storage value.
 */
export function verifyPasswordSync(password: string, storedHash: string): boolean {
	const parsedHash = parsePasswordHash(storedHash);
	if (!parsedHash || !isSafePasswordInput(password)) {
		return false;
	}

	try {
		const actualKey = scryptSync(password, parsedHash.salt, keyLength, scryptOptions(parsedHash.parameters));
		return timingSafeEqual(parsedHash.expectedKey, actualKey);
	} catch {
		return false;
	}
}

/**
 * Derive a password key using only the explicitly allowed scrypt parameters.
 *
 * @param {string} password - The untrusted plaintext password.
 * @param {Buffer} salt - A validated binary salt.
 * @param {PasswordHashParameters} parameters - Allowlisted scrypt parameters.
 * @returns {Promise<Buffer>} The derived password key.
 */
function derivePasswordKey(password: string, salt: Buffer, parameters: PasswordHashParameters): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, keyLength, scryptOptions(parameters), (error, key) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(key as Buffer);
		});
	});
}

/**
 * Build bounded scrypt options from already allowlisted parameters.
 *
 * @param {PasswordHashParameters} parameters - Allowlisted scrypt parameters.
 * @returns {{ N: number; r: number; p: number; maxmem: number }} Scrypt options with a fixed memory ceiling.
 */
function scryptOptions(parameters: PasswordHashParameters): { N: number; r: number; p: number; maxmem: number } {
	return { ...parameters, maxmem: scryptMemoryLimitBytes };
}

/**
 * Parse only legacy native and current versioned scrypt values with strict encoding bounds.
 *
 * @param {string} storedHash - Untrusted stored password storage text.
 * @returns {ParsedPasswordHash | null} Safe parsed values or null when unsupported.
 */
function parsePasswordHash(storedHash: string): ParsedPasswordHash | null {
	if (storedHash.length === 0 || storedHash.length > maximumPasswordHashLength) {
		return null;
	}

	const parts = storedHash.split('$');
	const [algorithm] = parts;
	if (algorithm !== 'scrypt') {
		return null;
	}
	if (parts.length === legacyPasswordHashPartCount) {
		const [, encodedSalt, encodedKey] = parts;
		const salt = decodeBase64Url(encodedSalt, saltLength);
		const expectedKey = decodeBase64Url(encodedKey, keyLength);
		return salt && expectedKey ? { legacy: true, parameters: currentScryptParameters, salt, expectedKey } : null;
	}
	if (parts.length !== versionedPasswordHashPartCount) {
		return null;
	}

	const [, version, encodedN, encodedR, encodedP, encodedSalt, encodedKey] = parts;
	if (version !== 'v1') {
		return null;
	}
	const parameters = parseAllowedParameters(encodedN, encodedR, encodedP);
	const salt = decodeBase64Url(encodedSalt, saltLength);
	const expectedKey = decodeBase64Url(encodedKey, keyLength);
	return parameters && salt && expectedKey ? { legacy: false, parameters, salt, expectedKey } : null;
}

/**
 * Parse a scrypt parameter tuple only when it exactly matches the current allowlist.
 *
 * @param {string | undefined} encodedN - Encoded scrypt N parameter.
 * @param {string | undefined} encodedR - Encoded scrypt r parameter.
 * @param {string | undefined} encodedP - Encoded scrypt p parameter.
 * @returns {PasswordHashParameters | null} Allowlisted parameters or null.
 */
function parseAllowedParameters(encodedN: string | undefined, encodedR: string | undefined, encodedP: string | undefined): PasswordHashParameters | null {
	const N = parseInteger(encodedN);
	const r = parseInteger(encodedR);
	const p = parseInteger(encodedP);
	return allowedScryptParameters.find((parameters) => parameters.N === N && parameters.r === r && parameters.p === p) ?? null;
}

/**
 * Parse a canonical unsigned integer without coercion.
 *
 * @param {string | undefined} value - Untrusted numeric text.
 * @returns {number | null} A safe integer or null.
 */
function parseInteger(value: string | undefined): number | null {
	if (!value || !positiveIntegerPattern.test(value)) {
		return null;
	}
	const number = Number(value);
	return Number.isSafeInteger(number) && String(number) === value ? number : null;
}

/**
 * Decode a canonical base64url field with an exact byte length.
 *
 * @param {string | undefined} value - Untrusted encoded value.
 * @param {number} expectedLength - Required decoded byte length.
 * @returns {Buffer | null} Decoded bytes or null.
 */
function decodeBase64Url(value: string | undefined, expectedLength: number): Buffer | null {
	if (!value || !encodedKeyPattern.test(value)) {
		return null;
	}
	try {
		const decoded = Buffer.from(value, 'base64url');
		return decoded.length === expectedLength && decoded.toString('base64url') === value ? decoded : null;
	} catch {
		return null;
	}
}

/**
 * Reject inputs that cannot be verified within the application password bounds.
 *
 * @param {string} password - Untrusted plaintext password.
 * @returns {boolean} Whether the password length is bounded.
 */
function isSafePasswordInput(password: string): boolean {
	return password.length <= maximumPasswordLength;
}
