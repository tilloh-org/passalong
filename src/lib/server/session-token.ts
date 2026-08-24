import { randomBytes, createHash } from 'node:crypto';

/**
 * Generate an opaque, high-entropy session token for a browser cookie.
 *
 * @returns {string} A URL-safe session token.
 */
export function createSessionToken(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * Hash an opaque session token before durable storage.
 *
 * @param {string} token - The raw browser session token.
 * @returns {string} A deterministic SHA-256 token digest.
 */
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('base64url');
}
