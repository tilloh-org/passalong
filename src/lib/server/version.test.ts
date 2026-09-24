import { describe, expect, it } from 'vitest';
import { buildVersionLabel, resolveCommitHash, resolveReleaseVersion } from '$lib/server/version';

describe('version label', () => {
	it('formats the label as v<release>-<short hash>', () => {
		// act
		const label = buildVersionLabel('0.3.0', '3ae0426f1b075b79f441b53b4552c1ae2d86a4ce');

		// assume
		expect(label).toBe('v0.3.0-3ae0426');
	});

	it('keeps an already-prefixed release from gaining a second v', () => {
		// act + assume
		expect(buildVersionLabel('v0.3.0', '3ae0426')).toBe('v0.3.0-3ae0426');
	});

	it('shortens a full hash to seven characters', () => {
		// act + assume
		expect(buildVersionLabel('1.0.0', 'abcdef1234567890')).toBe('v1.0.0-abcdef1');
	});

	it('falls back to a plain label when no commit is known', () => {
		// arrange — a source tarball without git metadata has no commit to show.
		// act
		const label = buildVersionLabel('0.3.0', '');

		// assume
		expect(label).toBe('v0.3.0');
	});

	it('falls back when no release version is known', () => {
		// act + assume
		expect(buildVersionLabel('', '3ae0426')).toBe('dev-3ae0426');
	});

	it('never renders an empty label', () => {
		// act + assume
		expect(buildVersionLabel('', '')).toBe('dev');
	});
});

describe('commit hash resolution', () => {
	it('prefers the injected build hash', () => {
		// act + assume
		expect(resolveCommitHash({ injected: 'abc1234', fromGit: 'zzz9999' })).toBe('abc1234');
	});

	it('falls back to git when nothing was injected', () => {
		// act + assume
		expect(resolveCommitHash({ injected: '', fromGit: 'zzz9999' })).toBe('zzz9999');
	});

	it('returns an empty string when neither source has a hash', () => {
		// act + assume
		expect(resolveCommitHash({ injected: '', fromGit: '' })).toBe('');
	});
});

describe('release version resolution', () => {
	it('reads the version from the package metadata', () => {
		// act + assume
		expect(resolveReleaseVersion({ version: '0.3.0' })).toBe('0.3.0');
	});

	it('ignores a missing or non-string version', () => {
		// act + assume
		expect(resolveReleaseVersion({})).toBe('');
		expect(resolveReleaseVersion({ version: 42 })).toBe('');
	});
});
