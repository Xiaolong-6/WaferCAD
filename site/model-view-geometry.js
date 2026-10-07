import {
  isArrayModel,
  arrayParts,
  resolveArrayModel,
  geometryBounds as arrayBounds,
  lineBounds,
  translatedStack,
  translatedAppearance,
} from './model-array.js';
import {
  difference,
  intersection,
  isEmpty,
  lineIntervalsInMulti,
  multiBounds,
  cloneGeom,
  unionGeometries,
} from './vector-geometry.js';
import { visibleMaterialModel } from './model.js';
import {
  appearanceSurfaceGroupsFromTopology,
  extrusionGroupsFromTopology,
  materialSolidsFromTopology,
  sectionColumnsFromTopology,
  sectionSlicesFromTopology,
  solidBordersFromTopology,
  visibleSurfaceGroups,
} from './process-topology.js';

// All views consume canonical physical XYZ geometry; visual Z scaling is renderer-only.
// Topology v2 owns the shared volumetric/section derivation; this module keeps
// the stable view-facing API.
export function extrusionGroups(model, clip = null) {
  if (isArrayModel(model))
    return extrusionGroups(resolveArrayModel(model, clip ? arrayBounds(clip) : null), clip);
  return extrusionGroupsFromTopology(visibleMaterialModel(model), clip);
}

export function sectionColumns(model, a, b) {
  if (isArrayModel(model))
    return arrayParts(model, lineBounds(a, b), { touch: true }).flatMap((p) =>
      sectionColumns(p.model, [a[0] - p.x, a[1] - p.y], [b[0] - p.x, b[1] - p.y]).map((c) => ({
        ...c,
        stack: translatedStack(c.stack, p.x, p.y),
      })),
    );
  return sectionColumnsFromTopology(visibleMaterialModel(model), a, b);
}

export function sectionSlices(model, a, b) {
  if (isArrayModel(model))
    return arrayParts(model, lineBounds(a, b), { touch: true }).flatMap((p) =>
      sectionSlices(p.model, [a[0] - p.x, a[1] - p.y], [b[0] - p.x, b[1] - p.y]),
    );
  return sectionSlicesFromTopology(visibleMaterialModel(model), a, b);
}

// Region partitions describe processing history, not visible material boundaries.
// Topology v2 owns which horizontal faces are physically exposed and which
// rough interfaces are buried; the view layer only adapts those facts.
export function surfaceGroups(model, face = 'front') {
  if (isArrayModel(model)) return surfaceGroups(resolveArrayModel(model), face);
  return visibleSurfaceGroups(visibleMaterialModel(model), { face }).map(
    ({ layerId, z, geom, appearance }) => ({
      layerId,
      z,
      geom,
      appearance,
    }),
  );
}

export function appearanceSurfaceGroups(model, clip = null) {
  if (isArrayModel(model))
    return appearanceSurfaceGroups(resolveArrayModel(model, clip ? arrayBounds(clip) : null), clip);
  return appearanceSurfaceGroupsFromTopology(visibleMaterialModel(model), clip).map(
    ({ layerId, z, face, profileNormal, appearance, buried, polys }) => ({
      layerId,
      z,
      face,
      profileNormal,
      appearance,
      buried,
      polys,
    }),
  );
}

export function sectionContours(model, a, b) {
  const groups = new Map();
  for (const { layerId, t0, t1, z0, z1 } of sectionSlices(model, a, b)) {
    if (!groups.has(layerId)) groups.set(layerId, []);
    groups.get(layerId).push([
      [
        [
          [t0, z0],
          [t1, z0],
          [t1, z1],
          [t0, z1],
          [t0, z0],
        ],
      ],
    ]);
  }
  return [...groups].map(([layerId, geoms]) => ({ layerId, polys: unionGeometries(geoms) }));
}

// A material's boundary is built by topology v2 from unioned Z slabs.
// Only footprint differences become horizontal caps; overlapping slab
// transitions are internal and never rendered as physical faces.
export function materialSolids(model, clip = null) {
  if (isArrayModel(model))
    return materialSolids(resolveArrayModel(model, clip ? arrayBounds(clip) : null), clip);
  return materialSolidsFromTopology(visibleMaterialModel(model), clip);
}

export function solidBorders(solid, thresholdDegrees = 20) {
  return solidBordersFromTopology(solid, thresholdDegrees);
}

function deriveAnnotationVolumeFragments(items, model, kind) {
  const bounds = new WeakMap();
  const boundsOf = (geom) => {
    if (!bounds.has(geom)) bounds.set(geom, multiBounds(geom));
    return bounds.get(geom);
  };
  const disjoint = (left, right) => {
    const a = boundsOf(left),
      b = boundsOf(right);
    return !a || !b || a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY;
  };
  const fragments = [];
  for (const item of items || []) {
    if (item.visible === false) continue;
    const thickness = Math.max(0, Number(item.thickness) || 0);
    if (!(thickness > 1e-12)) continue;

    for (const patch of item.patches || []) {
      const sourceLow = item.face === 'front' ? patch.z - thickness : patch.z,
        sourceHigh = item.face === 'front' ? patch.z : patch.z + thickness;

      for (const region of model.regions || []) {
        if (!region.stack?.length) continue;
        const hostSegments = region.stack.filter(
          (segment) =>
            (kind !== 'electrical' || segment.layerId === patch.layerId) &&
            Math.min(sourceHigh, segment.z1) > Math.max(sourceLow, segment.z0) + 1e-12,
        );
        if (!hostSegments.length || disjoint(patch.geom, region.geom)) continue;
        const geom = intersection(patch.geom, region.geom);
        if (isEmpty(geom)) continue;
        const currentLow = region.stack[0].z0,
          currentHigh = region.stack.at(-1).z1;

        for (const hostSegment of hostSegments) {
          const z0 = Math.max(sourceLow, hostSegment.z0),
            z1 = Math.min(sourceHigh, hostSegment.z1);
          if (!(z1 > z0 + 1e-12)) continue;

          const currentSurfaceSegment =
              item.face === 'front' ? region.stack.at(-1) : region.stack[0],
            currentSurfaceZ = item.face === 'front' ? currentHigh : currentLow,
            sourceSurfaceZ = Number(patch.z),
            currentCutsAnnotation =
              item.face === 'front'
                ? currentSurfaceZ < sourceSurfaceZ - 1e-9
                : currentSurfaceZ > sourceSurfaceZ + 1e-9,
            currentAppearance =
              item.face === 'front'
                ? currentSurfaceSegment?.frontSurface
                : currentSurfaceSegment?.backSurface,
            outerZ = item.face === 'front' ? z1 : z0,
            innerZ = item.face === 'front' ? z0 : z1,
            surfaceExposed = Math.abs(currentSurfaceZ - outerZ) <= 1e-9;

          fragments.push({
            annotationKind: kind,
            annotationId: item.id,
            ...(kind === 'implant' ? { implantId: item.id } : { electricalRegionId: item.id }),
            name: item.name,
            color: item.color,
            face: item.face,
            thickness,
            depthProfile: item.depthProfile === 'smooth' ? 'smooth' : 'follow',
            tilt: kind === 'implant' ? Number(item.tilt) || 0 : 0,
            ...(kind === 'electrical'
              ? {
                  regionType: item.regionType,
                  source: item.source,
                  hostLayerId: patch.layerId,
                }
              : {}),
            sourceZ: sourceSurfaceZ,
            outerZ,
            innerZ,
            surfaceExposed,
            viewClipped: false,
            z0,
            z1,
            surfaceAppearance:
              (currentCutsAnnotation ? currentAppearance : patch.surfaceAppearance) || null,
            polys: geom,
          });
        }
      }
    }
  }
  return fragments;
}

// Private derived geometry is shared across views of one model revision.
// Changes to an annotation's presentation metadata also invalidate it.
const annotationFragmentCache = new WeakMap();
function annotationVolumeFragments(items = [], model, clip = null, kind = 'annotation') {
  items ||= [];
  const metadata = JSON.stringify(
    items.map(({ patches = [], ...item }) => ({
      ...item,
      patches: patches.map(({ geom, ...patch }) => patch),
    })),
  );
  const geometries = items.flatMap((item) => (item.patches || []).map((patch) => patch.geom));
  let cache = annotationFragmentCache.get(model);
  if (
    !cache ||
    cache.revision !== model.revision ||
    cache.processRevision !== model.processRevision ||
    cache.regions !== model.regions
  ) {
    cache = {
      revision: model.revision,
      processRevision: model.processRevision,
      regions: model.regions,
      kinds: new Map(),
    };
    annotationFragmentCache.set(model, cache);
  }
  let entry = cache.kinds.get(kind);
  if (
    !entry ||
    entry.metadata !== metadata ||
    entry.geometries.length !== geometries.length ||
    entry.geometries.some((geom, i) => geom !== geometries[i])
  ) {
    entry = {
      metadata,
      geometries,
      fragments: deriveAnnotationVolumeFragments(items, model, kind),
    };
    cache.kinds.set(kind, entry);
  }
  if (!clip)
    return entry.fragments.map((fragment) => ({ ...fragment, polys: cloneGeom(fragment.polys) }));
  const clipped = new WeakMap();
  return entry.fragments.flatMap((fragment) => {
    let geometry = clipped.get(fragment.polys);
    if (!geometry) {
      geometry = {
        polys: intersection(fragment.polys, clip),
        viewClipped: !isEmpty(difference(fragment.polys, clip)),
      };
      clipped.set(fragment.polys, geometry);
    }
    return isEmpty(geometry.polys) ? [] : [{ ...fragment, ...geometry }];
  });
}

function annotationSurfaceGroups(fragments) {
  return fragments.map((fragment) => ({
    ...fragment,
    z: fragment.outerZ,
  }));
}

function annotationSolids(fragments) {
  return fragments.map((fragment) => ({
    ...fragment,
    slabs: [{ z0: fragment.z0, z1: fragment.z1, polys: fragment.polys }],
    caps: [
      { z: fragment.z0, normal: -1, polys: fragment.polys },
      { z: fragment.z1, normal: 1, polys: fragment.polys },
    ],
  }));
}

function annotationSectionBands(fragments, a, b) {
  const grouped = new Map();
  for (const fragment of fragments) {
    const key = JSON.stringify([
      fragment.annotationKind,
      fragment.annotationId,
      fragment.face,
      fragment.color,
      fragment.thickness,
      fragment.depthProfile,
      fragment.tilt,
      fragment.sourceZ,
      fragment.outerZ,
      fragment.innerZ,
      fragment.hostLayerId || null,
      fragment.regionType || null,
      fragment.source || null,
      fragment.surfaceAppearance || null,
    ]);
    if (!grouped.has(key)) grouped.set(key, []);
    for (const [t0, t1] of lineIntervalsInMulti(a, b, fragment.polys)) {
      grouped.get(key).push({ ...fragment, t0, t1 });
    }
  }

  const bands = [];
  for (const group of grouped.values()) {
    group.sort((left, right) => left.t0 - right.t0 || left.t1 - right.t1);
    let current = null;
    for (const band of group) {
      if (!current) {
        current = { ...band };
        continue;
      }
      // Host-region partitions are bookkeeping seams. If they describe the same
      // annotation volume and touch in Section, keep one continuous band so the
      // Border renderer cannot expose an internal dashed vertical edge.
      if (band.t0 <= current.t1 + 1e-9) {
        current.t1 = Math.max(current.t1, band.t1);
        current.surfaceExposed = Boolean(current.surfaceExposed && band.surfaceExposed);
        continue;
      }
      bands.push(current);
      current = { ...band };
    }
    if (current) bands.push(current);
  }
  return bands.sort((left, right) => left.t0 - right.t0 || left.t1 - right.t1);
}

function implantFragments(model, clip = null) {
  return annotationVolumeFragments(model?.implants, model, clip, 'implant');
}

function electricalRegionFragments(model, clip = null) {
  return annotationVolumeFragments(model?.electricalRegions, model, clip, 'electrical');
}

export function implantSurfaceGroups(model, clip = null) {
  if (isArrayModel(model))
    return implantSurfaceGroups(resolveArrayModel(model, clip ? arrayBounds(clip) : null), clip);
  return annotationSurfaceGroups(implantFragments(model, clip));
}

export function implantSolids(model, clip = null) {
  if (isArrayModel(model))
    return implantSolids(resolveArrayModel(model, clip ? arrayBounds(clip) : null), clip);
  return annotationSolids(implantFragments(model, clip));
}

// An ROI inspection face belongs to the ROI boundary, not every boundary of
// the host-region fragment. A fragment may also contain internal bookkeeping
// seams and the annotation's own perimeter, both of which remain buried.
export function annotationInspectionCutSegments(annotation, clip) {
  if (!clip || !annotation) return [];
  const clipEdges = [];
  for (const poly of clip) {
    for (const ring of poly) {
      for (let index = 1; index < ring.length; index++) {
        clipEdges.push([ring[index - 1], ring[index]]);
      }
    }
  }

  const segments = [];
  for (const poly of annotation.polys || []) {
    for (const ring of poly) {
      for (let index = 1; index < ring.length; index++) {
        const p = ring[index - 1],
          q = ring[index],
          dx = q[0] - p[0],
          dy = q[1] - p[1],
          length = Math.hypot(dx, dy);
        if (!(length > 1e-12)) continue;
        const tolerance = Math.max(
            1e-8,
            Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(q[0]), Math.abs(q[1])) *
              Number.EPSILON *
              32,
          ),
          intervals = [];
        for (const [a, b] of clipEdges) {
          const distance = (point) =>
            Math.abs(dx * (point[1] - p[1]) - dy * (point[0] - p[0])) / length;
          if (distance(a) > tolerance || distance(b) > tolerance) continue;
          const parameter = (point) =>
              ((point[0] - p[0]) * dx + (point[1] - p[1]) * dy) / (length * length),
            ta = parameter(a),
            tb = parameter(b),
            lo = Math.max(0, Math.min(ta, tb)),
            hi = Math.min(1, Math.max(ta, tb));
          if ((hi - lo) * length > tolerance) intervals.push([lo, hi]);
        }
        intervals.sort((a, b) => a[0] - b[0]);
        const merged = [];
        for (const interval of intervals) {
          const previous = merged.at(-1);
          if (previous && interval[0] <= previous[1] + tolerance / length) {
            previous[1] = Math.max(previous[1], interval[1]);
          } else merged.push([...interval]);
        }
        for (const [lo, hi] of merged) {
          segments.push({
            p: [p[0] + dx * lo, p[1] + dy * lo],
            q: [p[0] + dx * hi, p[1] + dy * hi],
          });
        }
      }
    }
  }
  return segments;
}

export function implantSectionBands(model, a, b) {
  if (isArrayModel(model))
    return arrayParts(model, lineBounds(a, b), { touch: true }).flatMap((p) =>
      implantSectionBands(p.model, [a[0] - p.x, a[1] - p.y], [b[0] - p.x, b[1] - p.y]).map((c) => ({
        ...c,
        surfaceAppearance: translatedAppearance(c.surfaceAppearance, p.x, p.y),
      })),
    );
  return annotationSectionBands(implantFragments(model), a, b);
}

export function electricalRegionSurfaceGroups(model, clip = null) {
  if (isArrayModel(model))
    return electricalRegionSurfaceGroups(
      resolveArrayModel(model, clip ? arrayBounds(clip) : null),
      clip,
    );
  return annotationSurfaceGroups(electricalRegionFragments(model, clip));
}

export function electricalRegionSolids(model, clip = null) {
  if (isArrayModel(model))
    return electricalRegionSolids(resolveArrayModel(model, clip ? arrayBounds(clip) : null), clip);
  return annotationSolids(electricalRegionFragments(model, clip));
}

export function electricalRegionSectionBands(model, a, b) {
  if (isArrayModel(model))
    return arrayParts(model, lineBounds(a, b), { touch: true }).flatMap((p) =>
      electricalRegionSectionBands(p.model, [a[0] - p.x, a[1] - p.y], [b[0] - p.x, b[1] - p.y]).map(
        (c) => ({ ...c, surfaceAppearance: translatedAppearance(c.surfaceAppearance, p.x, p.y) }),
      ),
    );
  return annotationSectionBands(electricalRegionFragments(model), a, b);
}
