import { isEmpty, transformMulti } from './vector-geometry.js';
import {
  difference,
  intersection,
  unionGeometries,
  materialGeometryArea,
  unionMaterialSweeps,
  materialGeometryBounds,
  materialBoundsQuery,
  offsetMaterialOpening,
  materialGeometriesTouch,
} from './material-process-boolean.js';
import { validateMaterialThicknessUm } from './process-numerical-contract.js';
import {
  materialOwnerCoverage,
  partitionMaterialProcess,
  repairMaterialHaloPartition,
} from './material-process-partition.js';
import { nodeMaterialProcessInputs } from './material-process-noding.js';
import { unionMaterialTiles } from './material-tile-union.js';

const EPS = 1e-8;
// Only for validated, disjoint source regions after shared-grid noding.
const unionSourceTiles = (geometries) =>
  unionMaterialTiles(geometries) ?? unionMaterialSweeps(geometries);
function unionCroppedTiles(geometries) {
  if (geometries.length < 2) return geometries[0] || [];
  const shared = unionMaterialTiles(geometries, { gridScale: 10000000 });
  if (shared) return shared;
  // Cropping a validated source partition keeps its interiors disjoint.
  // Re-node only transient clipping vertices on the existing fine Boolean
  // lattice; persisted material still uses the ordinary 0.1 nm grid.
  const noded = nodeMaterialProcessInputs(geometries, {
    sourceCount: geometries.length,
    gridScale: 10000000,
  });
  return unionMaterialTiles(noded, { gridScale: 10000000 }) ?? unionMaterialSweeps(noded);
}
const shift = (g, x, y) => transformMulti(g, ([a, b]) => [a + x, b + y]);

// Exact polygon sweep by a line segment, including concave rings and holes.
// This is a geometric parallel-ray model, not a deposition-kinetics model.
export function sweepMaterialPolygon(geom, dx, dy) {
  if (Math.hypot(dx, dy) < 1e-12) return geom;
  const pieces = [geom, shift(geom, dx, dy)];
  for (const poly of geom)
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        if (Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) < 1e-14) continue;
        pieces.push([[[a, b, [b[0] + dx, b[1] + dy], [a[0] + dx, a[1] + dy], a]]]);
      }
    }
  return unionMaterialSweeps(pieces);
}

function merge(model, regions, api) {
  const groups = new Map();
  for (const r of regions) {
    const stack = api.normalizeStack(r.stack);
    if (!stack.length || isEmpty(r.geom)) continue;
    const key = JSON.stringify(
      stack.map((s) => ({ ...s, z0: s.z0.toFixed(9), z1: s.z1.toFixed(9) })),
    );
    if (!groups.has(key)) groups.set(key, { stack, geoms: [] });
    groups.get(key).geoms.push(r.geom);
  }
  return [...groups.values()].map(({ stack, geoms }) => ({
    id: `region-${model.nextRegionId++}`,
    stack,
    geom: unionMaterialSweeps(geoms),
  }));
}

// Insert at the actual illuminated Z, including beneath a resist overhang.
// Deposits never replace existing material, nor jump to a column's upper cap.
function insert(model, patches, layerId, api) {
  let regions = model.regions;
  const coverage = unionGeometries(model.regions.map((r) => r.geom));
  for (const source of patches) {
    const patch = source;
    const next = [];
    const remaining = difference(patch.geom, coverage);
    for (const region of regions) {
      let intervals = [[patch.z0, patch.z1]];
      for (const occupied of region.stack) {
        intervals = intervals.flatMap(([lo, hi]) => {
          if (occupied.z1 <= lo + EPS || occupied.z0 >= hi - EPS) return [[lo, hi]];
          return [
            [lo, Math.min(hi, occupied.z0)],
            [Math.max(lo, occupied.z1), hi],
          ].filter(([a, b]) => b > a + EPS);
        });
      }
      if (!intervals.length) {
        next.push(region);
        continue;
      }
      const hit = intersection(region.geom, patch.geom);
      if (isEmpty(hit)) {
        next.push(region);
        continue;
      }
      const rest = difference(region.geom, hit);
      if (!isEmpty(rest)) next.push({ ...region, geom: rest });
      next.push({
        geom: hit,
        stack: [...region.stack, ...intervals.map(([z0, z1]) => ({ layerId, z0, z1 }))],
      });
    }
    if (!isEmpty(remaining))
      next.push({ geom: remaining, stack: [{ layerId, z0: patch.z0, z1: patch.z1 }] });
    regions = next;
  }
  return merge(model, regions, api);
}

/** Opt-in Direct on canonical material, with exact swept ray shadows and
 * horizontal targets inside undercuts. Vertical-facet growth is discretized
 * in physical Z; the slice size is explicit and must be convergence checked.
 * All planning uses the pre-dose geometry. Following doses use the new solids.
 */
export function applyMaterialDirect(model, params, area, api, traceHorizontalCaps = false) {
  const destination = model;
  model = structuredClone(model);
  const incidence = params.incidence;
  const error = validateMaterialThicknessUm(params.thickness);
  if (error) throw new RangeError(error);
  api.assertInputPartition(model);
  const repairedHalo = params.materialHaloRepaired === true;
  // Visibility must use one shared process-grid arrangement too. Otherwise
  // sub-grid seams from the previous dose become fictitious full-depth walls.
  // A repaired native halo already owns one validated shared arrangement.
  if (!repairedHalo) {
    const sourceGeometry = nodeMaterialProcessInputs(
      model.regions.map((r) => r.geom),
      { sourceCount: model.regions.length },
    );
    model.regions = model.regions
      .map((r, i) => ({
        ...r,
        geom: sourceGeometry[i]
          .filter((p) => materialGeometryArea([p]) > 0 && api.geometryArea([[p[0]]]) > 0)
          .map((p) => [p[0], ...p.slice(1).filter((h) => api.geometryArea([[h]]) > 0)]),
      }))
      .filter((r) => r.geom.length);
    // The validated source can acquire a grid-width overlap when its
    // shared edges are noded. Reconcile only witnessed numerical seams
    // against the original support before deriving receiving surfaces.
    repairMaterialHaloPartition(model, () => materialOwnerCoverage(destination));
  }
  const uniteSource = repairedHalo
    ? (geometries) =>
        unionMaterialTiles(geometries) ??
        unionMaterialTiles(geometries, { gridScale: 10000000 }) ??
        unionGeometries(geometries)
    : unionSourceTiles;
  if (
    model.kernel !== 'vector-2.5d-v1' ||
    model.array ||
    params.face === 'back' ||
    params.face === 'both'
  )
    throw new RangeError('Material Direct requires a front-face 2.5D model.');
  if (incidence.apertureStack?.length || incidence.sidewallGeometry)
    throw new RangeError(
      'Material Direct derives occlusion from actual material; remove external apertures.',
    );
  const theta = incidence.tiltDeg,
    phi = incidence.azimuthDeg;
  const step = incidence.heightStepUm ?? 0.025;
  if (!(Number.isFinite(theta) && theta >= 0 && theta < 89 && Number.isFinite(phi)))
    throw new RangeError('Material Direct requires finite tilt 0–<89° and azimuth.');
  if (!(Number.isFinite(step) && step >= 0.0001 && step <= 0.05))
    throw new RangeError('Material Direct Z slice must be within 0.0001–0.05 µm.');
  const vx = Math.tan((theta * Math.PI) / 180) * Math.cos((phi * Math.PI) / 180);
  const vy = Math.tan((theta * Math.PI) / 180) * Math.sin((phi * Math.PI) / 180);
  const limit = intersection(area, model.boundary);
  const slabs = new Map(),
    caps = new Map();
  for (const r of model.regions) {
    // Occlusion depends on occupied volume, not on internal material labels.
    // Coalesce touching slabs for visibility only; canonical layers and all
    // genuine undercut gaps remain unchanged in the stored material stack.
    const occupied = [];
    for (const segment of r.stack) {
      const previous = occupied.at(-1);
      if (previous && segment.z0 <= previous.z1 + EPS)
        previous.z1 = Math.max(previous.z1, segment.z1);
      else occupied.push({ z0: segment.z0, z1: segment.z1 });
    }
    for (let i = 0; i < occupied.length; i++) {
      const s = occupied[i];
      const key = `${s.z0}|${s.z1}`;
      if (!slabs.has(key)) slabs.set(key, { z0: s.z0, z1: s.z1, geoms: [] });
      slabs.get(key).geoms.push(r.geom);
      if (!occupied[i + 1] || occupied[i + 1].z0 > s.z1 + EPS) {
        if (!caps.has(s.z1)) caps.set(s.z1, []);
        caps.get(s.z1).push(r.geom);
      }
    }
  }
  // A validated, disjoint rectangular tiling with equal total area fills the
  // whole domain. Avoid re-unioning hundreds of buried Si fragments merely to
  // rediscover an unchanged solid wafer cross-section.
  let xyArea = 0,
    compensation = 0;
  for (const region of model.regions) {
    const term = materialGeometryArea(region.geom) - compensation;
    const next = xyArea + term;
    compensation = next - xyArea - term;
    xyArea = next;
  }
  const domainArea = materialGeometryArea(model.boundary);
  const rect =
    model.boundary.length === 1 &&
    model.boundary[0].length === 1 &&
    model.boundary[0][0].length === 5 &&
    model.boundary[0][0]
      .slice(1)
      .every((p, i) => p[0] === model.boundary[0][0][i][0] || p[1] === model.boundary[0][0][i][1]);
  const fullCoverage =
    rect && Math.abs(xyArea - domainArea) <= Math.max(1e-18, model.width * model.height * 1e-15);
  // Use disjoint Z bands for visibility. This is the same occupied volume,
  // with at most one occluder per physical height interval instead of every
  // combination of lower/upper material boundaries from earlier doses.
  const sourceSolids = [...slabs.values()];
  const levels = [...new Set(sourceSolids.flatMap((s) => [s.z0, s.z1]))].sort((a, b) => a - b);
  const solids = [];
  for (let i = 0; i < levels.length - 1; i++) {
    const z0 = levels[i],
      z1 = levels[i + 1];
    if (z1 - z0 <= EPS) continue;
    const geoms = sourceSolids
      .filter((s) => s.z0 <= z0 + EPS && s.z1 >= z1 - EPS)
      .flatMap((s) => s.geoms);
    if (!geoms.length) continue;
    let geometry, query;
    solids.push({
      z0,
      z1,
      geoms,
      get geom() {
        return (geometry ??=
          fullCoverage && geoms.length === model.regions.length
            ? model.boundary
            : uniteSource(geoms));
      },
      query(box) {
        query ??= materialBoundsQuery(
          geoms.map((geom, index) => ({ geom, index })),
          ({ geom }) => materialGeometryBounds(geom),
        );
        return query(box).sort((a, b) => a.index - b.index);
      },
    });
  }
  let work = 0;
  let queries = 0;
  // Higher occluders usually remove most of a buried target immediately.
  // Set subtraction commutes; this changes planning cost, not illumination.
  const shadowSolids = [...solids].reverse();
  const shadows = (target, z, upperZ = z) => {
    let visible = target;
    for (const s of shadowSolids) {
      if (s.z1 <= z + EPS) continue;
      const lo = Math.max(0, s.z0 - upperZ),
        hi = s.z1 - z;
      const length = hi - lo;
      let charged = false;
      visible = visible.flatMap((p) => {
        if (++queries > 1000000)
          throw new RangeError('Material Direct shadow search budget exceeded.');
        const box = materialGeometryBounds([p]);
        // A ray reaching this target can originate only inside this bounded
        // source corridor. Crop before sweeping, so distant perforations and
        // other junctions cannot dominate a local aperture calculation.
        const x0 = box[0] + Math.min(lo * vx, hi * vx),
          x1 = box[2] + Math.max(lo * vx, hi * vx);
        const y0 = box[1] + Math.min(lo * vy, hi * vy),
          y1 = box[3] + Math.max(lo * vy, hi * vy);
        const candidates = s.query([x0, y0, x1, y1]);
        if (!candidates.length) return [p];
        const corridor = [
          [
            [
              [x0, y0],
              [x1, y0],
              [x1, y1],
              [x0, y1],
              [x0, y0],
            ],
          ],
        ];
        const cropped = unionCroppedTiles(
          candidates.map(({ geom }) => intersection(geom, corridor)).filter((g) => g.length),
        );
        if (!cropped.length) return [p];
        if (!charged) {
          if (++work > 20000) throw new RangeError('Material Direct shadow budget exceeded.');
          charged = true;
        }
        const shadow = shift(
          sweepMaterialPolygon(cropped, -length * vx, -length * vy),
          -lo * vx,
          -lo * vy,
        );
        return difference([p], shadow);
      });
      if (isEmpty(visible)) break;
    }
    return visible;
  };
  const patches = [];
  let originalCoverage = null;
  for (const [z, geoms] of caps) {
    const visible = shadows(intersection(uniteSource(geoms), limit), z);
    if (!isEmpty(visible)) patches.push({ geom: visible, z0: z, z1: z + params.thickness });
  }
  if (traceHorizontalCaps) return patches.map(({ geom, z0 }) => ({ geom, z: z0 }));
  // Sweep the illuminated boundary outward by the projected beam thickness.
  // Clip against every solid and its upstream silhouette at both slice ends.
  if (theta > 0 && incidence.sidewalls !== false)
    for (let level = 0; level < levels.length - 1; level++) {
      const bottom = levels[level],
        top = levels[level + 1];
      if (top - bottom <= EPS) continue;
      const occupancy =
        fullCoverage &&
        model.regions.every((r) => r.stack.some((s) => s.z0 <= bottom + EPS && s.z1 >= top - EPS))
          ? model.boundary
          : uniteSource(
              solids.filter((s) => s.z0 < top - EPS && s.z1 > bottom + EPS).flatMap((s) => s.geoms),
            );
      const band = intersection(
        difference(
          sweepMaterialPolygon(occupancy, params.thickness * vx, params.thickness * vy),
          occupancy,
        ),
        limit,
      );
      if (isEmpty(band)) continue;
      const n = Math.ceil((top - bottom) / step);
      if (n > 3000) {
        // A grid seam opened by noding can mimic a wall through an entire
        // wafer. Only skip it when the original partition proves that every
        // column fills this slab and that those columns cover the boundary.
        // Preserve that same pre-noding support when committing the dose.
        if (
          rect &&
          destination.regions.every((r) =>
            r.stack.some((s) => s.z0 <= bottom + EPS && s.z1 >= top - EPS),
          )
        ) {
          const coverage = materialOwnerCoverage(destination);
          if (
            isEmpty(difference(model.boundary, coverage)) &&
            isEmpty(difference(coverage, model.boundary))
          ) {
            originalCoverage = model.boundary;
            continue;
          }
        }
        throw new RangeError(
          'Material Direct wall budget exceeded; restrict the physical process area.',
        );
      }
      for (let i = 0; i < n; i++) {
        const z0 = bottom + ((top - bottom) * i) / n;
        const z1 = bottom + ((top - bottom) * (i + 1)) / n;
        // Clip visibility at the receiving wall, not just in its projected
        // film envelope. An occluder can sever that envelope from the solid;
        // the detached remainder has no surface on which Al can nucleate.
        const visible = shadows(band, z0, z1).filter((p) =>
          materialGeometriesTouch([p], occupancy, EPS),
        );
        if (!isEmpty(visible)) patches.push({ geom: visible, z0, z1 });
      }
    }
  if (!patches.length) return { changed: false, error: 'No ray-visible material surface.' };
  const candidate = structuredClone(model);
  const noded = nodeMaterialProcessInputs(
    [...candidate.regions.map((r) => r.geom), ...patches.map((p) => p.geom)],
    { sourceCount: candidate.regions.length },
  );
  candidate.regions.forEach((r, i) => (r.geom = noded[i]));
  patches.forEach((p, i) => (p.geom = noded[candidate.regions.length + i]));
  const layer = api.createLayer(candidate, params.name);
  candidate.regions = insert(candidate, patches, layer.id, api);
  const coverage = originalCoverage ?? uniteSource(model.regions.map((r) => r.geom));
  candidate.regions = partitionMaterialProcess(candidate, coverage, api);
  candidate.revision++;
  candidate.processRevision = (candidate.processRevision || 0) + 1;
  Object.assign(destination, candidate);
  return {
    changed: true,
    layerId: layer.id,
    method: 'canonical-material-ray-shadow',
    heightStepUm: step,
    patches: patches.length,
  };
}

export function materialDirectHorizontalExposure(model, { tiltDeg, azimuthDeg }, area, api) {
  return applyMaterialDirect(
    model,
    { thickness: 0.0001, face: 'front', incidence: { tiltDeg, azimuthDeg } },
    area,
    api,
    true,
  );
}

export function applyPatternedDevelopment(model, params, area, api) {
  const ids = params.etchTargetLayerIds || [];
  if (
    ids.length !== 1 ||
    ['base', 'substrate'].includes(ids[0]) ||
    !model.layers.some((l) => l.id === ids[0])
  )
    return { changed: false, error: 'Development requires one non-base material.' };
  if (params.face === 'back' || params.face === 'both')
    return { changed: false, error: 'Patterned development currently requires Front.' };
  const depthError = validateMaterialThicknessUm(params.thickness);
  if (depthError) return { changed: false, error: depthError };
  const lateral = Number(params.developLateralUm ?? 0);
  if (!Number.isFinite(lateral) || lateral < 0)
    return { changed: false, error: 'Lateral development must be finite and non-negative.' };
  if (lateral) area = intersection(offsetMaterialOpening(area, lateral), model.boundary);
  const candidate = structuredClone(model),
    regions = [];
  const noded = nodeMaterialProcessInputs([...candidate.regions.map((r) => r.geom), area], {
    sourceCount: candidate.regions.length,
  });
  candidate.regions.forEach((r, i) => (r.geom = noded[i]));
  area = noded.at(-1);
  let changed = false;
  for (const r of candidate.regions) {
    const hit = intersection(r.geom, area),
      rest = difference(r.geom, area);
    if (!isEmpty(rest)) regions.push({ ...r, geom: rest });
    if (isEmpty(hit)) continue;
    const stack = r.stack.flatMap((s) => {
      if (s.layerId !== ids[0]) return [s];
      changed = true;
      return s.z1 - s.z0 > params.thickness + EPS ? [{ ...s, z1: s.z1 - params.thickness }] : [];
    });
    regions.push({ geom: hit, stack });
  }
  if (!changed)
    return { changed: false, error: 'No selected material intersects the development opening.' };
  candidate.regions = merge(candidate, regions, api);
  // Both sides of a developed edge must follow the same persisted 0.1 nm
  // polyline. Independent rounding of fine-lattice intersections can overlap
  // at chip coordinates even when the unrounded integer partition is exact.
  const developedGrid = nodeMaterialProcessInputs(
    candidate.regions.map((r) => r.geom),
    { sourceCount: candidate.regions.length },
  );
  candidate.regions = candidate.regions
    .map((r, i) => ({
      ...r,
      geom: developedGrid[i]
        .filter((p) => materialGeometryArea([p]) > 0 && api.geometryArea([[p[0]]]) > 0)
        .map((p) => [p[0], ...p.slice(1).filter((h) => api.geometryArea([[h]]) > 0)]),
    }))
    .filter((r) => r.geom.length);
  candidate.revision++;
  candidate.processRevision = (candidate.processRevision || 0) + 1;
  Object.assign(model, candidate);
  return { changed: true, targetLayerId: ids[0] };
}
