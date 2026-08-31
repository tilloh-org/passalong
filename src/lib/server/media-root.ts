import { join } from 'node:path';

const defaultMediaDirectoryName = 'media';
const mediaRootEnvironmentVariable = 'PASSALONG_MEDIA_ROOT';

let mediaRoot: string | undefined;

/**
 * Get the configured media root directory for uploaded item images.
 *
 * @returns {string} Absolute media root path.
 */
export function getMediaRoot(): string {
	if (!mediaRoot) {
		mediaRoot = process.env[mediaRootEnvironmentVariable] ?? join(process.cwd(), 'data', defaultMediaDirectoryName);
	}
	return mediaRoot;
}