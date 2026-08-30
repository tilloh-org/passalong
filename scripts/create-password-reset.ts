#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const resetSecretByteLength = 32;
const millisecondsPerSecond = 1000;
const secondsPerMinute = 60;
const minutesPerHour = 60;
const resetSecretLifetimeMilliseconds = minutesPerHour * secondsPerMinute * millisecondsPerSecond;
const usernamePattern = /^[a-z0-9._+-]{3,64}$/;

interface AccountScope {
	id: string;
	tenant_id: string;
}

const username = process.argv[2]?.trim().toLowerCase();
const databasePath = process.env.PASSALONG_DATABASE_PATH ?? join(process.cwd(), 'data', 'passalong.sqlite');

if (!username || !usernamePattern.test(username)) {
	console.error('Usage: node build/scripts/create-password-reset.js <username>');
	process.exitCode = 1;
} else {
	const database = new Database(databasePath);
	try {
		const account = database
			.prepare('SELECT id, tenant_id FROM users WHERE username = ?')
			.get(username) as AccountScope | undefined;
		if (!account) {
			console.error('No matching account was found.');
			process.exitCode = 1;
		} else {
			const resetSecret = randomBytes(resetSecretByteLength).toString('base64url');
			const secretHash = createHash('sha256').update(resetSecret).digest('base64url');
			const now = new Date().toISOString();
			const expiresAt = new Date(Date.now() + resetSecretLifetimeMilliseconds).toISOString();
			database.transaction(() => {
				database
					.prepare('UPDATE password_resets SET consumed_at = ? WHERE user_id = ? AND tenant_id = ? AND consumed_at IS NULL')
					.run(now, account.id, account.tenant_id);
				database
					.prepare('UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ? AND tenant_id = ?')
					.run(now, account.id, account.tenant_id);
				database
					.prepare('INSERT INTO password_resets (id, user_id, tenant_id, secret_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
					.run(randomUUID(), account.id, account.tenant_id, secretHash, expiresAt, now);
			database
					.prepare('UPDATE users SET password_reset_required = 1 WHERE id = ? AND tenant_id = ?')
					.run(account.id, account.tenant_id);
			})();
			console.log(`One-time reset secret (shown once; expires ${expiresAt}): ${resetSecret}`);
		}
	} finally {
		database.close();
	}
}
