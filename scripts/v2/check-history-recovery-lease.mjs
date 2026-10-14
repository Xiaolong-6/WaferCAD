// Production v2 transaction boundary: undo/redo, autosave and competing tab lease.
import assert from 'node:assert/strict';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 900 } });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/app.html?start=empty');
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 120000,
    });
    const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const initial = await snap();
    assert.equal(initial.workflow.steps.length, 0);
    assert.equal(initial.workflow.writable, true);

    await page.locator('[data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('add');
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#layerName').fill('Recovery transaction film');
    await page.locator('#operationThickness').fill('0.25');
    await page.locator('#applyOperationBtn').click();
    await page.waitForFunction(
      () =>
        window.WaferCadV2Workstation.snapshot().workflow.steps.length === 1 &&
        !window.WaferCadV2Workstation.snapshot().workflow.busy,
      null,
      { timeout: 120000 },
    );
    const committed = await snap();
    assert.equal(committed.model.layers.length, initial.model.layers.length + 1);
    assert.equal(committed.workflow.steps.length, 1);

    await page.locator('[data-action="domain:history"]').click();
    await page.locator('#undoBtn').click();
    await page.waitForFunction(
      (length) => window.WaferCadV2Workstation.snapshot().model.layers.length === length,
      initial.model.layers.length,
    );
    assert.deepEqual((await snap()).model, initial.model, 'Undo restores original physical geometry');
    await page.locator('#redoBtn').click();
    await page.waitForFunction(
      (length) => window.WaferCadV2Workstation.snapshot().model.layers.length === length,
      committed.model.layers.length,
    );
    assert.deepEqual((await snap()).model, committed.model, 'Redo replays exact same physical geometry');

    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#projectNameInput').fill('Recovery transaction owner');
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.dirty, null, {
      timeout: 120000,
    });

    const second = await context.newPage();
    second.on('pageerror', (error) => errors.push(error.message));
    try {
      await second.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
      await second.waitForFunction(() => document.body.dataset.ready === 'true', null, {
        timeout: 120000,
      });
      const contender = await second.evaluate(() => window.WaferCadV2Workstation.snapshot());
      assert.equal(contender.workflow.writable, false, 'Competing tab cannot silently steal writer');
      assert.deepEqual(contender.model, committed.model);
      // Non-owner attempts must never clobber the persisted authoritative geometry.
      await page.waitForFunction(
        () => !window.WaferCadV2Workstation.snapshot().workflow.dirty,
      );
      const stored = await second.evaluate(async () => {
        const { loadWorkspaceState } = await import('/workspace-persistence.js');
        const data = await loadWorkspaceState();
        return { model: data.model, name: data.name };
      });
      assert.deepEqual(stored.model, committed.model);
      assert.equal(stored.name, 'Recovery transaction owner');
    } finally {
      await second.close();
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, {
      timeout: 120000,
    });
    const recovered = await snap();
    assert.deepEqual(recovered.model, committed.model, 'Reload restores exact committed geometry');
    assert.equal(recovered.workflow.steps.length, 1, 'Reload restores logical History');
    assert.equal(recovered.projectName, 'Recovery transaction owner');
    assert.deepEqual(errors, []);
    console.log('v2 History/Recovery: Undo, Redo, save, concurrent lease and reload PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
