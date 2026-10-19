import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

/**
 * State of a maintenance window.
 */
export interface MaintenanceState {
	startedAt: string;
	reason: string;
}

/**
 * Marker file that turns a maintenance window on and off.
 *
 * The marker lives next to the database (not inside it), so a restore that replaces the database
 * keeps the window open until the restore finished.
 *
 * @param {string} databasePath - Path of the live SQLite database.
 * @returns {string} Path of the maintenance marker.
 */
export function maintenanceMarkerPath(databasePath: string): string {
	return `${databasePath}.maintenance`;
}

/**
 * Read the current maintenance window.
 *
 * @param {string} databasePath - Path of the live SQLite database.
 * @returns {MaintenanceState | null} The window, or null when the instance serves normally.
 */
export function readMaintenanceState(databasePath: string): MaintenanceState | null {
	const marker = maintenanceMarkerPath(databasePath);
	if (!existsSync(marker)) {
		return null;
	}
	try {
		const parsed = JSON.parse(readFileSync(marker, 'utf8')) as MaintenanceState;
		return typeof parsed?.startedAt === 'string' ? parsed : { startedAt: '', reason: 'unknown' };
	} catch {
		return { startedAt: '', reason: 'unknown' };
	}
}

/**
 * Open a maintenance window.
 *
 * Writing the marker twice keeps the first start time, so a second call cannot shorten an already
 * reported window.
 *
 * @param {string} databasePath - Path of the live SQLite database.
 * @param {string} reason - Short reason shown on the maintenance page.
 * @returns {MaintenanceState} The open window.
 */
export function startMaintenance(databasePath: string, reason: string): MaintenanceState {
	const existing = readMaintenanceState(databasePath);
	const state = existing ?? { startedAt: new Date().toISOString(), reason };
	writeFileSync(maintenanceMarkerPath(databasePath), JSON.stringify(state));
	return state;
}

/**
 * Close the maintenance window.
 *
 * @param {string} databasePath - Path of the live SQLite database.
 * @returns {void}
 */
export function finishMaintenance(databasePath: string): void {
	rmSync(maintenanceMarkerPath(databasePath), { force: true });
}
