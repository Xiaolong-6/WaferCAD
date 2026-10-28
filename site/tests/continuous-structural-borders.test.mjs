import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { readProjectFile } from '../project-io.js';
import { buildContinuousSiHeightfieldMesh } from '../continuous-heightfield-mesh.js';
import { clipContinuousSurfaceToRect } from '../continuous-etch-roi-mesh.js';
import { clipContinuousDisplayZBreak } from '../continuous-display-z-break.js';
import { continuousStructuralBorderPositions } from '../continuous-structural-borders.js';

function compareThreeEdges(positions, threshold = 60) {
  const input = new THREE.BufferGeometry();
  input.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const reference = new THREE.EdgesGeometry(input, threshold);
  const native = reference.getAttribute('position').array;
  const actual = continuousStructuralBorderPositions(positions, threshold);
  const edges = (data) => {
    const counts = new Map();
    for (let i = 0; i < data.length; i += 6) {
      const v = (offset) =>
        Array.from(data.subarray(i + offset, i + offset + 3), (n) => Math.round(n * 1e4)).join(',');
      const a = v(0),
        b = v(3),
        key = a < b ? `${a}|${b}` : `${b}|${a}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  };
  try {
    assert.deepEqual(edges(actual), edges(native));
    return actual.length / 6;
  } finally {
    input.dispose();
    reference.dispose();
  }
}

test('Continuous structural Borders exactly preserve Three.js cube, curved tube and degenerate edges', () => {
  const cube = new THREE.BoxGeometry(5, 5, 5).toNonIndexed();
  assert.equal(compareThreeEdges(cube.getAttribute('position').array), 12);
  cube.dispose();
  const tube = new THREE.TorusGeometry(8, 3, 18, 35).toNonIndexed();
  compareThreeEdges(tube.getAttribute('position').array, 60);
  compareThreeEdges(tube.getAttribute('position').array, 25);
  tube.dispose();
  const degenerate = Float32Array.from([0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0]);
  compareThreeEdges(degenerate);
  assert.throws(() => continuousStructuralBorderPositions([0, 0, 0]), /Invalid/);
  assert.throws(() => continuousStructuralBorderPositions(new Float32Array(9), -1), /angle/);
});

test('HBAR fine Si 3D structural Border equals Three.js in full mesh and real ROI/Z Break', async () => {
  await loadGeometryKernel();
  const file = new URL(
    '../../examples/projects/hbar-blesin-2024-candidate/hbar-blesin-2024-author-roi.wafercad',
    import.meta.url,
  );
  const bytes = readFileSync(file);
  const project = await readProjectFile({
    size: bytes.length,
    text: async () => bytes.toString('utf8'),
  });
  const fine = buildContinuousSiHeightfieldMesh(project.model.continuousEtchOwner, {
    xyStepUm: 0.5,
  });
  assert.equal(fine.triangles, 159360);
  assert.ok(compareThreeEdges(fine.positions) > 2000);
  const cropped = clipContinuousSurfaceToRect(fine, {
    minX: -42,
    minY: -30,
    maxX: 42,
    maxY: 30,
  });
  assert.ok(cropped.triangles > 0);
  assert.ok(compareThreeEdges(cropped.positions) > 0);
  const zBreak = clipContinuousDisplayZBreak(cropped, {
    enabled: true,
    top: 21,
    bottom: 0,
  });
  assert.ok(zBreak.triangles > 0);
  assert.ok(compareThreeEdges(zBreak.positions) > 0);
});
