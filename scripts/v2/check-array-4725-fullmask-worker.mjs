// #289: a full 4725-device file Mask must change exactly those sites in a
// real production Chromium Process Worker. Background cells remain physical Base.
import assert from 'node:assert/strict';
import { loadGeometryKernel, projectForBenchmark } from '../process-benchmarks.mjs';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';
import { createSnapshotManager } from '../../site/workspace-snapshots.js';

await loadGeometryKernel();
const { createModel, geometryArea } = await import('../../site/model.js');
const { createRectangularGridArrayModel } = await import('../../site/model-array-construction.js');
const { arrayParts } = await import('../../site/model-array.js');
const { rectMulti, pointInMulti } = await import('../../site/vector-geometry.js');
const { migrateProjectFile, validateProjectFile } = await import('../../site/project-schema.js');
const { serializeProject, readProjectFile } = await import('../../site/project-io.js');

const pitch = 0.375;
const substrate = createModel({ shape: 'rect', width: pitch, height: pitch, thickness: 2 });
const seed = createRectangularGridArrayModel(substrate, {
  kind: 'rect-grid',
  rows: 80,
  columns: 80,
  pitchX: pitch,
  pitchY: pitch,
  activeSites: 4725,
});
const seedSites = arrayParts(seed);
assert.equal(seedSites.length, 6400);
assert.equal(seedSites.filter((part) => part.role === 'device').length, 4725);
assert.equal(seedSites.filter((part) => part.role === 'background').length, 1675);

const active = seedSites.filter((part) => part.role === 'device');
function maskElements(size) {
  return active.map((part) => ({
    kind: 'polygon',
    sourceCell: 'GRID',
    layer: 1,
    datatype: 0,
    points: rectMulti(size, size, part.x, part.y)[0][0].slice(0, -1),
  }));
}
const outerMask = maskElements(0.2);
const innerMask = maskElements(0.1);
assert.equal(outerMask.length, 4725);
assert.equal(innerMask.length, 4725);
const maskTransform = { x: 0, y: 0, scale: 1, rotation: 0 };

function stackAt(site, point) {
  const regions = site.model.regions.filter((region) => pointInMulti(point, region.geom));
  assert.equal(regions.length, 1, 'Each site point must have one unique material owner');
  return regions[0].stack.map(({ layerId, z0, z1 }) => [layerId, z0, z1]);
}

function materialVolume(model, layerId) {
  return arrayParts(model).reduce(
    (sum, site) =>
      sum +
      site.model.regions.reduce(
        (volume, region) =>
          volume +
          geometryArea(region.geom) *
            region.stack.reduce(
              (height, layer) => height + (layer.layerId === layerId ? layer.z1 - layer.z0 : 0),
              0,
            ),
        0,
      ),
    0,
  );
}

const browser = await launchBrowser();
try {
  const { context, page } = await newUiPage(browser, {
    viewport: { width: 1280, height: 800 },
  });
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });

    async function processWithRealWorker(model, params, elements) {
      return page.evaluate(
        ({ model, params, elements, maskTransform }) =>
          new Promise((resolve, reject) => {
            const worker = new Worker('/process-worker.js');
            const timeout = setTimeout(() => {
              worker.terminate();
              reject(new Error('Full-device Mask Worker exceeded science test timeout'));
            }, 240000);
            const finish = (error, value) => {
              clearTimeout(timeout);
              worker.terminate();
              if (error) reject(error);
              else resolve(value);
            };
            worker.onerror = (event) =>
              finish(new Error(event.message || 'Production Process Worker crashed'));
            worker.onmessage = ({ data }) => {
              if (data?.id !== 1 || data.type === 'progress') return;
              if (data.type === 'error' || data.rejected) {
                finish(new Error(data.message || data.error || 'Process Worker rejected Mask'));
              } else {
                finish(null, data);
              }
            };
            worker.postMessage({
              id: 1,
              model,
              params,
              areaRequest: {
                mode: 'mask',
                maskSourceMode: 'file',
                maskTransform,
                elements,
              },
            });
          }),
        { model, params, elements, maskTransform },
      );
    }

    const depositParams = {
      type: 'add',
      name: '4725-device 10 nm Mask film',
      thickness: 0.01,
      face: 'front',
      growth: 'direct',
    };
    const coating = await processWithRealWorker(seed, depositParams, outerMask);
    assert.equal(coating.validated, true);
    assert.equal(coating.result.changed, true);
    assert.equal(coating.result.arrayChangedInstances, 4725);
    assert.equal(coating.model.array.instances.length, 6400);
    const filmId = coating.result.layerId;
    assert.ok(coating.model.layers.some((layer) => layer.id === filmId));
    const coatedSites = arrayParts(coating.model);
    for (let i = 0; i < seedSites.length; i++) {
      const initial = seedSites[i];
      const coated = coatedSites[i];
      assert.deepEqual(
        [coated.id, coated.role, coated.x, coated.y],
        [initial.id, initial.role, initial.x, initial.y],
      );
      if (coated.role === 'background') {
        assert.deepEqual(
          coated.model.regions,
          initial.model.regions,
          'No background site may receive the device Mask film',
        );
      } else {
        assert.deepEqual(stackAt(coated, [0, 0]), [
          ['base', -1, 1],
          [filmId, 1, 1.01],
        ]);
        assert.deepEqual(stackAt(coated, [0.15, 0.15]), [['base', -1, 1]]);
      }
    }
    assert.ok(Math.abs(materialVolume(coating.model, filmId) - 1.89) <= 1e-10);

    const etchParams = {
      type: 'etch',
      thickness: 0.01,
      face: 'front',
      etchProfile: 'directional',
      etchTargetLayerIds: [filmId],
    };
    const etching = await processWithRealWorker(coating.model, etchParams, innerMask);
    assert.equal(etching.validated, true);
    assert.equal(etching.result.changed, true);
    assert.equal(etching.result.arrayChangedInstances, 4725);
    assert.equal(etching.model.array.instances.length, 6400);
    const etchedSites = arrayParts(etching.model);
    for (let i = 0; i < seedSites.length; i++) {
      const original = seedSites[i];
      const etched = etchedSites[i];
      assert.deepEqual(
        [etched.id, etched.role, etched.x, etched.y],
        [original.id, original.role, original.x, original.y],
      );
      if (etched.role === 'background') {
        assert.deepEqual(etched.model.regions, original.model.regions);
      } else {
        assert.deepEqual(stackAt(etched, [0, 0]), [['base', -1, 1]]);
        assert.deepEqual(stackAt(etched, [0.075, 0.075]), [
          ['base', -1, 1],
          [filmId, 1, 1.01],
        ]);
      }
    }
    assert.ok(Math.abs(materialVolume(etching.model, filmId) - 1.4175) <= 1e-10);

    // Store the full real-mask two-Step History with the compact canonical array.
    let live = migrateProjectFile(
      projectForBenchmark({
        model: structuredClone(seed),
        section: { a: [-15, 0], b: [15, 0] },
      }),
    );
    live.layout.root = 'GRID';
    live.layout.hierarchy = { GRID: [] };
    live.activeCell = 'GRID';
    live.selectedLayerKeys = ['1|0'];
    live.maskSourceMode = 'file';
    let nextId = 0;
    const history = createSnapshotManager({
      capture: () => live,
      restore: (state) => {
        live = state;
      },
      validateState: (project) => {
        validateProjectFile(project);
        return true;
      },
      nodeIdFactory: () => 'fullmask-' + ++nextId,
    });
    for (const step of [
      { model: coating.model, params: depositParams, mask: outerMask, kind: 'add' },
      { model: etching.model, params: etchParams, mask: innerMask, kind: 'etch' },
    ]) {
      live.model = step.model;
      live.layout.elements = step.mask;
      history.recordOperation({
        kind: step.kind,
        label: '4725-device ' + step.kind,
        replay: {
          version: 1,
          params: step.params,
          areaMode: 'mask',
          maskContext: {
            sourceMode: 'file',
            cell: 'GRID',
            layerKeys: ['1|0'],
            transform: maskTransform,
            roi: null,
          },
        },
      });
    }
    const saved = {
      ...live,
      snapshots: history.exportRecords(),
      snapshotBranches: history.exportBranchState(),
    };
    validateProjectFile(saved);
    const serialized = serializeProject(saved);
    const reopened = await readProjectFile({
      size: Buffer.byteLength(serialized),
      text: async () => serialized,
    });
    assert.deepEqual(reopened, saved, 'Full-mask physical History and Mask context round-trip');
    assert.deepEqual(errors, []);
    console.log('V2_ARRAY_4725_FULL_MASK: all devices, intact backgrounds, Z, volume and IO PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
