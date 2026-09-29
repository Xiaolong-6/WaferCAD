import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const valueAfter = (name, fallback = null) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};

const root = path.resolve(valueAfter('--root', '_klayout/testdata'));
const reportPath = path.resolve(valueAfter('--report', 'klayout-ui-compat.json'));
const baseUrl = valueAfter('--url', 'http://127.0.0.1:4173');
const failureDir = path.resolve(valueAfter('--failure-dir', 'ui-failures'));
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

function isLimitStatus(status) {
  return /safe (?:flatten )?limit|expands beyond the safe limit/i.test(status);
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(?:gds|gdsii|oas|oasis)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function relativeFile(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

async function waitForImport(page) {
  await page.waitForFunction(
    () => {
      const text = document.getElementById('statusText')?.textContent || '';
      return text !== '__UI_IMPORT_PENDING__' && !text.startsWith('Reading ');
    },
    null,
    { timeout: 15000 },
  );
}

async function markPending(page) {
  await page.evaluate(() => {
    document.getElementById('statusText').textContent = '__UI_IMPORT_PENDING__';
  });
}

async function uiState(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('maskCanvas');
    return {
      status: document.getElementById('statusText')?.textContent || '',
      summary: document.getElementById('maskSummary')?.textContent || '',
      cells: document.querySelectorAll('#cellTree .cell-row').length,
      layers: document.querySelectorAll('#maskLayerList .layer-row').length,
      checkedLayers: document.querySelectorAll('#maskLayerList .layer-row input:checked').length,
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForFunction(
  () => (document.getElementById('statusText')?.textContent || '').startsWith('Ready'),
  null,
  { timeout: 30000 },
);
await page.locator('[data-tool-tab="mask"]').click();

const allFiles = (await walk(root)).sort();
const files = allFiles.filter((file) => coreDirs.has(relativeFile(file).split('/')[0]));
const results = [];

for (const file of files) {
  const relative = relativeFile(file);
  const priorErrors = pageErrors.length;
  let state;
  let status = 'pass';
  let error = null;

  try {
    await markPending(page);
    await page.locator('#gdsInput').setInputFiles(file);
    await waitForImport(page);
    state = await uiState(page);

    const rejected = state.status.startsWith('Layout import failed:');
    if (expectedRejections.has(relative)) {
      status = rejected ? 'expected-reject' : 'unexpected-pass';
    } else if (rejected && isLimitStatus(state.status)) {
      status = 'limit';
    } else if (rejected) {
      status = 'fail';
      error = state.status;
    } else if (state.canvasWidth <= 0 || state.canvasHeight <= 0) {
      status = 'fail';
      error = 'Mask canvas did not initialize.';
    } else if (state.layers > 0 && state.checkedLayers === 0) {
      status = 'fail';
      error = 'Imported layers were not selected in the real UI state.';
    }

    if (pageErrors.length > priorErrors) {
      status = 'fail';
      error = pageErrors.slice(priorErrors).join(' | ');
    }
  } catch (cause) {
    status = 'fail';
    error = cause instanceof Error ? cause.message : String(cause);
  }

  if (status === 'fail' || status === 'unexpected-pass') {
    await mkdir(failureDir, { recursive: true });
    const slug = relative.replace(/[^a-z0-9_.-]+/gi, '_');
    await page.screenshot({ path: path.join(failureDir, slug + '.png'), fullPage: true });
  }

  results.push({ path: relative, status, error, state });
}

const sampleResults = [];
const sampleOptions = await page
  .locator('#sampleMaskSelect option')
  .evaluateAll((options) =>
    options
      .map((option) => ({ value: option.value, label: option.textContent || '' }))
      .filter((option) => option.value),
  );

for (const sample of sampleOptions) {
  const priorErrors = pageErrors.length;
  let state;
  let status = 'pass';
  let error = null;
  try {
    await markPending(page);
    await page.locator('#sampleMaskSelect').selectOption(sample.value);
    await waitForImport(page);
    state = await uiState(page);
    if (state.status.startsWith('Layout import failed:')) {
      status = 'fail';
      error = state.status;
    } else if (state.canvasWidth <= 0 || state.canvasHeight <= 0) {
      status = 'fail';
      error = 'Mask canvas did not initialize.';
    } else if (state.layers > 0 && state.checkedLayers === 0) {
      status = 'fail';
      error = 'Sample layers were not selected.';
    }
    if (pageErrors.length > priorErrors) {
      status = 'fail';
      error = pageErrors.slice(priorErrors).join(' | ');
    }
  } catch (cause) {
    status = 'fail';
    error = cause instanceof Error ? cause.message : String(cause);
  }
  sampleResults.push({ id: sample.value, label: sample.label, status, error, state });
}

let operation = { status: 'pass', error: null };
try {
  await page.locator('[data-tool-tab="mask"]').click();
  await markPending(page);
  await page.locator('#sampleMaskSelect').selectOption('oas-rectangles');
  await waitForImport(page);
  const state = await uiState(page);
  if (!state.layers) throw new Error('Rectangle sample has no selectable layer.');
  await page.locator('[data-tool-tab="operation"]').click();
  await page.locator('#operationType').selectOption('add');
  await page.locator('#operationArea').selectOption('mask');
  await page.locator('#layerName').fill('UI import probe');
  await page.locator('#operationThickness').fill('1');
  await page.locator('#applyOperationBtn').click();
  await page.waitForFunction(
    () =>
      (document.getElementById('statusText')?.textContent || '').startsWith(
        'Added UI import probe',
      ),
    null,
    { timeout: 10000 },
  );
} catch (cause) {
  operation = { status: 'fail', error: cause instanceof Error ? cause.message : String(cause) };
  await mkdir(failureDir, { recursive: true });
  await page.screenshot({ path: path.join(failureDir, 'operation-chain.png'), fullPage: true });
}

await browser.close();

const statuses = [...results, ...sampleResults, operation];
const count = (status) => statuses.filter((item) => item.status === status).length;
const summary = {
  corpus: 'KLayout UI import compatibility',
  klayoutCommit: '5fa733e1680212e4ceda532ca5fa6ea707c654de',
  fileImports: results.length,
  bundledSampleImports: sampleResults.length,
  expectedReject: count('expected-reject'),
  limit: count('limit'),
  pass: count('pass'),
  fail: count('fail'),
  unexpectedPass: count('unexpected-pass'),
  pageErrors: pageErrors.length,
  operationChain: operation.status,
};

await writeFile(
  reportPath,
  JSON.stringify({ summary, files: results, samples: sampleResults, operation }, null, 2) + '\n',
);
console.log(JSON.stringify(summary));

for (const result of statuses.filter((item) => ['fail', 'unexpected-pass'].includes(item.status))) {
  console.log(
    `UI_FAIL\t${result.path || result.id || 'operation'}\t${result.error || result.status}`,
  );
}

if (summary.fail || summary.unexpectedPass || summary.pageErrors || operation.status !== 'pass') {
  process.exitCode = 1;
}
