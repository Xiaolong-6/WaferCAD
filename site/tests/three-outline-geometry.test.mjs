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
