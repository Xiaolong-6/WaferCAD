// #184: real native-v2 625-site wafer-array Process + History science.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';
import { selectScientificView } from './desktop-view-selector.mjs';

const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
const browser = await launchBrowser();
try {
  const { page, context } = await newUiPage(browser, { viewport: { width: 1440, height: 960 } });
  const errors = [];
  try {
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/app.html?start=example&example=three-tier-silicon-jlfets', {
      waitUntil: 'domcontentloaded', timeout: 120000,
    });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const initial = await snapshot();
    await page.evaluate((model) => { window.__arrayBaseline = model; }, initial.model);
    assert.equal(initial.model.kernel, 'vector-2.5d-array-v1');
    assert.equal(initial.model.array.instances.length, 1885);
    const devices = initial.model.array.instances.filter((site) => site.role === 'device');
    assert.equal(devices.length, 625);
    assert.equal(initial.workflow.steps.length, 40, 'Full-wafer History must have 40 Steps');
    const grid = new Set(devices.map((site) => site.x + ',' + site.y));
    assert.equal(grid.size, 625);
    for (let row = -12; row <= 12; row++)
      for (let col = -12; col <= 12; col++)
        assert.ok(grid.has(col * 1600 + ',' + row * 1600), 'Missing wafer grid site');

    await page.locator('[data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('add');
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#growthMode').selectOption('direct');
    await page.locator('#operationThickness').fill('0.01');
    await page.locator('#layerName').fill('V2 Array 10nm film');
    await page.locator('#applyOperationBtn').click();
    await page.waitForFunction(() => {
      const state = window.WaferCadV2Workstation.snapshot();
      return !state.workflow.busy && state.workflow.steps.length === 41 &&
        state.model.layers.some((layer) => layer.name === 'V2 Array 10nm film');
    }, null, { timeout: 300000 });
    const deposited = await snapshot();
    // Template IDs may be re-assigned by canonical deduplication after a
    // Process Worker commit. The physical site identity, role and translation
    // must remain exact; material geometry is checked separately below.
    const physicalSites = (model) =>
      model.array.instances.map(({ templateId, ...physical }) => physical);
    assert.deepEqual(
      physicalSites(deposited.model),
      physicalSites(initial.model),
      'Process cannot alter any physical array site identity, role or translation',
    );
    const oracle = await page.evaluate(async (originalIds) => {
      const { arrayParts } = await import('/model-array.js');
      const { pointInMulti } = await import('/vector-geometry.js');
      const original = arrayParts(window.__arrayBaseline).filter((site) => site.role === 'device');
      const afterModel = window.WaferCadV2Workstation.snapshot().model;
      const current = arrayParts(afterModel).filter((site) => site.role === 'device');
      const old = new Map(original.map((part) => [part.id, part]));
      const film = afterModel.layers.find((layer) => layer.name === 'V2 Array 10nm film');
      const samples = [[0, 0], [-575, 0], [575, 0], [0, 150], [-700.005, 0], [700.005, 0]];
      let coatedSites = 0, buriedSamples = 0;
      for (const part of current) {
        const previous = old.get(part.id);
        if (!previous) throw Error('Array device was removed: ' + part.id);
        if (part.model.regions.some((region) => region.stack.some((s) => s.layerId === film.id)))
          coatedSites++;
        for (const point of samples) {
          const owners = (model) => model.regions.filter((r) => pointInMulti(point, r.geom));
          const before = owners(previous.model), now = owners(part.model);
          if (before.length !== 1 || now.length !== 1)
            throw Error('Physical ownership changed at ' + part.id + ':' + point);
          const buried = (stack) => stack.filter((s) => originalIds.includes(s.layerId))
            .map((s) => [s.layerId, s.z0, s.z1, s.role || null]);
          if (JSON.stringify(buried(before[0].stack)) !== JSON.stringify(buried(now[0].stack)))
            throw Error('Original Z spans changed at ' + part.id + ':' + point);
          buriedSamples++;
        }
      }
      return { count: current.length, coatedSites, buriedSamples };
    }, initial.model.layers.map((layer) => layer.id));
    assert.deepEqual(oracle, { count: 625, coatedSites: 625, buriedSamples: 3750 });

    await mkdir('test-results/v2-array-science', { recursive: true });
    await selectScientificView(page, 'main', 1440);
    await page.screenshot({
      path: 'test-results/v2-array-science/625-sites-after-deposition.png',
      animations: 'disabled', timeout: 120000,
    });
    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () => /Saved/.test(document.querySelector('[data-slot="status.message"]')?.textContent || ''),
      null, { timeout: 120000 },
    );
    const saved = await snapshot();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const restored = await snapshot();
    assert.deepEqual(restored.model, saved.model, 'Full physical 625-site array must survive reload');
    assert.deepEqual(restored.workflow.steps, saved.workflow.steps, 'All 41 History Steps survive');
    assert.deepEqual(errors, []);
    console.log('V2_ARRAY_625_SCIENCE: 625 devices coated, 3750 buried probes, full Save/Reload PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
