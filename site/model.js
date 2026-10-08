import { indexedIntersectionInputs } from './process-boundary-index.js';
import { localGeometry } from './model-array-context.js';
import { applyArrayOperation } from './model-array-process.js';
import {
  isArrayModel,
  resolveArrayModel,
  referencedModelParts,
  arrayParts,
  translateGeometry,
  geometryBounds as arrayBounds,
} from './model-array.js';
import {
  bufferMulti,
  circleMulti,
  cloneGeom,
  difference,
  intersection,
  isEmpty,
  rectMulti,
  unionGeometries,
} from './vector-geometry.js';
import {
  classifyCoverageVoids,
  conformalBoundaryBands,
  conformalWallTargets,
  DEFAULT_COVERAGE_CRACK_TOLERANCE_UM,
  exposedLayerIdsFromTopology,
  exposedSurfaceGroups,
  regionSurfaceFaces,
  stackSurfaceAppearance,
  stackSurfaceSegment,
  stackSurfaceZ,
  uncoveredDomain,
} from './process-topology.js';

export const COLORS = [
  '#6C8EBF',
  '#82B6A6',
  '#D6A85F',
  '#C97B84',
  '#8A7CB8',
  '#6FA9B8',
  '#A98B6C',
  '#7FA178',
  '#B7799C',
  '#7590AA',
];
export const BASE_COLOR = '#C3CBD4';

function baseGeometry(shape, width, height) {
  return shape === 'circle' ? circleMulti(width, height, 192) : rectMulti(width, height);
}

export function createModel({
  shape = 'circle',
  width = 100000,
  height = 100000,
  thickness = 12,
} = {}) {
  const boundary = baseGeometry(shape, width, height);
  return {
    kernel: 'vector-2.5d-v1',
    shape,
    width,
    height,
    thickness,
    boundary,
    units: { xy: 'µm', z: 'µm' },
    layers: [{ id: 'base', name: 'Base', color: BASE_COLOR, visible: true }],
    regions: [
      {
        id: 'region-1',
        geom: cloneGeom(boundary),
        stack: [{ layerId: 'base', z0: -thickness / 2, z1: thickness / 2 }],
      },
    ],
    implants: [],
    electricalRegions: [],
    nextImplantId: 1,
    nextElectricalRegionId: 1,
    nextLayerId: 1,
    nextRegionId: 2,
    revision: 1,
    processRevision: 0,
  };
}

export const cloneModel = (model) => structuredClone(model);
export const isVectorModel = (model) =>
  (model?.kernel === 'vector-2.5d-v1' || isArrayModel(model)) && Array.isArray(model.regions);
export const fullFaceGeometry = (model) => cloneGeom(model.boundary);

export function hasMaterial(model) {
  if (isArrayModel(model)) return referencedModelParts(model).some(hasMaterial);
  return Boolean(
    model?.regions?.some((region) => !isEmpty(region.geom) && (region.stack || []).length > 0),
  );
}

function ringArea(ring) {
  let sum = 0;
  for (let index = 1; index < (ring || []).length; index++) {
    const a = ring[index - 1],
      b = ring[index];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

export function geometryArea(geometry) {
  let total = 0;
  for (const polygon of geometry || []) {
    if (!polygon.length) continue;
    let area = Math.abs(ringArea(polygon[0]));
    for (let index = 1; index < polygon.length; index++) {
      area -= Math.abs(ringArea(polygon[index]));
    }
    total += Math.max(0, area);
  }
  return total;
}

export function layerPresent(model, layerId) {
  if (isArrayModel(model)) return referencedModelParts(model).some((m) => layerPresent(m, layerId));
  return Boolean(
    model?.regions?.some((region) =>
      (region.stack || []).some((segment) => segment.layerId === layerId),
    ),
  );
}

export function baseCoverageState(model) {
  if (isArrayModel(model)) {
    const costs = new Map(
      model.array.templates.map((t) => [
        t.id,
        t.model.regions.reduce(
          (sum, r) => sum + (r.stack.some((s) => s.layerId === 'base') ? geometryArea(r.geom) : 0),
          0,
        ),
      ]),
    );
    const area = model.array.instances.reduce((sum, i) => sum + costs.get(i.templateId), 0);
    if (area <= 1e-12) return 'removed';
    const domain = geometryArea(model.boundary);
    return area >= domain - Math.max(1e-9, domain * 1e-9) ? 'full' : 'partial';
  }
  let baseArea = 0;
  for (const region of model?.regions || []) {
    if ((region.stack || []).some((segment) => segment.layerId === 'base')) {
      baseArea += geometryArea(region.geom);
    }
  }
  if (baseArea <= 1e-12) return 'removed';

  const domainArea = geometryArea(model.boundary),
    tolerance = Math.max(1e-9, domainArea * 1e-9);
  return baseArea >= domainArea - tolerance ? 'full' : 'partial';
}

export function exposedLayerIds(model, area = model?.boundary, face = 'front') {
  if (isArrayModel(model)) {
    const ids = new Set(),
      full = area === model.boundary || JSON.stringify(area) === JSON.stringify(model.boundary),
      seen = new Set(),
      queries = new Map(),
      maskBoundsCache = new WeakMap();
    for (const part of arrayParts(model, full ? null : arrayBounds(area))) {
      if (full && seen.has(part.model)) continue;
      seen.add(part.model);
      const local = full
        ? part.model.boundary
        : localGeometry(area, part, translateGeometry(part.model.boundary, part.x, part.y));
      if (!local.length) continue;
      const key = part.templateId + '|' + JSON.stringify(local);
      let exposed = queries.get(key);
      if (!exposed) {
        exposed = exposedLayerIdsFromTopology(part.model, local, face);
        queries.set(key, exposed);
      }
      for (const id of exposed) ids.add(id);
    }
    return [...ids];
  }
  return exposedLayerIdsFromTopology(model, area, face);
}

export function zDisplayScale(model) {
  const [lo, hi] = modelBoundsZ(model);
  const zSpan = Math.max(hi - lo, 1e-12);
  const xySpan = Math.max(model.width, model.height, 1e-12);
  return (xySpan * 0.12) / zSpan;
}

export function layerById(model, id) {
  return model.layers.find((layer) => layer.id === id) || null;
}
export function createLayer(model, name) {
  const ordinal = model.nextLayerId++;
  const id = `layer-${ordinal}`;
  const layer = {
    id,
    name: (name || `Layer ${ordinal}`).trim(),
    color: COLORS[(ordinal - 1) % COLORS.length],
    visible: true,
  };
  model.layers.push(layer);
  return layer;
}
export function renameLayer(model, id, name) {
  const layer = layerById(model, id);
  if (!layer) return false;
  const clean = String(name || '').trim();
  if (!clean) return false;
  layer.name = clean;
  model.revision++;
  return true;
}
export function recolorLayer(model, id, color) {
  const layer = layerById(model, id);
  if (!layer || !/^#[0-9a-f]{6}$/i.test(color || '')) return false;
  layer.color = color;
  model.revision++;
  return true;
}

export function setLayerVisible(model, id, visible) {
  const layer = layerById(model, id);
  if (!layer) return false;
  layer.visible = Boolean(visible);
  model.revision++;
  return true;
}

export function visibleMaterialModel(model) {
  const hidden = new Set(
    (model?.layers || []).filter((layer) => layer.visible === false).map((layer) => layer.id),
  );
  if (!hidden.size) return model;
  if (isArrayModel(model))
    return {
      ...model,
      array: {
        ...model.array,
        templates: model.array.templates.map((t) => ({
          ...t,
          model: visibleMaterialModel({ ...t.model, layers: model.layers }),
        })),
      },
    };
  return {
    ...model,
    regions: (model?.regions || [])
      .map((region) => ({
        ...region,
        stack: (region.stack || []).filter((segment) => !hidden.has(segment.layerId)),
      }))
      .filter((region) => region.stack.length),
  };
}

export function implantById(model, id) {
  return (model?.implants || []).find((implant) => implant.id === id) || null;
}

export function electricalRegionById(model, id) {
  return (model?.electricalRegions || []).find((region) => region.id === id) || null;
}

export function renameElectricalRegion(model, id, name) {
  const region = electricalRegionById(model, id);
  if (!region) return false;
  const clean = String(name || '').trim();
  if (!clean) return false;
  region.name = clean;
  model.revision++;
  return true;
}

export function recolorElectricalRegion(model, id, color) {
  const region = electricalRegionById(model, id);
  if (!region || !/^#[0-9a-f]{6}$/i.test(color || '')) return false;
  region.color = color;
  model.revision++;
  return true;
}

export function setElectricalRegionVisible(model, id, visible) {
  const region = electricalRegionById(model, id);
  if (!region) return false;
  region.visible = Boolean(visible);
  model.revision++;
  return true;
}

export function setElectricalRegionDepthProfile(model, id, profile) {
  const region = electricalRegionById(model, id);
  if (!region || !['follow', 'smooth'].includes(profile)) return false;
  region.depthProfile = profile;
  model.revision++;
  return true;
}

export function renameImplant(model, id, name) {
  const implant = implantById(model, id);
  if (!implant) return false;
  const clean = String(name || '').trim();
  if (!clean) return false;
  implant.name = clean;
  model.revision++;
  return true;
}

export function recolorImplant(model, id, color) {
  const implant = implantById(model, id);
  if (!implant || !/^#[0-9a-f]{6}$/i.test(color || '')) return false;
  implant.color = color;
  model.revision++;
  return true;
}

export function setImplantVisible(model, id, visible) {
  const implant = implantById(model, id);
  if (!implant) return false;
  implant.visible = Boolean(visible);
  model.revision++;
  return true;
}

export function setImplantDepthProfile(model, id, profile) {
  const implant = implantById(model, id);
  if (!implant || !['follow', 'smooth'].includes(profile)) return false;
  implant.depthProfile = profile;
  model.revision++;
  return true;
}

export function isLayerExposed(model, id) {
  if (isArrayModel(model)) {
    const leaves = referencedModelParts(model).filter((m) => layerPresent(m, id));
    return leaves.length > 0 && leaves.every((m) => isLayerExposed(m, id));
  }
  if (id === 'base' || !layerById(model, id)) return false;
  let found = false;
  for (const region of model.regions) {
    const stack = region.stack || [];
    for (let index = 0; index < stack.length; index++) {
      if (stack[index].layerId !== id) continue;
      found = true;
      if (index !== 0 && index !== stack.length - 1) return false;
    }
  }
  return found;
}

export function deleteExposedLayer(model, id) {
  if (isArrayModel(model)) {
    if (!isLayerExposed(model, id)) return false;
    const templates = model.array.templates.map((t) => {
      const leaf = cloneModel(t.model);
      if (layerPresent(leaf, id)) deleteExposedLayer(leaf, id);
      leaf.layers = leaf.layers.filter((l) => l.id !== id);
      return { ...t, model: leaf };
    });
    model.array = { ...model.array, templates };
    model.layers = model.layers.filter((l) => l.id !== id);
    model.revision++;
    model.processRevision = (model.processRevision || 0) + 1;
    return true;
  }
  if (!isLayerExposed(model, id)) return false;
  const next = [];
  for (const region of model.regions) {
    const stack = normalizeStack(region.stack.filter((segment) => segment.layerId !== id));
    if (stack.length) next.push({ id: region.id, geom: cloneGeom(region.geom), stack });
  }
  model.regions = mergeRegions(model, next);
  model.layers = model.layers.filter((layer) => layer.id !== id);
  model.revision++;
  model.processRevision = (model.processRevision || 0) + 1;
  return true;
}

export function surfaceSegment(stack, face = 'front') {
  return stackSurfaceSegment(stack, face);
}
function surfaceField(face = 'front') {
  return face === 'back' ? 'backSurface' : 'frontSurface';
}
export function surfaceAppearance(segment, face = 'front') {
  return stackSurfaceAppearance(segment, face);
}
function cloneAppearance(appearance) {
  return appearance ? { ...appearance } : null;
}
function normalizedRoughSurface(surface, processRevision = 0, etchDepth = null) {
  if (surface?.kind !== 'rough') return null;
  const featureSize = Math.max(1e-6, Number(surface.featureSize) || 0.5),
    meanHeight = Math.max(1e-6, Number(surface.meanHeight ?? surface.amplitude) || featureSize),
    featureCv = Math.max(0, Math.min(1, Number(surface.featureCv) || 0)),
    heightCv = Math.max(0, Math.min(1, Number(surface.heightCv) || 0)),
    morphology = ['stochastic', 'pyramid'].includes(surface.morphology)
      ? surface.morphology
      : 'stochastic',
    polarity = surface.polarity === 'normal' ? 'normal' : 'inverted',
    seed = Number.isInteger(surface.seed)
      ? Math.max(0, surface.seed)
      : (Math.max(1, processRevision) * 2654435761) >>> 0,
    profileId =
      typeof surface.profileId === 'string' && surface.profileId
        ? surface.profileId
        : `rough-${Math.max(1, processRevision)}-${seed >>> 0}`;
  return {
    kind: 'rough',
    featureSize,
    meanHeight,
    featureCv,
    heightCv,
    morphology,
    polarity,
    seed,
    profileId,
    geometryMode: 'ideal',
    ...(Number.isFinite(etchDepth) ? { etchDepth } : {}),
  };
}
function withSurfaceAppearance(stack, face, appearance) {
  if (!stack?.length) return stack;
  const out = stack.map((segment) => ({ ...segment })),
    segment = surfaceSegment(out, face),
    field = surfaceField(face);
  if (!segment) return out;
  if (appearance) segment[field] = cloneAppearance(appearance);
  else delete segment[field];
  return out;
}
export function surfaceZ(stack, face = 'front') {
  return stackSurfaceZ(stack, face);
}
export function normalizeStack(stack) {
  const sorted = (stack || [])
    .filter((seg) => seg.z1 > seg.z0 + 1e-9)
    .map((seg) => ({ ...seg }))
    .sort((a, b) => a.z0 - b.z0);
  const out = [];
  for (const seg of sorted) {
    const prev = out.at(-1);
    if (prev && prev.layerId === seg.layerId && Math.abs(prev.z1 - seg.z0) < 1e-8) {
      prev.z1 = seg.z1;
      if (seg.frontSurface) prev.frontSurface = cloneAppearance(seg.frontSurface);
      else delete prev.frontSurface;
      if (prev.role === 'conformal-sidewall' || seg.role === 'conformal-sidewall')
        prev.role = 'conformal-sidewall';
    } else out.push(seg);
  }
  return out;
}

function ringAreaAbs(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  let twiceArea = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    twiceArea += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(twiceArea) / 2;
}

function sanitizeProcessGeometry(geom, areaEpsilon = 1e-18) {
  const out = [];
  for (const poly of geom || []) {
    if (!Array.isArray(poly) || !poly.length) continue;
    const outer = poly[0];
    if (ringAreaAbs(outer) <= areaEpsilon) continue;
    const holes = poly.slice(1).filter((ring) => ringAreaAbs(ring) > areaEpsilon);
    out.push([outer, ...holes]);
  }
  return out;
}

const PROCESS_GEOMETRY_GRID_UM = 1e-4;

function snapProcessGeometry(geom) {
  const snap = (value) =>
      Number(
        (Math.round(Number(value) / PROCESS_GEOMETRY_GRID_UM) * PROCESS_GEOMETRY_GRID_UM).toFixed(
          4,
        ),
      ),
    samePoint = (a, b) => a && b && a[0] === b[0] && a[1] === b[1],
    snapRing = (ring) => {
      const points = [];
      for (const point of ring || []) {
        if (!Array.isArray(point) || point.length < 2) continue;
        const next = [snap(point[0]), snap(point[1])];
        if (!samePoint(points.at(-1), next)) points.push(next);
      }
      if (points.length && samePoint(points[0], points.at(-1))) points.pop();
      if (points.length < 3) return [];
      points.push([...points[0]]);
      return points;
    };

  return (geom || [])
    .map((poly) => (poly || []).map(snapRing).filter((ring) => ring.length >= 4))
    .filter((poly) => poly.length && ringAreaAbs(poly[0]) > 1e-18);
}

function processGeometryArea(geom) {
  let total = 0;
  for (const poly of geom || []) {
    if (!poly?.length) continue;
    total += ringAreaAbs(poly[0]);
    for (const hole of poly.slice(1)) total -= ringAreaAbs(hole);
  }
  return Math.max(0, total);
}

function partitionProcessRegions(
  regions,
  rejectOverlapAbove = null,
  operation = 'Isotropic release',
) {
  const out = [],
    operationCache = new WeakMap();
  for (const region of regions || []) {
    let geom = sanitizeProcessGeometry(region.geom);
    if (isEmpty(geom)) continue;

    for (const previous of out) {
      const [left, right] = indexedIntersectionInputs(geom, previous.geom, operationCache);
      const overlap = intersection(left, right);
      if (isEmpty(overlap)) continue;
      const overlapArea = processGeometryArea(overlap);
      if (rejectOverlapAbove != null && overlapArea > rejectOverlapAbove) {
        throw new Error(`${operation} produced overlapping regions (${overlapArea} µm²).`);
      }
      geom = sanitizeProcessGeometry(difference(geom, previous.geom));
      if (isEmpty(geom)) break;
    }

    if (!isEmpty(geom)) out.push({ ...region, geom });
  }
  return out;
}

// Boolean differences may introduce an intersection vertex on only one side
// of a shared edge. Node both owners before rounding, so they follow the same
// snapped polyline instead of independently rounding a straight edge and a bend.
function nodeProcessPartitionEdges(regions) {
  const epsilon = 1e-8,
    vertices = new Map();
  for (const region of regions) {
    for (const polygon of region.geom) {
      for (const ring of polygon) {
        for (const point of ring) vertices.set(`${point[0]}:${point[1]}`, point);
      }
    }
  }
  const points = [...vertices.values()].sort((a, b) => a[0] - b[0]),
    lowerBound = (x) => {
      let low = 0,
        high = points.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (points[middle][0] < x) low = middle + 1;
        else high = middle;
      }
      return low;
    };
  return regions.map((region) => ({
    ...region,
    geom: region.geom.map((polygon) =>
      polygon.map((ring) => {
        const out = [];
        for (let index = 1; index < ring.length; index++) {
          const a = ring[index - 1],
            b = ring[index],
            dx = b[0] - a[0],
            dy = b[1] - a[1],
            length = Math.hypot(dx, dy),
            nodes = [],
            minY = Math.min(a[1], b[1]) - epsilon,
            maxY = Math.max(a[1], b[1]) + epsilon,
            maxX = Math.max(a[0], b[0]) + epsilon;
          out.push([...a]);
          if (length <= epsilon) continue;
          for (
            let cursor = lowerBound(Math.min(a[0], b[0]) - epsilon);
            cursor < points.length && points[cursor][0] <= maxX;
            cursor++
          ) {
            const point = points[cursor];
            if (point[1] < minY || point[1] > maxY) continue;
            const px = point[0] - a[0],
              py = point[1] - a[1],
              distance = (px * dx + py * dy) / length;
            if (distance <= epsilon || distance >= length - epsilon) continue;
            if (Math.abs(px * dy - py * dx) / length <= epsilon) nodes.push({ point, distance });
          }
          nodes.sort((a, b) => a.distance - b.distance);
          for (const node of nodes) out.push([...node.point]);
        }
        if (out.length) out.push([...out[0]]);
        return out;
      }),
    ),
  }));
}

function dropPersistenceDegeneratePolygons(geom) {
  return sanitizeProcessGeometry(geom).filter((polygon) => {
    if (!polygon?.[0]) return false;
    const snappedOuter = sanitizeProcessGeometry(snapProcessGeometry([[polygon[0]]]));
    return !isEmpty(snappedOuter);
  });
}

function canonicalizeProcessPartition(model, regions, operation = 'Isotropic release') {
  // Boolean fallback may quantize coordinates to the 0.1 nm persistence grid.
  // A residual overlap no larger than roughly two grid cells is numerical
  // ownership ambiguity, not a physical double-owned region. Partition it
  // deterministically while still rejecting overlaps above persistence scale.
  const overlapTolerance = Math.max(
      PROCESS_GEOMETRY_GRID_UM * PROCESS_GEOMETRY_GRID_UM * 2,
      model.width * model.height * 1e-15,
    ),
    canonical = partitionProcessRegions(regions, overlapTolerance, operation),
    snapped = canonical.map((region) => ({
      ...region,
      geom: sanitizeProcessGeometry(snapProcessGeometry(region.geom)),
    }));

  // Runtime geometry is checked before snapping. Any overlap in this second
  // pass is therefore introduced only by the 0.1 nm persistence grid and can
  // be deterministically assigned without masking a real kernel overlap.
  const partitioned = partitionProcessRegions(snapped),
    noded = nodeProcessPartitionEdges(partitioned),
    stored = noded
      .map((region) => ({
        ...region,
        geom: sanitizeProcessGeometry(snapProcessGeometry(region.geom)),
      }))
      .filter((region) => !isEmpty(region.geom));
  // A final ownership pass removes any persistence-grid sliver that noding +
  // rounding can reintroduce. Do not snap again here: another snap can recreate
  // the same overlap. The serializer will quantize stable coordinates on export.
  // Genuine overlaps above overlapTolerance still reject before assignment.
  return partitionProcessRegions(stored, overlapTolerance, operation)
    .map((region) => ({
      ...region,
      geom: dropPersistenceDegeneratePolygons(region.geom),
    }))
    .filter((region) => !isEmpty(region.geom));
}

function stackKey(stack) {
  return (stack || [])
    .map((seg) =>
      [
        seg.layerId,
        seg.z0.toFixed(9),
        seg.z1.toFixed(9),
        seg.role || '',
        seg.backSurface ? JSON.stringify(seg.backSurface) : '',
        seg.frontSurface ? JSON.stringify(seg.frontSurface) : '',
      ].join(':'),
    )
    .join('|');
}
function safeUnionParts(geometries) {
  const geoms = (geometries || []).filter((geom) => !isEmpty(geom));
  if (!geoms.length) return [];
  if (geoms.length === 1) return [cloneGeom(geoms[0])];
  try {
    const merged = unionGeometries(geoms);
    return isEmpty(merged) ? [] : [merged];
  } catch {
    const middle = Math.ceil(geoms.length / 2);
    return [...safeUnionParts(geoms.slice(0, middle)), ...safeUnionParts(geoms.slice(middle))];
  }
}

function mergeRegions(model, regions) {
  const groups = new Map();
  for (const region of regions) {
    if (isEmpty(region.geom) || !region.stack.length) continue;
    const key = stackKey(region.stack);
    if (!groups.has(key))
      groups.set(key, { stack: region.stack.map((s) => ({ ...s })), geoms: [] });
    groups.get(key).geoms.push(region.geom);
  }
  const out = [];
  for (const group of groups.values()) {
    // Merge as far as the geometry kernel safely allows. If one large union is
    // numerically unstable, recursively keep smaller valid partitions instead
    // of failing the process or exploding all the way back to one region per cut.
    for (const geom of safeUnionParts(group.geoms)) {
      const cleaned = sanitizeProcessGeometry(geom);
      if (isEmpty(cleaned)) continue;
      out.push({
        id: `region-${model.nextRegionId++}`,
        geom: cleaned,
        stack: group.stack.map((segment) => ({ ...segment })),
      });
    }
  }
  return out;
}

function trimStack(stack, amount, face, appearance = null, targetLayerIds = null) {
  let left = amount,
    cutIntoSegment = false,
    removedMaterial = false,
    out = stack.map((seg) => ({ ...seg }));
  const targets = new Set((targetLayerIds || []).filter(Boolean)),
    selective = targets.size > 0;

  while (left > 1e-9 && out.length) {
    const idx = face === 'front' ? out.length - 1 : 0,
      seg = out[idx];
    // A material-selective etch only attacks an exposed selected material and
    // stops immediately when the next material is not selected.
    if (selective && !targets.has(seg.layerId)) break;

    const height = seg.z1 - seg.z0;
    removedMaterial = true;
    if (left >= height - 1e-9) {
      left -= height;
      out.splice(idx, 1);
      const next = face === 'front' ? out.at(-1) : out[0],
        crossesVoid =
          next && (face === 'front' ? seg.z0 - next.z1 > 1e-9 : next.z0 - seg.z1 > 1e-9);
      if (crossesVoid) left = 0;
    } else {
      if (face === 'front') seg.z1 -= left;
      else seg.z0 += left;
      left = 0;
      cutIntoSegment = true;
    }
  }

  const normalized = normalizeStack(out);
  if (!removedMaterial) return normalized;

  if (appearance) {
    const exposed = surfaceSegment(normalized, face);
    // If a selective etch fully removes its target and stops on a different
    // material, do not stamp the target's morphology onto the stop layer.
    if (!selective || cutIntoSegment || (exposed && targets.has(exposed.layerId))) {
      return withSurfaceAppearance(normalized, face, appearance);
    }
    return normalized;
  }

  // A smooth etch that cuts into a material creates a new smooth cut face.
  // If it removes one or more whole layers and lands exactly on an existing
  // interface, that interface has merely been re-exposed: keep its stored
  // morphology (for example rough Si -> conformal Al2O3 -> Al strip).
  return cutIntoSegment ? withSurfaceAppearance(normalized, face, null) : normalized;
}

function addLayerToSurface(stack, layerId, amount, face) {
  const z = surfaceZ(stack, face),
    inherited = cloneAppearance(surfaceAppearance(surfaceSegment(stack, face), face));
  if (z == null) return stack;
  const out = stack.map((seg) => ({ ...seg })),
    added =
      face === 'front' ? { layerId, z0: z, z1: z + amount } : { layerId, z0: z - amount, z1: z };
  if (inherited) added[surfaceField(face)] = inherited;
  if (face === 'front') out.push(added);
  else out.unshift(added);
  return normalizeStack(out);
}

function growSurfaceLayer(stack, targetLayerId, amount, face) {
  const out = stack.map((seg) => ({ ...seg })),
    seg = surfaceSegment(out, face);
  if (!seg || seg.layerId !== targetLayerId) return out;
  if (face === 'front') seg.z1 += amount;
  else seg.z0 -= amount;
  return normalizeStack(out);
}

function mutateStack(
  stack,
  { type, layerId, targetLayerId, etchTargetLayerIds, amount, face, appearance },
) {
  if (type === 'etch') {
    return trimStack(stack, amount, face, appearance, etchTargetLayerIds);
  }
  if (type === 'grow') return growSurfaceLayer(stack, targetLayerId, amount, face);
  return addLayerToSurface(stack, layerId, amount, face);
}

function splitByArea(model, area, mutator, merge = true) {
  const next = [];
  for (const region of model.regions) {
    const hit = intersection(region.geom, area);
    const rest = difference(region.geom, area);
    if (!isEmpty(rest))
      next.push({ id: region.id, geom: rest, stack: region.stack.map((s) => ({ ...s })) });
    if (!isEmpty(hit)) {
      const stack = mutator(
        region.stack.map((s) => ({ ...s })),
        region,
      );
      if (stack.length) next.push({ id: `region-${model.nextRegionId++}`, geom: hit, stack });
    }
  }
  model.regions = merge ? mergeRegions(model, next) : next;
}

function exposedLayerPatches(model, active, face, layerId) {
  return exposedSurfaceGroups(model, {
    face,
    clip: active,
    layerId,
    preserveOppositeZ: true,
  }).map(({ z, oppositeZ, appearance, geom }) => ({
    z,
    oppositeZ,
    appearance,
    geom,
  }));
}

function conformalSourcePatchesBeforeCoating(model, active, face, amount) {
  // Capture the physical exposed surfaces before the new film is clipped by a
  // process mask. Sidewalls must originate from real topography/step
  // boundaries, not from the artificial XY edge introduced by active.
  return exposedSurfaceGroups(model, {
    face,
    clip: model.boundary,
    preserveOppositeZ: true,
  })
    .filter(({ geom }) => !isEmpty(intersection(geom, active)))
    .map(({ z, oppositeZ, appearance, geom }) => ({
      z: face === 'front' ? z + amount : z - amount,
      oppositeZ,
      appearance,
      geom,
    }));
}

function conformalSidewallStack(stack, layerId, face, sourceZ, appearance = null) {
  const local = surfaceZ(stack, face);
  if (local == null || sourceZ == null || !layerId) return stack;

  const out = stack.map((seg) => ({ ...seg })),
    sidewall =
      face === 'front'
        ? { layerId, z0: local, z1: sourceZ, role: 'conformal-sidewall' }
        : { layerId, z0: sourceZ, z1: local, role: 'conformal-sidewall' };
  if (face === 'front') {
    if (local >= sourceZ - 1e-9) return out;
    if (appearance) sidewall.frontSurface = cloneAppearance(appearance);
    out.push(sidewall);
  } else {
    if (local <= sourceZ + 1e-9) return out;
    if (appearance) sidewall.backSurface = cloneAppearance(appearance);
    out.unshift(sidewall);
  }
  return normalizeStack(out);
}

function applyConformalMaterialWalls(
  model,
  materialWalls,
  band,
  layerId,
  face,
  sourceZ,
  appearance,
) {
  const targets = new Map((materialWalls || []).map((target) => [target.regionId, target])),
    next = [];

  for (const region of model.regions) {
    const stack = region.stack.map((segment) => ({ ...segment })),
      target = targets.get(region.id);

    if (!target) {
      next.push({ id: region.id, geom: cloneGeom(region.geom), stack });
      continue;
    }

    // Derive both halves from the same band. Subtracting the already clipped
    // target can retry on a different grid and leave two owners at one wall.
    const rest = difference(region.geom, band);
    if (!isEmpty(rest)) next.push({ id: region.id, geom: rest, stack });
    if (!isEmpty(target.geom)) {
      next.push({
        id: `region-${model.nextRegionId++}`,
        geom: target.geom,
        stack: conformalSidewallStack(stack, layerId, face, sourceZ, appearance),
      });
    }
  }
  model.regions = next;
}

const COVERAGE_CRACK_TOLERANCE_UM = DEFAULT_COVERAGE_CRACK_TOLERANCE_UM;

// A Conformal coating may re-partition the XY domain thousands of times near
// rounded sidewall corners. Snapping and re-noding can lose sub-grid slivers
// even when the input base covers the entire field. In the 2.5D model an XY
// sliver removes its *entire* Z column and creates a false full-depth sidewall.
// Restore only newly missing, sub-grid coverage; existing physical voids are
// explicitly excluded. Do not re-snap the repaired polygon (which can re-open
// the very same crack).
function healConformalCoverageCracks(model, originalVoids) {
  const overlapTolerance = Math.max(
    PROCESS_GEOMETRY_GRID_UM ** 2 * 2,
    model.width * model.height * 1e-15,
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    const { cracks } = classifyCoverageVoids(model, {
      crackTolerance: COVERAGE_CRACK_TOLERANCE_UM,
    });
    let repaired = false;
    for (const crack of cracks) {
      const missing = isEmpty(originalVoids)
        ? crack.geom
        : difference(crack.geom, originalVoids);
      if (isEmpty(missing)) continue;
      const halo = bufferMulti(missing, COVERAGE_CRACK_TOLERANCE_UM * 4, 12);
      let owner = null;
      let largestContact = 0;
      for (const region of model.regions) {
        const contact = geometryArea(intersection(region.geom, halo));
        if (contact > largestContact) {
          largestContact = contact;
          owner = region;
        }
      }
      if (!owner || largestContact <= 0) {
        throw new Error('Conformal could not assign a numerical coverage crack.');
      }
      owner.geom = unionGeometries([owner.geom, missing]);
      repaired = true;
    }
    if (!repaired) return;
    model.regions = partitionProcessRegions(
      model.regions,
      overlapTolerance,
      'Conformal coverage repair',
    );
  }
  const remaining = classifyCoverageVoids(model, {
    crackTolerance: COVERAGE_CRACK_TOLERANCE_UM,
  }).cracks.some(({ geom }) =>
    !isEmpty(isEmpty(originalVoids) ? geom : difference(geom, originalVoids)),
  );
  if (remaining) throw new Error('Conformal left a numerical coverage crack after repair.');
}

function uncoveredGeometryRaw(model) {
  return uncoveredDomain(model, model.boundary);
}

function healNumericalCoverageCracks(model) {
  const { cracks } = classifyCoverageVoids(model, {
    clip: model.boundary,
    crackTolerance: COVERAGE_CRACK_TOLERANCE_UM,
  });
  if (!cracks.length) return false;

  let changed = false;
  for (const { geom: crack } of cracks) {
    let halo;
    try {
      halo = bufferMulti(crack, COVERAGE_CRACK_TOLERANCE_UM * 4, 12);
    } catch {
      continue;
    }

    let bestRegion = null,
      bestContact = 0;
    for (const region of model.regions || []) {
      const contact = geometryArea(intersection(region.geom, halo));
      if (contact > bestContact) {
        bestContact = contact;
        bestRegion = region;
      }
    }
    if (!bestRegion || bestContact <= 0) continue;

    try {
      bestRegion.geom = unionGeometries([bestRegion.geom, crack]);
      changed = true;
    } catch {
      // A sub-grid repair must never make a valid process operation fail.
    }
  }
  return changed;
}

function uncoveredGeometry(model) {
  return uncoveredGeometryRaw(model);
}

function addVoidConformalSidewall(model, geom, layerId, face, source) {
  if (isEmpty(geom) || !layerId || source?.z == null || source?.oppositeZ == null) return;
  const z0 = face === 'front' ? source.oppositeZ : source.z,
    z1 = face === 'front' ? source.z : source.oppositeZ;
  if (!(z1 > z0 + 1e-9)) return;
  model.regions.push({
    id: `region-${model.nextRegionId++}`,
    geom,
    stack: [
      {
        layerId,
        z0,
        z1,
        role: 'conformal-sidewall',
        ...(source.appearance ? { [surfaceField(face)]: cloneAppearance(source.appearance) } : {}),
      },
    ],
  });
}

function processPartitionHasFractionalBoundary(regions) {
  return regions.some((region) =>
    region.geom.some((polygon) =>
      polygon.some((ring) =>
        ring.some((point) =>
          point.some(
            (value) =>
              Math.abs(
                value - Math.round(value / PROCESS_GEOMETRY_GRID_UM) * PROCESS_GEOMETRY_GRID_UM,
              ) > 1e-8,
          ),
        ),
      ),
    ),
  );
}

function applyConformalCoating(model, active, layerId, amount, face) {
  // Normalize a checked partition before true through-void detection and
  // repeated offset construction. A numerical slit must not receive a full-
  // depth film, and fractional shared edges must use one persistence grid.
  if (
    processPartitionHasFractionalBoundary(model.regions) ||
    classifyCoverageVoids(model, {
      crackTolerance: COVERAGE_CRACK_TOLERANCE_UM,
    }).cracks.length
  ) {
    model.regions = canonicalizeProcessPartition(model, model.regions, 'Conformal');
  }

  // Capture the source topography before the horizontal coating is clipped to
  // the process area. This is the key ownership rule for masked conformal
  // deposition: the mask boundary itself is not a physical sidewall.
  const sources = conformalSourcePatchesBeforeCoating(model, active, face, amount);

  // Deposit and Extend share one conformal kernel. Extend simply reuses the
  // selected layer id, so contiguous material merges during stack normalization.
  //
  // Keep the pre-coating void domain. A conformal film is allowed to occupy
  // empty trench / through-hole space next to an exposed wall; ordinary
  // splitByArea() only visits existing material regions.
  const originalVoids = baseCoverageState(model) === 'full' ? [] : uncoveredGeometry(model);
  let uncovered = cloneGeom(originalVoids);

  // Stage 1: coat every exposed horizontal surface in the selected area.
  splitByArea(model, active, (stack) => addLayerToSurface(stack, layerId, amount, face), false);

  // Stage 2: coat only physical vertical boundaries from the pre-coating
  // topography. Intersect each boundary band with active so real steps inside a
  // mask opening still receive conformal coverage while the mask edge remains a
  // hard clip.
  for (const source of sources) {
    for (const rawBand of conformalBoundaryBands(source.geom, amount, active)) {
      // Use one persistence-grid band for both the hit and its complement.
      const band = intersection(intersection(snapProcessGeometry(rawBand), active), model.boundary);
      if (isEmpty(band)) continue;

      // Topology v2 classifies this symmetric edge band once. Equal-height
      // computational partitions never become material-wall targets; genuine
      // uncovered domain becomes an explicit void-wall target.
      const { materialWalls, voidWalls } = conformalWallTargets(model, band, {
        face,
        source,
        voidDomain: uncovered,
      });
      applyConformalMaterialWalls(
        model,
        materialWalls,
        band,
        layerId,
        face,
        source.z,
        source.appearance,
      );

      for (const wall of voidWalls) {
        addVoidConformalSidewall(model, wall.geom, layerId, face, source);
        uncovered = difference(uncovered, wall.geom);
      }
    }
  }
  return originalVoids;
}

const ISOTROPIC_ETCH_SLICES = 8;

function removeLayerInterval(stack, targetLayerIds, z0, z1) {
  const targets = new Set((targetLayerIds || []).filter(Boolean));
  if (!targets.size || !(z1 > z0 + 1e-9)) {
    return (stack || []).map((segment) => ({ ...segment }));
  }

  const out = [];
  for (const segment of stack || []) {
    if (!targets.has(segment.layerId) || segment.z1 <= z0 + 1e-9 || segment.z0 >= z1 - 1e-9) {
      out.push({ ...segment });
      continue;
    }

    const cut0 = Math.max(segment.z0, z0),
      cut1 = Math.min(segment.z1, z1);
    if (segment.z0 < cut0 - 1e-9) {
      const lower = { ...segment, z1: cut0 };
      delete lower.frontSurface;
      out.push(lower);
    }
    if (cut1 < segment.z1 - 1e-9) {
      const upper = { ...segment, z0: cut1 };
      delete upper.backSurface;
      out.push(upper);
    }
  }
  return normalizeStack(out);
}

function applyIsotropicEtch(model, active, targetLayerIds, amount, face) {
  const targets = new Set((targetLayerIds || []).filter(Boolean));
  if (!targets.size) {
    return {
      changed: false,
      error: 'Isotropic release requires a selected material.',
    };
  }

  const seeds = exposedSurfaceGroups(model, {
    face,
    clip: active,
    preserveOppositeZ: false,
  }).filter((patch) => targets.has(patch.layerId));
  if (!seeds.length) {
    return {
      changed: false,
      error: 'The selected release material is not exposed in the selected area.',
    };
  }

  let changed = false;
  for (const seed of seeds) {
    // Work from the protected complement rather than repeatedly unioning a
    // large exposed domain with its dilation. The undercut strip inside the
    // protected footprint is disjoint from the exposed seed, which avoids
    // near-coincident slivers at mask edges.
    const protectedGeom = difference(model.boundary, seed.geom);

    for (let index = 0; index < ISOTROPIC_ETCH_SLICES; index++) {
      const d0 = (amount * index) / ISOTROPIC_ETCH_SLICES,
        d1 = (amount * (index + 1)) / ISOTROPIC_ETCH_SLICES,
        depth = (d0 + d1) / 2,
        lateral = Math.sqrt(Math.max(0, amount * amount - depth * depth)),
        footprints = [seed.geom];

      if (lateral > 1e-9 && !isEmpty(protectedGeom)) {
        for (const band of conformalBoundaryBands(protectedGeom, lateral)) {
          const undercut = intersection(band, protectedGeom);
          if (!isEmpty(undercut)) footprints.push(undercut);
        }
      }

      const z0 = face === 'front' ? seed.z - d1 : seed.z + d0,
        z1 = face === 'front' ? seed.z - d0 : seed.z + d1;
      for (const footprint of footprints) {
        splitByArea(
          model,
          footprint,
          (stack) => {
            const next = removeLayerInterval(stack, [...targets], z0, z1);
            if (stackKey(next) !== stackKey(stack)) changed = true;
            return next;
          },
          false,
        );
      }

      // Release produces many neighboring stacks with the same Z interval.
      // Consolidate after each depth band so region count stays bounded before
      // the next clipping pass.
      model.regions = mergeRegions(model, model.regions);
    }
  }
  return changed
    ? { changed: true }
    : {
        changed: false,
        error: 'The isotropic release did not intersect the selected material.',
      };
}

function applyOperationImpl(
  model,
  {
    type,
    name,
    targetLayerId,
    etchTargetLayerIds = [],
    etchProfile = 'directional',
    thickness,
    face = 'front',
    area,
    growth = 'direct',
    surface,
    color,
    tilt = 0,
    electricalRegionType = 'custom',
    electricalRegionSource = 'custom',
  },
) {
  const amount = Math.max(1e-5, Number(thickness) || 0);
  if (type === 'etch' && !['directional', 'isotropic'].includes(etchProfile)) {
    return { changed: false, error: 'Unsupported Etch profile.' };
  }
  if (type === 'etch' && etchProfile === 'isotropic' && surface?.kind === 'rough') {
    return {
      changed: false,
      error:
        'Isotropic release uses physical undercut geometry and cannot combine with Rough/Pyramid display morphology.',
    };
  }
  if (type === 'etch' && surface?.kind === 'rough') {
    const roughHeight = Number(surface.meanHeight ?? surface.amplitude),
      featureCv = Number(surface.featureCv ?? 0),
      heightCv = Number(surface.heightCv ?? 0),
      morphology = surface.morphology ?? 'stochastic',
      polarity = surface.polarity ?? 'inverted';
    if (!(roughHeight > 0)) {
      return { changed: false, error: 'Rough mean Height must be greater than zero.' };
    }
    if (roughHeight > amount + 1e-9) {
      return {
        changed: false,
        error: 'Rough mean Height cannot exceed Etch Depth.',
      };
    }
    if (!(featureCv >= 0 && featureCv <= 1) || !(heightCv >= 0 && heightCv <= 1)) {
      return {
        changed: false,
        error: 'Rough CV values must be between 0% and 100%.',
      };
    }
    if (!['stochastic', 'pyramid'].includes(morphology)) {
      return { changed: false, error: 'Unsupported surface morphology.' };
    }
    if (!['inverted', 'normal'].includes(polarity)) {
      return { changed: false, error: 'Rough polarity must be Inverted or Normal.' };
    }
  }
  const appearance =
    type === 'etch'
      ? normalizedRoughSurface(surface, (model.processRevision || 0) + 1, amount)
      : null;
  let active = intersection(area, model.boundary);
  if (isEmpty(active)) return { changed: false };
  if (!hasMaterial(model)) {
    return {
      changed: false,
      error: 'No material remains. Recreate the Base before applying another process.',
    };
  }
  const touchesMaterial = model.regions.some(
    (region) => !isEmpty(intersection(active, region.geom)),
  );
  if (!touchesMaterial) {
    return { changed: false, error: 'The selected area contains no material.' };
  }
  if (type === 'implant' || type === 'electrical') {
    const patches = [];
    for (const region of model.regions) {
      const segment = surfaceSegment(region.stack, face),
        geom = intersection(region.geom, active);
      if (!segment || isEmpty(geom)) continue;
      patches.push({
        geom,
        z: face === 'front' ? segment.z1 : segment.z0,
        zMin: region.stack[0]?.z0 ?? segment.z0,
        zMax: region.stack.at(-1)?.z1 ?? segment.z1,
        layerId: segment.layerId,
        surfaceAppearance: cloneAppearance(surfaceAppearance(segment, face)),
      });
    }
    if (!patches.length) {
      return {
        changed: false,
        error:
          type === 'implant'
            ? 'No exposed surface is available for Implant.'
            : 'No exposed surface is available for Electrical Region.',
      };
    }

    if (type === 'implant') {
      if (!Array.isArray(model.implants)) model.implants = [];
      if (!Number.isInteger(model.nextImplantId) || model.nextImplantId < 1) {
        model.nextImplantId = model.implants.length + 1;
      }
      const ordinal = model.nextImplantId++,
        implant = {
          id: `implant-${ordinal}`,
          name: String(name || `Implant ${ordinal}`).trim() || `Implant ${ordinal}`,
          color: /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : '#D65A6F',
          face,
          thickness: amount,
          tilt: Math.max(-80, Math.min(80, Number(tilt) || 0)),
          depthProfile: 'follow',
          visible: true,
          patches,
        };
      model.implants.push(implant);
      model.revision++;
      model.processRevision = (model.processRevision || 0) + 1;
      return { changed: true, implantId: implant.id };
    }

    const allowedTypes = new Set([
        'p-type',
        'n-type',
        'p-inversion',
        'n-inversion',
        'p-accumulation',
        'n-accumulation',
        'depletion',
        'custom',
      ]),
      allowedSources = new Set(['induced', 'doped', 'interface', 'custom']);
    if (!allowedTypes.has(electricalRegionType)) {
      return { changed: false, error: 'Unsupported Electrical Region type.' };
    }
    if (!allowedSources.has(electricalRegionSource)) {
      return { changed: false, error: 'Unsupported Electrical Region source.' };
    }
    if (!Array.isArray(model.electricalRegions)) model.electricalRegions = [];
    if (!Number.isInteger(model.nextElectricalRegionId) || model.nextElectricalRegionId < 1) {
      model.nextElectricalRegionId = model.electricalRegions.length + 1;
    }
    const ordinal = model.nextElectricalRegionId++,
      electricalRegion = {
        id: `electrical-${ordinal}`,
        name:
          String(name || `Electrical Region ${ordinal}`).trim() || `Electrical Region ${ordinal}`,
        color: /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : '#7A6FD0',
        face,
        thickness: amount,
        regionType: electricalRegionType,
        source: electricalRegionSource,
        depthProfile: 'follow',
        visible: true,
        patches,
      };
    model.electricalRegions.push(electricalRegion);
    model.revision++;
    model.processRevision = (model.processRevision || 0) + 1;
    return { changed: true, electricalRegionId: electricalRegion.id };
  }

  let layer = null;
  let conformalOriginalVoids = null;
  if (type === 'grow' && !layerById(model, targetLayerId))
    return { changed: false, error: 'Target layer is unavailable.' };

  if (type === 'grow') {
    const exposed = exposedLayerPatches(model, active, face, targetLayerId);
    if (!exposed.length) {
      return {
        changed: false,
        error: 'Target layer is not exposed in the selected area on the active face.',
      };
    }
  }

  if ((type === 'add' || type === 'grow') && growth !== 'conformal') {
    const eligible = model.regions.some((region) => {
      const exposed = surfaceSegment(region.stack, face);
      return (
        exposed &&
        exposed.role !== 'conformal-sidewall' &&
        (type !== 'grow' || exposed.layerId === targetLayerId) &&
        !isEmpty(intersection(active, region.geom))
      );
    });
    if (!eligible) {
      return {
        changed: false,
        error: 'The selected area has no eligible horizontal surface for directional deposition.',
      };
    }
  }
  if (type === 'add') layer = createLayer(model, name);

  if (type === 'etch') {
    const selectiveTargets = [...new Set((etchTargetLayerIds || []).filter(Boolean))];
    if (etchProfile === 'isotropic' && !selectiveTargets.length) {
      return {
        changed: false,
        error: 'Isotropic release requires a selected material.',
      };
    }
    if (selectiveTargets.length) {
      const exposed = new Set(exposedLayerIds(model, active, face));
      if (!selectiveTargets.some((layerId) => exposed.has(layerId))) {
        return {
          changed: false,
          error:
            etchProfile === 'isotropic'
              ? 'The selected release material is not exposed in the selected area.'
              : 'None of the selected etch materials are exposed in the selected area.',
        };
      }
    }
    if (etchProfile === 'isotropic') {
      const release = applyIsotropicEtch(model, active, selectiveTargets, amount, face);
      if (!release.changed) return release;
    } else {
      splitByArea(model, active, (stack) =>
        mutateStack(stack, {
          type,
          amount,
          face,
          appearance,
          etchTargetLayerIds: selectiveTargets,
        }),
      );
    }
  } else if (growth === 'conformal') {
    conformalOriginalVoids = applyConformalCoating(
      model,
      active,
      layer?.id || targetLayerId,
      amount,
      face,
    );
  } else {
    splitByArea(model, active, (stack) => {
      const exposed = surfaceSegment(stack, face);
      // A conformal-sidewall segment is a finite-width surrogate for a vertical
      // film. Its outward Z cap is not a physical horizontal process surface, so
      // directional Deposit/Extend must not grow another layer from that cap.
      if (!exposed || exposed.role === 'conformal-sidewall') return stack;
      return mutateStack(stack, { type, layerId: layer?.id, targetLayerId, amount, face });
    });
  }
  model.regions = mergeRegions(model, model.regions);
  if (growth === 'conformal') {
    // A coverage boolean retry may derive sub-grid cracks from snapped inputs.
    // Unioning those cracks into one unsnapped owner can overlap its neighbors.
    // Check the runtime partition first, then normalize the shared persistence
    // grid when cracks or fractional shared nodes exist; real overlaps reject.
    const { cracks } = classifyCoverageVoids(model, {
      crackTolerance: COVERAGE_CRACK_TOLERANCE_UM,
    });
    if (cracks.length || processPartitionHasFractionalBoundary(model.regions)) {
      model.regions = canonicalizeProcessPartition(model, model.regions, 'Conformal');
    }
    healConformalCoverageCracks(model, conformalOriginalVoids);
  } else if (healNumericalCoverageCracks(model)) {
    model.regions = mergeRegions(model, model.regions);
  }
  if (type === 'etch' && etchProfile === 'isotropic') {
    model.regions = canonicalizeProcessPartition(model, model.regions);
  }

  // Every successful Process result must survive the 0.1 nm project-storage
  // quantum. Directional mask splits can inherit tiny fractional islands from
  // an earlier Boolean partition even when the physical operation is valid.
  // Remove only polygon components whose outer ring collapses to zero area at
  // persistence precision; larger geometry and holes are left untouched.
  model.regions = model.regions
    .map((region) => ({
      ...region,
      geom: dropPersistenceDegeneratePolygons(region.geom),
    }))
    .filter((region) => !isEmpty(region.geom));

  model.revision++;
  model.processRevision = (model.processRevision || 0) + 1;
  return { changed: true, layerId: layer?.id || targetLayerId || null };
}

export function applyOperation(model, params) {
  if (isArrayModel(model)) return applyArrayOperation(model, params, applyOperation);
  const safeGeometryOperation =
      params?.growth === 'conformal' ||
      (params?.type === 'etch' && params?.etchProfile === 'isotropic'),
    rollback = safeGeometryOperation ? cloneModel(model) : null;
  try {
    return applyOperationImpl(model, params);
  } catch (error) {
    if (!rollback) throw error;
    for (const key of Object.keys(model)) delete model[key];
    Object.assign(model, rollback);
    const prefix =
      params?.growth === 'conformal'
        ? 'Conformal geometry failed safely'
        : 'Isotropic etch geometry failed safely';
    return {
      changed: false,
      error: `${prefix}: ${error?.message || 'unknown geometry error'}`,
    };
  }
}

export function modelBoundsZ(model) {
  if (isArrayModel(model)) {
    const bounds = referencedModelParts(model).filter(hasMaterial).map(modelBoundsZ);
    return bounds.length
      ? [Math.min(...bounds.map((b) => b[0])), Math.max(...bounds.map((b) => b[1]))]
      : [-1, 1];
  }
  let lo = Infinity,
    hi = -Infinity;
  for (const region of model.regions)
    for (const seg of region.stack) {
      lo = Math.min(lo, seg.z0);
      hi = Math.max(hi, seg.z1);
    }
  return Number.isFinite(lo) ? [lo, hi] : [-1, 1];
}

export function surfacePatches(model, face = 'front') {
  if (isArrayModel(model)) return surfacePatches(resolveArrayModel(model), face);
  return regionSurfaceFaces(model, { face }).map((patch) => ({
    geom: patch.geom,
    layerId: patch.layerId,
    z: patch.z,
    face: patch.face,
    appearance: patch.appearance,
    stack: patch.stack,
  }));
}

export function layerUsage(model, id) {
  if (isArrayModel(model)) {
    const counts = new Map(model.array.templates.map((t) => [t.id, layerUsage(t.model, id)]));
    return model.array.instances.reduce((n, i) => n + counts.get(i.templateId), 0);
  }
  let count = 0;
  for (const region of model.regions)
    for (const seg of region.stack) if (seg.layerId === id) count++;
  return count;
}
