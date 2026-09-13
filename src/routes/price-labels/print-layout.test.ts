import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const priceLabelsPagePath = resolve(process.cwd(), 'src/routes/price-labels/+page.svelte');

describe('price-label print layout', () => {
	it('declares a deterministic A4 sheet with 8mm margins', () => {
		// act
		const source = readFileSync(priceLabelsPagePath, 'utf8');

		// assume
		expect(source).toMatch(/@page\s*\{\s*size:\s*A4 portrait;\s*margin:\s*8mm;\s*\}/);
		expect(source).toContain('width: 194mm;');
		expect(source).toContain('height: 281mm;');
	});

	it('places an enlarged QR code between label metadata and the price in print', () => {
		// act
		const source = readFileSync(priceLabelsPagePath, 'utf8');

		// assume
		expect(source).toMatch(
			/label-topline[\s\S]*label-qr[\s\S]*qrCodeDataUrl[\s\S]*label-bottomline[\s\S]*price/
		);
		expect(source).toMatch(/\.label-qr\s*\{[\s\S]*?flex:\s*1;/);
		expect(source).toMatch(/\.label-qr\s*\{[\s\S]*?margin:\s*2mm 1mm;/);
		expect(source).toMatch(/\.label-qr img\s*\{[\s\S]*?width:\s*min\(100%, 34mm\);/);
	});
});
