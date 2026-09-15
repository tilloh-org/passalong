import { describe, expect, it } from 'vitest';
import { buildZip } from '$lib/server/backup';
import { DATA_ENTRY_NAME } from '$lib/server/exchange-format';
import { fixtureArchive, fixtureUser } from '$lib/server/exchange-fixture.test-helper';
import { validateInstanceArchive } from '$lib/server/instance-import';

describe('instance import validation', () => {
	it('reports every entity per user together with expected counts', () => {
		// arrange
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', items: 2 }),
			fixtureUser({ sourceId: 'u2', username: 'blake', items: 3 })
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors).toEqual([]);
		expect(report.users.map((user) => user.username)).toEqual(['avery', 'blake']);
		expect(report.counts.items).toBe(5);
		expect(report.counts.users).toBe(2);
		expect(report.counts.tenants).toBe(2);
		expect(report.counts.collections).toBe(2);
		expect(report.counts.marketDays).toBe(2);
		expect(report.counts.expenses).toBe(2);
	});

	it('reports the media count and confirms every checksum matches', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery', items: 2 })]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors).toEqual([]);
		expect(report.media.files).toBe(2);
		expect(report.media.checksumsMatch).toBe(true);
	});

	it('reports public stand pages that will be republished', () => {
		// arrange
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', published: true }),
			fixtureUser({ sourceId: 'u2', username: 'blake', published: false })
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.publicStandPages).toHaveLength(1);
		expect(report.publicStandPages[0].username).toBe('avery');
	});

	it('reports the password hash status of every account', () => {
		// arrange
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', passwordHash: 'native-format-value' }),
			fixtureUser({
				sourceId: 'u2',
				username: 'blake',
				passwordHash: null,
				passwordResetRequired: true
			})
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.users.map((user) => user.username)).toEqual(['avery', 'blake']);
		expect(report.users[1].passwordResetRequired).toBe(true);
	});

	it('blocks activation when two users share a normalized username', () => {
		// arrange
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'Avery' }),
			fixtureUser({ sourceId: 'u2', username: 'avery' })
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/username/i);
	});

	it('blocks activation when a source id is used twice', () => {
		// arrange
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'same', username: 'avery' }),
			fixtureUser({ sourceId: 'same', username: 'blake' })
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/duplicate/i);
	});

	it('blocks activation when an item references an unknown market day', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items[0].marketDaySourceId = 'does-not-exist';
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/market day/i);
	});

	it('blocks activation when a referenced media file is missing from the archive', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		const archive = fixtureArchive([user], { mediaFiles: [] });

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/media/i);
	});

	it('blocks activation when a media checksum does not match', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		const archive = fixtureArchive([user]);
		const tampered = Buffer.from(archive);
		const marker = Buffer.from('image-bytes');
		const offset = tampered.indexOf(marker);
		tampered[offset] = 'X'.charCodeAt(0);

		// act
		const report = validateInstanceArchive(tampered);

		// assume
		expect(report.errors.length).toBeGreaterThan(0);
	});

	it('blocks activation when the archive is not a valid backup container', () => {
		// act
		const report = validateInstanceArchive(Buffer.from('not a zip at all'));

		// assume
		expect(report.errors.length).toBeGreaterThan(0);
	});

	it('blocks activation when the manifest is missing', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		const withoutManifest = buildZip([
			[DATA_ENTRY_NAME, Buffer.from(JSON.stringify({ users: [user] }))]
		]);

		// act
		const report = validateInstanceArchive(withoutManifest);

		// assume
		expect(report.errors.length).toBeGreaterThan(0);
	});

	it('blocks activation when an item category is not supported', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items[0].category = 'spaceship';
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/category/i);
	});

	it('blocks activation when an item condition is not supported', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items[0].condition = 'pristine';
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/condition/i);
	});

	it('blocks activation when an expense category is not supported', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].expenses[0].category = 'bribes';
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/expense/i);
	});

	it('blocks activation when a price is negative', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items[0].priceCents = -1;
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/price/i);
	});

	it('blocks activation when an amount is not an integer', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].expenses[0].amountCents = 12.5;
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/amount/i);
	});

	it('blocks activation when a username is blank', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: '   ' })]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/username/i);
	});

	it('warns without blocking when a sale has no proceeds recorded', () => {
		// arrange
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		user.collections[0].items[0].saleChannel = 'flea-market';
		user.collections[0].items[0].soldAt = '2026-09-05T12:00:00.000Z';
		user.collections[0].items[0].saleProceedsCents = null;
		const archive = fixtureArchive([user]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors).toEqual([]);
		expect(report.warnings.length).toBeGreaterThan(0);
	});

	it('changes nothing on disk while validating', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]);
		const before = Buffer.from(archive);

		// act
		validateInstanceArchive(archive);

		// assume
		expect(archive.equals(before)).toBe(true);
	});
});
