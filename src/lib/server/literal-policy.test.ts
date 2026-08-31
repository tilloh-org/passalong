import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';

const formatSource = readFileSync(new URL('../utils/format.ts', import.meta.url), 'utf8');
const passwordSource = readFileSync(new URL('./password.ts', import.meta.url), 'utf8');
const repositorySource = readFileSync(new URL('./collection-repository.ts', import.meta.url), 'utf8');
const sessionTokenSource = readFileSync(new URL('./session-token.ts', import.meta.url), 'utf8');
const pageActionSource = readFileSync(new URL('../../routes/+page.server.ts', import.meta.url), 'utf8');
const resetScriptSource = readFileSync(new URL('../../../scripts/create-password-reset.ts', import.meta.url), 'utf8');
const backmergeScriptSource = readFileSync(new URL('../../../.github/scripts/backmerge.sh', import.meta.url), 'utf8');
const releaseScriptSource = readFileSync(new URL('../../../.github/scripts/release-pr.sh', import.meta.url), 'utf8');
const releaseWorkflowSource = readFileSync(new URL('../../../.github/workflows/release.yml', import.meta.url), 'utf8');
const releaseCandidateWorkflowSource = readFileSync(new URL('../../../.github/workflows/release-pr.yml', import.meta.url), 'utf8');

test('keeps security and data-format policy literals named', () => {
	// arrange
	const expectedDeclarations = [
		[formatSource, 'const centsPerEuro = 100;'],
		[formatSource, 'const priceFractionDigitCount = 2;'],
		[passwordSource, 'const positiveIntegerPattern = /^[1-9]\\d*$/;'],
		[repositorySource, 'const databaseBusyTimeoutMilliseconds = 5000;'],
		[repositorySource, 'const minimumUsernameLength = 3;'],
		[repositorySource, 'const maximumUsernameLength = 64;'],
		[repositorySource, 'const usernamePattern = new RegExp'],
		[repositorySource, 'const requestIpPattern = new RegExp'],
		[repositorySource, 'const minimumRequestIpLength = 1;'],
		[sessionTokenSource, 'const sessionTokenByteLength = 32;'],
		[pageActionSource, 'const wholeNumberPattern = /^\\d+$/;'],
		[pageActionSource, 'const sessionLifetimeDays = 30;'],
		[resetScriptSource, 'const minimumUsernameLength = 3;'],
		[resetScriptSource, 'const maximumUsernameLength = 64;'],
		[resetScriptSource, 'const usernamePattern = new RegExp'],
		[backmergeScriptSource, 'readonly CURL_RETRY_COUNT=3'],
		[backmergeScriptSource, 'readonly GITHUB_API_VERSION=2022-11-28'],
		[releaseScriptSource, 'readonly CURL_RETRY_COUNT=3'],
		[releaseScriptSource, 'readonly GITHUB_API_VERSION=2022-11-28'],
		[releaseWorkflowSource, 'readonly SEMANTIC_VERSION_TAG_PATTERN='],
		[releaseCandidateWorkflowSource, 'readonly SHORT_COMMIT_SHA_LENGTH=7']
	] as const;

	// act
	const missingDeclarations = expectedDeclarations
		.filter(([source, declaration]) => !source.includes(declaration))
		.map(([, declaration]) => declaration);
	const unnamedSingleRowWriteChecks = repositorySource.match(/result\.changes !== 1/g) ?? [];
	const unnamedSqliteBooleanChecks = repositorySource.match(/row\.instance_admin === 1/g) ?? [];

	// assume
	expect(missingDeclarations).toEqual([]);
	expect(unnamedSingleRowWriteChecks).toEqual([]);
	expect(unnamedSqliteBooleanChecks).toEqual([]);
});
