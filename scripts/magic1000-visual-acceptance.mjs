// Candidate-only visual acceptance. Produces real Chromium section screenshots,
// never copies manuscript illustrations or rewrites existing visual baselines.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  baseUrl,
  installPinnedThreeRoute,
  observePageErrors,
  waitForPaint,
  canvasInkFraction,
} from './test-helpers/ui.mjs';

const browser = await chromium.launch({
  headless: true,
  ...(process.env.WAFERCAD_CHROMIUM ? { executablePath: process.env.WAFERCAD_CHROMIUM } : {}),
  args: ['--enable-unsafe-swiftshader'],
});
const out = new URL(
  '../site/examples/thumbnails/magic-1000-mos2-beol-section.webp',
  import.meta.url,
);
const reportPath = new URL('../test-results/magic1000/visual-acceptance.json', import.meta.url);
const views = {};
const writeThumbnail = process.argv.includes('--write-thumbnail');
const evidenceDir = new URL('../test-results/magic1000/', import.meta.url);
await mkdir(evidenceDir, { recursive: true });
try {
  for (const view of ['section', 'three']) {
    const context = await browser.newContext({
      viewport: { width: 920, height: 600 },
      deviceScaleFactor: 1,
    });
    await installPinnedThreeRoute(context);
    const page = await context.newPage();
    const errors = observePageErrors(page);
    await page.goto(baseUrl + '/app.html?preview=1&example=magic-1000-mos2-beol&view=' + view, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForFunction(
      (selectedView) => {
        const instance = window.WaferCadV2Workstation;
        if (document.body.dataset.ready !== 'true' || !instance?.ready) return false;
        const state = instance.snapshot();
        return (
          state.source.endsWith('examples/previews/magic-1000-mos2-beol.wafercad') &&
          state.ui.view === selectedView &&
          state.workflow.writable === false
        );
      },
      view,
      { timeout: 120000 },
    );
    const target = view === 'section' ? '#sectionCanvas' : '#threeHost';
    if (view === 'section') {
      await page.locator(target).waitFor({ state: 'visible', timeout: 120000 });
      await page.waitForFunction(
        () =>
          document.getElementById('sectionCanvas')?.width > 100 &&
          document.getElementById('sectionCanvas')?.height > 100,
        null,
        { timeout: 120000 },
      );
    } else {
      await page.waitForFunction(
        () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
        null,
        { timeout: 120000 },
      );
    }
    await waitForPaint(page);
    const ink = view === 'section' ? await canvasInkFraction(page, '#sectionCanvas') : null;
    if (view === 'section') assert.ok(ink > 0.008, 'Section canvas is blank');
    const png = await page.screenshot();
    const webp = Buffer.from(
      await page.evaluate(async (bytes) => {
        const bitmap = await createImageBitmap(
          new Blob([Uint8Array.from(bytes)], { type: 'image/png' }),
        );
        const canvas = new globalThis.OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        const result = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
        bitmap.close();
        return Array.from(new Uint8Array(await result.arrayBuffer()));
      }, Array.from(png)),
    );
    await writeFile(new URL(view + '.webp', evidenceDir), webp);
    if (view === 'section' && writeThumbnail) await writeFile(out, webp);
    views[view] = { width: 920, height: 600, inkFraction: ink, bytes: webp.length };
    assert.deepEqual(errors, [], view + ' browser errors');
    await context.close();
  }
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        pass: true,
        source: 'MAGIC-1000 paper-derived local reconstruction',
        views,
        ui: 'production v2 read-only preview',
        wrotePublishedThumbnail: writeThumbnail,
        note: 'Browser rendering established; comparison to Fig. 1e/f still requires human visual audit.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ pass: true, views }));
} finally {
  await browser.close();
}
