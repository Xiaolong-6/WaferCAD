import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadGeometryKernel } from '../../../scripts/process-benchmarks.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const files = [
  ['TFLN_10x8_recovered_native.wafercad', '3e0fcdcd1ef81419580695eb74b3ab30692f4ac014a701562b52f5ab74eb8df8'],
  ['TFLN_M1_M2_10x8_recovered.gds', 'e5646056a2a215f596688f7b6eb617cce815c9db8d97dda24677634bcaef14d1'],
  ['TFLN_M1_M2_10x8_recovered.oas', '9bbe1d46446e0a15be31b9434203e8f53ac114ef78b9fd109d8c8dfa1906f548'],
];
const bytes = new Map();
for (const [name, sha256] of files) {
  const buf = gunzipSync(readFileSync(join(dir, `${name}.gz`)));
  assert.equal(createHash('sha256').update(buf).digest('hex'), sha256, name);
  bytes.set(name, buf);
}
await loadGeometryKernel();
const { readProjectFile } = await import('../../../site/project-io.js');
const { parseGDS, flattenGDS } = await import('../../../site/gds.js');
const { parseOAS } = await import('../../../site/oasis.js');
const { buildRenderSurfacePlan } = await import('../../../site/renderer-geometry.js');
const { rectMulti } = await import('../../../site/vector-geometry.js');
const projectText = bytes.get(files[0][0]).toString('utf8');
const start = performance.now();
const project = await readProjectFile({ size: Buffer.byteLength(projectText), text: async () => projectText });
assert.equal(project.model.kernel, 'vector-2.5d-array-v1');
assert.equal(project.model.array.instances.length, 80);
assert.equal(project.model.array.templates.length, 30);
assert.equal(project.model.width, 1160);
assert.equal(project.model.height, 3600);
assert.equal(project.layout.elements.length, 2000);
const layerCounts = (elements) => {
  const counts = new Map();
  for (const e of elements) {
    const key = `${e.layer}|${e.datatype}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].sort();
};
assert.deepEqual(layerCounts(project.layout.elements), [['11|0', 1200], ['12|0', 800]]);
// Compare exact quantized polygon vertices, up to ring rotation/reversal. This
// checks more than count, total area or bounding boxes and catches mask drift.
function canonicalElement(element) {
  const coords = element.points.map(([x, y]) => [Math.round(x * 10000), Math.round(y * 10000)]);
  if (coords.length > 1 && coords[0][0] === coords.at(-1)[0] && coords[0][1] === coords.at(-1)[1]) coords.pop();
  function canonical(points) {
    let first = 0;
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i], [px, py] = points[first];
      if (x < px || (x === px && y < py)) first = i;
    }
    return JSON.stringify([...points.slice(first), ...points.slice(0, first)]);
  }
  return `${element.layer}|${element.datatype}|${[canonical(coords), canonical([...coords].reverse())].sort()[0]}`;
}
const signatureCounts = (elements) => {
  const counts = new Map();
  for (const element of elements) {
    const key = canonicalElement(element);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
};
const expected = signatureCounts(project.layout.elements);
for (const [format, parse] of [
  ['gds', (buf) => parseGDS(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))],
  ['oas', (buf) => parseOAS(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))],
]) {
  const result = await parse(bytes.get(files[format === 'gds' ? 1 : 2][0]));
  const flat = flattenGDS(result, 'WAFERCAD_EXPORT');
  assert.equal(flat.elements.length, 2000);
  assert.deepEqual(layerCounts(flat.elements), layerCounts(project.layout.elements));
  assert.deepEqual(signatureCounts(flat.elements), expected, `${format} polygon-by-polygon parity`);
}
// Check the actual Array Model's own 3D/Border plan, using an exact single-disk ROI.
const roi = rectMulti(115, 110, -507.5, -1605);
const plan = buildRenderSurfacePlan(project.model, roi);
assert.ok(plan.caps.length > 0 && plan.sidewalls.length > 0);
assert.ok(plan.borderLines.length > 0);
console.log(JSON.stringify({ ok: true, model: 'TFLN 10x8 recovered', instances: 80,
  templates: 30, maskPolygons: 2000, layerCounts: layerCounts(project.layout.elements),
  roi: { caps: plan.caps.length, sidewalls: plan.sidewalls.length, borderLines: plan.borderLines.length },
  ms: Math.round(performance.now() - start) }, null, 2));