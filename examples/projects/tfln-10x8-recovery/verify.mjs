/** Verify the committed TFLN 10x8 native, mask-driven reconstruction.
 * Run from the WaferCAD repository root:
 *   node examples/projects/tfln-10x8-recovery/verify.mjs
 * Requires the production Geometry Kernel, not a mock polygon engine.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const pkg = dirname(fileURLToPath(import.meta.url));
const source = resolve(pkg, '../../..');
const load = async (relative) => import(pathToFileURL(resolve(source, relative)).href);
const { loadGeometryKernel } = await load('scripts/process-benchmarks.mjs');
await loadGeometryKernel();
const { readProjectFile } = await load('site/project-io.js');
const { parseGDS, flattenGDS } = await load('site/gds.js');
const { parseOAS } = await load('site/oasis.js');
const { arrayParts } = await load('site/model-array.js');
const { rectMulti, pointInMulti } = await load('site/vector-geometry.js');
const { buildRenderSurfacePlan } = await load('site/renderer-geometry.js');
const { borderInspectorContours } = await load('site/three-outline-geometry.js');

const started = performance.now();
const expected = {
  'TFLN_10x8_REBUILT_editable.wafercad':
    '43b758303c226c00ab9b4909ef6cb93223cfc607edd888a6f58d4ac8d62481f9',
  'TFLN_M1_M2_10x8.gds': 'ebb37f61452bfb6ed13819c7deafe2040297903f931a63781d5c1b41a36ee7de',
  'TFLN_M1_M2_10x8.oas': '43ef9f97786546d8481c96dc30da75bc152cc288c9e23c16608c26749c4bb6f7',
  'routes.json': '95f0c1a9cb2ce926dd020d11a583e34b73e330414219a4c7710f8213a9686fd9',
};
const checked = [];
const sourceBytes = new Map();
for (const [filename, sha256] of Object.entries(expected)) {
  const buf = gunzipSync(readFileSync(join(pkg, `${filename}.gz`)));
  assert.equal(createHash('sha256').update(buf).digest('hex'), sha256, filename);
  sourceBytes.set(filename, buf);
  checked.push(filename);
}
const raw = sourceBytes.get('TFLN_10x8_REBUILT_editable.wafercad');
const project = await readProjectFile({ size: raw.length, text: async () => raw.toString('utf8') });
const model = project.model;
assert.equal(project.version, 14);
assert.equal(model.kernel, 'vector-2.5d-array-v1');
assert.equal(model.width, 1160);
assert.equal(model.height, 3600);
assert.equal(model.array.instances.length, 10);
assert.equal(model.array.templates.length, 1);
assert.equal(project.maskSourceMode, 'file');
assert.equal(project.layout.elements.length, 1120);
assert.deepEqual(
  [...new Set(project.layout.elements.map((el) => `${el.layer}|${el.datatype}`))].sort(),
  ['11|0', '12|0'],
);

// GDS/OAS preserve every polygon, modulo explicitly duplicated consecutive
// vertices. 0.1 nm coordinate grid; ring rotation and winding are ignored.
function signature(element) {
  let a = element.points.map(([x, y]) => [Math.round(x * 1e4), Math.round(y * 1e4)]);
  if (a.length > 1 && a[0][0] === a.at(-1)[0] && a[0][1] === a.at(-1)[1]) a.pop();
  a = a.filter((pt, i) => i === 0 || pt[0] !== a[i - 1][0] || pt[1] !== a[i - 1][1]);
  const canonical = (vertices) => {
    let first = 0;
    for (let i = 1; i < vertices.length; i++) {
      const p = vertices[i],
        q = vertices[first];
      if (p[0] < q[0] || (p[0] === q[0] && p[1] < q[1])) first = i;
    }
    return JSON.stringify([...vertices.slice(first), ...vertices.slice(0, first)]);
  };
  return `${element.layer}|${element.datatype}|${
    [canonical(a), canonical([...a].reverse())].sort()[0]
  }`;
}
const multiset = (elements) => {
  const map = new Map();
  for (const e of elements) {
    const key = signature(e);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b));
};
const expectedMasks = multiset(project.layout.elements);
const imported = {};
for (const type of ['gds', 'oas']) {
  const buf = sourceBytes.get(`TFLN_M1_M2_10x8.${type}`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const parsed = await (type === 'gds' ? parseGDS(ab) : parseOAS(ab));
  const result = flattenGDS(parsed, project.layout.root);
  assert.deepEqual(result.warnings || [], [], `${type} import warnings`);
  assert.equal(result.elements.length, 1120, `${type} polygon count`);
  assert.deepEqual(multiset(result.elements), expectedMasks, `${type} polygon geometry`);
  imported[type] = { polygons: result.elements.length, bytes: buf.length, parity: true };
}

const parts = arrayParts(model).sort((a, b) => a.y - b.y);
assert.equal(parts.length, 10);
const routes = JSON.parse(sourceBytes.get('routes.json').toString('utf8'));
assert.equal(routes.length, 160);
const thickness = (part, x, y, layerId) =>
  part.model.regions
    .filter((region) => pointInMulti([x - part.x, y - part.y], region.geom))
    .flatMap((region) => region.stack)
    .filter((s) => s.layerId === layerId)
    .reduce((z, s) => z + s.z1 - s.z0, 0);
let probes = 0;
const errors = [];
function check(part, label, x, y, ln, box) {
  probes++;
  const actual = [thickness(part, x, y, 'layer-2'), thickness(part, x, y, 'layer-1')];
  if (Math.abs(actual[0] - ln) > 1e-5 || Math.abs(actual[1] - box) > 1e-5) {
    errors.push({ label, x, y, actual, expected: [ln, box] });
  }
}
for (let row = 0; row < 10; row++) {
  const part = parts[row],
    cy = (row - 4.5) * 360;
  assert.equal(part.y, cy);
  for (let col = 0; col < 8; col++) {
    const cx = (col - 3.5) * 145,
      label = `${row}/${col}`;
    check(part, `${label} center`, cx, cy, 0.08, 0);
    check(part, `${label} rim`, cx + 18.5, cy, 0.3, 0);
    check(part, `${label} hole`, cx + 25, cy, 0, 2);
    for (const degrees of [45, 135, 225, 315]) {
      const radians = (degrees * Math.PI) / 180;
      check(
        part,
        `${label} anchor r30`,
        cx + 30 * Math.cos(radians),
        cy + 30 * Math.sin(radians),
        0.08,
        0,
      );
      check(
        part,
        `${label} anchor r40`,
        cx + 40 * Math.cos(radians),
        cy + 40 * Math.sin(radians),
        0.08,
        2,
      );
    }
    check(part, `${label} BOX`, cx + 55, cy, 0.3, 2);
    check(part, `${label} bus`, cx, cy - 20.8, 0.3, 2);
  }
}
for (const route of routes) {
  const points = route.centerline;
  for (const i of [
    0,
    Math.floor(points.length / 4),
    Math.floor(points.length / 2),
    Math.floor((3 * points.length) / 4),
    points.length - 2,
  ]) {
    check(
      parts[route.row],
      `fanout ${route.row}/${route.col}/${route.port}/${i}`,
      ...points[i],
      0.3,
      2,
    );
  }
}
assert.equal(probes, 1840);
assert.deepEqual(errors, []);

const fullStart = performance.now();
const full = buildRenderSurfacePlan(model);
const fullPlanMs = Math.round(performance.now() - fullStart);
const contourStart = performance.now();
const fullContours = borderInspectorContours(full);
const fullContourMs = Math.round(performance.now() - contourStart);
const roi = rectMulti(235, 135, -432.5, -1617.5);
const roiStart = performance.now();
const clipped = buildRenderSurfacePlan(model, roi);
const roiPlanMs = Math.round(performance.now() - roiStart);
assert.ok(full.caps.length > 0 && full.borderLines.length > 0);
assert.ok(
  clipped.caps.length > 0 && clipped.sidewalls.length > 0 && clipped.borderLines.length > 0,
);
const evidence = {
  status: 'passed',
  repoSource: source,
  node: process.version,
  integrityFiles: checked.length,
  project: {
    bytes: raw.length,
    version: project.version,
    instances: parts.length,
    sites: 80,
    templates: model.array.templates.length,
    polygons: project.layout.elements.length,
    dimensionsMicrometres: [model.width, model.height],
  },
  imported,
  physics: { probes, fanoutRoutes: routes.length, failures: errors.length },
  render: {
    full: {
      caps: full.caps.length,
      walls: full.sidewalls.length,
      exteriorLines: full.borderLines.length,
      internalInterfaceLines: fullContours.interface.length,
      buriedLines: fullContours.buried.length,
      planMs: fullPlanMs,
      outlineMs: fullContourMs,
    },
    roi: {
      caps: clipped.caps.length,
      walls: clipped.sidewalls.length,
      exteriorLines: clipped.borderLines.length,
      planMs: roiPlanMs,
    },
  },
  caveat:
    'This is native Node scientific/renderer-geometry evidence, not normal-origin Workstation acceptance.',
  totalMs: Math.round(performance.now() - started),
};
console.log(JSON.stringify(evidence, null, 2));
