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
  PROJECT_COORDINATE_LIMIT_UM,
  PROJECT_LENGTH_LIMIT_UM,
  migrateProjectFile,
  validateProjectFile,
  validateProjectFiles,
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

test('v13 projects migrate electrical region defaults into v14', () => {
  const source = validProject();
  source.version = 13;
  delete source.model.electricalRegions;
  delete source.model.nextElectricalRegionId;
  const migrated = migrateProjectFile(source);
  assert.equal(migrated.version, CURRENT_PROJECT_VERSION);
  assert.deepEqual(migrated.model.electricalRegions, []);
  assert.equal(migrated.model.nextElectricalRegionId, 1);
  assert.equal(validateProjectFile(migrated), migrated);
});

test('project validator accepts typed electrical region annotation volumes', () => {
  const source = validProject();
  source.version = CURRENT_PROJECT_VERSION;
  source.model.electricalRegions = [
    {
      id: 'electrical-1',
      name: 'Al2O3-induced p inversion',
      color: '#7A6FD0',
      face: 'front',
      thickness: 0.05,
      regionType: 'p-inversion',
      source: 'induced',
      visible: true,
      patches: [
        {
          geom: structuredClone(source.model.boundary),
          z: 4,
          zMin: -4,
          zMax: 4,
          layerId: 'base',
          surfaceAppearance: null,
        },
      ],
    },
  ];
  source.model.nextElectricalRegionId = 2;
  assert.equal(validateProjectFile(source), source);

  source.model.electricalRegions[0].regionType = 'magic-junction';
  assert.throws(
    () => validateProjectFile(source),
    /electricalRegions\[0\]\.regionType.*not supported/,
  );
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

test('project validator rejects coordinates outside the physical CAD envelope', () => {
  const source = validProject();
  source.section.a[0] = PROJECT_COORDINATE_LIMIT_UM + 1;
  assert.throws(() => validateProjectFile(source), /section\.a\[0\].*must be between/);

  const oversized = validProject();
  oversized.roi = { type: 'circle', c: [0, 0], r: PROJECT_LENGTH_LIMIT_UM + 1 };
  assert.throws(() => validateProjectFile(oversized), /roi\.r.*must be between/);
});

test('project serializer enforces the same size ceiling used by Open', () => {
  assert.throws(() => serializeProject(validProject(), 1024), /larger than the 0 MB safety limit/);
  assert.doesNotThrow(() => serializeProject(validProject(), MAX_PROJECT_FILE_BYTES));
});

test('project validator rejects zero-area material polygon rings', () => {
  const source = validProject();
  source.model.regions[0].geom = [
    [
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 0],
      ],
    ],
  ];
  assert.throws(() => validateProjectFile(source), /must enclose non-zero area/);
});

test('project storage rejects XY geometry that collapses at the 0.1 nm persistence quantum', () => {
  const source = validProject(),
    halfWidth = PROJECT_LENGTH_QUANTUM_UM * 0.2;
  source.model.width = halfWidth * 2;
  source.model.boundary = [
    [
      [
        [-halfWidth, -50],
        [halfWidth, -50],
        [halfWidth, 50],
        [-halfWidth, 50],
        [-halfWidth, -50],
      ],
    ],
  ];
  source.model.regions[0].geom = structuredClone(source.model.boundary);

  assert.equal(validateProjectFile(source), source);
  assert.throws(() => serializeProject(source), /cannot be stored safely/i);
});

test('project storage rejects semantic geometry that collapses at file precision', () => {
  const tiny = PROJECT_LENGTH_QUANTUM_UM * 0.4;

  const roiProject = validProject();
  roiProject.roi = { type: 'rect', a: [0, 0], b: [tiny, 1] };
  assert.equal(validateProjectFile(roiProject), roiProject);
  assert.throws(() => serializeProject(roiProject), /cannot be stored safely.*roi/i);

  const sectionProject = validProject();
  sectionProject.section = { a: [0, 0], b: [tiny, 0] };
  assert.equal(validateProjectFile(sectionProject), sectionProject);
  assert.throws(() => serializeProject(sectionProject), /cannot be stored safely.*section/i);

  const lineworkProject = validProject();
  lineworkProject.layout.linework = [
    {
      kind: 'path',
      sourceCell: 'TOP',
      layer: 1,
      datatype: 0,
      width: 0,
      points: [
        [0, 0],
        [tiny, 0],
      ],
    },
  ];
  assert.equal(validateProjectFile(lineworkProject), lineworkProject);
  assert.throws(
    () => serializeProject(lineworkProject),
    /cannot be stored safely.*linework\[0\]\.points collapse to zero length/i,
  );
});

test('project storage rejects non-zero layout path widths that quantize to zero', () => {
  const source = validProject(),
    tinyWidth = PROJECT_LENGTH_QUANTUM_UM * 0.4,
    path = {
      kind: 'path',
      sourceCell: 'TOP',
      layer: 1,
      datatype: 0,
      width: tinyWidth,
      points: [
        [-1, 0],
        [1, 0],
      ],
    };
  source.layout.elements = [path];
  source.layout.combos = [{ key: '1|0', cell: 'TOP', layer: 1, datatype: 0, count: 1 }];

  assert.equal(validateProjectFile(source), source);
  assert.throws(
    () => serializeProject(source),
    /cannot be stored safely.*layout\.elements\[0\]\.width collapses to zero/i,
  );

  const snapshotSource = validProject();
  snapshotSource.snapshots = [
    {
      id: 'snapshot-path-width',
      name: 'Tiny path',
      createdAt: '2026-10-03T06:00:00.000Z',
      state: structuredClone(snapshotSource),
    },
  ];
  snapshotSource.snapshots[0].state.layout.elements = [structuredClone(path)];
  snapshotSource.snapshots[0].state.layout.combos = [
    { key: '1|0', cell: 'TOP', layer: 1, datatype: 0, count: 1 },
  ];

  assert.equal(validateProjectFile(snapshotSource), snapshotSource);
  assert.throws(
    () => serializeProject(snapshotSource),
    /cannot be stored safely.*snapshots\[0\]\.state\.layout\.elements\[0\]\.width collapses to zero/i,
  );
});

test('project storage rejects geometry that collapses at the 0.1 nm persistence quantum', () => {
  const source = validProject();
  source.model.regions[0].stack[0].z0 = 0;
  source.model.regions[0].stack[0].z1 = PROJECT_LENGTH_QUANTUM_UM * 0.4;

  assert.equal(validateProjectFile(source), source);
  assert.throws(() => serializeProject(source), /cannot be stored safely.*z1 > z0/i);
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
  assert.equal(stored.storage.encoding, 'shared-assets-v2');
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
  assert.equal(stored.storage.encoding, 'shared-assets-v2');
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

test('project storage preserves snapshot branch graph metadata', () => {
  const source = validProject();
  source.snapshots = [
    {
      id: 'snapshot-main',
      name: 'Shared process',
      createdAt: '2026-10-03T10:00:00.000Z',
      branchId: 'main',
      parentId: null,
      state: validProject(),
    },
    {
      id: 'snapshot-variant',
      name: 'Black silicon',
      createdAt: '2026-10-03T10:01:00.000Z',
      branchId: 'branch-black',
      parentId: 'snapshot-main',
      state: validProject(),
    },
  ];
  source.snapshotBranches = {
    version: 1,
    activeBranchId: 'branch-black',
    branches: [
      {
        id: 'main',
        name: 'Main',
        rootSnapshotId: null,
        headSnapshotId: 'snapshot-main',
        createdAt: '1970-01-01T00:00:00.000Z',
      },
      {
        id: 'branch-black',
        name: 'Black silicon',
        rootSnapshotId: 'snapshot-main',
        headSnapshotId: 'snapshot-variant',
        createdAt: '2026-10-03T10:00:30.000Z',
      },
    ],
  };

  const stored = JSON.parse(serializeProject(source));
  assert.equal(stored.snapshots[1].branchId, 'branch-black');
  assert.equal(stored.snapshots[0].parentId, null);
  assert.equal(stored.snapshots[1].parentId, 'snapshot-main');
  assert.equal(stored.snapshotBranches.activeBranchId, 'branch-black');

  expandProjectStorage(stored);
  assert.equal(validateProjectFile(stored), stored);
  assert.equal(stored.snapshots[1].branchId, 'branch-black');
  assert.equal(stored.snapshotBranches.branches[1].headSnapshotId, 'snapshot-variant');

  const workspaceStored = prepareProjectForWorkspaceStorage(source);
  expandProjectStorage(workspaceStored);
  assert.equal(workspaceStored.snapshots[0].parentId, null);
  assert.equal(workspaceStored.snapshots[1].parentId, 'snapshot-main');
  assert.equal(workspaceStored.snapshotBranches.activeBranchId, 'branch-black');
});

test('project validator rejects dangling snapshot branch graph references', () => {
  const source = validProject();
  source.snapshots = [
    {
      id: 'snapshot-1',
      name: 'Checkpoint',
      createdAt: '2026-10-03T10:00:00.000Z',
      branchId: 'main',
      parentId: 'missing',
      state: validProject(),
    },
  ];
  source.snapshotBranches = {
    version: 1,
    activeBranchId: 'main',
    branches: [
      {
        id: 'main',
        name: 'Main',
        rootSnapshotId: null,
        headSnapshotId: 'snapshot-1',
        createdAt: '1970-01-01T00:00:00.000Z',
      },
    ],
  };
  assert.throws(() => validateProjectFile(source), /parentId references an unknown snapshot/);

  source.snapshots[0].parentId = null;
  source.snapshotBranches.branches[0].headSnapshotId = 'missing';
  assert.throws(() => validateProjectFile(source), /headSnapshotId references an unknown snapshot/);
});

test('v2 shares geometry across distinct history models and annotation patches', () => {
  const source = migrateProjectFile(validProject());
  source.model.electricalRegions = [
    {
      id: 'electrical-1',
      name: 'Doped base',
      color: '#7A6FD0',
      face: 'front',
      thickness: 0.05,
      regionType: 'n-type',
      source: 'doped',
      visible: true,
      patches: [
        {
          geom: structuredClone(source.model.boundary),
          z: 4,
          zMin: -4,
          zMax: 4,
          layerId: 'base',
          surfaceAppearance: null,
        },
      ],
    },
  ];
  source.model.nextElectricalRegionId = 2;
  source.snapshots = Array.from({ length: 12 }, (_, index) => {
    const state = structuredClone(source);
    delete state.snapshots;
    state.model.revision += index + 1;
    state.model.processRevision += index + 1;
    state.model.regions[0].stack[0].z1 += (index + 1) * 0.01;
    return {
      id: `step-${index}`,
      name: `Step ${index}`,
      createdAt: '2026-10-06T00:00:00.000Z',
      state,
    };
  });
  const before = structuredClone(source);
  const packed = prepareProjectForWorkspaceStorage(source);
  assert.equal(packed.storage.encoding, 'shared-assets-v2');
  assert.equal(packed.sharedGeometries.length, 1);
  assert.equal(packed.sharedModels.length, 12);
  assert.equal(packed.model.boundary, undefined);
  assert.equal(packed.model.regions[0].geom, undefined);
  assert.equal(packed.model.electricalRegions[0].patches[0].geomRef, packed.model.boundaryRef);
  expandProjectStorage(packed);
  assert.deepEqual(packed, before);
  assert.deepEqual(source, before);
  assert.equal(validateProjectFile(packed), packed);
  assert.strictEqual(packed.model.boundary, packed.snapshots[0].state.model.boundary);
});

test('v2 rejects missing, conflicting, fractional and dangling geometry references', () => {
  const text = serializeProject(validProject());
  for (const reference of [-1, 0.5, '0', 999999]) {
    const packed = JSON.parse(text);
    packed.model.boundaryRef = reference;
    assert.throws(() => expandProjectStorage(packed), /invalid boundary geometry reference/);
  }
  const missing = JSON.parse(text);
  delete missing.sharedGeometries;
  assert.throws(() => expandProjectStorage(missing), /invalid shared geometry dictionary/);
  const conflicting = JSON.parse(text);
  conflicting.model.boundary = [];
  assert.throws(() => expandProjectStorage(conflicting), /invalid boundary geometry reference/);
  const malformed = JSON.parse(text);
  malformed.sharedGeometries[0][0][0][0][0] = Infinity;
  expandProjectStorage(malformed);
  assert.throws(() => validateProjectFile(malformed), /finite number/);
});

test('legacy shared-assets-v1 remains readable and unknown encodings reject', async () => {
  const source = validProject();
  const legacy = {
    ...structuredClone(source),
    storage: { encoding: 'shared-assets-v1' },
    snapshots: [
      {
        id: 'old',
        name: 'Old bookmark',
        createdAt: '2026-10-06T00:00:00.000Z',
        state: {
          ...structuredClone(source),
          model: undefined,
          layout: undefined,
          modelRef: 'project',
          layoutRef: 'project',
        },
      },
    ],
  };
  const text = JSON.stringify(legacy);
  const loaded = await readProjectFile({ size: text.length, text: async () => text });
  assert.equal(loaded.snapshots.length, 1);
  assert.strictEqual(loaded.model, loaded.snapshots[0].state.model);
  legacy.storage.encoding = 'shared-assets-future';
  assert.throws(() => expandProjectStorage(legacy), /storage encoding is not supported/);
});

test('geometry validation reuse retains per-model bounds, stacks and overlap checks', () => {
  const first = validProject();
  // Extra collinear edge vertex keeps this on the general Boolean/cache path.
  first.model.boundary[0][0].splice(1, 0, [0, -50]);
  const second = structuredClone(first);
  second.model.boundary = first.model.boundary;
  second.model.regions[0].geom = first.model.regions[0].geom;
  let differences = 0;
  const kernel = globalThis.polygonClipping;
  globalThis.polygonClipping = {
    ...kernel,
    difference: (...args) => {
      differences++;
      return kernel.difference(...args);
    },
  };
  try {
    validateProjectFiles([first, second]);
    assert.equal(differences, 1);
    second.model.width += 1;
    assert.throws(() => validateProjectFiles([first, second]), /bounds do not match/);
    second.model.width = first.model.width;
    second.model.regions[0].stack[0].z1 = -5;
    assert.throws(() => validateProjectFiles([first, second]), /z1 > z0/);
    second.model.regions[0].stack[0].z1 = 4;
    second.model.regions.push({
      ...structuredClone(second.model.regions[0]),
      id: 'overlap',
      geom: first.model.regions[0].geom,
    });
    assert.throws(() => validateProjectFiles([first, second]), /overlaps/);
    second.model.regions.pop();
    first.model.regions[0].geom[0][0][0][0] = NaN;
    assert.throws(() => validateProjectFiles([first, second]), /finite number/);
  } finally {
    globalThis.polygonClipping = kernel;
  }
});

test('reused geometry still consumes each model occurrence in the point budget', () => {
  const source = validProject();
  const ring = Array.from({ length: 64 }, (_, index) => {
    const angle = (index * 2 * Math.PI) / 64;
    return [100 * Math.cos(angle), 50 * Math.sin(angle)];
  });
  ring.push([...ring[0]]);
  const geom = [[ring]];
  source.model.regions = Array.from({ length: 50000 }, (_, index) => ({
    id: `region-${index}`,
    geom,
    stack: [{ layerId: 'base', z0: -4, z1: 4 }],
  }));
  assert.throws(() => validateProjectFile(source), /exceeds the project point budget/);
});

test('shared whole-model validation still charges model points in every workspace budget', () => {
  const first = validProject();
  const second = { ...first, layout: structuredClone(first.layout) };
  second.layout.elements = [
    {
      kind: 'path',
      sourceCell: 'TOP',
      layer: 1,
      datatype: 0,
      width: 1,
      points: Array(3000000 - 5).fill([0, 0]),
    },
  ];
  assert.throws(() => validateProjectFile(second), /exceeds the project point budget/);
  assert.throws(() => validateProjectFiles([first, second]), /exceeds the project point budget/);
});

test('shared whole-layout validation still charges layout points with a different model', () => {
  const first = validProject();
  first.layout.elements = [
    {
      kind: 'path',
      sourceCell: 'TOP',
      layer: 1,
      datatype: 0,
      width: 1,
      points: Array(3000000 - 15).fill([0, 0]),
    },
  ];
  const second = { ...first, model: structuredClone(first.model) };
  const ring = second.model.boundary[0][0];
  ring.splice(1, 0, ...Array.from({ length: 10 }, () => [...ring[0]]));
  assert.equal(validateProjectFile(first), first);
  assert.throws(() => validateProjectFile(second), /exceeds the project point budget/);
  assert.throws(() => validateProjectFiles([first, second]), /exceeds the project point budget/);
});

test('rectangular containment is proven without booleans, while holes and outside regions reject', () => {
  const source = validProject();
  const kernel = globalThis.polygonClipping;
  let differences = 0;
  globalThis.polygonClipping = {
    ...kernel,
    difference: (...args) => {
      differences++;
      return kernel.difference(...args);
    },
  };
  try {
    validateProjectFile(source);
    assert.equal(differences, 0);
    const outside = structuredClone(source);
    outside.model.regions[0].geom[0][0].forEach((p) => {
      p[0] += 20;
    });
    assert.throws(() => validateProjectFile(outside), /extends outside/);
    assert.ok(differences > 0);
    const holed = structuredClone(source);
    holed.model.boundary[0].push([
      [-10, -10],
      [-10, 10],
      [10, 10],
      [10, -10],
      [-10, -10],
    ]);
    assert.throws(() => validateProjectFile(holed), /extends outside/);
    const concave = structuredClone(source);
    concave.model.boundary = [
      [
        [
          [-100, -50],
          [100, -50],
          [100, 0],
          [0, 0],
          [0, 50],
          [-100, 50],
          [-100, -50],
        ],
      ],
    ];
    assert.throws(() => validateProjectFile(concave), /extends outside/);
  } finally {
    globalThis.polygonClipping = kernel;
  }
});

test('component broad phase avoids disjoint sweeps and retains aggregate overlap rejection', () => {
  const p = validProject();
  const square = (x, y, w, h) => [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ];
  p.model.regions = [
    {
      id: 'left-right',
      geom: [[square(-80, -10, 5, 5)], [square(75, -10, 5, 5)]],
      stack: [{ layerId: 'base', z0: -4, z1: 4 }],
    },
    { id: 'middle', geom: [[square(-2, -10, 4, 5)]], stack: [{ layerId: 'base', z0: -4, z1: 4 }] },
  ];
  const kernel = globalThis.polygonClipping;
  let intersections = 0;
  globalThis.polygonClipping = {
    ...kernel,
    intersection: (...args) => {
      intersections++;
      return kernel.intersection(...args);
    },
  };
  try {
    validateProjectFile(p);
    assert.equal(
      intersections,
      0,
      'disjoint components with overlapping whole-geometry bounds need no sweep',
    );
    p.model.regions[1].geom = [[square(76, -9, 2, 2)]];
    assert.throws(() => validateProjectFile(p), /overlaps/);
    assert.ok(intersections > 0);
    const aggregate = validProject();
    aggregate.model.width = aggregate.model.height = 1000000;
    aggregate.model.boundary = [[square(-500000, -500000, 1000000, 1000000)]];
    const parts = [[square(-10, 0, 0.02, 0.03)], [square(10, 0, 0.02, 0.03)]];
    aggregate.model.regions = [
      { id: 'a', geom: parts, stack: [{ layerId: 'base', z0: -4, z1: 4 }] },
      { id: 'b', geom: structuredClone(parts), stack: [{ layerId: 'base', z0: -4, z1: 4 }] },
    ];
    assert.throws(
      () => validateProjectFile(aggregate),
      /overlaps/,
      'two sub-tolerance overlaps must still reject in aggregate',
    );
  } finally {
    globalThis.polygonClipping = kernel;
  }
});


test('project file persists and validates Process Recipe', async () => {
  const source = validProject();
  source.version = CURRENT_PROJECT_VERSION;
  source.processRecipe = {
    version: 1,
    name: 'Detector recipe',
    activeStepId: 'recipe-step-2',
    steps: [
      {
        id: 'recipe-step-1',
        command: 'deposit',
        params: {
          material: 'SiO2',
          thicknessUm: 0.1,
          coverage: 'direct',
          face: 'front',
          area: 'full',
        },
      },
      {
        id: 'recipe-step-2',
        command: 'etch',
        params: {
          target: 'SiO2',
          thicknessUm: 0.1,
          profile: 'directional',
          surface: 'smooth',
          face: 'front',
          area: 'mask',
          mask: {
            sourceMode: 'file',
            cell: 'TOP',
            layerKeys: ['1|0'],
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
            roi: null,
          },
        },
      },
    ],
  };

  assert.equal(validateProjectFile(source), source);
  const text = serializeProject(source);
  const loaded = await readProjectFile({
    size: new Blob([text]).size,
    text: async () => text,
  });
  assert.deepEqual(loaded.processRecipe, source.processRecipe);
  assert.equal(validateProjectFile(loaded), loaded);
});

test('project validator rejects malformed Process Recipe structure', () => {
  const source = validProject();
  source.version = CURRENT_PROJECT_VERSION;
  source.processRecipe = {
    version: 1,
    name: 'Bad recipe',
    activeStepId: 'missing',
    steps: [
      { id: 'same', command: 'deposit', params: {} },
      { id: 'same', command: 'shell', params: {} },
    ],
  };
  assert.throws(() => validateProjectFile(source), /processRecipe\.steps\[1\]\.id.*unique/);

  source.processRecipe.steps[1].id = 'other';
  assert.throws(() => validateProjectFile(source), /processRecipe\.steps\[1\]\.command.*not supported/);

  source.processRecipe.steps[1].command = 'etch';
  assert.throws(() => validateProjectFile(source), /activeStepId.*unknown recipe step/);
});
