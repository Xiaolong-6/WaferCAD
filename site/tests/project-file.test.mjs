import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { serializeProject } from '../project-io.js';
import { validateProjectFile } from '../project-schema.js';

const vendorSource = readFileSync(
  new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;

function validProject() {
  return {
    format: 'WaferCAD-vector',
    model: {
      kernel: 'vector-2.5d-v1',
      shape: 'rect',
      width: 200,
      height: 100,
      thickness: 8,
      boundary: [
        [
          [
            [-100, -50],
            [100, -50],
            [100, 50],
            [-100, 50],
            [-100, -50],
          ],
        ],
      ],
      units: { xy: 'µm', z: 'relative' },
      layers: [{ id: 'base', name: 'Base', color: '#C3CBD4' }],
      regions: [
        {
          id: 'region-1',
          geom: [
            [
              [
                [-100, -50],
                [100, -50],
                [100, 50],
                [-100, 50],
                [-100, -50],
              ],
            ],
          ],
          stack: [{ layerId: 'base', z0: -4, z1: 4 }],
        },
      ],
      nextLayerId: 1,
      nextRegionId: 2,
      revision: 1,
      processRevision: 0,
    },
    layout: {
      name: 'fixture.gds',
      root: 'TOP',
      elements: [],
      linework: [],
      bounds: { minX: -10, minY: -5, maxX: 10, maxY: 5, width: 20, height: 10 },
      combos: [],
      hierarchy: { TOP: [] },
      units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
    },
    selectedLayerKeys: ['1|0', '2|0'],
    activeCell: 'TOP',
    maskTransform: { x: 2, y: -3, scale: 1.5, rotation: 12 },
    activeFace: 'back',
    roi: { type: 'rect', a: [-1, -2], b: [3, 4] },
    section: { a: [-20, 0], b: [20, 0] },
    planViews: {
      mask: { zoom: 2, panX: 1, panY: 2 },
      main: { zoom: 1, panX: 0, panY: 0 },
    },
    display: { xyUnit: 'mm', structurePalette: 'balanced', customStructurePalette: null },
  };
}

test('project JSON round-trip remains valid', () => {
  const source = validProject();
  const loaded = JSON.parse(JSON.stringify(source));
  assert.equal(validateProjectFile(loaded), loaded);
  assert.deepEqual(loaded, source);
});

test('project validator rejects malformed stack structure', () => {
  const source = validProject();
  source.model.regions[0].stack[0].z1 = -5;
  assert.throws(() => validateProjectFile(source), /z1 > z0/);
});

test('project validator rejects unknown layer references', () => {
  const source = validProject();
  source.model.regions[0].stack[0].layerId = 'missing';
  assert.throws(() => validateProjectFile(source), /unknown layer/);
});

test('project validator rejects malformed layout structure', () => {
  const source = validProject();
  source.layout.elements = {};
  assert.throws(() => validateProjectFile(source), /layout\.elements must be an array/);
});

test('project validator accepts non-recursive snapshot records', () => {
  const source = validProject();
  const snapshotState = validProject();
  source.snapshots = [
    {
      id: 'snapshot-1',
      name: 'Before etch',
      createdAt: '2026-09-29T12:00:00.000Z',
      state: snapshotState,
    },
  ];
  assert.equal(validateProjectFile(source), source);
});

test('project validator rejects recursive snapshot payloads', () => {
  const source = validProject();
  const snapshotState = validProject();
  snapshotState.snapshots = [];
  source.snapshots = [
    {
      id: 'snapshot-1',
      name: 'Recursive',
      createdAt: '2026-09-29T12:00:00.000Z',
      state: snapshotState,
    },
  ];
  assert.throws(() => validateProjectFile(source), /must not be nested/);
});

test('project validator accepts the runtime nanometre zoom ceiling', () => {
  const source = validProject();
  source.planViews.mask.zoom = 1e8;
  source.planViews.main.zoom = 1e8;
  assert.equal(validateProjectFile(source), source);
});

test('project serializer enforces the same size ceiling used by Open', () => {
  assert.throws(() => serializeProject(validProject(), 1024), /larger than the 0 MB safety limit/);
  assert.doesNotThrow(() => serializeProject(validProject(), 64 * 1024 * 1024));
});

test('project validator rejects regions outside the declared base boundary', () => {
  const source = validProject();
  source.model.regions[0].geom[0][0] = source.model.regions[0].geom[0][0].map(([x, y]) => [
    x + 500,
    y,
  ]);
  assert.throws(() => validateProjectFile(source), /extends outside model\.boundary/);
});

test('project validator rejects overlapping region geometry', () => {
  const source = validProject();
  const duplicate = structuredClone(source.model.regions[0]);
  duplicate.id = 'region-2';
  source.model.regions.push(duplicate);
  assert.throws(() => validateProjectFile(source), /overlaps model\.regions/);
});

test('project validator rejects base metadata that disagrees with boundary bounds', () => {
  const source = validProject();
  source.model.width = 201;
  assert.throws(() => validateProjectFile(source), /bounds do not match model width\/height/);
});
