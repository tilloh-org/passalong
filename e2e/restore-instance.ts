/**
 * Account and file locations of the instance the restore proof runs on.
 *
 * The restore proof replaces the database of its instance while the server runs, so it needs an
 * instance of its own; the spec and the Playwright config share these values, and the spec writes
 * the maintenance marker next to the same database the server uses.
 */
export const restoreInstanceAccount = {
	username: 'restoreproofs',
	displayName: 'Restore proofs',
	password: 'correct-horse-battery-staple'
};

export const restoreInstancePaths = {
	database: '/tmp/passalong-e2e-restore.sqlite',
	mediaRoot: '/tmp/passalong-e2e-restore-media'
};

export const restoreInstanceMaintenanceMarker = `${restoreInstancePaths.database}.maintenance`;
