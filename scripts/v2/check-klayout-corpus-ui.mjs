// Pinned KLayout full UI corpus; native v2 side-by-side with retained Legacy owner.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index < 0 ? fallback : argv[index + 1];
};
const root = path.resolve(arg('--root', '_klayout/testdata'));
const base = arg('--url', 'http://127.0.0.1:4182').replace(/\/$/, '');
const reportPath = path.resolve(arg('--report', 'klayout-v2-ui-compat.json'));
const failureDir = path.resolve(arg('--failure-dir', 'ui-failures-v2'));
const coreDirs = new Set(['gds', 'oasis', 'lstream']);
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
const isLimit = (status) => /safe (?:flatten )?limit|expands beyond the safe limit/i.test(status);
async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(file)));
    else if (/\.(?:gds|gdsii|oas|oasis)$/i.test(entry.name)) found.push(file);
  }
  return found;
}
const relative = (file) => path.relative(root, file).split(path.sep).join('/');
const allFiles = (await walk(root)).sort();
const files = allFiles.filter((file) => coreDirs.has(relative(file).split('/')[0]));
if (files.length === 0) throw Error('KLayout pinned GDS/OAS corpus is empty');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
const results = [];
try {
  await page.goto(base + '/app.html?start=empty', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
    timeout: 120000,
  });
  await page.locator('[data-action="domain:mask"]').click();
  for (const file of files) {
    const name = relative(file);
    const previousErrors = pageErrors.length;
    let state;
    let status = 'pass';
    let error = null;
    try {
      await page.evaluate(() => {
        document.querySelector('[data-slot="status.message"]').textContent = '__IMPORT_PENDING__';
      });
      await page.locator('#gdsInput').setInputFiles(file);
      await page.waitForFunction(
        () => {
          const message = document.querySelector('[data-slot="status.message"]')?.textContent || '';
          return message.startsWith('Opened ') || message.startsWith('Layout import failed:');
        },
        null,
        { timeout: 30000 },
      );
      state = await page.evaluate(() => {
        const snap = window.WaferCadV2Workstation.snapshot();
        const canvas = document.getElementById('maskCanvas');
        return {
          message: document.querySelector('[data-slot="status.message"]')?.textContent || '',
          layoutName: snap.layout.name,
          selectedLayerKeys: snap.selectedLayerKeys.length,
          layers: document.querySelectorAll('#v2-maskLayerList .layer-row').length,
          checked: document.querySelectorAll('#v2-maskLayerList input:checked').length,
          cells: document.querySelectorAll('#v2-cellTree .cell-row').length,
          canvasWidth: canvas?.width || 0,
          canvasHeight: canvas?.height || 0,
        };
      });
      const rejected = state.message.startsWith('Layout import failed:');
      if (expectedRejections.has(name)) {
        status = rejected ? 'expected-reject' : 'unexpected-pass';
      } else if (rejected && isLimit(state.message)) {
        status = 'limit';
      } else if (rejected) {
        status = 'fail';
        error = state.message;
      } else if (state.layoutName !== path.basename(file)) {
        status = 'fail';
        error = 'Real v2 layout provenance did not match the imported file';
      } else if (!state.canvasWidth || !state.canvasHeight) {
        status = 'fail';
        error = 'Actual v2 Mask canvas is empty';
      } else if (state.layers && !state.checked) {
        status = 'fail';
        error = 'Real v2 Mask Layer controls lost their checked selection';
      }
      if (pageErrors.length !== previousErrors) {
        status = 'fail';
        error = pageErrors.slice(previousErrors).join(' | ');
      }
    } catch (cause) {
      status = 'fail';
      error = cause instanceof Error ? cause.message : String(cause);
    }
    if (status === 'fail' || status === 'unexpected-pass') {
      await mkdir(failureDir, { recursive: true });
      await page.screenshot({
        path: path.join(failureDir, name.replace(/[^a-z0-9_.-]+/gi, '_') + '.png'),
        fullPage: true,
      });
    }
    results.push({ path: name, status, error, state });
  }
} finally {
  await browser.close();
}
const count = (status) => results.filter((item) => item.status === status).length;
const summary = {
  corpus: 'Native v2 full KLayout UI imports',
  klayoutCommit: '5fa733e1680212e4ceda532ca5fa6ea707c654de',
  fileImports: results.length,
  expectedReject: count('expected-reject'),
  limit: count('limit'),
  pass: count('pass'),
  fail: count('fail'),
  unexpectedPass: count('unexpected-pass'),
  pageErrors: pageErrors.length,
};
await writeFile(reportPath, JSON.stringify({ summary, files: results }, null, 2) + '\n');
console.log(JSON.stringify(summary));
for (const item of results.filter((x) => x.status === 'fail' || x.status === 'unexpected-pass'))
  console.log('UI_FAIL\t' + item.path + '\t' + (item.error || item.status));
if (summary.fail || summary.unexpectedPass || summary.pageErrors) process.exitCode = 1;
