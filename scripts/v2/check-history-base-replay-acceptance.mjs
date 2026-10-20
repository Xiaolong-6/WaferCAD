// PR #350: browser-origin Base replay is a physical, History and Recovery transaction.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const evidence = 'test-results/pr350-history-base';
await mkdir(evidence, { recursive: true });

const browser = await launchBrowser();

async function runScenario({ injectFailure = false } = {}) {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const snap = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
  const waitReady = () =>
    page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, { timeout: 120000 });
  const name = injectFailure ? 'rollback' : 'success';
  try {
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await waitReady();
    const first = await snap();
    assert.equal(first.workflow.steps.length, 0);

    for (const layerName of [`Base ${name} A`, `Base ${name} B`]) {
      await page.locator('[data-action="domain:process"]').click();
      await page.locator('#operationType').selectOption('add');
      await page.locator('#operationArea').selectOption('full');
      await page.locator('#growthMode').selectOption('direct');
      await page.locator('#operationThickness').fill('0.05');
      await page.locator('#layerName').fill(layerName);
      await page.locator('#applyOperationBtn').click();
      await page.waitForFunction(
        (expected) => {
          const snapshot = window.WaferCadV2Workstation.snapshot();
          return (
            !snapshot.workflow.busy &&
            snapshot.model.layers.some((layer) => layer.name === expected)
          );
        },
        layerName,
        { timeout: 120000 },
      );
    }
    const original = await snap();
    assert.equal(original.workflow.steps.length, 2);
    assert.equal(original.workflow.branches.length, 1);

    if (injectFailure) {
      await page.evaluate(() => {
        const nativePost = Worker.prototype.postMessage;
        window.__baseReplayFault = { requests: 0, injected: 0 };
        Worker.prototype.postMessage = function (request, ...rest) {
          if (request?.params && request?.model) {
            window.__baseReplayFault.requests++;
            if (window.__baseReplayFault.requests === 2) {
              window.__baseReplayFault.injected++;
              throw new Error('injected Base replay Worker failure');
            }
          }
          return Reflect.apply(nativePost, this, [request, ...rest]);
        };
      });
    }

    await page.locator('[data-action="domain:history"]').click();
    const stepZero = page.locator('#snapshotList .snapshot-base-step');
    await stepZero.waitFor({ state: 'visible', timeout: 15000 });
    assert.match(await stepZero.innerText(), /Step 0.*Starting Wafer/);
    await stepZero.click();
    await page.locator('#applyBaseBtn').waitFor({ state: 'visible' });
    const nextThickness = Number((original.model.thickness * 1.2).toFixed(5));
    await page.locator('#baseThickness').fill(String(nextThickness));
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
    if (injectFailure) {
      assert.match(
        await page.locator('[data-slot="status.message"]').innerText(),
        /Base rebuild failed/,
      );
      assert.deepEqual(
        await page.evaluate(() => window.__baseReplayFault),
        { requests: 2, injected: 1 },
        'The real Worker must fail only after one downstream Step was replayed',
      );
      assert.deepEqual(after.model, original.model, 'Failed Base replay restores all geometry');
      assert.deepEqual(
        after.workflow.steps,
        original.workflow.steps,
        'Failed replay preserves Steps',
      );
      assert.deepEqual(
        after.workflow.branches,
        original.workflow.branches,
        'Failed replay preserves branch topology and HEAD',
      );
      assert.equal(after.workflow.busy, false, 'Failed replay releases Process busy state');
    } else {
      assert.equal(after.model.thickness, nextThickness);
      assert.equal(after.model.layers.length, original.model.layers.length);
      assert.equal(after.model.processRevision, original.model.processRevision);
      assert.equal(after.workflow.branches.length, 2, 'Previous Main must be archived');
      assert.equal(
        after.workflow.steps.filter((step) => step.branchId === 'main').length,
        2,
        'Every Process Step must replay on the new Base',
      );
      assert.ok(after.model.layers.some((layer) => layer.name === 'Base success A'));
      assert.ok(after.model.layers.some((layer) => layer.name === 'Base success B'));

      await page.locator('[data-action="domain:history"]').click();
      await page.locator('#undoBtn').click();
      await page.waitForFunction(
        (oldThickness) => window.WaferCadV2Workstation.snapshot().model.thickness === oldThickness,
        original.model.thickness,
      );
      const undone = await snap();
      assert.deepEqual(
        undone.model,
        original.model,
        'One Undo reverts the entire Base replacement',
      );
      assert.deepEqual(undone.workflow.steps, original.workflow.steps);
      assert.deepEqual(undone.workflow.branches, original.workflow.branches);

      await page.locator('#redoBtn').click();
      await page.waitForFunction(
        (expected) => window.WaferCadV2Workstation.snapshot().model.thickness === expected,
        nextThickness,
      );
      const redone = await snap();
      assert.deepEqual(redone.model, after.model, 'Redo restores exact new-base geometry');
      assert.deepEqual(redone.workflow.branches, after.workflow.branches);
    }

    await page.screenshot({ path: `${evidence}/${name}-after-replay.png`, animations: 'disabled' });
    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () => !window.WaferCadV2Workstation.snapshot().workflow.dirty,
      null,
      { timeout: 120000 },
    );
    const saved = await snap();
    await page.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
    await waitReady();
    const reloaded = await snap();
    assert.deepEqual(reloaded.model, saved.model, 'Reload preserves the committed Base/geometry');
    assert.deepEqual(
      reloaded.workflow.steps,
      saved.workflow.steps,
      'Reload preserves Step topology',
    );
    assert.deepEqual(
      reloaded.workflow.branches,
      saved.workflow.branches,
      'Reload preserves Variants',
    );
    assert.deepEqual(errors, [], 'No page JavaScript exceptions');
    console.log(
      `PR350_BASE_REPLAY_${name.toUpperCase()}: real Worker, Undo/Redo, Save/Reload PASS`,
    );
  } catch (error) {
    await page
      .screenshot({ path: `${evidence}/${name}-failure.png`, animations: 'disabled' })
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

try {
  await runScenario();
  await runScenario({ injectFailure: true });
} finally {
  await browser.close();
}
