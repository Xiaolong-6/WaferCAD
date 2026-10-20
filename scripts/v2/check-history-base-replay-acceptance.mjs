// Normal-origin scientific/transactional acceptance for Starting Wafer Step 0.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const evidence = 'test-results/pr350-history-base';
await mkdir(evidence, { recursive: true });
const browser = await launchBrowser();

async function scenario(fault) {
  const { context, page } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
  const label = fault ? 'rollback' : 'success';
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  const ready = () =>
    page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, { timeout: 120000 });
  try {
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await ready();
    assert.equal((await snap()).workflow.steps.length, 0);

    for (const suffix of ['A', 'B']) {
      const material = 'Base ' + label + ' ' + suffix;
      await page.locator('[data-action="domain:process"]').click();
      await page.locator('#operationType').selectOption('add');
      await page.locator('#operationArea').selectOption('full');
      await page.locator('#growthMode').selectOption('direct');
      await page.locator('#operationThickness').fill('0.05');
      await page.locator('#layerName').fill(material);
      await page.locator('#applyOperationBtn').click();
      await page.waitForFunction(
        (name) => {
          const state = window.WaferCadV2Workstation.snapshot();
          return !state.workflow.busy && state.model.layers.some((layer) => layer.name === name);
        },
        material,
        { timeout: 120000 },
      );
    }

    const before = await snap();
    assert.equal(before.workflow.steps.length, 2);
    assert.equal(before.workflow.branches.length, 1);
    if (fault) {
      await page.evaluate(() => {
        const post = Worker.prototype.postMessage;
        window.__baseReplayFault = { requests: 0, injected: 0 };
        Worker.prototype.postMessage = function (request, ...rest) {
          if (request?.params && request?.model) {
            window.__baseReplayFault.requests++;
            if (window.__baseReplayFault.requests === 2) {
              window.__baseReplayFault.injected++;
              throw new Error('Injected Base replay failure');
            }
          }
          return Reflect.apply(post, this, [request, ...rest]);
        };
      });
    }

    await page.locator('[data-action="domain:history"]').click();
    const stepZero = page.locator('#snapshotList .snapshot-base-step');
    await stepZero.waitFor({ state: 'visible' });
    assert.match(await stepZero.innerText(), /Step 0.*Starting Wafer/);
    await stepZero.click();
    await page.locator('#applyBaseBtn').waitFor({ state: 'visible' });
    const thickness = Number((before.model.thickness * 1.2).toFixed(5));
    await page.locator('#baseThickness').fill(String(thickness));
    await page.locator('#applyBaseBtn').click();
    await page.getByRole('button', { name: 'Replace Base & Replay', exact: true }).click();
    await page.waitForFunction(
      () =>
        /Starting Wafer replaced|Base rebuild failed/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent || '',
        ),
      null,
      { timeout: 120000 },
    );
    const after = await snap();
    if (fault) {
      assert.deepEqual(
        await page.evaluate(() => window.__baseReplayFault),
        { requests: 2, injected: 1 },
        'Second replay Worker call must fail after one successful Step',
      );
      assert.deepEqual(after.model, before.model, 'Failed replay restores exact geometry');
      assert.deepEqual(after.workflow.steps, before.workflow.steps, 'Failed replay restores Steps');
      assert.deepEqual(after.workflow.branches, before.workflow.branches);
      assert.equal(after.workflow.busy, false);
    } else {
      assert.equal(after.model.thickness, thickness);
      assert.equal(after.model.layers.length, before.model.layers.length);
      assert.equal(after.model.processRevision, before.model.processRevision);
      assert.equal(after.workflow.branches.length, 2, 'Original Main archived');
      assert.equal(
        after.workflow.steps.filter((step) => step.branchId === 'main').length,
        2,
      );
      for (const suffix of ['A', 'B']) {
        assert.ok(after.model.layers.some((layer) => layer.name === 'Base success ' + suffix));
      }
      await page.locator('[data-action="domain:history"]').click();
      await page.locator('#undoBtn').click();
      await page.waitForFunction(
        (n) => window.WaferCadV2Workstation.snapshot().model.thickness === n,
        before.model.thickness,
      );
      const undone = await snap();
      assert.deepEqual(undone.model, before.model, 'One Undo reverses entire Base replay');
      assert.deepEqual(undone.workflow.steps, before.workflow.steps);
      assert.deepEqual(undone.workflow.branches, before.workflow.branches);
      await page.locator('#redoBtn').click();
      await page.waitForFunction(
        (n) => window.WaferCadV2Workstation.snapshot().model.thickness === n,
        thickness,
      );
      const redone = await snap();
      assert.deepEqual(redone.model, after.model);
      assert.deepEqual(redone.workflow.branches, after.workflow.branches);
    }

    await page.screenshot({
      path: evidence + '/' + label + '-after-replay.png',
      animations: 'disabled',
    });
    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () => !window.WaferCadV2Workstation.snapshot().workflow.dirty,
      null,
      { timeout: 120000 },
    );
    const saved = await snap();
    await page.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
    await ready();
    const restored = await snap();
    assert.deepEqual(restored.model, saved.model, 'Save/Reload preserves physical model');
    assert.deepEqual(restored.workflow.steps, saved.workflow.steps, 'Save/Reload preserves Steps');
    assert.deepEqual(restored.workflow.branches, saved.workflow.branches);
    assert.deepEqual(errors, [], 'Uncaught page errors');
    console.log('PR350 Base replay ' + label + ': real Worker + Recovery PASS');
  } catch (error) {
    await page
      .screenshot({ path: evidence + '/' + label + '-failure.png', animations: 'disabled' })
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

try {
  await scenario(false);
  await scenario(true);
} finally {
  await browser.close();
}
