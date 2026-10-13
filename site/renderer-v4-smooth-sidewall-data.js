// CPU-only exact mesh data for smooth, unindexed sidewalls. Does not change model data.
import { mergeCollinearSidewallParts } from './renderer-line-reduction.js';

export function canPrepareSmoothSidewallsInWorker(
  parts,
  { displayTolerance = 0, indexedSmooth = false, minParts = 8 } = {},
) {
  return (
    displayTolerance === 0 &&
    indexedSmooth === false &&
    Array.isArray(parts) &&
    parts.length >= minParts &&
    parts.every(
      (part) =>
        part &&
        Array.isArray(part.p) &&
        Array.isArray(part.q) &&
        part.p.length >= 2 &&
        part.q.length >= 2 &&
        [...part.p.slice(0, 2), ...part.q.slice(0, 2), part.z0, part.z1].every(Number.isFinite) &&
        !part.lowerSurface?.appearance &&
        !part.upperSurface?.appearance &&
        !Number.isFinite(Number(part.lowerDepth)) &&
        !Number.isFinite(Number(part.upperDepth)),
    )
  );
}

export function prepareSmoothSidewallData(parts) {
  if (!canPrepareSmoothSidewallsInWorker(parts, { minParts: 1 })) {
    throw new TypeError('Only smooth, unindexed, depth-free sidewalls are supported');
  }
  const positions = [];
  const normals = [];
  const triangle = (a, b, c) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const magnitude = Math.hypot(...normal) || 1;
    const unit = normal.map((value) => value / magnitude);
    positions.push(...a, ...b, ...c);
    normals.push(...unit, ...unit, ...unit);
  };
  for (const part of mergeCollinearSidewallParts(parts)) {
    const p = part.p;
    const q = part.q;
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    if (Math.hypot(dx, dy) <= 1e-4) continue;
    if (Math.abs(Number(part.z1) - Number(part.z0)) <= 1e-9) continue;
    const lower0 = [p[0], p[1], part.z0];
    const lower1 = [q[0], q[1], part.z0];
    const upper1 = [q[0], q[1], part.z1];
    const upper0 = [p[0], p[1], part.z1];
    triangle(lower0, lower1, upper1);
    triangle(lower0, upper1, upper0);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
  };
}
