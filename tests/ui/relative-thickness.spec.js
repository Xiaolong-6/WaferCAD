import { expect, test } from '@playwright/test';

test('relative thickness mapping is logarithmic between layers and linear within', async ({ page }) => {
  await page.goto('/?qa=playwright-relative-thickness');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();

  // Numeric table
  const numeric = await page.evaluate(async () => {
    const { relativeThickness } = await import('/static/js/layer-model.js');
    const cases = [
      [0.001, 1],
      [0.01, 2],
      [0.1, 3],
      [1, 4],
      [10, 5],
      [100, 6],
      [500, 1 + Math.log10(500 * 1000)],
      [0.00005, 0.25], // 0.05 nm clamp
      [0, 0.25],
    ];
    return cases.map(([t, expected]) => ({ t, expected, actual: relativeThickness(t) }));
  });
  for (const { expected, actual } of numeric) expect(actual).toBeCloseTo(expected, 5);
  expect(numeric.find(c => c.t === 0.00005).actual).toBe(0.25);

  // Partial layer: 100 nm full -> visual 3 * global, half -> 1.5 * global
  const partial = await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    const { mappedSolidBounds, relativeThickness } = await import('/static/js/layer-model.js');
    state.wafer = { shape: 'circle', diameter: 100000, thickness: 500, material: 'Si', displayUnits: { lateral: 'mm', thickness: 'um' }, edgeFeature: 'none' };
    state.zMapping = 'relative';
    state.zExag = 1;
    state.layerVisuals = {};
    state.solids = [];
    state.cuts = [];
    state.dopings = [];
    // create layer with full 0.1 µm (100 nm)
    const layerId = 'layer-front-100nm';
    state.layerVisuals[layerId] = { name: 'Test 100nm', color: '#ff0000', scale: 1, baseThickness: 0.1 };
    state.layerVisuals.substrate = { name: 'Substrate', color: '#9ca3af', scale: 1, baseThickness: 500 };
    state.solids.push({ id: 'solid-full', layerId, side: 'front', material: 'SiO2', footprint: [[0,0],[10,0],[10,10],[0,10]], zMin: 0, zMax: 0.1 });
    const full = mappedSolidBounds({ layerId, side: 'front', zMin: 0, zMax: 0.1 });
    const half = mappedSolidBounds({ layerId, side: 'front', zMin: 0, zMax: 0.05 });
    const quarter = mappedSolidBounds({ layerId, side: 'front', zMin: 0.05, zMax: 0.1 });
    return {
      fullHeight: full.zMax - full.zMin,
      halfHeight: half.zMax - half.zMin,
      quarterHeight: quarter.zMax - quarter.zMin,
      expectedFull: relativeThickness(0.1) * 1,
    };
  });
  expect(partial.fullHeight).toBeCloseTo(3, 5);
  expect(partial.halfHeight).toBeCloseTo(1.5, 5);
  expect(partial.quarterHeight).toBeCloseTo(1.5, 5);
  expect(partial.halfHeight * 2).toBeCloseTo(partial.fullHeight, 5);

  // Substrate partial: 500 µm substrate, 100 µm cut depth = 20% of visual height
  const substratePartial = await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    const { mappedCutBounds, substrateVisualHeight } = await import('/static/js/layer-model.js');
    state.wafer = { shape: 'circle', diameter: 100000, thickness: 500, material: 'Si', displayUnits: { lateral: 'mm', thickness: 'um' }, edgeFeature: 'none' };
    state.zMapping = 'relative';
    state.zExag = 2;
    state.layerVisuals = { substrate: { name: 'Substrate', color: '#9ca3af', scale: 1, baseThickness: 500 } };
    state.solids = [];
    state.cuts = [];
    const H = substrateVisualHeight();
    const whole = mappedCutBounds(-500, 0);
    const trench = mappedCutBounds(-100, 0);
    const trenchDepth = trench.zMax - trench.zMin; // should be 100/500 * H
    return { H, wholeHeight: whole.zMax - whole.zMin, trenchDepth, expectedRatio: 100 / 500 };
  });
  expect(substratePartial.wholeHeight).toBeCloseTo(substratePartial.H, 5);
  expect(substratePartial.trenchDepth / substratePartial.H).toBeCloseTo(0.2, 5);

  // Front/back symmetry: 10 µm front and 10 µm back should have same visual height
  const symmetry = await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    const { mappedSolidBounds } = await import('/static/js/layer-model.js');
    state.wafer = { shape: 'circle', diameter: 100000, thickness: 500, material: 'Si', displayUnits: { lateral: 'mm', thickness: 'um' }, edgeFeature: 'none' };
    state.zMapping = 'relative';
    state.zExag = 1;
    state.layerVisuals = {
      substrate: { name: 'Substrate', color: '#9ca3af', scale: 1, baseThickness: 500 },
      'front-10um': { name: 'Front', color: '#ff0000', scale: 1, baseThickness: 10 },
      'back-10um': { name: 'Back', color: '#00ff00', scale: 1, baseThickness: 10 },
    };
    state.solids = [
      { id: 's1', layerId: 'front-10um', side: 'front', material: 'F', footprint: [[0,0],[1,0],[1,1],[0,1]], zMin: 0, zMax: 10 },
      { id: 's2', layerId: 'back-10um', side: 'back', material: 'B', footprint: [[0,0],[1,0],[1,1],[0,1]], zMin: -510, zMax: -500 },
    ];
    const front = mappedSolidBounds({ layerId: 'front-10um', side: 'front', zMin: 0, zMax: 10 });
    const back = mappedSolidBounds({ layerId: 'back-10um', side: 'back', zMin: -510, zMax: -500 });
    return { frontHeight: front.zMax - front.zMin, backHeight: back.zMax - back.zMin };
  });
  expect(symmetry.frontHeight).toBeCloseTo(symmetry.backHeight, 5);
  expect(symmetry.frontHeight).toBeCloseTo(5, 5); // 10 µm => relative 5

  // Multiple stacked layers: heights sum correctly and ordering preserved
  const stacked = await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    const { mappedSolidBounds, relativeThickness } = await import('/static/js/layer-model.js');
    state.wafer = { shape: 'circle', diameter: 100000, thickness: 500, material: 'Si', displayUnits: { lateral: 'mm', thickness: 'um' }, edgeFeature: 'none' };
    state.zMapping = 'relative';
    state.zExag = 1;
    state.layerVisuals = {
      substrate: { name: 'Substrate', color: '#9ca3af', scale: 1, baseThickness: 500 },
      'l1-0.1': { name: 'L1', color: '#ff0000', scale: 1, baseThickness: 0.1 },
      'l2-1': { name: 'L2', color: '#00ff00', scale: 1, baseThickness: 1 },
    };
    state.solids = [
      { id: 's1', layerId: 'l1-0.1', side: 'front', material: 'A', footprint: [[0,0],[1,0],[1,1],[0,1]], zMin: 0, zMax: 0.1 },
      { id: 's2', layerId: 'l2-1', side: 'front', material: 'B', footprint: [[0,0],[1,0],[1,1],[0,1]], zMin: 0.1, zMax: 1.1 },
    ];
    const b1 = mappedSolidBounds({ layerId: 'l1-0.1', side: 'front', zMin: 0, zMax: 0.1 });
    const b2 = mappedSolidBounds({ layerId: 'l2-1', side: 'front', zMin: 0.1, zMax: 1.1 });
    return { b1Min: b1.zMin, b1Max: b1.zMax, b2Min: b2.zMin, b2Max: b2.zMax, expected1: relativeThickness(0.1), expected2: relativeThickness(1) };
  });
  expect(stacked.b1Min).toBeCloseTo(0, 5);
  expect(stacked.b1Max).toBeCloseTo(stacked.expected1, 5);
  expect(stacked.b2Min).toBeCloseTo(stacked.expected1, 5);
  expect(stacked.b2Max).toBeCloseTo(stacked.expected1 + stacked.expected2, 5);

  // Per-layer visual scale multiplies correctly
  const perLayerScale = await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    const { mappedSolidBounds, relativeThickness } = await import('/static/js/layer-model.js');
    state.wafer = { shape: 'circle', diameter: 100000, thickness: 500, material: 'Si', displayUnits: { lateral: 'mm', thickness: 'um' }, edgeFeature: 'none' };
    state.zMapping = 'relative';
    state.zExag = 1;
    state.layerVisuals = {
      substrate: { name: 'Substrate', color: '#9ca3af', scale: 1, baseThickness: 500 },
      'scale-layer': { name: 'Scaled', color: '#ff0000', scale: 2, baseThickness: 1 },
    };
    state.solids = [{ id: 's1', layerId: 'scale-layer', side: 'front', material: 'A', footprint: [[0,0],[1,0],[1,1],[0,1]], zMin: 0, zMax: 1 }];
    const bounds = mappedSolidBounds({ layerId: 'scale-layer', side: 'front', zMin: 0, zMax: 1 });
    return { height: bounds.zMax - bounds.zMin, expected: relativeThickness(1) * 2 };
  });
  expect(perLayerScale.height).toBeCloseTo(perLayerScale.expected, 5);

  // Doping follows target layer proportionally and respects per-layer scale
  const dopingCheck = await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    const { mappedDopingBounds } = await import('/static/js/layer-model.js');
    state.wafer = { shape: 'circle', diameter: 100000, thickness: 500, material: 'Si', displayUnits: { lateral: 'mm', thickness: 'um' }, edgeFeature: 'none' };
    state.zMapping = 'relative';
    state.zExag = 1;
    state.layerVisuals = {
      substrate: { name: 'Substrate', color: '#9ca3af', scale: 1, baseThickness: 500 },
      'target-1um': { name: 'Target', color: '#ff0000', scale: 1, baseThickness: 1 },
      'doping-layer': { name: 'Doping', color: '#00ff00', scale: 1, baseThickness: 0, gradient: true },
    };
    state.solids = [{ id: 's1', layerId: 'target-1um', side: 'front', material: 'A', footprint: [[0,0],[1,0],[1,1],[0,1]], zMin: 0, zMax: 1 }];
    // doping occupying upper half of 1 µm target (0.5-1.0)
    const doping = { id: 'd1', layerId: 'doping-layer', targetLayerId: 'target-1um', dopant: 'Boron', position: 'upper', zMin: 0.5, zMax: 1.0, footprint: [[0,0],[1,0],[1,1],[0,1]], depth: 0.5 };
    const bounds = mappedDopingBounds(doping);
    // target visual height = 4 (1 µm => 4)
    // doping should be upper half => 0.5*4 =2 high at top
    return { height: bounds.zMax - bounds.zMin, expectedFraction: 0.5 };
  });
  // doping height should be half of target's visual height
  expect(dopingCheck.height).toBeCloseTo(2, 5);

  // Switching mapping does not alter physical geometry
  const physicalInvariant = await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    state.wafer = { shape: 'circle', diameter: 100000, thickness: 500, material: 'Si', displayUnits: { lateral: 'mm', thickness: 'um' }, edgeFeature: 'none' };
    state.solids = [{ id: 's1', layerId: 'inv-layer', side: 'front', material: 'A', footprint: [[0,0],[1,0],[1,1],[0,1]], zMin: 0, zMax: 0.1 }];
    state.layerVisuals = { substrate: { name: 'Sub', color: '#9ca3af', scale: 1, baseThickness: 500 }, 'inv-layer': { name: 'Inv', color: '#ff0000', scale: 1, baseThickness: 0.1 } };
    state.zMapping = 'linear';
    const before = JSON.stringify(state.solids[0]);
    state.zMapping = 'relative';
    const after = JSON.stringify(state.solids[0]);
    state.zMapping = 'linear';
    const after2 = JSON.stringify(state.solids[0]);
    return { before, after, after2, waferThick: state.wafer.thickness };
  });
  expect(physicalInvariant.before).toBe(physicalInvariant.after);
  expect(physicalInvariant.after).toBe(physicalInvariant.after2);
  expect(physicalInvariant.waferThick).toBe(500);

  // Project save/load and migration: legacy log should become relative
  const migration = await page.evaluate(async () => {
    const { validateAndMigrateProject } = await import('/static/js/project-schema.js');
    const legacy = {
      format: 'wafercad-mvp',
      version: 8,
      wafer: { shape: 'circle', diameter: 100000, thickness: 500, material: 'Si', displayUnits: { lateral: 'mm', thickness: 'um' }, edgeFeature: 'none' },
      activeFace: 'front',
      solids: [],
      cuts: [],
      dopings: [],
      imprintedFaces: [],
      layerVisuals: {},
      gds: { filename: null, bbox: null, layers: [], topCells: [], activeTopCell: null, maskPolarity: 'transmit', truncated: false, polygonLimit: 20000, committedProjection: null, transform: { offsetX: 0, offsetY: 0, rotationDeg: 0, scale: 1 } },
      slice: null,
      snapshots: [],
      snapshotDevices: {},
      snapshotThumbnails: {},
      view: { zExag: 80, zMapping: 'log', zLogK: 0.05, showAxes: false, maskBaseOpacity: 0.35, sectionBreak: { enabled: false, mode: 'surfaces', frontKeep: 5, backKeep: 5, from: -495, to: -5 } },
    };
    const migrated = validateAndMigrateProject(legacy);
    const current = {
      format: 'wafercad-mvp',
      version: 9,
      wafer: { shape: 'circle', diameter: 100000, thickness: 500, material: 'Si', displayUnits: { lateral: 'mm', thickness: 'um' }, edgeFeature: 'none' },
      activeFace: 'front',
      solids: [],
      cuts: [],
      dopings: [],
      imprintedFaces: [],
      layerVisuals: {},
      gds: { filename: null, bbox: null, layers: [], topCells: [], activeTopCell: null, maskPolarity: 'transmit', truncated: false, polygonLimit: 20000, committedProjection: null, transform: { offsetX: 0, offsetY: 0, rotationDeg: 0, scale: 1 } },
      slice: null,
      snapshots: [],
      snapshotDevices: {},
      snapshotThumbnails: {},
      view: { zExag: 8, zMapping: 'relative', showAxes: false, maskBaseOpacity: 0.35, sectionBreak: { enabled: false, mode: 'surfaces', frontKeep: 5, backKeep: 5, from: -495, to: -5 } },
    };
    const roundtrip = validateAndMigrateProject(current);
    return { migratedMapping: migrated.view.zMapping, roundtripMapping: roundtrip.view.zMapping, migratedVersion: migrated.version, roundtripVersion: roundtrip.version };
  });
  expect(migration.migratedMapping).toBe('relative');
  expect(migration.roundtripMapping).toBe('relative');
  expect(migration.migratedVersion).toBe(9);
  expect(migration.roundtripVersion).toBe(9);
});

test('switching display mode never mutates stored thickness labels', async ({ page }) => {
  await page.goto('/?qa=playwright-relative-invariant');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.locator('#materialInput').fill('Thin film');
  await page.locator('#distanceInput').fill('0.1');
  await page.getByRole('button', { name: 'Apply operation' }).click();
  await expect(page.locator('#figureLegend')).toContainText('Thickness 100 nm');
  const physicalBefore = await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    return state.solids[0].zMax - state.solids[0].zMin;
  });
  await page.locator('#zMapping').selectOption('relative');
  await expect(page.locator('#sectionMeta')).toContainText('relative thickness');
  await expect(page.locator('#figureLegend')).toContainText('Thickness 100 nm');
  const physicalAfter = await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    return state.solids[0].zMax - state.solids[0].zMin;
  });
  expect(physicalAfter).toBeCloseTo(physicalBefore, 8);
  await page.locator('#zMapping').selectOption('linear');
  await expect(page.locator('#figureLegend')).toContainText('Thickness 100 nm');
});
