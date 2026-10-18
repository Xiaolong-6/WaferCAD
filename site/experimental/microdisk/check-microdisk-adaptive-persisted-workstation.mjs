// Native Workstation acceptance for a saved, independently openable adaptive Microdisk Variant.
// The model must originate from the generated .wafercad file, not an in-page fake geometry.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  launchBrowser,
  newUiPage,
  waitForPaint,
  waitForThreeReady,
  canvasInkFraction,
} from '../../../scripts/test-helpers/ui.mjs';
import { selectScientificView } from '../../../scripts/v2/desktop-view-selector.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4173';
const output = resolve('test-results/issue298-persisted-variant');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const { page, context } = await newUiPage(browser, {
  viewport: { width: 1560, height: 960 },
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const evidence = {
  source: 'site/experimental/microdisk/suspended-silica-microdisks-adaptive.wafercad',
  nativeV2: true,
  paperSemMatch: 'NOT_VERIFIED',
  savedVariant: 'microdisk-adaptive-72-band',
  result: 'running',
};
try {
  await page.goto(base + '/app.html?start=empty', {
    waitUntil: 'domcontentloaded',
    timeout: 180000,
  });
  await page.waitForFunction(
    () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
    null,
    { timeout: 180000 },
  );
  const bytes = await readFile(
    resolve('site/experimental/microdisk/suspended-silica-microdisks-adaptive.wafercad'),
  );
  evidence.projectSha256 = createHash('sha256').update(bytes).digest('hex');
  await page.evaluate(async (text) => {
    const { stageStartupFile } = await import('/startup-file.js');
    await stageStartupFile(
      new File([text], 'suspended-silica-microdisks-adaptive.wafercad', {
        type: 'application/json',
      }),
      'project',
    );
  }, bytes.toString('utf8'));
  await page.goto(base + '/app.html?start=staged', {
    waitUntil: 'domcontentloaded',
    timeout: 180000,
  });
  await page.waitForFunction(
    () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
    null,
    { timeout: 180000 },
  );
  assert.equal(await page.locator('html').getAttribute('data-ui'), 'v2');
  const model = await page.evaluate(async () => {
    const state = window.WaferCadV2Workstation.snapshot();
    const { sectionSlices } = await import('/model-view-geometry.js');
    return {
      revision: state.model.processRevision,
      regions: state.model.regions.length,
      sectionSlices: sectionSlices(state.model, [-175, 0], [175, 0]).length,
      layers: state.model.layers.map((layer) => layer.id),
    };
  });
  assert.equal(model.revision, 8);
  assert.equal(model.regions, 74);
  assert.ok(model.sectionSlices > 100);
  assert.deepEqual(model.layers, ['base', 'layer-1']);
  evidence.model = model;
  await selectScientificView(page, 'section', 1560);
  await waitForPaint(page);
  const ink = await canvasInkFraction(page, '#sectionCanvas');
  assert.ok(ink > 0.002, 'Persisted native Section canvas is blank');
  evidence.sectionInk = ink;
  await page.locator('#sectionPanel').screenshot({
    path: resolve(output, 'persisted-adaptive-section.png'),
    animations: 'disabled',
    timeout: 120000,
  });
  await selectScientificView(page, 'three', 1560);
  await waitForThreeReady(page, 180000);
  await page.locator('#threePanel').screenshot({
    path: resolve(output, 'persisted-adaptive-three.png'),
    animations: 'disabled',
    timeout: 120000,
  });
  assert.deepEqual(errors, [], 'Persisted adaptive Workstation raised browser exceptions');
  evidence.result = 'captured-unreviewed';
} catch (error) {
  evidence.result = 'failed';
  evidence.error = error.stack || String(error);
  evidence.browserErrors = errors;
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(evidence, null, 2) + '\n');
  await context.close();
  await browser.close();
}
