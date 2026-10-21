import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { sidewallApertureCoverage } = await import('../direct-sidewall-aperture.js');
const { isolatedDirectSidewallPlan } = await import('../direct-sidewall-geometry.js');
const { createModel, applyOperation } = await import('../model.js');
const { rectMulti } = await import('../vector-geometry.js');
const { validateProcessModel } = await import('../project-schema.js');

const facet = { a: [2, -1], b: [2, 1], lowZ: 5, highZ: 6 };
const inc = (opening, overrides = {}) => ({
  tiltDeg: 45,
  azimuthDeg: 0,
  heightStepUm: 0.05,
  sidewallGeometry: 'isolated-step',
  apertureStack: [{ bottomZUm: 6, topZUm: 6.6, opening }],
  ...overrides,
});
const model = () => {
  const m = createModel({ shape: 'rect', width: 12, height: 8, thickness: 10 });
  assert.equal(
    applyOperation(m, { type: 'add', name: 'Step', thickness: 1, area: rectMulti(4, 2) }).changed,
    true,
  );
  return m;
};

test('exact swept aperture classifies full, none and partially illuminated sidewall', () => {
  assert.equal(sidewallApertureCoverage(facet, inc(rectMulti(2, 3, 2.8))), 'visible');
  assert.equal(sidewallApertureCoverage(facet, inc(rectMulti(0.2, 2, 6))), 'blocked');
  assert.equal(sidewallApertureCoverage(facet, inc(rectMulti(1.05, 2, 2.5))), 'partial');
});

test('aperture intruding into wall height is rejected, not treated as zero-height mask', () => {
  assert.throws(
    () =>
      sidewallApertureCoverage(
        facet,
        inc(rectMulti(3, 3), {
          apertureStack: [{ bottomZUm: 5.5, topZUm: 6.6, opening: rectMulti(3, 3) }],
        }),
      ),
    /above the facet/,
  );
});

test('native Direct deposits sidewall only when upper Z-resolved aperture fully clears facet', () => {
  const m = model();
  const ray = inc(rectMulti(2, 3, 2.8));
  const plans = isolatedDirectSidewallPlan(m, m.boundary, ray, 0.04);
  assert.equal(plans.length, 1);
  const result = applyOperation(m, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    area: m.boundary,
    incidence: ray,
  });
  assert.equal(result.changed, true, result.error);
  assert.ok(
    m.regions.some((r) =>
      r.stack.some((s) => s.layerId === result.layerId && s.role === 'direct-sidewall'),
    ),
  );
  validateProcessModel(m);
});

test('partial Z exposure becomes a material slab with real Z gaps, not a full-height wall', () => {
  const m = model();
  const result = applyOperation(m, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    area: m.boundary,
    incidence: inc(rectMulti(1.2, 3, 2.8)),
  });
  assert.equal(result.changed, true, result.error);
  const bands = m.regions.flatMap((region) =>
    region.stack.filter((segment) => segment.layerId === result.layerId && segment.role === 'direct-sidewall'),
  );
  assert.equal(bands.length, 1);
  assert.ok(Math.abs(bands[0].z0 - 5.2) < 1e-7);
  assert.ok(Math.abs(bands[0].z1 - 5.8) < 1e-7);
  assert.equal(bands[0].z1 < 6, true);
  validateProcessModel(m);
});

test('unsupported wall intersecting resist is rejected transactionally', () => {
  const m = model(),
    before = structuredClone(m);
  const result = applyOperation(m, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    area: m.boundary,
    incidence: inc(rectMulti(3, 3), {
      apertureStack: [
        {
          bottomZUm: 5.5,
          topZUm: 6.6,
          opening: rectMulti(3, 3),
        },
      ],
    }),
  });
  assert.equal(result.changed, false);
  assert.deepEqual(m, before);
});
