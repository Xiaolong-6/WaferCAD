// Native-v2 long-session interaction: Draw/File source switch -> Process Worker ->
// physical selected-mask geometry -> History -> project reload. Retain Legacy suite.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const output = resolve('test-results/pr290-draw-process-interaction');
await mkdir(output, { recursive: true });
const report = { result: 'running', errors: [] };
const browser = await launchBrowser();

try {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
  try {
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.body.dataset.ready === 'true' && window.WaferCadV2Workstation?.ready,
      null,
      { timeout: 120000 },
    );
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const initial = await snapshot();
    assert.equal(initial.workflow.steps.length, 0);

    await page.locator('.p-nav [data-action="domain:mask"]').click();
    await page.locator('#maskPanel [data-action="draw-toggle"]').click();
    await page.locator('#maskPanel [data-action="draw-tool:rect"]').click();
    const bounds = await page.locator('#maskCanvas').boundingBox();
    assert.ok(bounds?.width > 100 && bounds?.height > 100, 'real Mask canvas available');
    const xy = (fx, fy) => [bounds.x + bounds.width * fx, bounds.y + bounds.height * fy];
    await page.mouse.move(...xy(0.45, 0.45));
    await page.mouse.down();
    await page.mouse.move(...xy(0.55, 0.55), { steps: 10 });
    await page.mouse.up();
    await page.waitForFunction(
      () => window.WaferCadV2Workstation.snapshot().drawMask.shapes.length === 1,
      null,
      { timeout: 10000 },
    );
    const drawn = await snapshot();
    const shape = drawn.drawMask.shapes[0];
    assert.equal(shape.type, 'rect');
    assert.equal(drawn.maskSourceMode, 'draw');
    assert.deepEqual(drawn.model, initial.model, 'drawing must not alter physical material');
    assert.deepEqual(drawn.workflow.steps, initial.workflow.steps);
    await page.screenshot({ path: resolve(output, 'drawn-rect.png') });

    // Source switching must preserve the edited Draw geometry and its stable ID.
    await page.locator('.p-mask-source-controls [data-action="mask-source:file"]').click();
    await page.waitForFunction(
      () => window.WaferCadV2Workstation.snapshot().maskSourceMode === 'file',
    );
    assert.deepEqual((await snapshot()).drawMask, drawn.drawMask);
    assert.deepEqual((await snapshot()).model, initial.model);
    await page.locator('.p-mask-source-controls [data-action="mask-source:draw"]').click();
    await page.waitForFunction(
      () => window.WaferCadV2Workstation.snapshot().maskSourceMode === 'draw',
    );
    assert.deepEqual((await snapshot()).drawMask, drawn.drawMask);

    // The actual v2 Process Worker must consume the selected Draw source.
    await page.locator('.p-nav [data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('add');
    await page.locator('#operationArea').selectOption('mask');
    await page.locator('#faceToggleBtn').selectOption('front');
    await page.locator('#layerName').fill('Draw-selected process film');
    await page.locator('#operationThickness').fill('0.125');
    await page.locator('#applyOperationBtn').click();
    const branch = page.getByRole('button', { name: 'Create Variant & apply', exact: true });
    if (await branch.isVisible()) await branch.click();
    await page.waitForFunction(
      () => window.WaferCadV2Workstation.snapshot().model.layers.some(
        (layer) => layer.name === 'Draw-selected process film',
      ),
      null,
      { timeout: 120000 },
    );
    await page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.busy);
    const deposited = await snapshot();
    const layer = deposited.model.layers.find(
      (entry) => entry.name === 'Draw-selected process film',
    );
    const step = deposited.workflow.steps.at(-1);
    assert.ok(layer?.id, 'actual Process Worker committed the named film');
    assert.equal(deposited.workflow.steps.length, initial.workflow.steps.length + 1);
    assert.equal(step.operation?.maskSourceMode, 'draw');
    assert.equal(step.operation?.replay?.maskContext?.sourceMode, 'draw');
    assert.equal(step.operation?.replay?.maskContext?.shapeCount, drawn.drawMask.shapes.length);
    assert.deepEqual(deposited.drawMask, drawn.drawMask);

    const coverage = await page.evaluate(async ({ layerId, rect }) => {
      const { geometryArea } = await import('./model.js');
      const { pointInMulti } = await import('./vector-geometry.js');
      const model = window.WaferCadV2Workstation.snapshot().model;
      const regions = model.regions.filter((region) =>
        region.stack.some((segment) => segment.layerId === layerId),
      );
      const center = [(rect.a[0] + rect.b[0]) / 2, (rect.a[1] + rect.b[1]) / 2];
      const side = [rect.b[0] + (rect.b[0] - rect.a[0]), center[1]];
      return {
        area: regions.reduce((sum, region) => sum + geometryArea(region.geom), 0),
        thicknesses: regions.flatMap((region) =>
          region.stack.filter((segment) => segment.layerId === layerId)
            .map((segment) => segment.z1 - segment.z0),
        ),
        centerCovered: regions.some((region) => pointInMulti(center, region.geom)),
        outsideCovered: regions.some((region) => pointInMulti(side, region.geom)),
        baseAtOutside: model.regions.some((region) => pointInMulti(side, region.geom)),
      };
    }, { layerId: layer.id, rect: shape });
    assert.ok(coverage.area > 0, 'Draw geometry created actual material area');
    assert.ok(coverage.thicknesses.length > 0, 'physical layer has thickness spans');
    assert.ok(coverage.thicknesses.every((t) => Math.abs(t - 0.125) < 1e-12));
    assert.equal(coverage.centerCovered, true, 'inside Draw rectangle must be deposited');
    assert.equal(coverage.baseAtOutside, true, 'outside test point remains on physical wafer');
    assert.equal(coverage.outsideCovered, false, 'outside Draw rectangle remains untouched');
    report.coverage = coverage;
    await page.screenshot({ path: resolve(output, 'after-selected-mask-deposition.png') });

    await page.locator('.p-nav [data-action="domain:project"]').click();
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () => /Saved/.test(document.querySelector('[data-slot="status.message"]')?.textContent || ''),
      null,
      { timeout: 120000 },
    );
    const committed = await snapshot();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const restored = await snapshot();
    assert.deepEqual(restored.model, committed.model, 'Recovery retains physical deposition');
    assert.deepEqual(restored.drawMask, committed.drawMask, 'Recovery retains Draw shape and ID');
    assert.deepEqual(restored.workflow.steps, committed.workflow.steps, 'Recovery retains History');
    assert.equal(restored.maskSourceMode, 'draw');
    assert.deepEqual(report.errors, []);
    report.result = 'pass';
    console.log('PR290 native Draw/File -> Process -> History/Recovery science: PASS');
  } finally {
    await context.close();
  }
} catch (error) {
  report.result = 'fail';
  report.failure = String(error.stack || error);
  throw error;
} finally {
  await browser.close();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
