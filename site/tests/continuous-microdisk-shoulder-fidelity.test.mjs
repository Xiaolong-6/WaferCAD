// Issue #362: published *masked* Microdisk M08, not a synthetic full-face etch.
// Compare the actual 3D display triangle surface to the immutable analytic
// material and production Section across steep shoulders and ROI crossings.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../project-io.js');
const { restoreContinuousMaterialOwner, continuousOwnerColumnAtXY } =
  await import('../continuous-material-owner.js');
const { continuousSectionContours } = await import('../continuous-etch-section.js');
const { buildContinuousSiHeightfieldMesh, continuousSiAdaptiveChordErrorUm } =
  await import('../continuous-heightfield-mesh.js');
const { clipContinuousSurfaceToRect } = await import('../continuous-etch-roi-mesh.js');
const { buildContinuousRectMeshCaps } = await import('../continuous-etch-roi-mesh-cap.js');

const model = (
  await readProjectFile(
    new Blob([
      readFileSync(
        new URL('../examples/suspended-silica-microdisks-continuous.wafercad', import.meta.url),
      ),
    ]),
  )
).model;
const owner = restoreContinuousMaterialOwner(model.continuousEtchOwner);
const original = JSON.stringify(model);
const baseline = buildContinuousSiHeightfieldMesh(owner, { xyStepUm: 1 });
const adaptiveChordErrorUm = continuousSiAdaptiveChordErrorUm(owner);
assert.equal(adaptiveChordErrorUm, 0.5);
const refined = buildContinuousSiHeightfieldMesh(owner, { xyStepUm: 1, adaptiveChordErrorUm });

function triangleZ(pos, tri, x, y) {
  const i = tri * 9;
  const ax = pos[i],
    ay = pos[i + 1],
    bx = pos[i + 3],
    by = pos[i + 4];
  const cx = pos[i + 6],
    cy = pos[i + 7];
  const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(det) < 1e-10) return null;
  const a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
  const b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
  const c = 1 - a - b;
  return Math.min(a, b, c) >= -1e-7 ? a * pos[i + 2] + b * pos[i + 5] + c * pos[i + 8] : null;
}

function spatialTopSampler(mesh) {
  const bins = new Map();
  const pos = mesh.positions;
  for (let tri = 0; tri < mesh.triangles; tri++) {
    const k = tri * 9;
    const x0 = Math.min(pos[k], pos[k + 3], pos[k + 6]);
    const x1 = Math.max(pos[k], pos[k + 3], pos[k + 6]);
    const y0 = Math.min(pos[k + 1], pos[k + 4], pos[k + 7]);
    const y1 = Math.max(pos[k + 1], pos[k + 4], pos[k + 7]);
    if (x1 - x0 < 1e-5 || y1 - y0 < 1e-5) continue;
    for (let j = Math.floor(y0 + 200); j <= Math.floor(y1 + 200); j++)
      for (let i = Math.floor(x0 + 200); i <= Math.floor(x1 + 200); i++) {
        const key = j * 500 + i;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push(tri);
      }
  }
  return (x, y) => {
    let top = -Infinity;
    for (const tri of bins.get(Math.floor(y + 200) * 500 + Math.floor(x + 200)) || []) {
      const value = triangleZ(pos, tri, x, y);
      if (value !== null) top = Math.max(top, value);
    }
    return top;
  };
}

function sectionTopAt(polys, t) {
  let top = -Infinity;
  for (const poly of polys)
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [t0, z0] = ring[i],
          [t1, z1] = ring[i + 1];
        if (
          Math.abs(t1 - t0) < 1e-12 ||
          t < Math.min(t0, t1) - 1e-10 ||
          t > Math.max(t0, t1) + 1e-10
        )
          continue;
        top = Math.max(top, z0 + ((t - t0) / (t1 - t0)) * (z1 - z0));
      }
    }
  return top;
}

function stats(values) {
  assert.ok(values.length > 3000, 'Dense published shoulder witness grid required');
  const sorted = values.toSorted((a, b) => a - b);
  return {
    samples: values.length,
    rms: Math.sqrt(values.reduce((sum, e) => sum + e * e, 0) / values.length),
    max: sorted.at(-1),
    p95: sorted[Math.ceil(0.95 * values.length) - 1],
  };
}

test('published M08 dense 3D/Section/owner shoulder cuts retain submicrometre fidelity', () => {
  const beforeTop = spatialTopSampler(baseline);
  const afterTop = spatialTopSampler(refined);
  for (const cut of [
    { name: 'center', a: [-170, 0], b: [170, 0] },
    { name: 'offset', a: [-170, 50], b: [170, 50] },
    { name: 'diagonal', a: [-170, -80], b: [170, 80] },
  ]) {
    const section = continuousSectionContours(model, cut.a, cut.b).find(
      (part) => part.layerId === 'base',
    );
    assert.ok(section?.polys?.length);
    const length = Math.hypot(cut.b[0] - cut.a[0], cut.b[1] - cut.a[1]);
    const before = [],
      after = [],
      sectionError = [],
      cross = [];
    for (let d = 4.025; d < length - 4; d += 0.1) {
      const t = d / length;
      const x = cut.a[0] + (cut.b[0] - cut.a[0]) * t;
      const y = cut.a[1] + (cut.b[1] - cut.a[1]) * t;
      const intervals = continuousOwnerColumnAtXY(owner, [x, y]).filter(
        (part) => part.layerId === 'base',
      );
      if (!intervals.length) continue;
      const exact = Math.max(...intervals.map((part) => part.z1));
      const oldZ = beforeTop(x, y),
        newZ = afterTop(x, y);
      const sectionZ = sectionTopAt(section.polys, t);
      assert.ok([exact, oldZ, newZ, sectionZ].every(Number.isFinite));
      before.push(Math.abs(oldZ - exact));
      after.push(Math.abs(newZ - exact));
      sectionError.push(Math.abs(sectionZ - exact));
      cross.push(Math.abs(newZ - sectionZ));
    }
    const report = {
      cut: cut.name,
      before: stats(before),
      after: stats(after),
      section: stats(sectionError),
      meshVsSection: stats(cross),
    };
    console.log('Issue #362 published shoulder witness ' + JSON.stringify(report));
    assert.ok(report.before.max > 0.8, 'Witness must exercise the original coarse-grid defect');
    assert.ok(report.after.max < 0.55, 'Locally refined 3D shoulder remains displaced');
    assert.ok(report.after.rms < 0.035, '3D shoulder RMS exceeds display tolerance');
    assert.ok(report.section.max < 0.06, 'Native Section no longer tracks analytic owner');
    assert.ok(report.meshVsSection.max < 0.55, '3D and Section show distinct shoulders');
    assert.ok(
      report.after.max < report.before.max * 0.55,
      'Adaptive mesh did not materially improve',
    );
  }
  assert.equal(baseline.triangles, 324800, 'Published 1 µm baseline changed');
  assert.ok(refined.triangles > baseline.triangles && refined.triangles < 450000);
  assert.ok(refined.grid.adaptiveRefinedCells > 0);
  assert.equal(JSON.stringify(model), original, 'Display must never modify published material');
});

function verifyWatertight(parts) {
  const edges = new Map();
  const coord = (positions, k) =>
    Array.from(positions.slice(k, k + 3), (value) => Math.round(value * 1e4)).join(':');
  for (const { positions } of parts)
    for (let k = 0; k < positions.length; k += 9) {
      const vertices = [coord(positions, k), coord(positions, k + 3), coord(positions, k + 6)];
      assert.equal(new Set(vertices).size, 3, 'Degenerate display triangle');
      for (let i = 0; i < 3; i++) {
        const a = vertices[i],
          b = vertices[(i + 1) % 3];
        const key = a < b ? a + '|' + b : b + '|' + a;
        const edge = edges.get(key) || [0, 0];
        edge[0]++;
        edge[1] += a < b ? 1 : -1;
        edges.set(key, edge);
      }
    }
  assert.ok(edges.size > 10000);
  for (const [key, [degree, winding]] of edges) {
    assert.equal(degree, 2, 'Open/nonmanifold refined edge ' + key);
    assert.equal(winding, 0, 'Incorrect refined winding at ' + key);
  }
}

test('published M08 locally refined 3D and cut ROI remain watertight and oriented', () => {
  verifyWatertight([refined]);
  const bounds = { minX: -75, minY: 56, maxX: -5, maxY: 114 };
  const cropped = clipContinuousSurfaceToRect(refined, bounds);
  const caps = buildContinuousRectMeshCaps(THREE, [cropped], bounds);
  assert.ok(cropped.triangles > 0 && caps[0]?.triangles > 0);
  verifyWatertight([cropped, ...caps]);
});
