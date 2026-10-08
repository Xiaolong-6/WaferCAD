import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  compactGeometryDictionary,
  expandGeometryDictionary,
  MAX_TEMPLATE_EXPANDED_POINTS,
} from '../project-geometry-storage.js';
import {
  expandProjectStorage,
  prepareProjectForWorkspaceStorage,
  serializeProject,
  readProjectFile,
} from '../project-io.js';
import { migrateProjectFile } from '../project-schema.js';
import { projectForBenchmark } from '../../scripts/process-benchmarks.mjs';
import { assertNativeFig3Contract } from '../../scripts/test-helpers/example-contracts.mjs';
const module = { exports: {} };
new Function(
  'module',
  'exports',
  readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(module, module.exports);
globalThis.polygonClipping = module.exports;
const { createModel, applyOperation } = await import('../model.js');
const { rectMulti, pointInMulti } = await import('../vector-geometry.js');
const move = (polygon, x, y) =>
  polygon.map((r) => r.map(([a, b]) => [Number((a + x).toFixed(4)), Number((b + y).toFixed(4))]));
function dictionary() {
  const outer = rectMulti(20, 10)[0];
  outer.push(rectMulti(2, 2)[0][0].toReversed());
  return {
    sharedGeometries: [Array.from({ length: 200 }, (_, i) => move(outer, i * 40, (i % 3) * 20))],
  };
}
test('polygon templates preserve holes, winding, ordering, closure and translated coordinates exactly', () => {
  const p = dictionary(),
    before = structuredClone(p);
  assert.equal(compactGeometryDictionary(p), true);
  assert.equal(p.sharedPolygonTemplates.length, 1);
  assert.ok(JSON.stringify(p).length < JSON.stringify(before).length * 0.4);
  expandGeometryDictionary(p);
  assert.deepEqual(p, before);
});
test('lossless workspace template encoding preserves sub-grid values and negative zero', () => {
  const p = dictionary();
  p.sharedGeometries[0].push([
    [
      [-0, 0],
      [0.00004, 0],
      [0.00004, 0.1],
      [-0, 0.1],
      [-0, 0],
    ],
  ]);
  const positiveZero = p.sharedGeometries[0]
    .at(-1)
    .map((ring) => ring.map(([x, y]) => [Object.is(x, -0) ? 0 : x, y]));
  p.sharedGeometries[0].unshift(positiveZero);
  const before = structuredClone(p);
  assert.equal(compactGeometryDictionary(p), true);
  assert.equal(p.sharedPolygonTemplates.filter((t) => t.raw).length, 2);
  expandGeometryDictionary(p);
  assert.deepEqual(p, before);
  assert.equal(Object.is(p.sharedGeometries[0].at(-1)[0][0][0], -0), true);
});
test('malformed polygon placements, unsafe deltas and coordinate overflow are rejected', () => {
  const p = dictionary();
  compactGeometryDictionary(p);
  for (const entry of [
    [-1, 0, 0],
    [0.5, 0, 0],
    [999999, 0, 0],
    [0, 0],
    [0, Infinity, 0],
    [0, 1e14, 0],
    [0, 0, 0, 0],
  ]) {
    const bad = structuredClone(p);
    bad.sharedGeometries[0][0] = entry;
    assert.throws(() => expandGeometryDictionary(bad), /invalid polygon template/);
  }
  for (const deltas of [
    [0, 0, 1],
    [0, 0, 1, 0, 0, Infinity],
    [0, 0, 1e14, 0, 0, 1],
  ]) {
    const bad = structuredClone(p);
    bad.sharedPolygonTemplates[0].rings[0] = deltas;
    assert.throws(() => expandGeometryDictionary(bad), /invalid polygon template/);
  }
});
test('compressed placements cannot bypass the expanded point limit', () => {
  const ring = Array.from({ length: 100 }, (_, i) => [i, i % 2]);
  ring.push([...ring[0]]);
  const p = { sharedGeometries: [], sharedPolygonTemplates: [{ raw: [ring] }] };
  // Every raw template has one placement; distinct grid origins exercise expansion.
  p.sharedPolygonTemplates = [
    { rings: [Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 1 : 0))] },
  ];
  p.sharedGeometries = [
    Array.from({ length: Math.floor(MAX_TEMPLATE_EXPANDED_POINTS / 101) + 1 }, (_, i) => [0, i, 0]),
  ];
  assert.throws(() => expandGeometryDictionary(p), /expanded geometry point limit/);
});
test('real Process output with repeated islands and bookmarks round-trips through v3', async () => {
  const model = createModel({ shape: 'rect', width: 10000, height: 10000, thickness: 500 });
  const p = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-4000, 0], b: [4000, 0] } }),
  );
  const early = structuredClone(p);
  const area = Array.from({ length: 400 }, (_, i) =>
    rectMulti(8, 6, ((i % 20) - 9.5) * 100, (Math.floor(i / 20) - 9.5) * 100),
  ).flat();
  assert.equal(
    applyOperation(p.model, {
      type: 'add',
      name: 'Array metal',
      thickness: 0.0404,
      growth: 'direct',
      face: 'front',
      area,
    }).changed,
    true,
  );
  p.snapshots = [
    { id: 'before', name: 'Before deposit', createdAt: '2026-10-07T10:00:00.000Z', state: early },
  ];
  const original = structuredClone(p);
  const text = serializeProject(p),
    stored = JSON.parse(text);
  assert.equal(stored.storage.encoding, 'shared-assets-v3');
  const loaded = await readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
  assert.deepEqual(loaded, original);
  assert.deepEqual(p, original);
  const lossless = prepareProjectForWorkspaceStorage(p);
  assert.equal(lossless.storage.encoding, 'shared-assets-v3');
  expandProjectStorage(lossless);
  assert.deepEqual(lossless, original);
});
test('native three-tier geometry and complete History stay exactly equal through v3', async () => {
  const bytes = readFileSync(
    new URL('../examples/three-tier-silicon-jlfets.wafercad', import.meta.url),
  );
  const p = expandProjectStorage(JSON.parse(bytes));
  const before = structuredClone(p);
  const text = serializeProject(p);
  assert.equal(JSON.parse(text).storage.encoding, 'shared-assets-v3');
  const loaded = await readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
  assert.deepEqual(loaded, before);
  assert.deepEqual(p, before);
  assertNativeFig3Contract(loaded, pointInMulti);
  assert.equal(
    serializeProject(loaded),
    text,
    'Formal shared-assets-v3 example must serialize deterministically after exact reopen',
  );
});
