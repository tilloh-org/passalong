import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	finishMaintenance,
	maintenanceMarkerPath,
	readMaintenanceState,
	startMaintenance
} from '$lib/server/maintenance';

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories) {
		rmSync(directory, { force: true, recursive: true });
	}
	temporaryDirectories.length = 0;
});

describe('instance maintenance window', () => {
	it('opens a window beside the database, reports it and closes it again', () => {
		// arrange
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-maintenance-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');

		// assume — a fresh instance serves normally
		expect(readMaintenanceState(databasePath)).toBeNull();

		// act
		const opened = startMaintenance(databasePath, 'restore');

		// assume — the marker sits next to the database and carries the reason
		expect(maintenanceMarkerPath(databasePath)).toBe(`${databasePath}.maintenance`);
		expect(existsSync(maintenanceMarkerPath(databasePath))).toBe(true);
		expect(opened.reason).toBe('restore');
		expect(readMaintenanceState(databasePath)).toMatchObject({ reason: 'restore' });

		// act — a second window keeps the first start time
		const reopened = startMaintenance(databasePath, 'another reason');
		expect(reopened.startedAt).toBe(opened.startedAt);
		expect(reopened.reason).toBe('restore');

		// act
		finishMaintenance(databasePath);

		// assume
		expect(readMaintenanceState(databasePath)).toBeNull();
		expect(existsSync(maintenanceMarkerPath(databasePath))).toBe(false);
	});

	it('keeps the instance closed when the marker cannot be read', () => {
		// arrange — a truncated marker file
		const workspace = mkdtempSync(join(tmpdir(), 'passalong-maintenance-'));
		temporaryDirectories.push(workspace);
		const databasePath = join(workspace, 'app.sqlite');
		writeFileSync(maintenanceMarkerPath(databasePath), 'not json');

		// act
		const state = readMaintenanceState(databasePath);

		// assume — an unreadable marker still closes the instance instead of opening it
		expect(state).toMatchObject({ reason: 'unknown' });
	});
});
