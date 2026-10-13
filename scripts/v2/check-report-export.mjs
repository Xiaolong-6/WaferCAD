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
    await page.goto(`${base}/app.html?start=example&example=photodetector-literature`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 120000,
    });
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const before = await snapshot();
    assert.equal(before.workflow.steps.length, 47);
    assert.equal(before.workflow.branches.length, 7);
    await page.locator('.p-nav [data-action="domain:project"]').click();
    assert.equal(await page.locator('#projectExportMenuBtn').count(), 1);
    assert.equal(await page.locator('#exportReportBtn').isVisible(), false);
    assert.equal(
      await page.getByText('Offline HTML, Markdown and full Process History data.').count(),
      0,
    );
    const exportTrigger = page.locator('#projectExportMenuBtn');
    await exportTrigger.click();
    assert.equal(await exportTrigger.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.getByRole('menu', { name: 'Project export formats' }).count(), 1);
    assert.equal(await page.locator('#exportProjectBtn').getAttribute('role'), 'menuitem');
    await page.keyboard.press('Escape');
    assert.equal(await exportTrigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await exportTrigger.evaluate((node) => document.activeElement === node), true);
    assert.equal(await page.locator('#exportProjectBtn').isVisible(), false);
    await exportTrigger.click();
    const button = page.locator('#exportReportBtn');
    await button.waitFor({ state: 'visible' });
    assert.equal(await button.getAttribute('role'), 'menuitem');
    const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
    await button.click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /-report\.zip$/);
    assert.equal(await download.failure(), null);
    const file = await readFile(await download.path());
    const entries = zipFiles(file);
    const manifest = JSON.parse(entries.get('manifest.json'));
    const recipe = JSON.parse(entries.get('recipe.json'));
    const keyframes = JSON.parse(entries.get('keyframe-plan.json'));
    assert.equal(manifest.historyStepCount, before.workflow.steps.length);
    assert.equal(manifest.branches.length, 7);
    assert.ok(Array.isArray(recipe.steps));
    assert.ok(entries.has('index.html'));
    assert.ok(entries.has('report.md'));
    assert.ok(entries.has('history/steps-0001.json'));
    assert.ok(entries.has('history/steps-0001.html'));
    assert.ok(entries.has('assets/current-main.png') || manifest.warnings.length > 0);
    const steps = JSON.parse(entries.get('history/steps-0001.json'));
    assert.equal(steps.length, before.workflow.steps.length);
    assert.equal(steps[0].id, before.workflow.steps[0].id);
    assert.equal(manifest.keyframePlan.path, 'keyframe-plan.json');
    assert.ok(keyframes.generatedImages >= 1, 'Real saved Photodetector History must yield an SVG');
    assert.ok(keyframes.plannedImages <= keyframes.imageBudget);
    assert.ok(keyframes.generatedImages <= keyframes.imageBudget);
    assert.equal(manifest.keyframePlan.generatedImages, keyframes.generatedImages);
    assert.equal(manifest.historicalSections.length, keyframes.generatedImages);
    for (const figure of manifest.historicalSections) {
      const step = JSON.parse(entries.get('history/steps-0001.json')).find(
        (item) => item.id === figure.nodeId,
      );
      assert.ok(step?.restorable, 'SVG must be backed by a real restorable Process Step');
      assert.equal(step.processRevision, figure.processRevision);
      assert.equal(figure.evidence.sourceNodeId, figure.nodeId);
      assert.equal(figure.evidence.sourceProcessRevision, step.processRevision);
      assert.equal(figure.evidence.provenanceVerified, true);
      assert.ok(figure.evidence.pixelsPerUm > 0);
      assert.ok(figure.evidence.physicalSliceCount > 0);
      assert.ok(figure.path.startsWith('history/figures/section-step-'));
      assert.match(entries.get(figure.path), /<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    }
    assert.ok(
      keyframes.keyframes.every((item) =>
        steps.some((step) => step.id === item.nodeId && step.restorable),
      ),
    );
    assert.match(entries.get('index.html'), /historical Section figures generated/);
    assert.ok(entries.get('index.html').includes('WaferCAD / Process Report'));
    const isolatedSection = await page.evaluate(async () => {
      const { createModel } = await import('/model.js');
      const worker = new Worker('/report-history-section-worker.js');
      try {
        return await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Historical SVG worker timed out')),
            30000,
          );
          worker.onmessage = ({ data }) => {
            if (data.id !== 'isolated-section-test') return;
            if (data.type === 'error') {
              clearTimeout(timer);
              reject(new Error(data.message));
            } else if (data.type === 'done') {
              clearTimeout(timer);
              resolve(data);
            }
          };
          worker.onerror = ({ message }) => {
            clearTimeout(timer);
            reject(new Error(message));
          };
          worker.postMessage({
            id: 'isolated-section-test',
            nodeId: 'synthetic-node',
            state: {
              model: createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 }),
              section: { a: [-9, 0], b: [9, 0] },
            },
          });
        });
      } finally {
        worker.terminate();
      }
    });
    assert.equal(isolatedSection.evidence.nodeId, 'synthetic-node');
    assert.deepEqual(isolatedSection.evidence.layerIds, ['base']);
    assert.equal(isolatedSection.evidence.lineLengthUm, 18);
    assert.equal(isolatedSection.evidence.zMinUm, -5);
    assert.equal(isolatedSection.evidence.zMaxUm, 5);
    assert.equal(isolatedSection.evidence.provenanceVerified, false);
    assert.match(isolatedSection.svg, /data-layer-id="base"/);
    const after = await snapshot();
    assert.deepEqual(after.model, before.model, 'Export must not change the canonical model');
    assert.deepEqual(after.workflow.steps, before.workflow.steps, 'Export must not change History');
    const reportPage = await context.newPage();
    try {
      await reportPage.setContent(entries.get('index.html'));
      const results = reportPage.locator('#stepSearchResults li:visible');
      assert.equal(await results.count(), steps.length, 'Offline index must list all steps');
      await reportPage.locator('#stepSearch').fill('no-matching-step-7cd49281');
      assert.equal(await results.count(), 0, 'Offline search must filter locally');
      await reportPage.locator('#stepSearch').fill('');
      const variantId = steps[0].branchId;
      await reportPage.locator('#stepVariant').selectOption(variantId);
      assert.equal(
        await results.count(),
        steps.filter((step) => step.branchId === variantId).length,
        'Variant filter must preserve only matching History nodes',
      );
      assert.equal(
        await reportPage.locator('#stepSearchResults a').first().getAttribute('href'),
        'history/steps-0001.html#step-1',
      );
    } finally {
      await reportPage.close();
    }
    // Narrow screen: the same Project Export trigger must stay in view, with
    // both choices available and without adding an extra Report action.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#projectExportMenuBtn').click();
    const mobileMenu = page.getByRole('menu', { name: 'Project export formats' });
    await mobileMenu.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#exportProjectBtn').isVisible(), true);
    assert.equal(await page.locator('#exportReportBtn').isVisible(), true);
    const bounds = await mobileMenu.boundingBox();
    assert.ok(
      bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390,
      'Export menu fits viewport',
    );
    await page.keyboard.press('Escape');
    assert.equal(
      await page.locator('#projectExportMenuBtn').getAttribute('aria-expanded'),
      'false',
    );
    assert.deepEqual((await snapshot()).model, before.model, 'Menu changes no physical geometry');
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
