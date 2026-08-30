import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionRepository } from '$lib/server/collection-repository';
import { hashSessionToken } from '$lib/server/session-token';

const temporaryDirectories: string[] = [];
const sessionCookieName = 'passalong_session';

/**
 * Create an isolated database path for a server-action authorization test.
 *
 * @returns {string} Empty SQLite database path.
 */
function createDatabasePath(): string {
	const directory = mkdtempSync(join(tmpdir(), 'passalong-admin-action-'));
	temporaryDirectories.push(directory);
	return join(directory, 'passalong.sqlite');
}

afterEach(() => {
	vi.resetModules();
	delete process.env.PASSALONG_DATABASE_PATH;
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe('instance-admin actions', () => {
	it('rejects reset issuance from an authenticated account without the instance-admin role', async () => {
		const databasePath = createDatabasePath();
		const repository = createCollectionRepository({ databasePath });
		repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const database = new Database(databasePath);
		database
			.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)')
			.run('member-tenant', 'Member household', '2026-01-01T00:00:00.000Z');
		database
			.prepare('INSERT INTO users (id, tenant_id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.run('member-user', 'member-tenant', 'blake', 'Blake', 'scrypt$test-salt$test-key', '2026-01-01T00:00:00.000Z');
		database.close();

		const memberScope = { userId: 'member-user', tenantId: 'member-tenant' };
		const rawSessionToken = 'authenticated-member-session-token';
		repository.createSessionForUser(memberScope, hashSessionToken(rawSessionToken));
		process.env.PASSALONG_DATABASE_PATH = databasePath;
		vi.resetModules();
		const { actions } = await import('../../routes/+page.server');
		const url = new URL('http://localhost/');
		const result = await actions.createPasswordReset({
			cookies: { get: (name: string) => (name === sessionCookieName ? rawSessionToken : undefined) },
			request: new Request(url, {
				body: new URLSearchParams({ username: 'avery' }),
				headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: url.origin },
				method: 'POST'
			}),
			url
		} as never);

		expect(result).toMatchObject({
			status: 403,
			data: { passwordResetIssueError: 'Du bist nicht für die Instanzverwaltung berechtigt.' }
		});
	});

	it('rejects cross-site reset issuance before creating a secret or revoking the target session', async () => {
		const databasePath = createDatabasePath();
		const repository = createCollectionRepository({ databasePath });
		const instanceAdministrator = repository.createInitialAdmin({
			username: 'avery',
			displayName: 'Avery',
			passwordHash: 'scrypt$test-salt$test-key'
		});
		const database = new Database(databasePath);
		database
			.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)')
			.run('member-tenant', 'Member household', '2026-01-01T00:00:00.000Z');
		database
			.prepare('INSERT INTO users (id, tenant_id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.run('member-user', 'member-tenant', 'blake', 'Blake', 'scrypt$test-salt$test-key', '2026-01-01T00:00:00.000Z');
		database.close();

		const rawAdministratorSessionToken = 'authenticated-administrator-session-token';
		const rawMemberSessionToken = 'authenticated-member-session-token';
		const memberScope = { userId: 'member-user', tenantId: 'member-tenant' };
		repository.createSessionForUser(instanceAdministrator, hashSessionToken(rawAdministratorSessionToken));
		repository.createSessionForUser(memberScope, hashSessionToken(rawMemberSessionToken));
		process.env.PASSALONG_DATABASE_PATH = databasePath;
		vi.resetModules();
		const { actions } = await import('../../routes/+page.server');
		const url = new URL('http://localhost/');
		const result = await actions.createPasswordReset({
			cookies: { get: (name: string) => (name === sessionCookieName ? rawAdministratorSessionToken : undefined) },
			request: new Request(url, {
				body: new URLSearchParams({ username: 'blake' }),
				headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://attacker.example' },
				method: 'POST'
			}),
			url
		} as never);

		expect(result).toMatchObject({ status: 403, data: { csrfError: 'Diese Anfrage konnte nicht sicher verarbeitet werden.' } });
		expect(repository.getSession(hashSessionToken(rawMemberSessionToken))).toEqual(memberScope);
		const readonlyDatabase = new Database(databasePath, { readonly: true });
		expect(readonlyDatabase.prepare('SELECT COUNT(*) AS count FROM password_resets').get()).toEqual({ count: 0 });
		readonlyDatabase.close();
	});
});
