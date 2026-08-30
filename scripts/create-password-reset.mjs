#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const username = process.argv[2]?.trim().toLowerCase();
const databasePath = process.env.PASSALONG_DATABASE_PATH ?? join(process.cwd(), 'data', 'passalong.sqlite');

if (!username || !/^[a-z0-9._+-]{3,64}$/.test(username)) {
	console.error('Usage: node scripts/create-password-reset.mjs <username>');
	process.exitCode = 1;
} else {
	const database = new Database(databasePath);
	try {
		const account = database
			.prepare('SELECT id, tenant_id FROM users WHERE username = ?')
			.get(username);
		if (!account) {
			console.error('No matching account was found.');
			process.exitCode = 1;
		} else {
			const resetSecret = randomBytes(32).toString('base64url');
			const secretHash = createHash('sha256').update(resetSecret).digest('base64url');
			const now = new Date().toISOString();
			const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
			database.transaction(() => {
				database
					.prepare('UPDATE password_resets SET consumed_at = ? WHERE user_id = ? AND tenant_id = ? AND consumed_at IS NULL')
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
