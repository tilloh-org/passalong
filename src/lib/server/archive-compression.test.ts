import { describe, expect, it } from 'vitest';
import { parseZip } from '$lib/server/backup';
import { fixtureArchive, fixtureUser } from '$lib/server/exchange-fixture.test-helper';
import { validateInstanceArchive } from '$lib/server/instance-import';

/**
 * Build a ZIP archive whose entry declares deflate compression.
 *
 * The exchange format is store-method only, so an entry that declares another method is either
 * hostile or produced by a tool this importer does not support — both have to be rejected instead
 * of being read with the wrong length.
 *
 * @param {Buffer} payload - Raw (already compressed) payload bytes.
 * @param {string} name - Entry name.
 * @param {number} declaredUncompressedSize - Size the header claims the entry expands to.
 * @returns {Buffer} Archive bytes.
 */
function deflateArchive(payload: Buffer, name: string, declaredUncompressedSize: number): Buffer {
	const nameBytes = Buffer.from(name, 'utf8');
	const local = Buffer.alloc(30);
	local.writeUInt32LE(0x04034b50, 0);
	local.writeUInt16LE(20, 4);
	local.writeUInt16LE(0, 6);
	local.writeUInt16LE(8, 8); // method 8 = deflate
	local.writeUInt32LE(0, 14);
	local.writeUInt32LE(payload.length, 18); // compressed size
	local.writeUInt32LE(declaredUncompressedSize, 22); // uncompressed size
	local.writeUInt16LE(nameBytes.length, 26);
	local.writeUInt16LE(0, 28);

	const central = Buffer.alloc(46);
	central.writeUInt32LE(0x02014b50, 0);
	central.writeUInt16LE(20, 4);
	central.writeUInt16LE(20, 6);
	central.writeUInt16LE(0, 8);
	central.writeUInt16LE(8, 10); // method 8 = deflate
	central.writeUInt32LE(payload.length, 20);
	central.writeUInt32LE(declaredUncompressedSize, 24);
	central.writeUInt16LE(nameBytes.length, 28);
	central.writeUInt32LE(30 + nameBytes.length + payload.length, 42);

	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(1, 8);
	end.writeUInt16LE(1, 10);
	const centralSize = central.length + nameBytes.length;
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(30 + nameBytes.length + payload.length, 16);

	return Buffer.concat([local, nameBytes, payload, central, nameBytes, end]);
}

describe('archive compression method', () => {
	it('refuses an entry that is not stored uncompressed', () => {
		// arrange — a deflate entry would be read as if its compressed bytes were the content.
		const archive = deflateArchive(Buffer.from('not really deflate'), 'data.json', 1024 * 1024);

		// act
		const result = validateInstanceArchive(archive);

		// assume
		expect(result.errors.join(' ')).toMatch(/compress|method|store/i);
	});

	it('reports a deflate entry through the parser instead of reading it', () => {
		// arrange
		const archive = deflateArchive(Buffer.from('payload'), 'media/bomb.bin', 50 * 1024 * 1024);

		// act + assume
		expect(() => parseZip(archive)).toThrow(/compress|method|store/i);
	});

	it('still reads a store-method archive', () => {
		// arrange — the format this project writes must keep working.
		const archive = fixtureArchive([fixtureUser({ sourceId: 'u1', username: 'avery' })]);

		// act
		const result = validateInstanceArchive(archive);

		// assume
		expect(result.errors).toEqual([]);
	});
});
