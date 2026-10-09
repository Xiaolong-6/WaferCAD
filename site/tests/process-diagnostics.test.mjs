import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, processBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { rectMulti } = await import('../vector-geometry.js');
const { analyzeProcessGeometry } = await import('../process-diagnostics.js');

const rectBase = () => createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });

test('Diagnostics is read-only and measures exact canonical base material', () => {
  const model = rectBase();
  const before = structuredClone(model);
  const report = analyzeProcessGeometry(model);
  assert.deepEqual(model, before);
  assert.equal(report.totalVolumeUm3, 4000);
  assert.equal(report.errors, 0);
  assert.equal(report.gapCount, 0);
  assert.equal(report.layers.length, 1);
  assert.equal(report.layers[0].minThicknessUm, 10);
  assert.equal(report.layers[0].maxThicknessUm, 10);
  assert.equal(report.checks.xyOverlapWithinTemplate, true);
  assert.equal(report.checks.crossInstanceBoundaries, true);
});

test('Legal released Z cavity is a located observation, not an error', () => {
  const model = rectBase();
  model.layers.push({ id: 'film', name: 'Bridge', visible: true, color: '#aabbcc' });
  model.regions[0].stack = [
    { layerId: 'base', z0: -5, z1: -2 },
    { layerId: 'film', z0: 0, z1: 1 },
  ];
  const report = analyzeProcessGeometry(model);
  const gap = report.findings.find((f) => f.code === 'z-gap');
  assert.ok(gap);
  assert.equal(gap.severity, 'info');
  assert.equal(gap.z0, -2);
  assert.equal(gap.z1, 0);
  assert.equal(gap.box.minX, -10);
  assert.equal(gap.box.maxY, 10);
  assert.equal(report.gapVolumeUm3, 800);
  assert.equal(report.errors, 0);
});

test('Overlapping material Z intervals carry an error with Z location', () => {
  const model = rectBase();
  model.layers.push({ id: 'metal', name: 'Metal' });
  model.regions[0].stack = [
    { layerId: 'base', z0: -5, z1: 2 },
    { layerId: 'metal', z0: 1, z1: 3 },
  ];
  const report = analyzeProcessGeometry(model);
  assert.ok(report.errors > 0);
  assert.ok(report.findings.some((f) => f.code === 'z-overlap' && f.z0 === 1 && f.z1 === 2));
});

test('Reversed but disjoint Z intervals flag ordering, not nonexistent overlap', () => {
  const model = rectBase();
  model.regions[0].stack = [
    { layerId: 'base', z0: 5, z1: 6 },
    { layerId: 'base', z0: 0, z1: 1 },
  ];
  const report = analyzeProcessGeometry(model);
  assert.ok(report.findings.some((finding) => finding.code === 'z-out-of-order'));
  assert.equal(
    report.findings.some((finding) => finding.code === 'z-overlap'),
    false,
  );
});

test('Two overlapping XY owners are detected independently of rendering', () => {
  const model = rectBase();
  model.regions.push({
    id: 'invalid-overlap',
    geom: rectMulti(2, 2, 0, 0),
    stack: [{ layerId: 'base', z0: -5, z1: -3 }],
  });
  const report = analyzeProcessGeometry(model);
  assert.ok(report.findings.some((f) => f.code === 'xy-overlap' && f.overlapAreaUm2 > 3.9));
  assert.equal(report.checks.xyOverlapWithinTemplate, true);
  assert.ok(report.errors > 0);
});

test('Touching XY partitions do not raise false material overlap', () => {
  const model = rectBase();
  model.regions = [
    {
      id: 'left',
      geom: rectMulti(10, 20, -5, 0),
      stack: [{ layerId: 'base', z0: -5, z1: 5 }],
    },
    {
      id: 'right',
      geom: rectMulti(10, 20, 5, 0),
      stack: [{ layerId: 'base', z0: -5, z1: 5 }],
    },
  ];
  const report = analyzeProcessGeometry(model);
  assert.equal(report.errors, 0);
  assert.equal(report.totalVolumeUm3, 4000);
});

test('Genuine through-void XY opening is recorded without calling it defective', () => {
  const model = rectBase();
  model.regions = [
    { id: 'left', geom: rectMulti(8, 20, -6, 0), stack: [{ layerId: 'base', z0: -5, z1: 5 }] },
    { id: 'right', geom: rectMulti(8, 20, 6, 0), stack: [{ layerId: 'base', z0: -5, z1: 5 }] },
  ];
  const report = analyzeProcessGeometry(model);
  assert.equal(report.voidCount, 1);
  assert.equal(report.crackCount, 0);
  assert.equal(report.warnings, 0);
  assert.ok(report.findings.some((f) => f.code === 'xy-through-void' && f.severity === 'info'));
});

test('Narrow uncovered XY slit is classified as a possible numerical crack', () => {
  const model = rectBase();
  const width = 0.00005;
  const half = 10 - width / 2;
  model.regions = [
    {
      id: 'left',
      geom: rectMulti(half, 20, -5 - width / 4, 0),
      stack: [{ layerId: 'base', z0: -5, z1: 5 }],
    },
    {
      id: 'right',
      geom: rectMulti(half, 20, 5 + width / 4, 0),
      stack: [{ layerId: 'base', z0: -5, z1: 5 }],
    },
  ];
  const report = analyzeProcessGeometry(model);
  assert.equal(report.checks.xyVoidClassification, true);
  assert.equal(report.crackCount, 1);
  assert.ok(report.warnings > 0);
  assert.ok(report.findings.some((f) => f.code === 'xy-numerical-crack'));
});

test('Report cap preserves late geometry errors ahead of benign gap observations', () => {
  const model = rectBase();
  model.regions[0].stack = Array.from({ length: 46 }, (_, i) => ({
    layerId: 'base',
    z0: i * 2,
    z1: i * 2 + 1,
  }));
  // The error is appended after more than 40 distinct legitimate Z gaps.
  model.regions[0].stack.push({ layerId: 'base', z0: 92, z1: 91 });
  const report = analyzeProcessGeometry(model);
  assert.ok(report.findingsTotal > 40);
  assert.ok(report.omittedFindings > 0);
  assert.ok(report.errors > 0);
  assert.ok(report.findings.some((finding) => finding.severity === 'error'));
  assert.equal(report.findings.length, 40);
});

test('Array measurements count every instance but disclose seam scan limitation', () => {
  const template = rectBase();
  const model = {
    ...rectBase(),
    kernel: 'vector-2.5d-array-v1',
    array: {
      templates: [{ id: 'base-template', model: template }],
      instances: [
        { id: 'A', templateId: 'base-template', x: 0, y: 0 },
        { id: 'B', templateId: 'base-template', x: 25, y: 0 },
        { id: 'C', templateId: 'base-template', x: 50, y: 0 },
      ],
    },
  };
  const before = structuredClone(model);
  const report = analyzeProcessGeometry(model);
  assert.deepEqual(model, before);
  assert.equal(report.scope, 'array-templates');
  assert.equal(report.instanceCount, 3);
  assert.equal(report.regions, 3);
  assert.equal(report.totalVolumeUm3, 12000);
  assert.equal(report.checks.crossInstanceBoundaries, false);
  assert.equal(report.errors, 0);
});

test('Conformal process fixture does not create false XY overlap findings', async () => {
  const { model } = await processBenchmark('step', 'conformal', 'front');
  const report = analyzeProcessGeometry(model);
  assert.equal(report.findings.filter((f) => f.code === 'xy-overlap').length, 0);
  assert.equal(report.findings.filter((f) => f.code === 'z-overlap').length, 0);
});
