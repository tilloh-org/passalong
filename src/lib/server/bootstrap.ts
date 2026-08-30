import type { CollectionRepository } from './collection-repository';
import { hashPassword, validatePassword } from './password';

export interface BootstrapAccount {
	tenantName: string;
	username: string;
	displayName: string;
	password: string;
	instanceAdmin: boolean;
}

export interface BootstrapConfiguration {
	accounts: BootstrapAccount[];
}

/**
 * Parse and validate the optional JSON bootstrap manifest without exposing its contents.
 *
 * @param {string | undefined} value - Raw PASSALONG_BOOTSTRAP environment value.
 * @returns {BootstrapConfiguration | null} A validated manifest, or null when it is absent.
 * @throws {Error} When the manifest is not valid structured bootstrap configuration.
 */
export function parseBootstrapConfiguration(value: string | undefined): BootstrapConfiguration | null {
	if (value === undefined || value.trim() === '') {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error('PASSALONG_BOOTSTRAP must be valid JSON.');
	}

	const manifest = requireRecord(parsed, 'PASSALONG_BOOTSTRAP must be an object.');
	if (!hasOnlyKeys(manifest, ['accounts']) || !Array.isArray(manifest.accounts)) {
		throw new Error('PASSALONG_BOOTSTRAP must contain an accounts array.');
	}

	const accounts = manifest.accounts.map(parseBootstrapAccount);
	const usernames = new Set(accounts.map((account) => account.username.trim().toLocaleLowerCase()));
	if (usernames.size !== accounts.length) {
		throw new Error('PASSALONG_BOOTSTRAP must not repeat account usernames.');
	}

	return { accounts };
}

/**
 * Hash and create validated bootstrap accounts without retaining plaintext passwords.
 *
 * @param {CollectionRepository} repository - Persistent account repository.
 * @param {BootstrapConfiguration | null} configuration - Optional validated bootstrap manifest.
 * @returns {Promise<void>} A promise that resolves after provisioning completes.
 */
export async function provisionBootstrapConfiguration(
	repository: CollectionRepository,
	configuration: BootstrapConfiguration | null
): Promise<void> {
	if (!configuration) {
		return;
	}

	for (const account of configuration.accounts) {
		validatePassword(account.password);
	}

	const accounts = await Promise.all(
		configuration.accounts.map(async (account) => ({
			tenantName: account.tenantName,
			username: account.username,
			displayName: account.displayName,
			password: account.password,
			passwordHash: await hashPassword(account.password),
			instanceAdmin: account.instanceAdmin
		}))
	);
	repository.provisionBootstrapAccounts(accounts);
}

/**
 * Parse one account entry in a bootstrap manifest.
 *
 * @param {unknown} value - Untrusted account configuration value.
 * @returns {BootstrapAccount} A validated bootstrap account.
 * @throws {Error} When the account configuration is invalid.
 */
function parseBootstrapAccount(value: unknown): BootstrapAccount {
	const account = requireRecord(value, 'Each bootstrap account must be an object.');
	if (!hasOnlyKeys(account, ['tenantName', 'username', 'displayName', 'password', 'instanceAdmin'])) {
		throw new Error('Each bootstrap account contains unsupported properties.');
	}
	if (typeof account.instanceAdmin !== 'boolean') {
		throw new Error('Each bootstrap account must declare instanceAdmin as a boolean.');
	}

	return {
		tenantName: requireNonBlankText(account.tenantName, 'Each bootstrap account requires tenantName.'),
		username: requireNonBlankText(account.username, 'Each bootstrap account requires username.'),
		displayName: requireNonBlankText(account.displayName, 'Each bootstrap account requires displayName.'),
		password: requireNonBlankText(account.password, 'Each bootstrap account requires password.'),
		instanceAdmin: account.instanceAdmin
	};
}

/**
 * Require a non-null object value that is not an array.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} message - Safe validation error message.
 * @returns {Record<string, unknown>} The object value.
 * @throws {Error} When the value is not an object.
 */
function requireRecord(value: unknown, message: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(message);
	}
	return value as Record<string, unknown>;
}

/**
 * Check that an object contains no unsupported configuration properties.
 *
 * @param {Record<string, unknown>} value - Object to inspect.
 * @param {string[]} allowedKeys - Supported property names.
 * @returns {boolean} Whether every property is supported.
 */
function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]): boolean {
	return Object.keys(value).every((key) => allowedKeys.includes(key));
}

/**
 * Require a text value containing at least one non-whitespace character.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} message - Safe validation error message.
 * @returns {string} The original text value.
 * @throws {Error} When the value is blank or not text.
 */
function requireNonBlankText(value: unknown, message: string): string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(message);
	}
	return value;
}
