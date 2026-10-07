import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { BUNDLED_EXAMPLES } from '../site/bundled-examples.js';
import {
  baseUrl,
  installPinnedThreeRoute,
  observePageErrors,
  waitForPaint,
} from './test-helpers/ui.mjs';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.WAFERCAD_CHROMIUM,
  args: ['--enable-unsafe-swiftshader'],
});
const report = [];
await mkdir(new URL('../site/examples/thumbnails/', import.meta.url), { recursive: true });
try {
  for (const example of BUNDLED_EXAMPLES) {
    const inputPath = new URL(
      '../site/' + example.previewProject.path.replace(/^\.\//, ''),
      import.meta.url,
    );
    const input = await readFile(inputPath);
    const context = await browser.newContext({
      viewport: { width: 640, height: 560 },
      deviceScaleFactor: 1,
    });
    await installPinnedThreeRoute(context);
    const page = await context.newPage(),
      errors = observePageErrors(page);
    await page.goto(
      baseUrl + '/app.html?preview=1&start=example&example=' + example.id + '&view=three',
      { waitUntil: 'domcontentloaded' },
    );
    await page.waitForFunction(
      () => document.getElementById('statusText')?.textContent.startsWith('Opened'),
      null,
      { timeout: 120000 },
    );
    await page.waitForFunction(
      () => document.getElementById('threeHost')?.dataset.renderState === 'ready',
      null,
      { timeout: 120000 },
    );
    await waitForPaint(page);
    const png = await page.screenshot();
    const webp = Buffer.from(
      await page.evaluate(async (bytes) => {
        const bitmap = await createImageBitmap(
          new Blob([Uint8Array.from(bytes)], { type: 'image/png' }),
        );
        const canvas = new globalThis.OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 });
        bitmap.close();
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      }, Array.from(png)),
    );
    assert.equal(webp.subarray(8, 12).toString(), 'WEBP');
    assert.ok(webp.length < 80000);
    const outputPath = new URL(
      '../site/' + example.preview.path.replace(/^\.\//, ''),
      import.meta.url,
    );
    await writeFile(outputPath, webp);
    assert.deepEqual(await readFile(inputPath), input);
    assert.deepEqual(errors, []);
    report.push({
      id: example.id,
      path: example.preview.path,
      view: 'three',
      width: 640,
      height: 560,
      bytes: webp.length,
      sourceSha256: createHash('sha256').update(input).digest('hex'),
      sha256: createHash('sha256').update(webp).digest('hex'),
    });
    await context.close();
  }
  await writeFile(
    new URL('../tests/fixtures/project-io/example-thumbnails.json', import.meta.url),
    JSON.stringify({ browserVersion: browser.version(), examples: report }, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
