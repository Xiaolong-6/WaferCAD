// Issue #362 / PR #378: display-only curvature refinement must never make a
// previously displayable exact material owner fail its triangle limit or
// leave an unrefined high-curvature shoulder at the perimeter sidewall.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../project-io.js');
const { planAdaptiveContinuousTop } = await import('../continuous-heightfield-adaptive.js');
const { buildContinuousSiHeightfieldMesh, continuousSiAdaptiveChordErrorUm } =
  await import('../continuous-heightfield-mesh.js');

const project = await readProjectFile(
  new Blob([
    readFileSync(
      new URL('../examples/suspended-silica-microdisks-continuous.wafercad', import.meta.url),
    ),
  ]),
);
const owner = project.model.continuousEtchOwner;
const adaptiveChordErrorUm = continuousSiAdaptiveChordErrorUm(owner);
assert.equal(adaptiveChordErrorUm, 0.5, 'Published M08 must remain eligible for refinement');

test('near-budget published M08 keeps byte-identical uniform display rather than failing', () => {
  const baseline = buildContinuousSiHeightfieldMesh(owner, { xyStepUm: 1 });
  const maxTriangles = baseline.triangles + 100;
  const constrained = buildContinuousSiHeightfieldMesh(owner, {
    xyStepUm: 1,
    adaptiveChordErrorUm,
    maxTriangles,
  });
  assert.equal(constrained.triangles, baseline.triangles);
  assert.equal(constrained.grid.adaptiveRefinedCells, undefined);
  assert.deepEqual(
    Buffer.from(constrained.positions.buffer),
    Buffer.from(baseline.positions.buffer),
    'Uniform fallback must reproduce the original positions byte for byte',
  );
  assert.deepEqual(
    Buffer.from(constrained.normals.buffer),
    Buffer.from(baseline.normals.buffer),
    'Uniform fallback must reproduce the original normals byte for byte',
  );
  assert.throws(
    () =>
      buildContinuousSiHeightfieldMesh(owner, {
        xyStepUm: 1,
        adaptiveChordErrorUm,
        maxTriangles: baseline.triangles - 1,
      }),
    /Continuous heightfield exceeds triangle budget/,
    'Base safety budget must still fail closed when even uniform mesh cannot fit',
  );
});

test('unstitched perimeter shoulder disables adaptive mesh instead of silently skipping its edge', () => {
  // Circular release shoulder intersects the first X grid column. The coarse
  // endpoints are both finite, while the true midpoint has high curvature.
  const nx = 8,
    ny = 8,
    originalTop = 40;
  const sampleZ = (x) => {
    const f = (x - 0.3) / 0.5;
    return originalTop - 36 * Math.sqrt(Math.max(0, 1 - f * f));
  };
  const top = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      top[j * (nx + 1) + i] = sampleZ(i);
    }
  const err = Math.abs(sampleZ(0.5) - (top[0] + top[1]) / 2);
  assert.ok(err > 10, `Boundary stress case needs a steep shoulder, got ${err}`);
  const plan = planAdaptiveContinuousTop({
    nx,
    ny,
    minX: 0,
    minY: 0,
    dx: 1,
    dy: 1,
    top,
    originalTop,
    releaseDepthUm: 36,
    maxChordErrorUm: 0.5,
    sampleZ: (x, y) => sampleZ(x),
  });
  assert.equal(plan, null, 'Missing perimeter-wall stitching must force uniform fallback');
});

test('physical near-edge release conservatively retains the original watertight display', () => {
  const nearEdge = structuredClone(owner);
  // A steep circular release shoulder meets the right-hand substrate wall.
  // There is not yet a refined wall-ring topology for this geometric case.
  nearEdge.fronts[0].seedGeom = [
    [
      [
        [163, -5],
        [165, -5],
        [165, 5],
        [163, 5],
        [163, -5],
      ],
    ],
  ];
  const uniform = buildContinuousSiHeightfieldMesh(nearEdge, { xyStepUm: 1 });
  const attempted = buildContinuousSiHeightfieldMesh(nearEdge, {
    xyStepUm: 1,
    adaptiveChordErrorUm,
  });
  assert.equal(attempted.grid.adaptiveRefinedCells, undefined);
  assert.deepEqual(Buffer.from(attempted.positions.buffer), Buffer.from(uniform.positions.buffer));
  assert.deepEqual(Buffer.from(attempted.normals.buffer), Buffer.from(uniform.normals.buffer));
});

test('published M08 well-separated shoulder still benefits from adaptive tessellation', () => {
  const refined = buildContinuousSiHeightfieldMesh(owner, {
    xyStepUm: 1,
    adaptiveChordErrorUm,
  });
  assert.ok(refined.grid.adaptiveRefinedCells > 0);
  assert.ok(refined.triangles > 324800 && refined.triangles < 450000);
});