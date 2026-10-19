import { unionGeometries } from './vector-geometry.js';

// Derived visualization geometry. The immutable continuous material owner remains
// authoritative: mesh resolution must never enter project storage or Process.
// Input: validated {sourceModel, fronts}; output: physical-um surface triangles.

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}

function signedFootprintDistance(x, y, multi) {
  let inside = false;
  let minSquared = Infinity;
  for (const poly of multi || []) {
    if (pointInRing(x, y, poly[0]) && !poly.slice(1).some((r) => pointInRing(x, y, r)))
      inside = true;
    for (const ring of poly)
      for (let k = 1; k < ring.length; k++) {
        const a = ring[k - 1];
        const b = ring[k];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
        const rx = x - a[0] - t * dx;
        const ry = y - a[1] - t * dy;
        minSquared = Math.min(minSquared, rx * rx + ry * ry);
      }
  }
  const magnitude = Math.sqrt(minSquared);
  return inside ? magnitude : -magnitude;
}

const TETS = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
];
const CORNERS = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

function emitTetra(position, value, out) {
  const inside = [];
  const outside = [];
  for (let i = 0; i < 4; i++) (value[i] > 0 ? inside : outside).push(i);
  if (!inside.length || !outside.length) return;
  const interpolate = (a, b) => {
    const v0 = value[a],
      v1 = value[b];
    const t = v0 === v1 ? 0.5 : Math.max(0, Math.min(1, v0 / (v0 - v1)));
    return [
      position[a][0] + (position[b][0] - position[a][0]) * t,
      position[a][1] + (position[b][1] - position[a][1]) * t,
      position[a][2] + (position[b][2] - position[a][2]) * t,
    ];
  };
  const insideCenter = [0, 0, 0],
    outsideCenter = [0, 0, 0];
  for (const i of inside)
    for (let j = 0; j < 3; j++) insideCenter[j] += position[i][j] / inside.length;
  for (const i of outside)
    for (let j = 0; j < 3; j++) outsideCenter[j] += position[i][j] / outside.length;
  const outward = outsideCenter.map((a, j) => a - insideCenter[j]);
  const addTriangle = (a, b, c) => {
    const u = b.map((t, j) => t - a[j]),
      v = c.map((t, j) => t - a[j]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const signedArea = n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2];
    if (Math.hypot(...n) < 1e-10) return;
    const points = signedArea >= 0 ? [a, b, c] : [a, c, b];
    for (const point of points) out.push(...point);
  };
  if (inside.length === 1 || outside.length === 1) {
    const pivot = (inside.length === 1 ? inside : outside)[0];
    const others = inside.length === 1 ? outside : inside;
    addTriangle(
      interpolate(pivot, others[0]),
      interpolate(pivot, others[1]),
      interpolate(pivot, others[2]),
    );
  } else {
    const [a, b] = inside,
      [c, d] = outside;
    const ac = interpolate(a, c),
      ad = interpolate(a, d),
      bc = interpolate(b, c),
      bd = interpolate(b, d);
    addTriangle(ac, ad, bc);
    addTriangle(ad, bd, bc);
  }
}

function smoothNormals(vertices) {
  const normal = new Float32Array(vertices.length);
  // Numeric spatial hashes avoid allocating millions of string keys during
  // the two-pass smooth-normal accumulation. A bucket is checked against the
  // full quantized XYZ triple, so hash collisions never merge distinct points.
  const sums = new Map();
  const recordAt = (index, create) => {
    const qx = Math.round(vertices[index] * 10000);
    const qy = Math.round(vertices[index + 1] * 10000);
    const qz = Math.round(vertices[index + 2] * 10000);
    const hash =
      (Math.imul(qx, 73856093) ^ Math.imul(qy, 19349663) ^ Math.imul(qz, 83492791)) >>> 0;
    let bucket = sums.get(hash);
    if (!bucket) {
      if (!create) throw new RangeError('Missing continuous mesh normal vertex');
      bucket = [];
      sums.set(hash, bucket);
    }
    for (const entry of bucket)
      if (entry[0] === qx && entry[1] === qy && entry[2] === qz) return entry;
    if (!create) throw new RangeError('Missing continuous mesh normal vertex');
    const entry = [qx, qy, qz, 0, 0, 0];
    bucket.push(entry);
    return entry;
  };
  for (let i = 0; i < vertices.length; i += 9) {
    const ux = vertices[i + 3] - vertices[i],
      uy = vertices[i + 4] - vertices[i + 1],
      uz = vertices[i + 5] - vertices[i + 2];
    const vx = vertices[i + 6] - vertices[i],
      vy = vertices[i + 7] - vertices[i + 1],
      vz = vertices[i + 8] - vertices[i + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    for (let offset = 0; offset < 9; offset += 3) {
      const entry = recordAt(i + offset, true);
      entry[3] += nx;
      entry[4] += ny;
      entry[5] += nz;
    }
  }
  for (let i = 0; i < vertices.length; i += 3) {
    const n = recordAt(i, false);
    const magnitude = Math.hypot(n[3], n[4], n[5]) || 1;
    normal[i] = n[3] / magnitude;
    normal[i + 1] = n[4] / magnitude;
    normal[i + 2] = n[5] / magnitude;
  }
  // A planar extrusion has a Z-invariant wall normal. Marching-tetrahedron
  // diagonals can otherwise create false horizontal shading bands on long
  // vertical walls even though the canonical sidewall is exactly vertical.
  const wallSums = new Map();
  const wallKey = (index) =>
    Math.round(vertices[index] * 5) + ',' + Math.round(vertices[index + 1] * 5);
  for (let i = 0; i < vertices.length; i += 3) {
    if (Math.abs(normal[i + 2]) > 0.18) continue;
    const key = wallKey(i);
    if (!wallSums.has(key)) wallSums.set(key, [0, 0]);
    const summed = wallSums.get(key);
    summed[0] += normal[i];
    summed[1] += normal[i + 1];
  }
  for (let i = 0; i < vertices.length; i += 3) {
    if (Math.abs(normal[i + 2]) > 0.18) continue;
    const summed = wallSums.get(wallKey(i));
    const magnitude = Math.hypot(...summed);
    if (!(magnitude > 0)) continue;
    normal[i] = summed[0] / magnitude;
    normal[i + 1] = summed[1] / magnitude;
    normal[i + 2] = 0;
  }
  return normal;
}

function footprintBounds(multi, box) {
  for (const poly of multi || [])
    for (const ring of poly)
      for (const p of ring) {
        box.minX = Math.min(box.minX, p[0]);
        box.maxX = Math.max(box.maxX, p[0]);
        box.minY = Math.min(box.minY, p[1]);
        box.maxY = Math.max(box.maxY, p[1]);
      }
}

export function buildContinuousMaterialSurfaceMesh(
  owner,
  { xyStepUm = 2.5, zStepUm = 1.25, maxVoxels = 4000000, maxTriangles = 1500000 } = {},
) {
  if (!owner?.sourceModel?.regions || !Array.isArray(owner.fronts))
    throw new RangeError('Continuous release requires validated source and fronts');
  if (![xyStepUm, zStepUm].every((v) => Number.isFinite(v) && v > 0))
    throw new RangeError('Invalid sampling precision');
  const source = owner.sourceModel;
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  let minZ = Infinity,
    maxZ = -Infinity;
  for (const region of source.regions) {
    footprintBounds(region.geom, box);
    for (const part of region.stack) {
      minZ = Math.min(minZ, part.z0);
      maxZ = Math.max(maxZ, part.z1);
    }
  }
  if (![box.minX, box.maxX, box.minY, box.maxY, minZ, maxZ].every(Number.isFinite))
    throw new RangeError('Invalid continuous bounding box');
  const padding = Math.max(xyStepUm * 1.2, 0.5);
  const nx = Math.ceil((box.maxX - box.minX + 2 * padding) / xyStepUm);
  const ny = Math.ceil((box.maxY - box.minY + 2 * padding) / xyStepUm);
  // Fail before allocating XY distance maps for pathological precision inputs.
  if (!Number.isSafeInteger(nx) || !Number.isSafeInteger(ny) || nx * ny > maxVoxels)
    throw new RangeError('Continuous surface exceeds display voxel budget');
  let usedVoxels = 0;
  const xs = Array.from(
    { length: nx + 1 },
    (_, i) => box.minX - padding + (i * (box.maxX - box.minX + 2 * padding)) / nx,
  );
  const ys = Array.from(
    { length: ny + 1 },
    (_, i) => box.minY - padding + (i * (box.maxY - box.minY + 2 * padding)) / ny,
  );
  // Canonical 2.5D cells may share an internal XY edge while owning the
  // SAME physical material and Z span. A max() of two independent signed
  // distances is zero on that internal edge, creating a fictitious slit and
  // surface ribbons through an otherwise solid region. Union these display
  // footprints first. The stored source/History remains untouched.
  const mergedParts = new Map();
  for (const region of source.regions)
    for (const segment of region.stack) {
      const key = JSON.stringify([segment.layerId, segment.z0, segment.z1]);
      if (!mergedParts.has(key))
        mergedParts.set(key, { layerId: segment.layerId, segment, footprints: [] });
      mergedParts.get(key).footprints.push(region.geom);
    }
  const solids = [...mergedParts.values()].map(({ layerId, segment, footprints }) => ({
    layerId,
    segment,
    geom: footprints.length === 1 ? footprints[0] : unionGeometries(footprints),
  }));
  const planeSize = (nx + 1) * (ny + 1);
  const xySigned = solids.map(() => new Float32Array(planeSize));
  const depthFields = owner.fronts.map((f) => new Float32Array(planeSize));
  for (let iy = 0; iy <= ny; iy++)
    for (let ix = 0; ix <= nx; ix++) {
      const p = ix + (nx + 1) * iy;
      for (let r = 0; r < solids.length; r++)
        xySigned[r][p] = signedFootprintDistance(xs[ix], ys[iy], solids[r].geom);
      for (let f = 0; f < owner.fronts.length; f++) {
        const front = owner.fronts[f];
        const seedSigned = signedFootprintDistance(xs[ix], ys[iy], front.seedGeom);
        const distance = Math.max(0, -seedSigned);
        if (distance >= front.lateralUm) {
          depthFields[f][p] = 0;
          continue;
        }
        depthFields[f][p] =
          front.shape === 'vertical'
            ? front.verticalUm
            : front.verticalUm * Math.sqrt(Math.max(0, 1 - (distance / front.lateralUm) ** 2));
      }
    }
  const layers = [...new Set(source.layers.map((l) => l.id))];
  const results = [];
  let totalTriangles = 0;
  for (const layerId of layers) {
    const parts = solids.flatMap(({ layerId: ownedLayerId, segment }, ri) =>
      ownedLayerId === layerId ? [{ ri, segment }] : [],
    );
    if (!parts.length) continue;
    const layerMinZ = Math.min(...parts.map(({ segment }) => segment.z0));
    const layerMaxZ = Math.max(...parts.map(({ segment }) => segment.z1));
    const minThickness = Math.min(...parts.map(({ segment }) => segment.z1 - segment.z0));
    const layerZStep = Math.min(zStepUm, minThickness / 5);
    const nz = Math.ceil((layerMaxZ - layerMinZ + 2 * layerZStep) / layerZStep);
    usedVoxels += nx * ny * nz;
    if (usedVoxels > maxVoxels)
      throw new RangeError('Continuous surface exceeds display voxel budget');
    const zs = Array.from(
      { length: nz + 1 },
      (_, i) => layerMinZ - layerZStep + (i * (layerMaxZ - layerMinZ + 2 * layerZStep)) / nz,
    );
    const slices = [new Float32Array(planeSize), new Float32Array(planeSize)];
    const buildSlice = (j, z) => {
      const values = slices[j];
      for (let p = 0; p < planeSize; p++) {
        let scalar = -Infinity;
        for (const { ri, segment } of parts) {
          let segmentScalar = Math.min(xySigned[ri][p], z - segment.z0, segment.z1 - z);
          if (segmentScalar > 0)
            for (let f = 0; f < owner.fronts.length; f++) {
              const front = owner.fronts[f];
              if (front.layerId !== layerId || !(depthFields[f][p] > 0)) continue;
              const d = depthFields[f][p];
              const remain = front.face === 'front' ? front.seedZ - d - z : z - front.seedZ - d;
              segmentScalar = Math.min(segmentScalar, remain);
            }
          scalar = Math.max(scalar, segmentScalar);
        }
        // A tiny display-only iso-offset avoids singular tetrahedra when the
        // exact interface happens to land on a grid vertex.
        values[p] = scalar - 1e-4;
      }
    };
    const positions = [];
    buildSlice(0, zs[0]);
    for (let iz = 0; iz < nz; iz++) {
      buildSlice(1, zs[iz + 1]);
      for (let iy = 0; iy < ny; iy++)
        for (let ix = 0; ix < nx; ix++) {
          const ids = [
            ix + (nx + 1) * iy,
            ix + 1 + (nx + 1) * iy,
            ix + 1 + (nx + 1) * (iy + 1),
            ix + (nx + 1) * (iy + 1),
          ];
          const cubePositions = CORNERS.map(([dx, dy, dz]) => [
            xs[ix + dx],
            ys[iy + dy],
            zs[iz + dz],
          ]);
          const values = [
            slices[0][ids[0]],
            slices[0][ids[1]],
            slices[0][ids[2]],
            slices[0][ids[3]],
            slices[1][ids[0]],
            slices[1][ids[1]],
            slices[1][ids[2]],
            slices[1][ids[3]],
          ];
          let haveInside = false,
            haveOutside = false;
          for (const v of values) {
            if (v > 0) haveInside = true;
            else haveOutside = true;
          }
          if (!haveInside || !haveOutside) continue;
          for (const tet of TETS) {
            emitTetra(
              tet.map((i) => cubePositions[i]),
              tet.map((i) => values[i]),
              positions,
            );
          }
          if (positions.length / 9 + totalTriangles > maxTriangles)
            throw new RangeError('Continuous surface exceeds display triangle budget');
        }
      slices.reverse();
    }
    if (positions.length) {
      const vertices = Float32Array.from(positions);
      const normals = smoothNormals(vertices);
      totalTriangles += vertices.length / 9;
      results.push({
        layerId,
        positions: vertices,
        normals,
        triangles: vertices.length / 9,
      });
    }
  }
  return {
    kind: 'continuous-etch-sampled-surface-v1',
    layers: results,
    triangles: totalTriangles,
    grid: { nx, ny, voxels: usedVoxels, xyStepUm, zStepUm },
    sourceRevision: source.revision,
  };
}
