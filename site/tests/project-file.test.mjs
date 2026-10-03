import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MAX_PROJECT_FILE_BYTES,
  PROJECT_LENGTH_QUANTUM_UM,
  expandProjectStorage,
  prepareProjectForWorkspaceStorage,
  readProjectFile,
  serializeProject,
} from '../project-io.js';
import {
  CURRENT_PROJECT_VERSION,
  migrateProjectFile,
  validateProjectFile,
} from '../project-schema.js';

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
      units: { xy: 'µm', z: 'µm' },
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
  assert.doesNotThrow(() => serializeProject(validProject(), MAX_PROJECT_FILE_BYTES));
});

test('project storage rejects geometry that collapses at the 0.1 nm persistence quantum', () => {
  const source = validProject();
  source.model.regions[0].stack[0].z0 = 0;
  source.model.regions[0].stack[0].z1 = PROJECT_LENGTH_QUANTUM_UM * 0.4;

  assert.equal(validateProjectFile(source), source);
  assert.throws(
    () => serializeProject(source),
    /cannot be stored safely.*z1 > z0/i,
  );
});

test('project storage compacts repeated snapshot assets and rounds physical lengths to 0.1 nm', async () => {
  const source = validProject();
  source.section.a[0] = 24999.999999999996;
  source.snapshots = [
    {
      id: 'snapshot-1',
      name: 'Same mask and model',
      createdAt: '2026-10-01T09:00:00.000Z',
      state: validProject(),
    },
    {
      id: 'snapshot-2',
      name: 'Same assets again',
      createdAt: '2026-10-01T09:01:00.000Z',
      state: validProject(),
    },
  ];

  const naive = JSON.stringify(source);
  const text = serializeProject(source);
  const stored = JSON.parse(text);

  assert.equal(PROJECT_LENGTH_QUANTUM_UM, 0.0001);
  assert.equal(stored.section.a[0], 25000);
  assert.equal(stored.storage.encoding, 'shared-assets-v1');
  assert.equal(stored.snapshots[0].state.layout, undefined);
  assert.equal(stored.snapshots[0].state.layoutRef, 'project');
  assert.equal(stored.snapshots[0].state.model, undefined);
  assert.equal(stored.snapshots[0].state.modelRef, 'project');
  assert.ok(text.length < naive.length);

  const loaded = await readProjectFile({
    size: new Blob([text]).size,
    text: async () => text,
  });
  assert.equal(loaded.section.a[0], 25000);
  assert.strictEqual(loaded.snapshots[0].state.layout, loaded.layout);
  assert.strictEqual(loaded.snapshots[0].state.model, loaded.model);
  assert.equal(validateProjectFile(loaded), loaded);
});

test('Recovery shared-asset packing is lossless below the file quantization boundary', () => {
  const source = validProject();
  source.section.a[0] = 0.00004;
  source.snapshots = [
    {
      id: 'snapshot-lossless',
      name: 'Lossless checkpoint',
      createdAt: '2026-10-03T04:00:00.000Z',
      state: structuredClone(source),
    },
  ];

  const stored = prepareProjectForWorkspaceStorage(source);
  assert.equal(stored.storage.encoding, 'shared-assets-v1');
  assert.equal(stored.storage.lossless, true);
  assert.equal(stored.section.a[0], 0.00004);
  assert.equal(stored.snapshots[0].state.model, undefined);
  assert.equal(stored.snapshots[0].state.layout, undefined);

  expandProjectStorage(stored);
  assert.equal(stored.section.a[0], 0.00004);
  assert.equal(validateProjectFile(stored), stored);
});

test('project storage keeps distinct snapshot masks as shared assets', async () => {
  const source = validProject();
  const snapshotState = validProject();
  snapshotState.layout.name = 'other-mask.gds';
  source.snapshots = [
    {
      id: 'snapshot-other-mask',
      name: 'Other mask',
      createdAt: '2026-10-01T09:02:00.000Z',
      state: snapshotState,
    },
  ];

  const text = serializeProject(source);
  const stored = JSON.parse(text);
  assert.equal(stored.sharedLayouts.length, 1);
  assert.equal(stored.snapshots[0].state.layoutRef, 0);

  const loaded = await readProjectFile({
    size: new Blob([text]).size,
    text: async () => text,
  });
  assert.equal(loaded.snapshots[0].state.layout.name, 'other-mask.gds');
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

test('legacy project migration adds current version and inspect-state defaults', () => {
  const source = validProject();
  const snapshotState = validProject();
  source.snapshots = [
    {
      id: 'legacy-snapshot',
      name: 'Legacy',
      createdAt: '2026-09-29T12:00:00.000Z',
      state: snapshotState,
    },
  ];
  source.version = 1;
  source.model.units.z = 'relative';
  delete source.roiAnchor;
  delete source.display.threeOpacity;
  delete source.display.threeShowBorders;
  snapshotState.version = 1;
  snapshotState.model.units.z = 'relative';
  delete snapshotState.roiAnchor;

  const beforeZ = source.model.regions[0].stack[0].z1;
  const migrated = migrateProjectFile(source);
  assert.equal(migrated.version, CURRENT_PROJECT_VERSION);
  assert.equal(migrated.roiAnchor, 'center');
  assert.equal(migrated.display.threeOpacity, 1);
  assert.equal(migrated.display.threeShowBorders, false);
  assert.equal(migrated.snapshots[0].state.version, CURRENT_PROJECT_VERSION);
  assert.equal(migrated.snapshots[0].state.roiAnchor, 'center');
  assert.equal(migrated.model.units.z, 'µm');
  assert.equal(migrated.snapshots[0].state.model.units.z, 'µm');
  assert.equal(migrated.model.regions[0].stack[0].z1, beforeZ);
  assert.equal(validateProjectFile(migrated), migrated);
});

test('project storage preserves Draw mask source and 0.1 nm geometry precision', async () => {
  const source = validProject();
  source.version = CURRENT_PROJECT_VERSION;
  source.maskSourceMode = 'draw';
  source.drawMask = {
    nextShapeId: 6,
    shapes: [
      {
        id: 'shape-1',
        type: 'rect',
        a: [1.23456789, -2.34567891],
        b: [4.56789123, 5.67891234],
      },
      { id: 'shape-2', type: 'circle', c: [7.000049, -8.000049], r: 0.12345678 },
      {
        id: 'shape-3',
        type: 'polygon',
        points: [
          [0.000049, 0.000051],
          [2.000049, 0.000051],
          [0.000049, 2.000051],
        ],
      },
      {
        id: 'shape-4',
        type: 'ring',
        c: [1.000049, 2.000051],
        innerR: 0.12345678,
        outerR: 0.98765432,
      },
      {
        id: 'shape-5',
        type: 'ring-sector',
        c: [-3.000049, 4.000051],
        innerR: 0.25,
        outerR: 1.75,
        startDeg: 300,
        endDeg: 60,
      },
    ],
  };

  const text = serializeProject(source);
  const stored = JSON.parse(text);
  assert.equal(stored.maskSourceMode, 'draw');
  assert.equal(stored.drawMask.shapes[0].a[0], 1.2346);
  assert.equal(stored.drawMask.shapes[1].r, 0.1235);
  assert.deepEqual(stored.drawMask.shapes[2].points[0], [0, 0.0001]);
  assert.equal(stored.drawMask.shapes[3].innerR, 0.1235);
  assert.equal(stored.drawMask.shapes[3].outerR, 0.9877);
  assert.equal(stored.drawMask.shapes[4].startDeg, 300);

  const loaded = await readProjectFile({
    size: new Blob([text]).size,
    text: async () => text,
  });
  assert.equal(loaded.maskSourceMode, 'draw');
  assert.equal(loaded.drawMask.shapes.length, 5);
  assert.equal(validateProjectFile(loaded), loaded);
});

test('v5 migration defaults Mask source to File and preserves future Draw compatibility', () => {
  const source = validProject();
  source.version = 5;
  delete source.maskSourceMode;
  delete source.drawMask;
  const migrated = migrateProjectFile(source);
  assert.equal(migrated.version, CURRENT_PROJECT_VERSION);
  assert.equal(migrated.maskSourceMode, 'file');
  assert.deepEqual(migrated.drawMask, { nextShapeId: 1, shapes: [] });
  assert.equal(validateProjectFile(migrated), migrated);
});

test('project validator rejects future format versions', () => {
  const source = validProject();
  source.version = CURRENT_PROJECT_VERSION + 1;
  assert.throws(() => validateProjectFile(source), /version must be between/);
});

test('project validator accepts persisted ROI reference and 3D inspect state', () => {
  const source = validProject();
  source.version = CURRENT_PROJECT_VERSION;
  source.roiAnchor = 'top-left';
  source.display.threeOpacity = 0.45;
  source.display.threeShowBorders = true;
  assert.equal(validateProjectFile(source), source);
});

test('project validator accepts persisted sector ROI', () => {
  const source = validProject();
  source.version = CURRENT_PROJECT_VERSION;
  source.roi = {
    type: 'sector',
    c: [12.345, -6.789],
    r: 25,
    startDeg: 315,
    endDeg: 45,
  };
  assert.equal(validateProjectFile(source), source);
});


test('project v8 persists and quantizes mask-local rotated Square ROI', async () => {
  const source = validProject();
  source.version = CURRENT_PROJECT_VERSION;
  source.maskRoi = {
    type: 'square',
    c: [1.23456789, -2.34567891],
    size: 20.000051,
    rotation: 37.5,
  };
  source.maskRoiAnchor = 'top-left';

  const text = serializeProject(source);
  const stored = JSON.parse(text);
  assert.deepEqual(stored.maskRoi.c, [1.2346, -2.3457]);
  assert.equal(stored.maskRoi.size, 20.0001);
  assert.equal(stored.maskRoi.rotation, 37.5);
  assert.equal(stored.maskRoiAnchor, 'top-left');

  const loaded = await readProjectFile({
    size: new Blob([text]).size,
    text: async () => text,
  });
  assert.deepEqual(loaded.maskRoi, stored.maskRoi);
  assert.equal(validateProjectFile(loaded), loaded);
});

test('Mask ROI accepts rotated Square or Circle only', () => {
  const source = validProject();
  source.version = CURRENT_PROJECT_VERSION;
  source.maskRoi = { type: 'circle', c: [0, 0], r: 5 };
  assert.equal(validateProjectFile(source), source);

  source.maskRoi = { type: 'square', c: [1, 2], size: 10, rotation: 42 };
  assert.equal(validateProjectFile(source), source);

  source.maskRoi = { type: 'rect', a: [-5, -5], b: [5, 5] };
  assert.throws(() => validateProjectFile(source), /maskRoi\.type/);

  source.maskRoi = {
    type: 'sector',
    c: [0, 0],
    r: 5,
    startDeg: 0,
    endDeg: 90,
  };
  assert.throws(() => validateProjectFile(source), /maskRoi\.type/);
});

test('v8 migration upgrades rough amplitude metadata to mean/CV profile schema', () => {
  const source = validProject();
  source.version = 8;
  source.model.regions[0].stack[0].frontSurface = {
    kind: 'rough',
    featureSize: 0.5,
    amplitude: 0.4,
    etchDepth: 0.8,
    seed: 123,
    geometryMode: 'ideal',
  };

  const migrated = migrateProjectFile(source),
    rough = migrated.model.regions[0].stack[0].frontSurface;
  assert.equal(migrated.version, CURRENT_PROJECT_VERSION);
  assert.equal(rough.meanHeight, 0.4);
  assert.equal(rough.featureCv, 0.25);
  assert.equal(rough.heightCv, 0.25);
  assert.equal(rough.morphology, 'stochastic');
  assert.equal(rough.polarity, 'inverted');
  assert.equal(rough.profileId, 'rough-123');
  assert.equal('amplitude' in rough, false);
  assert.equal(validateProjectFile(migrated), migrated);
});

test('v11 rough surfaces migrate to stochastic inverted polarity without visual drift', () => {
  const source = validProject();
  source.version = 11;
  source.model.regions[0].stack[0].frontSurface = {
    kind: 'rough',
    featureSize: 0.5,
    meanHeight: 0.4,
    featureCv: 0.2,
    heightCv: 0.3,
    etchDepth: 0.8,
    seed: 321,
    profileId: 'rough-v11',
    geometryMode: 'ideal',
  };
  source.model.implants = [
    {
      id: 'implant-1',
      name: 'Rough implant',
      color: '#D65A6F',
      face: 'front',
      thickness: 0.5,
      tilt: 0,
      visible: true,
      patches: [
        {
          geom: structuredClone(source.model.boundary),
          z: 4,
          zMin: -4,
          zMax: 4,
          layerId: 'base',
          surfaceAppearance: structuredClone(source.model.regions[0].stack[0].frontSurface),
        },
      ],
    },
  ];
  source.model.nextImplantId = 2;

  const migrated = migrateProjectFile(source),
    rough = migrated.model.regions[0].stack[0].frontSurface,
    implantRough = migrated.model.implants[0].patches[0].surfaceAppearance;
  assert.equal(rough.morphology, 'stochastic');
  assert.equal(rough.polarity, 'inverted');
  assert.equal(implantRough.morphology, 'stochastic');
  assert.equal(implantRough.polarity, 'inverted');
  assert.equal(validateProjectFile(migrated), migrated);
});

test('v12 stochastic surfaces upgrade to v13 without changing morphology', () => {
  const source = migrateProjectFile(validProject());
  source.version = 12;
  source.model.regions[0].stack[0].frontSurface = {
    kind: 'rough',
    morphology: 'stochastic',
    polarity: 'normal',
    featureSize: 0.5,
    meanHeight: 0.4,
    featureCv: 0.2,
    heightCv: 0.3,
    etchDepth: 0.8,
    seed: 222,
    profileId: 'rough-v12',
    geometryMode: 'ideal',
  };

  const migrated = migrateProjectFile(source),
    rough = migrated.model.regions[0].stack[0].frontSurface;
  assert.equal(migrated.version, CURRENT_PROJECT_VERSION);
  assert.equal(rough.morphology, 'stochastic');
  assert.equal(rough.polarity, 'normal');
  assert.equal(validateProjectFile(migrated), migrated);
});

test('project validator accepts pyramid surface morphology', () => {
  const source = migrateProjectFile(validProject());
  source.model.regions[0].stack[0].frontSurface = {
    kind: 'rough',
    morphology: 'pyramid',
    polarity: 'normal',
    featureSize: 2,
    meanHeight: 0.8,
    featureCv: 0,
    heightCv: 0,
    etchDepth: 1,
    seed: 11,
    profileId: 'pyramid-schema-test',
    geometryMode: 'ideal',
  };
  assert.equal(validateProjectFile(source), source);
});

test('v7 migration converts world-space Mask ROI into mask-local coordinates', () => {
  const source = validProject();
  source.version = 7;
  source.maskRoi = { type: 'rect', a: [-10, -10], b: [10, 10] };
  source.maskRoiAnchor = 'center';

  const migrated = migrateProjectFile(source);
  assert.equal(migrated.version, CURRENT_PROJECT_VERSION);
  assert.equal(migrated.maskRoi.type, 'square');
  assert.ok(Math.abs(migrated.maskRoi.size - 20 / source.maskTransform.scale) < 1e-12);
  assert.equal(migrated.maskRoi.rotation, -source.maskTransform.rotation);
  assert.equal(validateProjectFile(migrated), migrated);
});

test('v6 migration defaults independent Mask ROI state', () => {
  const source = validProject();
  source.version = 6;
  delete source.maskRoi;
  delete source.maskRoiAnchor;
  const migrated = migrateProjectFile(source);
  assert.equal(migrated.version, CURRENT_PROJECT_VERSION);
  assert.equal(migrated.maskRoi, null);
  assert.equal(migrated.maskRoiAnchor, 'center');
  assert.equal(validateProjectFile(migrated), migrated);
});


test('v9 projects migrate to the experimental implant model without changing material geometry', () => {
  const source = validProject();
  source.version = 9;
  delete source.model.implants;
  delete source.model.nextImplantId;

  const migrated = migrateProjectFile(source);
  assert.equal(migrated.version, CURRENT_PROJECT_VERSION);
  assert.deepEqual(migrated.model.implants, []);
  assert.equal(migrated.model.nextImplantId, 1);
  assert.equal(validateProjectFile(migrated), migrated);
});



test('v10 implant metadata migrates border styling to view state and keeps overlays visible', () => {
  const source = validProject();
  source.version = 10;
  source.display = source.display || {};
  source.model.implants = [
    {
      id: 'implant-1',
      name: 'Legacy implant',
      color: '#D65A6F',
      face: 'front',
      thickness: 0.5,
      tilt: 0,
      border: true,
      patches: [
        {
          geom: structuredClone(source.model.boundary),
          z: 4,
          zMin: -4,
          zMax: 4,
          layerId: 'base',
        },
      ],
    },
  ];
  source.model.nextImplantId = 2;

  const migrated = migrateProjectFile(source);
  assert.equal(migrated.version, CURRENT_PROJECT_VERSION);
  assert.equal(migrated.display.sectionShowBorders, false);
  assert.equal(migrated.model.implants[0].visible, true);
  assert.equal('border' in migrated.model.implants[0], false);
  assert.equal(validateProjectFile(migrated), migrated);
});

test('project validator accepts a structural implant annotation', () => {
  const source = migrateProjectFile(validProject());
  source.model.implants.push({
    id: 'implant-1',
    name: 'Test implant',
    color: '#D65A6F',
    face: 'front',
    thickness: 1.2,
    tilt: 7,
    visible: true,
    patches: [
      {
        geom: structuredClone(source.model.boundary),
        z: 4,
        zMin: -4,
        zMax: 4,
        layerId: 'base',
      },
    ],
  });
  source.model.nextImplantId = 2;
  assert.equal(validateProjectFile(source), source);
});

test('project validator rejects out-of-contract implant tilt values', () => {
  const source = migrateProjectFile(validProject());
  source.model.implants.push({
    id: 'implant-1',
    name: 'Bad tilt',
    color: '#D65A6F',
    face: 'front',
    thickness: 1.2,
    tilt: 95,
    visible: true,
    patches: [
      {
        geom: structuredClone(source.model.boundary),
        z: 4,
        zMin: -4,
        zMax: 4,
        layerId: 'base',
      },
    ],
  });
  source.model.nextImplantId = 2;
  assert.throws(() => validateProjectFile(source), /model\.implants\[0\]\.tilt/);
});
