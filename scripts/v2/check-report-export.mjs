// Validate the real v2 Project report action and portable offline ZIP.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();

function zipFiles(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const result = new Map();
  let position = 0;
  while (position + 30 <= bytes.length && view.getUint32(position, true) === 0x04034b50) {
    const size = view.getUint32(position + 18, true);
    const pathLength = view.getUint16(position + 26, true);
    const extraLength = view.getUint16(position + 28, true);
    const path = decoder.decode(bytes.subarray(position + 30, position + 30 + pathLength));
    const start = position + 30 + pathLength + extraLength;
    assert.ok(start + size <= bytes.length, 'ZIP entry must fit in download');
    result.set(path, decoder.decode(bytes.subarray(start, start + size)));
    position = start + size;
  }
  assert.equal(view.getUint32(position, true), 0x02014b50, 'ZIP central directory exists');
  return result;
}

try {
  const { page, context } = await newUiPage(browser, {
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(
      `${base}/app-v2-workstation.html?start=example&example=photodetector-literature`,
      {
        waitUntil: 'domcontentloaded',
        timeout: 120000,
      },
    );
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 120000,
    });
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const before = await snapshot();
    assert.equal(before.workflow.steps.length, 46);
    assert.equal(before.workflow.branches.length, 7);
    await page.locator('.p-nav [data-action="domain:project"]').click();
    const button = page.locator('#exportReportBtn');
    await button.waitFor({ state: 'visible' });
    const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
    await button.click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /-report\.zip$/);
    assert.equal(await download.failure(), null);
    const file = await readFile(await download.path());
    const entries = zipFiles(file);
    const manifest = JSON.parse(entries.get('manifest.json'));
    const recipe = JSON.parse(entries.get('recipe.json'));
    assert.equal(manifest.historyStepCount, 46);
    assert.equal(manifest.branches.length, 7);
    assert.ok(Array.isArray(recipe.steps));
    assert.ok(entries.has('index.html'));
    assert.ok(entries.has('report.md'));
    assert.ok(entries.has('history/steps-0001.json'));
    assert.ok(entries.has('history/steps-0001.html'));
    assert.ok(entries.has('assets/current-main.png') || manifest.warnings.length > 0);
    const steps = JSON.parse(entries.get('history/steps-0001.json'));
    assert.equal(steps.length, 46);
    assert.equal(steps[0].id, before.workflow.steps[0].id);
    assert.ok(entries.get('index.html').includes('WaferCAD / Process Report'));
    const after = await snapshot();
    assert.deepEqual(after.model, before.model, 'Export must not change the canonical model');
    assert.deepEqual(
      after.workflow.steps,
      before.workflow.steps,
      'Export must not change History',
    );
    assert.deepEqual(errors, []);
    console.log(
      `Report ZIP PASS: ${manifest.historyStepCount} steps, ${manifest.branches.length} variants, ${entries.size} files`,
    );
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
