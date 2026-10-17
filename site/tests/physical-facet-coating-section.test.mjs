import assert from 'node:assert/strict';
import test from 'node:test';

import { physicalAxialFacetCoatingSection } from '../physical-facet-coating-section.js';
import { makePhysicalPyramidOwner } from '../physical-facet-owner.js';

const owner = makePhysicalPyramidOwner({
  layerId: 'silicon',
  pitch: 6.4,
  height: 4.5,
  topPlaneZ: 125.5,
  bottomPlaneZ: -125.5,
  domain: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 },
});
const thicknessUm = 0.05;
const slope = (2 * owner.height) / owner.pitch;
const turn = 2 * Math.atan(slope);
const lengthPerHalfCell = Math.hypot(owner.pitch / 2, owner.height);
const near = (actual, expected, tolerance = 1e-10) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Physical value ${actual} differs from ${expected}`,
  );

function section(face, a, b, thickness = thicknessUm) {
  return physicalAxialFacetCoatingSection(owner, a, b, {
    face,
    layerId: 'oxide',
    thicknessUm: thickness,
  });
}

for (const face of ['front', 'back']) {
  test(`${face}: convex Si apex has a circular radius-t coating join and exact area`, () => {
    const result = section(face, [-3.2, 0], [3.2, 0]);
    assert.equal(result.kind, 'wafercad-axial-facet-offset-section-v1');
    assert.equal(result.substrateLayerId, 'silicon');
    assert.equal(result.layerId, 'oxide');
    assert.equal(result.complete3DCoating, false);
    assert.equal(result.joins.length, 1);
    const join = result.joins[0];
    assert.equal(join.type, 'convex-round');
    near(join.source[0], 0);
    near(join.source[1], face === 'front' ? 130 : -130);
    near(join.angleRadians, turn);
    assert.ok(join.samples > 15, 'Round join requires more than a visual miter');
    for (const point of result.offset) {
      if (Math.abs(point[0]) > thicknessUm + 1e-9) continue;
      near(Math.hypot(point[0] - join.source[0], point[1] - join.source[1]), thicknessUm);
    }
    // Each half facet contributes t × its true 2D slant length; the
    // convex junction contributes the actual circular sector area.
    const exactArea =
      thicknessUm * (2 * lengthPerHalfCell) + (thicknessUm * thicknessUm * turn) / 2;
    near(result.areaUm2, exactArea, 1e-9);
    assert.ok(result.offset.length > result.source.length);
  });

  test(`${face}: concave Si valley miter keeps exact distance and no overlap`, () => {
    const result = section(face, [0, 0], [6.4, 0]);
    assert.equal(result.joins.length, 1);
    const join = result.joins[0];
    assert.equal(join.type, 'concave-miter');
    near(join.source[0], 3.2);
    near(join.intersection[0], 3.2);
    const expectedValley = face === 'front' ? 125.5 : -125.5;
    near(join.source[1], expectedValley);
    near(Math.abs(join.intersection[1] - expectedValley), thicknessUm * Math.hypot(slope, 1));
    const area =
      thicknessUm * (2 * lengthPerHalfCell) - thicknessUm * thicknessUm * Math.tan(turn / 2);
    near(result.areaUm2, area, 1e-9);
    assert.equal(result.offset.length, 3);
  });

  test(`${face}: mixed apex/valley profile remains non-interpenetrating`, () => {
    const result = section(face, [-6.4, 0], [6.4, 0]);
    assert.equal(result.joins.filter((j) => j.type === 'convex-round').length, 1);
    assert.equal(result.joins.filter((j) => j.type === 'concave-miter').length, 2);
    assert.equal(result.source[0][0], -6.4);
    assert.equal(result.source.at(-1)[0], 6.4);
    assert.ok(result.areaUm2 > 0);
    assert.ok(result.closedSectionRing.length > result.source.length);
  });
}

test('unsupported diagonal, off-center, reversed, huge and invalid film Sections fail closed', () => {
  assert.throws(() => section('front', [-3.2, 0], [3.2, 1]), /left-to-right X Section/);
  assert.throws(() => section('front', [-3.2, 1], [3.2, 1]), /Y centerline/);
  assert.throws(() => section('front', [3.2, 0], [-3.2, 0]), /left-to-right X Section/);
  assert.throws(
    () => section('front', [-3.2, 0], [3.2, 0], 100),
    /miter|intersects|physical facet/i,
  );
  assert.throws(
    () =>
      physicalAxialFacetCoatingSection(owner, [-3.2, 0], [3.2, 0], {
        face: 'both',
        layerId: 'oxide',
        thicknessUm,
      }),
    /Unknown coating face/,
  );
  assert.throws(
    () =>
      physicalAxialFacetCoatingSection(owner, [-3.2, 0], [3.2, 0], {
        face: 'front',
        layerId: 'silicon',
        thicknessUm,
      }),
    /distinct coating/,
  );
});

test('analytic offset is read-only and cannot register a fake complete 3D layer', () => {
  const original = JSON.stringify(owner);
  const result = section('front', [-3.2, 0], [3.2, 0]);
  assert.equal(result.complete3DCoating, false);
  assert.equal(Object.hasOwn(result, 'model'), false);
  assert.equal(JSON.stringify(owner), original);
});
