/** Real Chromium v2 full 64x64 network loading and Mask visual evidence. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from './test-helpers/ui.mjs';

const dir = resolve('test-results/swx-benes64/browser');
await mkdir(dir, { recursive: true });
const filename = resolve('test-results/swx-benes64/hu-2025-benes-64x64-topology.wafercad');
const source = JSON.parse(await readFile(filename, 'utf8'));
const browser = await launchBrowser();
const errors = [];
try {
  const { page, context } = await newUiPage(browser, {
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true,
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('crash', () => errors.push('Chromium page crashed'));
  try {
    await page.goto(
      (process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182') + '/app.html?start=empty',
      { waitUntil: 'domcontentloaded', timeout: 120000 },
    );
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 120000,
    });
    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#openProjectInput').setInputFiles(filename);
    const confirm = page.getByRole('button', { name: 'Open project', exact: true });
    if (await confirm.isVisible()) await confirm.click();
    await page.waitForFunction(
      (name) => {
        const value = window.WaferCadV2Workstation?.snapshot?.();
        return value?.projectName === name && !value.workflow?.busy;
      },
      source.name,
      { timeout: 120000 },
    );
    const snapshot = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(snapshot.layout.elements.length, 3520);
    const dock = page.locator('.p-desktop-dock-actions [data-action="dock:overview"]');
    if (await dock.count()) {
      await dock.click();
      await page.locator('[data-action="domain:mask"]').click();
    } else {
      await page.locator('[data-action="mode:single"]').click();
      await page.locator('[data-action="view:mask"]').click();
    }
    await page.locator('#maskPanel').waitFor({ state: 'visible' });
    await waitForPaint(page);
    await page.locator('#maskPanel').screenshot({
      path: resolve(dir, 'full-64x64-mask.png'),
    });
    assert.deepEqual(errors, []);
    await writeFile(
      resolve(dir, 'browser-report.json'),
      JSON.stringify(
        {
          realChromium: browser.version(),
          imported: true,
          elements: snapshot.layout.elements.length,
          switches: 352,
          shuffleLinks: 640,
          crossingMarkers: 1824,
          physicalArrayFabricationAccepted: false,
          errors,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
