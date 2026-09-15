import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	MAXIMUM_STAGED_ARCHIVES,
	stageArchive,
	takeStagedArchive
} from '$lib/server/import-staging';

const workspaces: string[] = [];

/**
 * Create an isolated staging directory for one test.
 *
 * @returns {string} Directory path.
 */
function stagingDirectory(): string {
	const workspace = mkdtempSync(join(tmpdir(), 'passalong-staging-'));
	workspaces.push(workspace);
	return join(workspace, 'import-staging');
}

afterEach(() => {
	for (const workspace of workspaces.splice(0)) {
		rmSync(workspace, { force: true, recursive: true });
	}
});

describe('staging area limits', () => {
	it('refuses more staged archives than the cap allows', () => {
		// arrange — the staging surface is reachable before any account exists.
		const directory = stagingDirectory();

		// act
		for (let index = 0; index < MAXIMUM_STAGED_ARCHIVES; index += 1) {
			stageArchive(Buffer.from(`archive-${index}`), directory);
		}
		const overflow = stageArchive(Buffer.from('one-too-many'), directory);

		// assume
		expect(overflow).toBeNull();
		expect(readdirSync(directory)).toHaveLength(MAXIMUM_STAGED_ARCHIVES);
	});

	it('sweeps a staged archive that was never activated', () => {
		// arrange — an operator who abandons the dialog must not leak disk forever.
		const directory = stagingDirectory();
		const token = stageArchive(Buffer.from('abandoned'), directory);
		const stale = new Date(Date.now() - 60 * 60 * 1000);
		for (const name of readdirSync(directory)) {
			utimesSync(join(directory, name), stale, stale);
		}

		// act — staging another archive sweeps what has expired.
		stageArchive(Buffer.from('fresh'), directory);

		// assume
		expect(takeStagedArchive(token as string)).toBeNull();
		expect(readdirSync(directory)).toHaveLength(1);
	});

	it('keeps a staged archive that is still within its lifetime', () => {
		// arrange
		const directory = stagingDirectory();
		const token = stageArchive(Buffer.from('still-fresh'), directory);

		// act — a second staging pass must not evict a live pending upload.
		stageArchive(Buffer.from('second'), directory);

		// assume
		expect(takeStagedArchive(token as string)?.toString()).toBe('still-fresh');
	});

	it('ignores files it did not write', () => {
		// arrange — never delete anything that is not a staged archive of this store.
		const directory = stagingDirectory();
		stageArchive(Buffer.from('archive'), directory);
		writeFileSync(join(directory, 'somebody-elses-file.txt'), 'keep me');
		const stale = new Date(Date.now() - 60 * 60 * 1000);
		for (const name of readdirSync(directory)) {
			utimesSync(join(directory, name), stale, stale);
		}

		// act
		stageArchive(Buffer.from('fresh'), directory);

		// assume
		expect(readdirSync(directory)).toContain('somebody-elses-file.txt');
	});
});
