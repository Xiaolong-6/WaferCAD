import { openMetalensUnitProject } from './project-fixtures.mjs';
// User-approved desktop review contracts, exercised through actual controls and shared model.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchBrowser, newUiPage, waitForPaint } from '../test-helpers/ui.mjs';
import { selectScientificView } from './desktop-view-selector.mjs';
const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/ui-v2-review-interactions');
await mkdir(output, { recursive: true });
const report = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  result: 'running',
  cases: [],
};
const browser = await launchBrowser();
try {
  for (const [width, hasTouch] of [
    [1440, false],
    [1024, false],
    [768, false],
    [390, false],
    [1024, true],
  ]) {
    const { page, context } = await newUiPage(browser, {
      viewport: { width, height: 960 },
      hasTouch,
    });
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await openMetalensUnitProject(page, base);
      await page.waitForFunction(() => window.WaferCadV2Workstation?.ready);
      const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
      const initial = await snapshot();
      assert.equal(initial.ui.mode, width >= 1121 ? 'overview' : 'single');
      await selectScientificView(page, 'section', width);
      await waitForPaint(page);
      const layers = page.locator('#sectionPanel [data-action="legend"]');
      const commandLayers = async () => {
        if (!(await layers.isVisible()))
          await page.getByRole('button', { name: 'Section more tools', exact: true }).click();
        await layers.click();
        await waitForPaint(page);
      };
      assert.equal(await layers.getAttribute('aria-pressed'), 'true');
      await commandLayers();
      assert.equal(await layers.getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('#layerLegend').isVisible(), false);
      await page.reload();
      await page.waitForFunction(() => window.WaferCadV2Workstation?.ready);
      await selectScientificView(page, 'section', width);
      await waitForPaint(page);
      assert.equal(await layers.getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('#layerLegend').isVisible(), false);
      assert.deepEqual((await snapshot()).model, initial.model);
      await commandLayers();
      await page.reload();
      await page.waitForFunction(() => window.WaferCadV2Workstation?.ready);
      await selectScientificView(page, 'section', width);
      await waitForPaint(page);
      assert.equal(await layers.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#layerLegend').isVisible(), true);
      // Material identity is owned by the creating Process Step. The Layers legend
      // opens that Step for editing instead of changing the live model in-place.
      const editInHistory = page.getByRole('button', {
        name: 'Edit TiO2 in History',
        exact: true,
      });
      const inspectCanvas = () =>
        page.locator('#sectionCanvas').evaluate((canvas) => ({
          width: canvas.width,
          height: canvas.height,
          png: canvas.toDataURL(),
        }));
      const normal = await inspectCanvas();
      const inspectionBefore = await snapshot();
      assert.equal(await page.getByRole('textbox', { name: 'Name for TiO2' }).count(), 0);
      await editInHistory.click();
      await page.waitForFunction(
        () =>
          document.querySelector('#applyOperationBtn')?.textContent?.trim() === 'Save edited Step',
        null,
        { timeout: 30000 },
      );
      assert.equal(
        await page.getByRole('textbox', { name: 'Name for TiO2' }).count(),
        0,
        'Layers never exposes an independent rename field',
      );
      await page.locator('[data-action="domain:history"]').click();
      await page.getByRole('button', { name: 'Cancel edit', exact: true }).click();
      await page.waitForFunction(
        () => document.querySelector('#applyOperationBtn')?.textContent !== 'Save edited Step',
      );
      if (width <= 820) {
        // A compact History editor is a real Edit workspace. Return to the
        // View dock before asking for its Section button.
        await page.locator('.p-nav [data-action="return-results"]').click();
      }
      await selectScientificView(page, 'section', width);
      await waitForPaint(page);
      assert.deepEqual(
        (await snapshot()).model,
        initial.model,
        'Cancel History editing restores the original physical model',
      );
      assert.deepEqual(
        (await snapshot()).workflow.steps,
        initial.workflow.steps,
        'Opening and cancelling History editing adds no Process Steps',
      );
      const inspectionAfter = await snapshot();
      assert.deepEqual(
        inspectionAfter.section,
        inspectionBefore.section,
        'Cancel preserves the scientific Section A–B line',
      );
      assert.deepEqual(
        inspectionAfter.planViews.section,
        inspectionBefore.planViews.section,
        'Cancel preserves the Section zoom and pan',
      );
      const restoredCanvas = await inspectCanvas();
      assert.ok(restoredCanvas.width > 0 && restoredCanvas.height > 0);
      assert.ok(restoredCanvas.png.length > 3000, 'Section still renders actual model content');
      if (restoredCanvas.width === normal.width && restoredCanvas.height === normal.height) {
        assert.equal(restoredCanvas.png, normal.png, 'Same-size Section rendering is unchanged');
      } else {
        // Compact workstation navigation changes available canvas height as
        // the tool/status panels reflow. Bytewise PNG comparison across different
        // backing dimensions is invalid even when Section geometry is unchanged.
        console.log(
          `Section canvas resized ${normal.width}x${normal.height} -> ${restoredCanvas.width}x${restoredCanvas.height}; scientific view restored`,
        );
      }
      assert.deepEqual(
        await page
          .locator('.v2-legend-row')
          .evaluateAll((rows) => rows.map((e) => getComputedStyle(e).opacity)),
        ['1', '1', '1', '1', '1'],
      );
      const checks = await page
        .locator('.v2-legend-row > input[type="checkbox"]')
        .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().right));
      assert.ok(
        Math.max(...checks) - Math.min(...checks) <= 0.25,
        'Visibility checks are right aligned',
      );
      const palette = page.getByRole('combobox', { name: 'Structure color palette', exact: true });
      await palette.selectOption('random');
      await waitForPaint(page);
      const first = (await snapshot()).model.layers.map((l) => l.color);
      // Random intentionally returns the select to a 'Randomized' placeholder
      // after the legend is reconstructed. Wait for that observable UI state
      // before issuing the second choice; an old select still set to 'random'
      // cannot dispatch a second change event.
      await page.waitForFunction(
        () => document.querySelector('.v2-legend-palette-select')?.value === 'randomized',
        null,
        { timeout: 15000 },
      );
      await palette.selectOption('random');
      await waitForPaint(page);
      assert.notDeepEqual(
        (await snapshot()).model.layers.map((l) => l.color),
        first,
        'Repeated Random regenerates colors',
      );
      const color = page.getByRole('button', { name: 'Choose color for ITO', exact: true });
      await color.click();
      assert.equal(await page.locator('.v2-legend-palette').count(), 1);
      await color.click();
      assert.equal(await page.locator('.v2-legend-palette').count(), 0);
      await color.click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.v2-legend-palette').count(), 0);
      await color.click();
      await page.locator('[data-action="fit:section"]').click();
      assert.equal(await page.locator('.v2-legend-palette').count(), 0);
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: resolve(output, `review-${width}${hasTouch ? '-touch' : ''}.png`),
      });
      report.cases.push({
        width,
        hasTouch,
        editViaHistory: true,
        cancelRestoresModelAndColors: true,
        repeatedRandom: true,
        rightAligned: true,
        layersPersistedAfterReload: true,
      });
      console.log(`Review ${width}${hasTouch ? ' touch' : ''}: PASS`);
    } finally {
      await context.close();
    }
  }
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
  try {
    await page.goto(`${base}/app.html?start=example&example=jlfet`);
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready);
    await selectScientificView(page, 'main', 1440);
    await selectScientificView(page, 'section', 1440);
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const initial = await snapshot();
    const item = initial.model.electricalRegions[0];
    const depth = page.getByRole('button', { name: `Depth profile for ${item.name}`, exact: true });
    assert.equal(await depth.getAttribute('aria-pressed'), 'false');
    assert.equal(await depth.locator('use').getAttribute('href'), '#p-icon-depthFollow');
    await depth.click();
    await waitForPaint(page);
    assert.equal(await depth.getAttribute('aria-pressed'), 'true');
    assert.equal(await depth.locator('use').getAttribute('href'), '#p-icon-depthSmooth');
    assert.equal(
      await page
        .getByRole('combobox', { name: `Depth profile for ${item.name}`, exact: true })
        .count(),
      0,
    );
    await depth.click();
    await waitForPaint(page);
    assert.equal((await snapshot()).model.electricalRegions[0].depthProfile, 'follow');
    await depth.click();
    await waitForPaint(page);
    await page.getByRole('checkbox', { name: `Show ${item.name}`, exact: true }).uncheck();
    await waitForPaint(page);
    const expected = structuredClone(initial.model);
    expected.electricalRegions[0].depthProfile = 'smooth';
    expected.electricalRegions[0].visible = false;
    expected.revision += 4;
    assert.deepEqual(
      (await snapshot()).model,
      expected,
      'Electrical controls update only their existing display properties',
    );
    report.electrical = { example: 'jlfet', smooth: true, visibility: true };
    await page.screenshot({ path: resolve(output, 'electrical.png') });
    console.log('Electrical real controls: PASS');
  } finally {
    await context.close();
  }
  report.result = 'pass';
} catch (error) {
  report.result = 'fail';
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
