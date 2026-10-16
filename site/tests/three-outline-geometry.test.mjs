import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buriedInterfaceContours,
  contoursToPositions,
  ownedContourSegments,
  sectionCutContours,
  transparentInspectionContours,
} from '../three-outline-geometry.js';
import { roughProfileOffsetAtPoint } from '../surface-rendering.js';
import { boundaryProfileFromPositions } from '../rough-boundary-profile.js';

const square = [
  [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
    [0, 0],
  ],
];

test('transparent outlines deduplicate owned segments without exposing tessellation', () => {
  const exterior = [
    [
      [0, 0, 0],
      [4, 0, 0],
    ],
    [
      [4, 0, 0],
      [0, 0, 0],
    ],
  ];
  const internal = { z: 1, buried: true, polys: [square], layerId: 'buried' };
  const result = transparentInspectionContours({
    borderLines: exterior,
    caps: [internal, { ...internal, z: 2, buried: false }],
  });
  assert.equal(result.exposed.length, 1);
  assert.equal(result.buried.length, 4);
  assert.equal(contoursToPositions(result.buried).length, 24);
  assert.equal(ownedContourSegments(exterior).length, 1);
});

test('buried rough perimeter follows the same deterministic profile as section sampling', () => {
  const appearance = {
    kind: 'rough',
    morphology: 'pyramid',
    polarity: 'normal',
    featureSize: 1,
    meanHeight: 0.2,
    etchDepth: 0.2,
    featureCv: 0,
    heightCv: 0,
    sampleOrigin: [0, 0],
    seed: 3,
  };
  const cap = {
    buried: true,
    z: 2,
    normal: 1,
    profileNormal: -1,
    polys: [square],
    appearance,
  };
  const lines = buriedInterfaceContours([cap]);
  assert.ok(lines.length > 4);
  for (const point of contoursToPositions(lines)) {
    assert.equal(typeof point, 'number');
    assert.ok(Number.isFinite(point));
  }
  const start = lines.find((line) => line[0][0] === 0 && line[0][1] === 0);
  assert.ok(start);
  assert.ok(Math.abs(start[0][2] - (2 - roughProfileOffsetAtPoint(0, 0, appearance))) < 1e-9);
});

test('buried array contours honor instance transforms and reject degenerate edges', () => {
  const cap = {
    buried: true,
    z: -1,
    polys: [square],
    instanceTranslations: [
      [0, 0],
      [10, 10],
    ],
  };
  const lines = buriedInterfaceContours([cap]);
  assert.equal(lines.length, 8);
  assert.ok(lines.some(([a]) => a[0] === 10 && a[1] === 10 && a[2] === -1));
  assert.equal(
    ownedContourSegments([
      [
        [0, 0, 0],
        [0, 0, 0],
      ],
    ]).length,
    0,
  );
});

test('ROI material section contours include rough and smooth cut levels only', () => {
  const clip = [
    [
      [
        [0, 0],
        [8, 0],
        [8, 8],
        [0, 8],
        [0, 0],
      ],
    ],
  ];
  const appearance = {
    kind: 'rough',
    morphology: 'pyramid',
    polarity: 'normal',
    featureSize: 1,
    meanHeight: 0.2,
    etchDepth: 0.2,
    featureCv: 0,
    heightCv: 0,
    seed: 8,
  };
  const wall = {
    p: [0, 0],
    q: [8, 0],
    z0: 0,
    z1: 2,
    upperSurface: { appearance, profileNormal: -1 },
  };
  const inside = { ...wall, p: [2, 2], q: [6, 2] };
  const lines = sectionCutContours([wall, inside], clip);
  assert.ok(lines.length > 10);
  assert.ok(lines.every(([a, b]) => a[1] === 0 && b[1] === 0));
  const first = lines.find(([a, b]) => a[0] === 0 && b[0] === 0 && a[2] !== b[2]);
  assert.ok(first, 'cut edge has a material-height vertical border');
  assert.ok(
    Math.abs(
      Math.max(first[0][2], first[1][2]) - (2 - roughProfileOffsetAtPoint(0, 0, appearance)),
    ) < 1e-9,
  );
  assert.deepEqual(sectionCutContours([inside], clip), []);
  assert.deepEqual(sectionCutContours([wall], null), []);
});

test('ROI contour ownership spans collinear subdivisions of irregular outer and hole rings', () => {
  const outer = [
      [0, 0],
      [2, 2],
      [4, 4],
      [0, 8],
      [0, 0],
    ],
    hole = [
      [0.5, 2],
      [1, 3],
      [1.5, 4],
      [0.5, 4],
      [0.5, 2],
    ],
    walls = [
      { p: [0, 0], q: [4, 4], z0: 0, z1: 1, layerId: 'film' },
      { p: [0.5, 2], q: [1.5, 4], z0: 0, z1: 1, layerId: 'film' },
    ],
    lines = sectionCutContours(walls, [[outer, hole]]);
  assert.equal(lines.length, 8, 'both unsplit physical walls match split ROI boundary intervals');
  assert.ok(lines.some(([a, b]) => a[0] === 0 && b[0] === 4 && a[2] === 1 && b[2] === 1));
  assert.ok(lines.some(([a, b]) => a[0] === 0.5 && b[0] === 1.5 && a[2] === 1 && b[2] === 1));
});

test('collinear same-material wall subdivisions do not create vertical section seams', () => {
  const walls = [
    { p: [0, 0], q: [2, 0], z0: 0, z1: 1, layerId: 'film' },
    { p: [2, 0], q: [4, 0], z0: 0, z1: 1, layerId: 'film' },
  ];
  const lines = sectionCutContours(walls, [square]);
  assert.ok(
    !lines.some(([a, b]) => a[0] === 2 && b[0] === 2 && a[2] !== b[2]),
    'a split on the cut face is not a physical vertical material edge',
  );
  const cornerWalls = [...walls, { p: [4, 0], q: [4, 4], z0: 0, z1: 1, layerId: 'film' }];
  assert.ok(
    sectionCutContours(cornerWalls, [square]).some(
      ([a, b]) => a[0] === 4 && a[1] === 0 && b[0] === 4 && b[1] === 0 && a[2] !== b[2],
    ),
    'the actual ROI corner remains a vertical edge',
  );
});

test('ROI top cut yields to emitted rough cap border while preserving structural cuts', () => {
  const profile = boundaryProfileFromPositions(
    new Float32Array([0, 0, 2, 2, 0, 2.125, 2, 0, 2.125, 4, 0, 2]),
  );
  const wall = {
    p: [0, 0],
    q: [4, 0],
    z0: 1,
    z1: 2,
    layerId: 'base',
    upperSurface: { capIndex: 3 },
  };
  const boundaryProfiles = new Map([[3, profile]]);
  const original = sectionCutContours([wall], [square], { boundaryProfiles });
  assert.ok(original.some(([a, b]) => a[2] > 2 && b[2] > 2));
  const cut = sectionCutContours([wall], [square], {
    boundaryProfiles,
    ownedCapBorderIndices: new Set([3]),
  });
  assert.ok(cut.some(([a, b]) => a[2] === 1 && b[2] === 1));
  assert.ok(!cut.some(([a, b]) => a[2] > 2 && b[2] > 2));
  assert.ok(cut.some(([a, b]) => a[0] === b[0] && a[2] !== b[2]));
});

test('ROI and buried contours consume actual mesh boundary profiles instead of resampling heights', () => {
  const positions = new Float32Array([0, 0, 1.1, 1.25, 0, 1.8, 1.25, 0, 1.8, 4, 0, 1.2]),
    profile = boundaryProfileFromPositions(positions),
    boundaryProfiles = new Map([[0, profile]]),
    wall = { p: [0, 0], q: [4, 0], z0: 0, z1: 1, upperSurface: { capIndex: 0 } },
    lines = sectionCutContours([wall], [square], { boundaryProfiles });
  const upper = lines.filter(([a, b]) => a[2] > 1 && b[2] > 1);
  assert.deepEqual(
    upper,
    profile.segments.map(({ p, q }) => [p, q]),
  );
  const caps = [{ buried: true, z: 1, polys: [square] }];
  assert.deepEqual(buriedInterfaceContours(caps, { boundaryProfiles }), upper);
  assert.equal(lines.length, 6, 'two exact upper and lower intervals plus physical corner lines');
});

test('ROI contour matching clips only overlapping spans and retains material junctions', () => {
  const clip = [
      [
        [
          [1, 0],
          [3, 0],
          [3, 1],
          [1, 1],
          [1, 0],
        ],
      ],
    ],
    wall = { p: [0, 0], q: [4, 0], z0: 0, z1: 1, layerId: 'film' },
    lines = sectionCutContours([wall], clip);
  assert.equal(lines.length, 4);
  assert.ok(lines.every(([a, b]) => a[0] >= 1 && b[0] <= 3));
  const junction = sectionCutContours(
    [
      { ...wall, p: [0, 0], q: [2, 0] },
      { ...wall, p: [2, 0], q: [4, 0], layerId: 'other' },
    ],
    [square],
  );
  assert.ok(junction.some(([a, b]) => a[0] === 2 && b[0] === 2 && a[2] !== b[2]));
});

test('stacked silicon slabs share no black line, but silicon-oxide does', () => {
  const lower = { p: [0, 0], q: [4, 0], z0: 0, z1: 1, layerId: 'base' };
  const upper = { ...lower, z0: 1, z1: 2 };
  const seam = ([a, b]) => a[2] === 1 && b[2] === 1;
  const lines = sectionCutContours([lower, upper], [square]);
  assert.equal(lines.some(seam), false, 'silicon slab split is not an interface');
  const oxide = { ...upper, layerId: 'oxide' };
  assert.equal(sectionCutContours([lower, oxide], [square]).some(seam), true);
});
