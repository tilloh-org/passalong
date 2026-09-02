import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const outDir = 'docs/feature-development/feat-match-marktbude-look';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/data/playwright-browsers/chromium-1234/chrome-linux64/chrome',
  args: ['--no-sandbox']
});
const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
await context.addCookies([
  { name: 'passalong_session', value: 'shot-session-token', domain: 'localhost', path: '/' }
]);
const page = await context.newPage();

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=item-card]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/passalong-collection-wide.png`, fullPage: true });

const narrowContext = await browser.newContext({
  viewport: { width: 620, height: 1400 },
  storageState: await context.storageState()
});
const narrowPage = await narrowContext.newPage();
await narrowPage.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await narrowPage.waitForTimeout(300);
await narrowPage.screenshot({ path: `${outDir}/passalong-collection-narrow.png`, fullPage: false });
await narrowPage.locator('.burger').click();
await narrowPage.waitForTimeout(450);
await narrowPage.screenshot({ path: `${outDir}/passalong-burger-open.png`, fullPage: false });
await narrowContext.close();

await browser.close();
console.log('done');