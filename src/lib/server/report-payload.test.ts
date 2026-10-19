import { expect, it } from 'vitest';
import { fixtureArchive, fixtureUser } from '$lib/server/exchange-fixture.test-helper';
import { hashPassword } from '$lib/server/password';
import { validateInstanceArchive } from '$lib/server/instance-import';

it('never exposes stored password hashes in a report that reaches the browser', async () => {
	// arrange — a native hash that WOULD be carried over, so its presence would be a real leak.
	const nativeHash = await hashPassword('a-known-passphrase');
	const archive = fixtureArchive([
		{
			...fixtureUser({ sourceId: 'u1', username: 'avery' }),
			passwordHash: nativeHash
		}
	]);

	// act
	const report = validateInstanceArchive(archive);

	// assume — the serialized report must not contain the hash anywhere.
	const serialized = JSON.stringify(report);
	expect(report.errors).toEqual([]);
	expect(serialized).not.toContain(nativeHash);
	expect(serialized).not.toContain('scrypt');
	expect(serialized).not.toContain('passwordHash');
});

it('keeps the logical data out of the report entirely', async () => {
	// arrange
	const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]);

	// act
	const report = validateInstanceArchive(archive);

	// assume — activation reads the archive again; the report is a summary, not a data carrier.
	expect(Object.keys(report)).not.toContain('data');
});

it('still reports what the operator needs to decide', () => {
	// arrange
	const archive = fixtureArchive([
		fixtureUser({ sourceId: 'u1', username: 'avery', items: 2, published: true }),
		fixtureUser({ sourceId: 'u2', username: 'blake', items: 1 })
	]);

	// act
	const report = validateInstanceArchive(archive);

	// assume
	expect(report.users.map((user) => user.username)).toEqual(['avery', 'blake']);
	expect(report.users[0].items).toBe(2);
	expect(report.users[0].images).toBe(2);
	expect(report.counts.items).toBe(3);
	expect(report.media.files).toBe(3);
	expect(report.publicStandPages).toHaveLength(1);
});
