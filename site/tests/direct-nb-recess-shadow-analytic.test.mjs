import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel, applyOperation, geometryArea } = await import('../model.js');
const { multiBounds, rectMulti, pointInMulti } = await import('../vector-geometry.js');
const { directIncidenceArea } = await import('../direct-incidence-geometry.js');

function recessedNbWafer() {
  const model = createModel({ shape: 'rect', width: 12, height: 8, thickness: 10 });
  assert.equal(
    applyOperation(model, {
      type: 'add',
      growth: 'direct',
      name: 'Nb',
      thickness: 0.2,
      face: 'front',
      area: model.boundary,
    }).changed,
    true,
  );
  assert.equal(
    applyOperation(model, {
      type: 'etch',
      etchProfile: 'directional',
      name: 'Nb and Si recess',
      thickness: 0.25,
      face: 'front',
      area: rectMulti(6, 8, -3, 0),
    }).changed,
    true,
  );
  assert.deepEqual(model.regions.map((region) => region.stack.at(-1).z1).sort(), [4.95, 5.2]);
  return model;
}

function beam(azimuthDeg) {
  return {
    tiltDeg: 45,
    azimuthDeg,
    heightStepUm: 0.0375,
    apertureStack: [
      { bottomZUm: 4.95, topZUm: 5.45, opening: rectMulti(2.2, 2) },
      { bottomZUm: 5.45, topZUm: 5.85, opening: rectMulti(2.2, 2) },
    ],
  };
}

const siOpening = rectMulti(6, 8, -3, 0);

test('source-scale Nb/Si recess creates a 250 nm fixed-angle shadow along +X', () => {
  const result = directIncidenceArea(recessedNbWafer(), siOpening, beam(0), {
    depositedThicknessUm: 0.04,
  });
  const box = multiBounds(result.area);
  // Independent convex rectangle ray geometry: lower aperture constrains
  // xmin to -1.1, while 0.25 um elevated retained Nb shades x > -0.25.
  assert.ok(Math.abs(box.minX + 1.1) < 1e-8);
  assert.ok(Math.abs(box.maxX + 0.25) < 1e-8);
  assert.ok(Math.abs(geometryArea(result.area) - 1.7) < 1e-8);
  assert.equal(pointInMulti([-0.3, 0], result.area), true);
  assert.equal(pointInMulti([-0.2, 0], result.area), false);
});

test('reversing evaporation azimuth removes retained-Nb shadow from recessed side', () => {
  const result = directIncidenceArea(recessedNbWafer(), siOpening, beam(180), {
    depositedThicknessUm: 0.03,
  });
  const box = multiBounds(result.area);
  // The -X beam meets the 900 nm-high window from the opposite direction;
  // the retreating Nb step no longer shades the recessed Si region.
  assert.ok(Math.abs(box.minX + 0.2) < 1e-8);
  assert.ok(Math.abs(box.maxX - 0) < 1e-8);
  assert.ok(Math.abs(geometryArea(result.area) - 0.4) < 1e-8);
  assert.equal(pointInMulti([-0.1, 0], result.area), true);
});

test('Q2-like two-layer opening remains sampling-convergent at a known analytic bound', () => {
  const model = recessedNbWafer();
  const coarse = directIncidenceArea(
    model,
    siOpening,
    {
      ...beam(0),
      heightStepUm: 0.075,
    },
    { depositedThicknessUm: 0.04 },
  );
  const fine = directIncidenceArea(
    model,
    siOpening,
    {
      ...beam(0),
      heightStepUm: 0.01875,
    },
    { depositedThicknessUm: 0.04 },
  );
  assert.ok(fine.sampleCount > coarse.sampleCount);
  assert.ok(Math.abs(geometryArea(coarse.area) - geometryArea(fine.area)) < 1e-8);
  assert.ok(Math.abs(geometryArea(fine.area) - 1.7) < 1e-8);
});

test('subsequent 30 nm Al dose self-shadows by the previous 40 nm Al material', () => {
  const model = createModel({ shape: 'rect', width: 8, height: 4, thickness: 10 });
  assert.equal(
    applyOperation(model, {
      type: 'add',
      name: 'First Al: 40 nm',
      thickness: 0.04,
      area: rectMulti(4, 4, 2, 0),
      face: 'front',
      growth: 'direct',
    }).changed,
    true,
  );
  const lowerExposedSi = rectMulti(4, 4, -2, 0);
  const beam = { tiltDeg: 45, azimuthDeg: 0, heightStepUm: 0.01 };
  const secondDose = directIncidenceArea(model, lowerExposedSi, beam, {
    depositedThicknessUm: 0.03,
  });
  const extent = multiBounds(secondDose.area);
  assert.ok(Math.abs(extent.maxX + 0.04) < 1e-8);
  assert.ok(Math.abs(geometryArea(secondDose.area) - 15.84) < 1e-8);
  assert.equal(pointInMulti([-0.03, 0], secondDose.area), false);
  assert.equal(pointInMulti([-0.05, 0], secondDose.area), true);
});

test('second-dose metal self-shadow reverses with wafer-frame beam azimuth', () => {
  const model = createModel({ shape: 'rect', width: 8, height: 4, thickness: 10 });
  assert.equal(
    applyOperation(model, {
      type: 'add',
      name: 'First Al: 40 nm',
      thickness: 0.04,
      area: rectMulti(4, 4, 2, 0),
      face: 'front',
      growth: 'direct',
    }).changed,
    true,
  );
  const opposite = directIncidenceArea(
    model,
    rectMulti(4, 4, -2, 0),
    { tiltDeg: 45, azimuthDeg: 180, heightStepUm: 0.01 },
    { depositedThicknessUm: 0.03 },
  );
  assert.ok(Math.abs(multiBounds(opposite.area).maxX) < 1e-8);
  assert.ok(Math.abs(geometryArea(opposite.area) - 16) < 1e-8);
  assert.equal(pointInMulti([-0.03, 0], opposite.area), true);
});
