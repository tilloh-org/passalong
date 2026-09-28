import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scannerPagePath = resolve(process.cwd(), 'src/routes/scan/+page.svelte');
const packagePath = resolve(process.cwd(), 'package.json');
const translationsPath = resolve(process.cwd(), 'src/lib/i18n/index.svelte.ts');

describe('seller scanner fallbacks', () => {
	it('uses a portable QR decoder with direct camera access instead of the browser-only API', () => {
		// act
		const scannerPage = readFileSync(scannerPagePath, 'utf8');
		const packageJson = readFileSync(packagePath, 'utf8');

		// assume
		expect(packageJson).toContain('"jsqr"');
		expect(scannerPage).toContain("import jsQR from 'jsqr'");
		expect(scannerPage).toContain('navigator.mediaDevices.getUserMedia');
		expect(scannerPage).toContain("facingMode: { ideal: 'environment' }");
		expect(scannerPage).toContain('await videoElement.play()');
		expect(scannerPage).not.toContain('BarcodeDetector');
	});

	it('offers a camera-friendly QR photo upload instead of direct link entry', () => {
		// act
		const scannerPage = readFileSync(scannerPagePath, 'utf8');
		const translations = readFileSync(translationsPath, 'utf8');

		// assume
		expect(scannerPage).toMatch(/type="file"[\s\S]*accept="image\/\*"[\s\S]*capture="environment"/);
		expect(scannerPage).toContain(
			'const decodedText = decodeQrFrame(image, image.naturalWidth, image.naturalHeight);'
		);
		expect(scannerPage).not.toContain('manualValue');
		expect(scannerPage).not.toContain('openManualTarget');
		expect(translations).toContain("'scan.fileTitle'");
		expect(translations).not.toContain("'scan.manualTitle'");
	});

	it('cancels a pending camera request and preserves invalid item errors from photo scans', () => {
		// act
		const scannerPage = readFileSync(scannerPagePath, 'utf8');

		// assume
		expect(scannerPage).toContain('let scannerSession = 0;');
		expect(scannerPage).toContain('scannerSession += 1;');
		expect(scannerPage).toContain(
			'const requestedStream = await navigator.mediaDevices.getUserMedia'
		);
		expect(scannerPage).toContain('if (session !== scannerSession || !videoElement)');
		expect(scannerPage).toContain('stopMediaStream(requestedStream);');
		expect(scannerPage).toContain('cameraStarting = true;\n		await stopScanner(false, true);');
		expect(scannerPage).toContain('if (!preserveStarting) {');
		expect(scannerPage).toContain('if (!decodedText) {');
		expect(scannerPage).not.toContain('if (!decodedText || !(await openDecodedItem(decodedText)))');
	});
});
