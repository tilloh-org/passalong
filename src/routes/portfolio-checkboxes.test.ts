import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('portfolio checkbox controls', () => {
	it('gives collection flags an intentional control size and semantic checked states', () => {
		// arrange
		const portfolioPagePath = resolve(process.cwd(), 'src/routes/+page.svelte');
		const appStylesPath = resolve(process.cwd(), 'src/app.css');

		// act
		const source = readFileSync(portfolioPagePath, 'utf8');
		const appStyles = readFileSync(appStylesPath, 'utf8');

		// assume
		expect(appStyles).toContain('--checkbox-checkmark: url(');
		expect(source).toMatch(
			/label\.checkbox input\[type='checkbox'\]\s*\{[\s\S]*?appearance:\s*none;[\s\S]*?background-image:\s*none;[\s\S]*?height:\s*1\.05rem;[\s\S]*?width:\s*1\.05rem;/
		);
		expect(source).toMatch(
			/label\.checkbox:has\(input\[name='isComplete'\]:checked\) input\[type='checkbox'\]\s*\{[\s\S]*?background-color:\s*var\(--color-ok\);[\s\S]*?background-image:\s*var\(--checkbox-checkmark\);/
		);
		expect(source).toMatch(
			/label\.checkbox:has\(input\[name='isFunctional'\]:checked\) input\[type='checkbox'\]\s*\{[\s\S]*?background-color:\s*var\(--color-info, #3884ff\);[\s\S]*?background-image:\s*var\(--checkbox-checkmark\);/
		);
	});
});
