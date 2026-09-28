import { describe, expect, it } from 'vitest';
import { fixtureArchive, fixtureUser } from '$lib/server/exchange-fixture.test-helper';
import { validateInstanceArchive } from '$lib/server/instance-import';
import { hashPassword } from '$lib/server/password';

describe('reported password status', () => {
	it('marks an account reset-required when its hash is foreign', async () => {
		// arrange — a foreign digest is never stored, so the report must not promise a takeover.
		const archive = fixtureArchive([
			{
				...fixtureUser({ sourceId: 'u1', username: 'avery' }),
				passwordHash: 'pbkdf2:sha256:600000$abcdef$0123456789abcdef'
			}
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.users[0].passwordResetRequired).toBe(true);
	});

	it('marks an account reset-required when it carries no hash', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.users[0].passwordResetRequired).toBe(true);
	});

	it('does not mark an account reset-required when its hash can be carried over', async () => {
		// arrange — a native hash is stored as-is, so the user keeps their password.
		const nativeHash = await hashPassword('a-known-passphrase');
		const archive = fixtureArchive([
			{ ...fixtureUser({ sourceId: 'u1', username: 'avery' }), passwordHash: nativeHash }
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.users[0].passwordResetRequired).toBe(false);
	});

	it('marks an account reset-required when it carries a malformed native hash', () => {
		// arrange — something that looks like a native hash but cannot be verified.
		const archive = fixtureArchive([
			{
				...fixtureUser({ sourceId: 'u1', username: 'avery' }),
				passwordHash: 'scrypt$v1$not-a-number$8$1$salt$key'
			}
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.users[0].passwordResetRequired).toBe(true);
	});
});
