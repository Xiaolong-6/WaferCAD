// Display-only analytic Si surface for a full rectangular, shallow-released substrate.
// The mathematical material owner remains authoritative; the raster is never
// persisted as material or used by Process, History, or scientific replay.
import { difference, unionGeometries, pointInMulti } from './vector-geometry.js';
import { geometryArea } from './model.js';

function distanceToFootprint([x, y], multi) {
  if (pointInMulti([x, y], multi)) return 0;
  let result = Infinity;
  for (const poly of multi)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i];
        const dx = b[0] - a[0],
          dy = b[1] - a[1];
        const sq = dx * dx + dy * dy;
        const t = sq ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / sq)) : 0;
        result = Math.min(result, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
      }
  return result;
}

export function canBuildContinuousSiHeightfield(owner) {
  const model = owner?.sourceModel;
  if (model?.shape !== 'rect' || !Array.isArray(model.regions) || !Array.isArray(owner.fronts))
    return false;
  if (!Number.isFinite(model.width) || !Number.isFinite(model.height)) return false;
  const base = [];
  for (const region of model.regions) {
    for (const part of region.stack) {
      if (part.layerId === 'base') base.push({ geom: region.geom, z0: part.z0, z1: part.z1 });
    }
  }
  if (!base.length || !base.every(({ z0, z1 }) => z0 === base[0].z0 && z1 === base[0].z1))
    return false;
  if (
    !owner.fronts.length ||
    !owner.fronts.every(
      (front) =>
        front.layerId === 'base' &&
        front.face === 'front' &&
        front.seedZ === base[0].z1 &&
        Number.isFinite(front.lateralUm) &&
        front.lateralUm > 0 &&
        Number.isFinite(front.verticalUm) &&
        front.verticalUm > 0 &&
        front.verticalUm < base[0].z1 - base[0].z0 &&
        ['circular', 'elliptical'].includes(front.shape),
    )
  )
    return false;
  const merged = unionGeometries(base.map((part) => part.geom));
  const outside = difference(merged, model.boundary);
  const missing = difference(model.boundary, merged);
  return geometryArea(outside) + geometryArea(missing) < model.width * model.height * 1e-12;
}

function physicalTopAt(owner, x, y, originalTop) {
  let top = originalTop;
  for (const front of owner.fronts) {
    const dist = distanceToFootprint([x, y], front.seedGeom);
    if (dist >= front.lateralUm) continue;
    const reach = front.verticalUm * Math.sqrt(Math.max(0, 1 - (dist / front.lateralUm) ** 2));
    top = Math.min(top, front.seedZ - reach);
  }
  return top;
}

export function buildContinuousSiHeightfieldMesh(
  owner,
  { xyStepUm = 1, maxTriangles = 1200000 } = {},
) {
  if (!canBuildContinuousSiHeightfield(owner))
    throw new RangeError(
      'Continuous heightfield requires full planar source silicon and shallow curved front release',
    );
  if (
    !(Number.isFinite(xyStepUm) && xyStepUm > 0) ||
    !Number.isSafeInteger(maxTriangles) ||
    maxTriangles < 1
  )
    throw new RangeError('Invalid heightfield display budget');
  const model = owner.sourceModel;
  const vertices = model.boundary[0][0];
  if (vertices.length !== 5)
    throw new RangeError('Only exact four-corner physical silicon boundaries are supported');
  const corners = vertices.slice(0, 4);
  const minX = Math.min(...corners.map((p) => p[0])),
    maxX = Math.max(...corners.map((p) => p[0]));
  const minY = Math.min(...corners.map((p) => p[1])),
    maxY = Math.max(...corners.map((p) => p[1]));
  if (
    !corners.every(([x, y]) => (x === minX || x === maxX) && (y === minY || y === maxY)) ||
    maxX - minX !== model.width ||
    maxY - minY !== model.height
  )
    throw new RangeError('Heightfield substrate must be an axis-aligned physical rectangle');
  const nx = Math.ceil(model.width / xyStepUm),
    ny = Math.ceil(model.height / xyStepUm);
  const expectedTriangles = 2 * nx * ny + 6 * (nx + ny);
  if (!Number.isSafeInteger(expectedTriangles) || expectedTriangles > maxTriangles)
    throw new RangeError('Continuous heightfield exceeds triangle budget');
  const zBottom = Math.min(
    ...model.regions.flatMap((r) => r.stack.filter((s) => s.layerId === 'base').map((s) => s.z0)),
  );
  const originalTop = Math.max(
    ...model.regions.flatMap((r) => r.stack.filter((s) => s.layerId === 'base').map((s) => s.z1)),
  );
  const dx = model.width / nx,
    dy = model.height / ny;
  const top = new Float64Array((nx + 1) * (ny + 1));
  const index = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++)
      top[index(i, j)] = physicalTopAt(owner, minX + dx * i, minY + dy * j, originalTop);
  const pos = new Float32Array(expectedTriangles * 9);
  const normal = new Float32Array(expectedTriangles * 9);
  let write = 0;
  const xy = (i, j) => [minX + dx * i, minY + dy * j];
  const surface = (i, j) => [...xy(i, j), top[index(i, j)]];
  const bottom = (i, j) => [...xy(i, j), zBottom];
  const pushTri = (a, b, c, normals) => {
    const points = [a, b, c];
    for (let k = 0; k < 3; k++) {
      for (let j = 0; j < 3; j++) {
        pos[write] = points[k][j];
        normal[write++] = normals[k][j];
      }
    }
  };
  const unitNormal = (i, j) => {
    const a = top[index(Math.max(0, i - 1), j)],
      b = top[index(Math.min(nx, i + 1), j)];
    const c = top[index(i, Math.max(0, j - 1))],
      d = top[index(i, Math.min(ny, j + 1))];
    const gx = (b - a) / (Math.min(nx, i + 1) - Math.max(0, i - 1)) / dx;
    const gy = (d - c) / (Math.min(ny, j + 1) - Math.max(0, j - 1)) / dy;
    const length = Math.hypot(gx, gy, 1);
    return [-gx / length, -gy / length, 1 / length];
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = surface(i, j),
        b = surface(i + 1, j),
        c = surface(i + 1, j + 1),
        d = surface(i, j + 1);
      const na = unitNormal(i, j),
        nb = unitNormal(i + 1, j),
        nc = unitNormal(i + 1, j + 1),
        nd = unitNormal(i, j + 1);
      pushTri(a, b, c, [na, nb, nc]);
      pushTri(a, c, d, [na, nc, nd]);
    }
  // The underside is planar; one center-to-perimeter fan replaces a full
  // raster, retaining top/side/bottom watertight perimeter ownership.
  const ring = [];
  for (let i = 0; i < nx; i++) ring.push(bottom(i, 0));
  for (let j = 0; j < ny; j++) ring.push(bottom(nx, j));
  for (let i = nx; i > 0; i--) ring.push(bottom(i, ny));
  for (let j = ny; j > 0; j--) ring.push(bottom(0, j));
  const center = [(minX + maxX) / 2, (minY + maxY) / 2, zBottom];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    pushTri(center, b, a, [
      [0, 0, -1],
      [0, 0, -1],
      [0, 0, -1],
    ]);
  }
  const wall = (i0, j0, i1, j1, n) => {
    const a = surface(i0, j0),
      b = surface(i1, j1),
      a0 = bottom(i0, j0),
      b0 = bottom(i1, j1);
    pushTri(a, a0, b0, [n, n, n]);
    pushTri(a, b0, b, [n, n, n]);
  };
  for (let i = 0; i < nx; i++) {
    wall(i, 0, i + 1, 0, [0, -1, 0]);
    wall(i + 1, ny, i, ny, [0, 1, 0]);
  }
  for (let j = 0; j < ny; j++) {
    wall(nx, j, nx, j + 1, [1, 0, 0]);
    wall(0, j + 1, 0, j, [-1, 0, 0]);
  }
  if (write / 9 !== expectedTriangles)
    throw new RangeError('Unclosed analytic heightfield triangulation budget');
  return {
    layerId: 'base',
    positions: pos,
    normals: normal,
    triangles: write / 9,
    kind: 'continuous-silicon-heightfield-display-v1',
    grid: { nx, ny, xyStepUm },
    sourceRevision: model.revision,
  };
}
