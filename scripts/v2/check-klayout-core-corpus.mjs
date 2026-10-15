// KLayout external core corpus through production v2 Mask import Worker.
// Runs in parallel with the retained Legacy UI corpus until result parity is proven.
import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const root = path.resolve('_klayout/testdata');
const output = path.resolve('test-results/klayout-v2-corpus');
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173';
const expectedRejections = new Set([
  'oasis/t2.3.oas',
  'oasis/t2.5.oas',
  'oasis/t2.6.oas',
  'oasis/t3.3.oas',
  'oasis/t3.4.oas',
  'oasis/t3.6.oas',
  'oasis/t3.7.oas',
  'oasis/t3.8.oas',
  'oasis/t3.11.oas',
]);
const coreDirs = new Set(['gds', 'oasis', 'lstream']);
const isLimit = (value) => /safe (?:flatten )?limit|expands beyond the safe limit/i.test(value);
async function walk(folder) {
  const files = [];
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, item.name);
    if (item.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(?:gds|gdsii|oas|oasis)$/i.test(item.name)) files.push(full);
  }
  return files;
}
await mkdir(output, { recursive: true });
const files = (await walk(root))
  .filter((file) => coreDirs.has(path.relative(root, file).split(path.sep)[0]))
  .sort();
assert.ok(files.length > 0, 'Pinned KLayout core corpus must not be empty');
const results = [];
const errors = [];
const browser = await launchBrowser();
try {
  const { context, page } = await newUiPage(browser, {
    viewport: { width: 1440, height: 960 },
  });
  try {
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 120000,
    });
    await page.locator('[data-action="domain:mask"]').click();
    const input = page.locator('#gdsInput');
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const initial = await snapshot();
    for (const file of files) {
      const relative = path.relative(root, file).split(path.sep).join('/');
      const name = path.basename(file);
      let result = { path: relative, status: 'fail', error: null };
      try {
        // Distinguish this request from the prior import, including duplicate
        // basename fixtures. The marker is only diagnostic UI text.
        await page.evaluate(() => {
          document.querySelector('[data-slot="status.message"]').textContent =
            '__V2_IMPORT_PENDING__';
        });
        await input.setInputFiles(file);
        await page.waitForFunction(
          (expected) => {
            const status =
              document.querySelector('[data-slot="status.message"]')?.textContent || '';
            const snap = window.WaferCadV2Workstation.snapshot();
            return (
              status.startsWith('Layout import failed:') ||
              (snap.layout.name === expected && status !== '__V2_IMPORT_PENDING__')
            );
          },
          name,
          { timeout: 30000 },
        );
        const state = await snapshot();
        const status = await page.locator('[data-slot="status.message"]').textContent();
        const rejected = status.startsWith('Layout import failed:');
        result.status = expectedRejections.has(relative)
          ? rejected
            ? 'expected-reject'
            : 'unexpected-pass'
          : rejected
            ? isLimit(status)
              ? 'limit'
              : 'fail'
            : 'pass';
        if (result.status === 'pass') {
          const size = await page
            .locator('#maskCanvas')
            .evaluate((canvas) => [canvas.width, canvas.height]);
          if (!size.every((value) => value > 0)) {
            result.status = 'fail';
            result.error = 'Mask canvas is empty';
          } else if (
            state.layout.combos.length > 0 &&
            (!state.selectedLayerKeys.length ||
              !(await page.locator('#v2-maskLayerList input:checked').count()))
          ) {
            result.status = 'fail';
            result.error = 'Imported Mask layers are not selected in native v2 DOM';
          } else {
            result.layers = state.selectedLayerKeys.length;
            result.elements = state.layout.elements.length;
          }
          assert.deepEqual(state.model, initial.model, 'Layout import must not fabricate a device');
        } else if (result.status === 'fail') {
          result.error = status;
        }
      } catch (error) {
        result.status = 'fail';
        result.error = error.message;
      }
      if (result.status === 'fail' || result.status === 'unexpected-pass') {
        await page.screenshot({
          path: path.join(output, relative.replace(/[^a-z0-9_.-]+/gi, '_') + '.png'),
          fullPage: true,
        });
      }
      results.push(result);
    }
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
const counts = Object.fromEntries(
  ['pass', 'expected-reject', 'limit', 'fail', 'unexpected-pass'].map((kind) => [
    kind,
    results.filter((item) => item.status === kind).length,
  ]),
);
const summary = { corpus: 'KLayout core on v2', total: files.length, counts, errors };
await writeFile(path.join(output, 'report.json'), JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary));
for (const result of results.filter((item) => ['fail', 'unexpected-pass'].includes(item.status)))
  console.error('V2_KLAYOUT_FAIL', result.path, result.error || result.status);
if (counts.fail || counts['unexpected-pass'] || errors.length) process.exitCode = 1;
