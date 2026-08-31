import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createCollectionRepository } from './collection-repository';
import { parseBootstrapConfiguration, provisionBootstrapConfiguration } from './bootstrap';
import { initializeRepository } from './startup';

const temporaryDirectories: string[] = [];

/**
 * Create an isolated SQLite database path for a bootstrap test.
 *
 * @returns {string} The temporary database file path.
 */
function createDatabasePath(): string {
	const directory = mkdtempSync(join(tmpdir(), 'passalong-bootstrap-'));
	temporaryDirectories.push(directory);
	return join(directory, 'passalong.sqlite');
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe('bootstrap configuration', () => {
	it('parses a structured account manifest without altering special characters', () => {
		// arrange

		// act
		const configuration = parseBootstrapConfiguration(
			JSON.stringify({
				accounts: [
					{
						tenantName: 'Müller & Co. Household',
						username: 'avery+home',
						displayName: 'Avery "Ace" Müller',
						password: 'not-a-real-secret:$,[]{}',
						instanceAdmin: true
					}
				]
			})
		);

		// assume
		expect(configuration).toEqual({
			accounts: [
				{
					tenantName: 'Müller & Co. Household',
					username: 'avery+home',
					displayName: 'Avery "Ace" Müller',
					password: 'not-a-real-secret:$,[]{}',
					instanceAdmin: true
				}
			]
		});
	});

	it('rejects repeated usernames without exposing account passwords', () => {
		// arrange
		const password = 'bootstrap-secret-that-must-not-leak';
		let thrown: unknown;

		// act
		try {
			parseBootstrapConfiguration(
				JSON.stringify({
					accounts: [
						{
							tenantName: 'Avery household',
							username: 'Avery',
							displayName: 'Avery',
							password,
							instanceAdmin: true
						},
						{
							tenantName: 'Blake household',
							username: 'avery',
							displayName: 'Blake',
							password,
							instanceAdmin: false
						}
					]
				})
			);
		} catch (error) {
			thrown = error;
		}

		// assume
		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toBe('PASSALONG_BOOTSTRAP must not repeat account usernames.');
		expect((thrown as Error).message).not.toContain(password);
	});

	it('provisions usernames containing a supported special character without altering them', async () => {
		// arrange
		const configuration = parseBootstrapConfiguration(
			JSON.stringify({
				accounts: [
					{
						tenantName: 'Müller household',
						username: 'avery+home',
						displayName: 'Avery Müller',
						password: 'not-a-real-password-avery',
						instanceAdmin: true
					}
				]
			})
		);
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });

		// act
		await provisionBootstrapConfiguration(repository, configuration);

		// assume
		expect(repository.getBootstrapAccount('avery+home')).toMatchObject({
			username: 'avery+home',
			displayName: 'Avery Müller'
		});
	});

	it('canonicalizes tenant and display names so whitespace-padded manifests stay idempotent', async () => {
		// arrange
		const configuration = parseBootstrapConfiguration(
			JSON.stringify({
				accounts: [
					{
						tenantName: '  Avery household  ',
						username: 'avery',
						displayName: '  Avery  ',
						password: 'not-a-real-password-avery',
						instanceAdmin: true
					}
				]
			})
		);
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });

		// act
		await provisionBootstrapConfiguration(repository, configuration);
		await provisionBootstrapConfiguration(repository, configuration);

		// assume
		expect(repository.getBootstrapAccount('avery')).toMatchObject({
			tenantName: 'Avery household',
			displayName: 'Avery'
		});
	});

	it('provisions a valid manifest atomically with one instance administrator', async () => {
		// arrange
		const configuration = parseBootstrapConfiguration(
			JSON.stringify({
				accounts: [
					{
						tenantName: 'Avery household',
						username: 'avery',
						displayName: 'Avery',
						password: 'not-a-real-password-avery',
						instanceAdmin: true
					},
					{
						tenantName: 'Blake household',
						username: 'blake',
						displayName: 'Blake',
						password: 'not-a-real-password-blake',
						instanceAdmin: false
					}
				]
			})
		);
		const databasePath = createDatabasePath();

		// act
		await provisionBootstrapConfiguration(createCollectionRepository({ databasePath }), configuration);

		const database = new Database(databasePath, { readonly: true });

		// assume
		expect(database.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 2 });
		expect(database.prepare('SELECT COUNT(*) AS count FROM instance_roles').get()).toEqual({ count: 1 });
		database.close();
	});

	it('initializes provisioning before the repository is exposed to requests', async () => {
		// arrange
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });

		// act
		await initializeRepository(
			repository,
			JSON.stringify({
				accounts: [
					{
						tenantName: 'Avery household',
						username: 'avery',
						displayName: 'Avery',
						password: 'not-a-real-password-avery',
						instanceAdmin: true
					}
				]
			})
		);

		// assume
		expect(repository.hasAccounts()).toBe(true);
	});

	it('rolls back every bootstrap write when a later account insert fails', async () => {
		// arrange
		const databasePath = createDatabasePath();
		const database = new Database(databasePath);
		const repository = createCollectionRepository({ databasePath });
		database.exec(`
			CREATE TRIGGER reject_blake_bootstrap
			BEFORE INSERT ON users
			WHEN NEW.username = 'blake'
			BEGIN
				SELECT RAISE(ABORT, 'test bootstrap insert failure');
			END;
		`);
		database.close();
		const configuration = parseBootstrapConfiguration(
			JSON.stringify({
				accounts: [
					{
						tenantName: 'Avery household',
						username: 'avery',
						displayName: 'Avery',
						password: 'not-a-real-password-avery',
						instanceAdmin: true
					},
					{
						tenantName: 'Blake household',
						username: 'blake',
						displayName: 'Blake',
						password: 'not-a-real-password-blake',
						instanceAdmin: false
					}
				]
			})
		);

		// act
		const provisioning = provisionBootstrapConfiguration(repository, configuration);

		// assume
		await expect(provisioning).rejects.toThrow(
			'test bootstrap insert failure'
		);

		const unchangedDatabase = new Database(databasePath, { readonly: true });
		expect(unchangedDatabase.prepare('SELECT COUNT(*) AS count FROM tenants').get()).toEqual({ count: 0 });
		expect(unchangedDatabase.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 0 });
		expect(unchangedDatabase.prepare('SELECT COUNT(*) AS count FROM instance_roles').get()).toEqual({ count: 0 });
		unchangedDatabase.close();
	});

	it('rejects a later bootstrap manifest that would create a second instance administrator', async () => {
		// arrange
		const repository = createCollectionRepository({ databasePath: createDatabasePath() });
		const initialConfiguration = parseBootstrapConfiguration(
			JSON.stringify({
				accounts: [
					{
						tenantName: 'Avery household',
						username: 'avery',
						displayName: 'Avery',
						password: 'not-a-real-password-avery',
						instanceAdmin: true
					}
				]
			})
		);
		await provisionBootstrapConfiguration(repository, initialConfiguration);

		const secondAdministratorConfiguration = parseBootstrapConfiguration(
			JSON.stringify({
				accounts: [
					{
						tenantName: 'Blake household',
						username: 'blake',
						displayName: 'Blake',
						password: 'not-a-real-password-blake',
						instanceAdmin: true
					}
				]
			})
		);

		// act
		const secondProvisioning = provisionBootstrapConfiguration(repository, secondAdministratorConfiguration);

		// assume
		await expect(secondProvisioning).rejects.toThrow(
			'bootstrap configuration cannot create another instance administrator'
		);
		expect(repository.getBootstrapAccount('blake')).toBeNull();
	});

	it('rejects conflicts before writing any accounts and never exposes manifest passwords', async () => {
		// arrange
		const databasePath = createDatabasePath();
		const repository = createCollectionRepository({ databasePath });
		const initialConfiguration = parseBootstrapConfiguration(
			JSON.stringify({
				accounts: [
					{
						tenantName: 'Avery household',
						username: 'avery',
						displayName: 'Avery',
						password: 'not-a-real-password-avery',
						instanceAdmin: true
					}
				]
			})
		);
		await provisionBootstrapConfiguration(repository, initialConfiguration);

		const changedPassword = 'bootstrap-secret-that-must-not-leak';
		const conflictingConfiguration = parseBootstrapConfiguration(
			JSON.stringify({
				accounts: [
					{
						tenantName: 'Blake household',
						username: 'blake',
						displayName: 'Blake',
						password: 'not-a-real-password-blake',
						instanceAdmin: false
					},
					{
						tenantName: 'Avery household',
						username: 'avery',
						displayName: 'Avery',
						password: changedPassword,
						instanceAdmin: true
					}
				]
			})
		);

		let thrown: unknown;

		// act
		try {
			await provisionBootstrapConfiguration(repository, conflictingConfiguration);
		} catch (error) {
			thrown = error;
		}

		// assume
		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toBe('Bootstrap configuration conflicts with an existing account.');
		expect((thrown as Error).message).not.toContain(changedPassword);
		expect(repository.getBootstrapAccount('blake')).toBeNull();
	});
});
