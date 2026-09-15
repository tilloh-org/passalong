import { describe, expect, it } from 'vitest';
import { fixtureArchive, fixtureUser } from '$lib/server/exchange-fixture.test-helper';
import { validateInstanceArchive } from '$lib/server/instance-import';

describe('manifest coverage', () => {
	it('refuses a media file that the data references but the manifest does not cover', () => {
		// arrange — an uncovered file would be copied without any checksum having been verified.
		const user = fixtureUser({ sourceId: 'u1', username: 'avery' });
		const archive = fixtureArchive([user], {
			omitMediaFromManifest: [`media/u1/photo-1.jpg`]
		});

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/manifest/i);
		expect(report.media.checksumsMatch).toBe(false);
	});

	it('accepts an archive whose manifest covers every media file it references', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors).toEqual([]);
		expect(report.media.checksumsMatch).toBe(true);
		expect(report.media.files).toBe(1);
	});

	it('refuses a manifest whose media file count disagrees with the content', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })], {
			mediaFileCount: 5
		});

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/media/i);
	});

	it('refuses a manifest whose media byte total disagrees with the content', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })], {
			mediaBytesTotal: 999_999
		});

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/media/i);
	});

	it('refuses a manifest whose expense count disagrees with the content', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })], {
			expenseCount: 7
		});

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/expense/i);
	});

	it('refuses a manifest whose market day count disagrees with the content', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })], {
			marketDayCount: 9
		});

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/market day/i);
	});

	it('refuses a manifest whose item count disagrees with the content', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })], {
			itemCount: 4
		});

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/item/i);
	});

	it('refuses a manifest whose user count disagrees with the content', () => {
		// arrange
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })], {
			userCount: 3
		});

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/user/i);
	});

	it('counts sold items in the report instead of always reporting zero', () => {
		// arrange — the fixture now really sells one of two items; the count must reflect that.
		const archive = fixtureArchive([
			fixtureUser({ sourceId: 'u1', username: 'avery', items: 2, soldItems: 1 })
		]);

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors).toEqual([]);
		expect(report.counts.sales).toBe(1);
		expect(report.users[0].sales).toBe(1);
	});

	it('reports a sales count that disagrees with the content', () => {
		// arrange — the fixture sells nothing, so a declared sale is a mismatch.
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })], {
			salesCount: 2
		});

		// act
		const report = validateInstanceArchive(archive);

		// assume
		expect(report.errors.join(' ')).toMatch(/sale/i);
	});
});
