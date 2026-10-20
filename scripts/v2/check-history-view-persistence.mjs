// Native browser acceptance for project-level appearance and inspection History invariants.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const evidence = 'test-results/pr350-history-view';
await mkdir(evidence, { recursive: true });
const browser = await launchBrowser();

const snapshot = (page) => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
const ready = (page) =>
  page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, { timeout: 120000 });

async function desktop() {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await ready(page);
    for (const label of ['View film A', 'View film B']) {
      await page.locator('[data-action="domain:process"]').click();
      await page.locator('#operationType').selectOption('add');
      await page.locator('#operationArea').selectOption('full');
      await page.locator('#operationThickness').fill('0.05');
      await page.locator('#layerName').fill(label);
      await page.locator('#applyOperationBtn').click();
      await page.waitForFunction(
        (name) => {
          const state = window.WaferCadV2Workstation.snapshot();
          return !state.workflow.busy && state.model.layers.some((layer) => layer.name === name);
        },
        label,
        { timeout: 120000 },
      );
    }

    await page.locator('#sectionPanel .v2-legend-palette-select').selectOption('warm');
    const before = await snapshot(page);
    const colors = Object.fromEntries(before.model.layers.map((layer) => [layer.id, layer.color]));
    await page.locator('#mainCanvas').hover();
    await page.mouse.wheel(0, -250);
    await page.waitForFunction(
      (zoom) => window.WaferCadV2Workstation.snapshot().planViews.main.zoom !== zoom,
      before.planViews.main.zoom,
    );
    const lastZoom = (await snapshot(page)).planViews.main.zoom;

    async function assertViewAndExistingColors() {
      const state = await snapshot(page);
      assert.equal(state.planViews.main.zoom, lastZoom, 'History must retain current zoom');
      for (const layer of state.model.layers) {
        assert.equal(layer.color, colors[layer.id], 'Existing layer must keep latest color');
      }
      return state;
    }

    await page.locator('[data-action="domain:history"]').click();
    await page.getByRole('button', { name: /^Restore Step .*View film A/ }).click();
    await page.waitForFunction(
      () =>
        !window.WaferCadV2Workstation.snapshot().model.layers.some((l) => l.name === 'View film B'),
    );
    await assertViewAndExistingColors();
    await page.getByRole('button', { name: 'Return to Variant HEAD', exact: true }).click();
    await page.waitForFunction(() =>
      window.WaferCadV2Workstation.snapshot().model.layers.some((l) => l.name === 'View film B'),
    );
    await assertViewAndExistingColors();

    await page.locator('#undoBtn').click();
    await page.waitForFunction(
      () =>
        !window.WaferCadV2Workstation.snapshot().model.layers.some((l) => l.name === 'View film B'),
    );
    await assertViewAndExistingColors();
    await page.locator('#redoBtn').click();
    await page.waitForFunction(() =>
      window.WaferCadV2Workstation.snapshot().model.layers.some((l) => l.name === 'View film B'),
    );
    const atHead = await assertViewAndExistingColors();
    await page.screenshot({ path: evidence + '/desktop-history-view.png', animations: 'disabled' });

    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () => !window.WaferCadV2Workstation.snapshot().workflow.dirty,
      null,
      { timeout: 120000 },
    );
    await page.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
    await ready(page);
    const reloaded = await snapshot(page);
    assert.equal(reloaded.planViews.main.zoom, lastZoom, 'Reload preserves latest main view zoom');
    assert.deepEqual(
      reloaded.model.layers.map(({ id, color }) => ({ id, color })),
      atHead.model.layers.map(({ id, color }) => ({ id, color })),
      'Reload preserves latest palette despite past History inspection',
    );
    console.log('PR350_HISTORY_VIEW_DESKTOP: color, zoom, restore, Undo/Redo, Save/Reload PASS');
  } catch (error) {
    await page.screenshot({ path: evidence + '/desktop-failure.png' }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

async function mobile() {
  const { page, context } = await newUiPage(browser, {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await ready(page);
    await page.locator('[data-action="domain:history"]').click();
    const zero = page.locator('#snapshotList .snapshot-base-step');
    await zero.waitFor({ state: 'visible' });
    await zero.click();
    await page.locator('#applyBaseBtn').waitFor({ state: 'visible' });
    await page.locator('[data-action="domain:process"]').click();
    const undo = page.getByRole('button', { name: 'Undo model operation' });
    const redo = page.getByRole('button', { name: 'Redo model operation' });
    assert.equal(await undo.count(), 1);
    assert.equal(await redo.count(), 1);
    assert.equal(await undo.isVisible(), true);
    assert.equal(await redo.isVisible(), true);
    await page.screenshot({ path: evidence + '/mobile-undo-step0.png', animations: 'disabled' });
    console.log('PR350_HISTORY_VIEW_MOBILE: Step 0 navigation and model Undo controls PASS');
  } catch (error) {
    await page.screenshot({ path: evidence + '/mobile-failure.png' }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

try {
  await desktop();
  await mobile();
} finally {
  await browser.close();
}
