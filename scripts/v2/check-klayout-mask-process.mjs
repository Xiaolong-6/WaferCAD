// Production v2 Mask worker -> Process worker integration using pinned KLayout samples.
// The full external KLayout corpus remains a separate scientific acceptance owner.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/klayout-v2');
await mkdir(output, { recursive: true });
const report = { result: 'running', imports: [], process: null };
const browser = await launchBrowser();

try {
  const { context, page } = await newUiPage(browser, {
    viewport: { width: 1440, height: 960 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
      null,
      { timeout: 120000 },
    );
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const start = await snapshot();
    assert.equal(start.layout.name, 'No mask');
    const baseModel = start.model;
    await page.locator('[data-action="domain:mask"]').click();

    for (const [id, relative] of [
      ['gds-basic-instances', 'gds-basic-instances.gds'],
      ['oas-rectangles', 'oas-rectangles.oas'],
    ]) {
      const filename = fileURLToPath(
        new URL('../../site/samples/klayout/' + relative, import.meta.url),
      );
      await page.locator('#gdsInput').setInputFiles(filename);
      await page.waitForFunction(
        (expected) => {
          const instance = window.WaferCadV2Workstation;
          if (!instance?.ready) return false;
          const snap = instance.snapshot();
          return (
            snap.layout?.name === expected &&
            snap.selectedLayerKeys.length > 0 &&
            snap.activeCell != null
          );
        },
        relative,
        { timeout: 120000 },
      );
      // The persisted selection and visible checkbox state must converge
      // after the worker import, not only after switching domains.
      try {
        await page.waitForFunction(
          () => document.querySelector('#maskLayerList input:checked') !== null,
          null,
          { timeout: 6000 },
        );
      } catch {
        const diagnostic = await page.evaluate(() => {
          const list = document.getElementById('maskLayerList');
          const snap = window.WaferCadV2Workstation.snapshot();
          return {
            selectedKeys: snap.selectedLayerKeys,
            root: snap.layout.root,
            combos: snap.layout.combos?.length,
            activeCell: snap.activeCell,
            bodyDomain: document.body.dataset.domain,
            listCount: document.querySelectorAll('#maskLayerList').length,
            listConnected: list?.isConnected,
            listHtml: list?.innerHTML.slice(0, 1500),
            checkedCount: document.querySelectorAll('#maskLayerList input:checked').length,
          };
        });
        throw Error(
          'Mask browser layer checkboxes did not synchronize: ' + JSON.stringify(diagnostic),
        );
      }
      await waitForPaint(page);
      const snap = await snapshot();
      const canvas = page.locator('#maskCanvas');
      assert.ok(await canvas.isVisible(), 'Real v2 Mask canvas remains visible');
      const size = await canvas.evaluate((node) => ({ width: node.width, height: node.height }));
      assert.ok(size.width > 100 && size.height > 100, 'Mask canvas is nonempty');
      assert.equal(snap.maskSourceMode, 'file');
      assert.ok(snap.selectedLayerKeys.length > 0, 'All imported layers are initially selectable');
      assert.ok(await page.locator('#maskLayerList input:checked').count());
      assert.deepEqual(snap.model, baseModel, 'Layout import alone cannot edit the process model');
      report.imports.push({
        id,
        source: relative,
        selectedLayerCount: snap.selectedLayerKeys.length,
        activeCell: snap.activeCell,
        canvas: size,
      });
    }

    const before = await snapshot();
    await page.locator('[data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('add');
    await page.locator('#operationArea').selectOption('mask');
    await page.locator('#layerName').fill('KLayout v2 mask deposition');
    await page.locator('#operationThickness').fill('1');
    await page.locator('#applyOperationBtn').click();
    await page.waitForFunction(
      (count) => {
        const snap = window.WaferCadV2Workstation.snapshot();
        return (
          snap.workflow.steps.length === count + 1 &&
          !snap.workflow.busy &&
          snap.model.layers.some((layer) => layer.name === 'KLayout v2 mask deposition')
        );
      },
      before.workflow.steps.length,
      { timeout: 120000 },
    );
    const after = await snapshot();
    assert.equal(after.workflow.steps.length, before.workflow.steps.length + 1);
    assert.equal(after.selectedLayerKeys.length, before.selectedLayerKeys.length);
    assert.ok(after.model.layers.length > before.model.layers.length);
    assert.deepEqual(after.layout, before.layout, 'Process Apply preserves imported layout');
    assert.ok(
      after.model.layers.some((layer) => layer.name === 'KLayout v2 mask deposition'),
      'Actual masked Deposit must commit into the scientific model',
    );
    report.process = {
      type: 'add',
      area: 'mask',
      layerCount: after.model.layers.length,
      steps: after.workflow.steps.length,
    };
    assert.deepEqual(errors, [], 'KLayout import and Deposit must not throw browser errors');
    await page.screenshot({
      path: resolve(output, 'klayout-v2-mask-process.png'),
      animations: 'disabled',
    });
    report.result = 'pass';
  } finally {
    await context.close();
  }
} catch (error) {
  report.result = 'fail';
  report.error = error.stack || String(error);
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log('KLayout v2: GDS/OASIS import, selected Mask, scientific Deposit and History PASS');
