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
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const snapshot = () => page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    const initial = await snapshot();
    await page.evaluate((model) => {
      window.__arrayBaseline = model;
    }, initial.model);
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
    await page.waitForFunction(
      () => {
        const state = window.WaferCadV2Workstation.snapshot();
        return (
          !state.workflow.busy &&
          state.workflow.steps.length === 41 &&
          state.model.layers.some((layer) => layer.name === 'V2 Array 10nm film')
        );
      },
      null,
      { timeout: 300000 },
    );
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
    const oracle = await page.evaluate(
      async (originalIds) => {
        const { arrayParts } = await import('/model-array.js');
        const { pointInMulti } = await import('/vector-geometry.js');
        const original = arrayParts(window.__arrayBaseline).filter(
          (site) => site.role === 'device',
        );
        const afterModel = window.WaferCadV2Workstation.snapshot().model;
        const current = arrayParts(afterModel).filter((site) => site.role === 'device');
        const old = new Map(original.map((part) => [part.id, part]));
        const film = afterModel.layers.find((layer) => layer.name === 'V2 Array 10nm film');
        const samples = [
          [0, 0],
          [-575, 0],
          [575, 0],
          [0, 150],
          [-700.005, 0],
          [700.005, 0],
        ];
        let coatedSites = 0,
          buriedSamples = 0;
        for (const part of current) {
          const previous = old.get(part.id);
          if (!previous) throw Error('Array device was removed: ' + part.id);
          if (part.model.regions.some((region) => region.stack.some((s) => s.layerId === film.id)))
            coatedSites++;
          for (const point of samples) {
            const owners = (model) => model.regions.filter((r) => pointInMulti(point, r.geom));
            const before = owners(previous.model),
              now = owners(part.model);
            if (before.length !== 1 || now.length !== 1)
              throw Error('Physical ownership changed at ' + part.id + ':' + point);
            const buried = (stack) =>
              stack
                .filter((s) => originalIds.includes(s.layerId))
                .map((s) => [s.layerId, s.z0, s.z1, s.role || null]);
            if (JSON.stringify(buried(before[0].stack)) !== JSON.stringify(buried(now[0].stack)))
              throw Error('Original Z spans changed at ' + part.id + ':' + point);
            buriedSamples++;
          }
        }
        return { count: current.length, coatedSites, buriedSamples };
      },
      initial.model.layers.map((layer) => layer.id),
    );
    assert.deepEqual(oracle, { count: 625, coatedSites: 625, buriedSamples: 3750 });

    await mkdir('test-results/v2-array-science', { recursive: true });
    await selectScientificView(page, 'main', 1440);
    await page.screenshot({
      path: 'test-results/v2-array-science/625-sites-after-deposition.png',
      animations: 'disabled',
      timeout: 120000,
    });
    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () => /Saved/.test(document.querySelector('[data-slot="status.message"]')?.textContent || ''),
      null,
      { timeout: 120000 },
    );
    const saved = await snapshot();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const restored = await snapshot();
    assert.deepEqual(
      restored.model,
      saved.model,
      'Full physical 625-site array must survive reload',
    );
    assert.deepEqual(restored.workflow.steps, saved.workflow.steps, 'All 41 History Steps survive');
    // Reload creates a new JS realm; restore the immutable paper baseline for later physical probes.
    await page.evaluate((model) => {
      window.__arrayBaseline = model;
    }, initial.model);

    // #289: run a real Fig3 JLFET 625-device conformal/ROI Etch transaction
    // through the native v2 UI and Worker. The original 40 paper Steps remain intact.
    const roiAction = async (action) => {
      const button = page.locator('[data-action="' + action + '"]');
      if (!(await button.isVisible()))
        await page.locator('#maskPanel button[aria-label$="more tools"]').click();
      await button.click();
    };
    await selectScientificView(page, 'mask', 1440);
    await roiAction('mask-roi-toggle');
    await page.locator('[data-action="mask-roi-tool:square"]').click();
    const maskCanvas = await page.locator('#maskCanvas').boundingBox();
    assert.ok(maskCanvas && maskCanvas.width > 0 && maskCanvas.height > 0);
    await page.mouse.move(
      maskCanvas.x + maskCanvas.width * 0.35,
      maskCanvas.y + maskCanvas.height * 0.35,
    );
    await page.mouse.down();
    await page.mouse.move(
      maskCanvas.x + maskCanvas.width * 0.65,
      maskCanvas.y + maskCanvas.height * 0.65,
      { steps: 8 },
    );
    await page.mouse.up();
    await roiAction('mask-roi-settings');
    for (const [id, value] of [
      ['maskRoiX', '0'],
      ['maskRoiY', '0'],
      ['maskRoiSize', '40000'],
    ])
      await page.locator('#' + id).fill(value);
    await page.locator('.v2-mask-floating [data-action="roi-apply"]').click();
    await page.getByRole('button', { name: 'Close Mask ROI settings', exact: true }).click();
    assert.equal((await snapshot()).maskRoi.size, 40000, 'Conformal ROI is the 625-site field');

    await page.locator('[data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('add');
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#growthMode').selectOption('conformal');
    await page.locator('#operationThickness').fill('0.01');
    await page.locator('#layerName').fill('V2 JLFET conformal science 10nm');
    await page.locator('#applyOperationBtn').click();
    await page.waitForFunction(
      () => {
        const state = window.WaferCadV2Workstation.snapshot();
        return (
          !state.workflow.busy &&
          state.workflow.steps.length === 42 &&
          state.model.layers.some((layer) => layer.name === 'V2 JLFET conformal science 10nm')
        );
      },
      null,
      { timeout: 600000 },
    );
    const coated = await snapshot();
    const conformalLayer = coated.model.layers.find(
      (layer) => layer.name === 'V2 JLFET conformal science 10nm',
    );
    assert.ok(conformalLayer);
    assert.deepEqual(physicalSites(coated.model), physicalSites(initial.model));
    const conformalOracle = await page.evaluate(
      async (originalLayerIds) => {
        const { arrayParts } = await import('/model-array.js');
        const { pointInMulti } = await import('/vector-geometry.js');
        const prior = new Map(
          arrayParts(window.__arrayBaseline)
            .filter((site) => site.role === 'device')
            .map((site) => [site.id, site]),
        );
        const model = window.WaferCadV2Workstation.snapshot().model;
        const layer = model.layers.find((item) => item.name === 'V2 JLFET conformal science 10nm');
        const samples = [
          [0, 0],
          [-575, 0],
          [575, 0],
          [0, 150],
          [-700.005, 0],
          [700.005, 0],
        ];
        let filmSites = 0,
          sidewallSites = 0,
          preservedSamples = 0;
        for (const site of arrayParts(model).filter((item) => item.role === 'device')) {
          const before = prior.get(site.id);
          if (!before) throw Error('Missing original JLFET site ' + site.id);
          const segments = site.model.regions.flatMap((region) => region.stack);
          if (segments.some((segment) => segment.layerId === layer.id)) filmSites++;
          if (
            segments.some(
              (segment) => segment.layerId === layer.id && segment.role === 'conformal-sidewall',
            )
          )
            sidewallSites++;
          for (const point of samples) {
            const owner = (part) => part.model.regions.filter((r) => pointInMulti(point, r.geom));
            const old = owner(before),
              next = owner(site);
            if (old.length !== 1 || next.length !== 1)
              throw Error('JLFET local material ownership changed at ' + site.id + ':' + point);
            const originalStack = (stack) =>
              stack
                .filter((s) => originalLayerIds.includes(s.layerId))
                .map((s) => [s.layerId, s.z0, s.z1, s.role || null]);
            if (
              JSON.stringify(originalStack(old[0].stack)) !==
              JSON.stringify(originalStack(next[0].stack))
            )
              throw Error('Buried physical Z spans modified at ' + site.id + ':' + point);
            preservedSamples++;
          }
        }
        return { filmSites, sidewallSites, preservedSamples };
      },
      initial.model.layers.map((layer) => layer.id),
    );
    assert.deepEqual(
      conformalOracle,
      { filmSites: 625, sidewallSites: 625, preservedSamples: 3750 },
      'All 625 JLFET sites require real conformal sidewalls and original buried Z',
    );
    await selectScientificView(page, 'main', 1440);
    await page.screenshot({
      path: 'test-results/v2-array-science/625-jlfet-conformal.png',
      animations: 'disabled',
      timeout: 120000,
    });

    // A second, smaller native Mask ROI must confine the selective Etch to
    // exactly the center device; all other 624 devices and wafer background survive.
    await page.evaluate((model) => {
      window.__jlfetBeforeEtch = model;
    }, coated.model);
    await selectScientificView(page, 'mask', 1440);
    await roiAction('mask-roi-settings');
    await page.locator('#maskRoiSize').fill('1590');
    await page.locator('.v2-mask-floating [data-action="roi-apply"]').click();
    await page.getByRole('button', { name: 'Close Mask ROI settings', exact: true }).click();
    assert.equal((await snapshot()).maskRoi.size, 1590, 'Etch ROI spans only one device');
    await page.locator('[data-action="domain:process"]').click();
    await page.locator('#operationType').selectOption('etch');
    await page.locator('#operationArea').selectOption('full');
    await page.locator('#etchProfile').selectOption('directional');
    await page.locator('#etchSurfaceMode').selectOption('smooth');
    await page.locator('#operationThickness').fill('0.01');
    await page.locator('#etchTargetLayer').selectOption(conformalLayer.id);
    await page.locator('#applyOperationBtn').click();
    await page.waitForFunction(
      () => {
        const state = window.WaferCadV2Workstation.snapshot();
        return !state.workflow.busy && state.workflow.steps.length === 43;
      },
      null,
      { timeout: 600000 },
    );
    const etched = await snapshot();
    assert.deepEqual(physicalSites(etched.model), physicalSites(initial.model));
    const changedSites = await page.evaluate(async () => {
      const { arrayParts } = await import('/model-array.js');
      const before = arrayParts(window.__jlfetBeforeEtch);
      const after = arrayParts(window.WaferCadV2Workstation.snapshot().model);
      const old = new Map(before.map((part) => [part.id, JSON.stringify(part.model.regions)]));
      return after
        .filter((part) => JSON.stringify(part.model.regions) !== old.get(part.id))
        .map(({ id, role, x, y }) => ({ id, role, x, y }));
    });
    assert.equal(changedSites.length, 1, 'Selective Etch may modify only one physical site');
    assert.deepEqual(
      changedSites.map(({ role, x, y }) => [role, x, y]),
      [['device', 0, 0]],
      'Only the center JLFET device may change within the selected ROI',
    );
    const etchStep = etched.workflow.steps.at(-1)?.operation;
    assert.equal(etchStep?.maskRoi, true, 'Etch History records its Mask ROI');
    assert.deepEqual(etchStep?.etchTargetLayerIds, [conformalLayer.id]);
    await selectScientificView(page, 'section', 1440);
    await page.screenshot({
      path: 'test-results/v2-array-science/625-jlfet-roi-etch-section.png',
      animations: 'disabled',
      timeout: 120000,
    });

    // Native History inspection is read-only; return to HEAD restores the
    // exact post-Etch model, and project storage retains every 43-step record.
    await page.locator('[data-action="domain:history"]').click();
    await page
      .locator('.process-history-row.history-step-row', {
        hasText: 'V2 JLFET conformal science 10nm',
      })
      .first()
      .click();
    await page.waitForFunction(
      () => {
        const model = window.WaferCadV2Workstation.snapshot().model;
        return model.layers.some((layer) => layer.name === 'V2 JLFET conformal science 10nm');
      },
      null,
      { timeout: 120000 },
    );
    assert.deepEqual((await snapshot()).model, coated.model, 'History restores pre-Etch structure');
    await page.locator('.snapshot-return-head').click();
    await page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.busy, null, {
      timeout: 120000,
    });
    assert.deepEqual((await snapshot()).model, etched.model, 'Return HEAD restores selective Etch');
    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () => /Saved/.test(document.querySelector('[data-slot="status.message"]')?.textContent || ''),
      null,
      { timeout: 120000 },
    );
    const afterSave = await snapshot();
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });
    const afterReload = await snapshot();
    assert.deepEqual(
      afterReload.model,
      afterSave.model,
      'JLFET Conformal/ROI Etch survives reload',
    );
    assert.deepEqual(
      afterReload.workflow.steps,
      afterSave.workflow.steps,
      'All 43 JLFET History Steps survive reload',
    );
    assert.deepEqual(
      afterReload.workflow.branches,
      afterSave.workflow.branches,
      'Array History Variant topology survives reload',
    );
    console.log(
      'V2_ARRAY_JLFET_CONFORMAL_ROI: 625 coated + 625 walls, 3750 Z probes, one-site Etch, History/Save PASS',
    );
    assert.deepEqual(errors, []);
    console.log(
      'V2_ARRAY_625_SCIENCE: 625 devices coated, 3750 buried probes, full Save/Reload PASS',
    );
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
