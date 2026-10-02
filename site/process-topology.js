import {
  cloneGeom,
  difference,
  intersection,
  isEmpty,
  lineIntervalsInMulti,
  multiBounds,
  unionGeometries,
} from './vector-geometry.js';

export const TOPOLOGY_EPSILON_UM = 1e-9;
export const INTERFACE_EPSILON_UM = 1e-8;
export const DEFAULT_COVERAGE_CRACK_TOLERANCE_UM = 1e-4;

export function stackSurfaceSegment(stack, face = 'front') {
  if (!stack?.length) return null;
  return face === 'front' ? stack.at(-1) : stack[0];
}

export function stackSurfaceZ(stack, face = 'front') {
  const segment = stackSurfaceSegment(stack, face);
  return segment ? (face === 'front' ? segment.z1 : segment.z0) : null;
}

export function stackSurfaceAppearance(segment, face = 'front') {
  return segment?.[face === 'back' ? 'backSurface' : 'frontSurface'] || null;
}

function cloneAppearance(appearance) {
  return appearance ? { ...appearance } : null;
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
    return [
      ...safeUnionParts(geoms.slice(0, middle)),
      ...safeUnionParts(geoms.slice(middle)),
    ];
  }
}

function clippedRegionGeometry(region, clip) {
  if (!clip) return region.geom;
  const geom = intersection(region.geom, clip);
  return isEmpty(geom) ? [] : geom;
}

export function regionSurfaceFaces(model, { face = 'front', clip = null } = {}) {
  const out = [];
  for (const region of model?.regions || []) {
    const segment = stackSurfaceSegment(region.stack, face);
    if (!segment) continue;
    const geom = clippedRegionGeometry(region, clip);
    if (isEmpty(geom)) continue;
    out.push({
      kind: 'exposed-horizontal',
      regionId: region.id,
      layerId: segment.layerId,
      z: face === 'front' ? segment.z1 : segment.z0,
      oppositeZ: face === 'front' ? region.stack[0].z0 : region.stack.at(-1).z1,
      face,
      geom,
      appearance: cloneAppearance(stackSurfaceAppearance(segment, face)),
      stack: region.stack,
    });
  }
  return out;
}

export function exposedSurfaceGroups(
  model,
  { face = 'front', clip = null, layerId = null, preserveOppositeZ = true } = {},
) {
  const groups = new Map();
  for (const patch of regionSurfaceFaces(model, { face, clip })) {
    if (layerId && patch.layerId !== layerId) continue;
    const key = JSON.stringify([
      patch.layerId,
      patch.z,
      preserveOppositeZ ? patch.oppositeZ : null,
      patch.appearance || null,
    ]);
    if (!groups.has(key)) {
      groups.set(key, {
        kind: 'exposed-horizontal',
        layerId: patch.layerId,
        z: patch.z,
        oppositeZ: patch.oppositeZ,
        face,
        appearance: cloneAppearance(patch.appearance),
        geoms: [],
      });
    }
    groups.get(key).geoms.push(patch.geom);
  }

  const out = [];
  for (const group of groups.values()) {
    for (const geom of safeUnionParts(group.geoms)) {
      const { geoms, ...rest } = group;
      out.push({ ...rest, geom });
    }
  }
  return out.sort((a, b) => (face === 'front' ? b.z - a.z : a.z - b.z));
}

export function visibleSurfaceGroups(model, { face = 'front', clip = null } = {}) {
  const groups = new Map();
  for (const patch of regionSurfaceFaces(model, { face, clip })) {
    const key = JSON.stringify([patch.layerId, patch.z]);
    if (!groups.has(key)) {
      groups.set(key, {
        kind: 'exposed-horizontal',
        layerId: patch.layerId,
        z: patch.z,
        face,
        geoms: [],
      });
    }
    groups.get(key).geoms.push(patch.geom);
  }
  return [...groups.values()].flatMap(({ geoms, ...group }) =>
    safeUnionParts(geoms).map((geom) => ({ ...group, geom })),
  );
}

export function extrusionGroupsFromTopology(model, clip = null) {
  const groups = new Map();
  for (const region of model?.regions || []) {
    const geom = clippedRegionGeometry(region, clip);
    if (isEmpty(geom)) continue;
    for (const segment of region.stack || []) {
      const key = JSON.stringify([segment.layerId, segment.z0, segment.z1]);
      if (!groups.has(key)) groups.set(key, { ...segment, geoms: [] });
      groups.get(key).geoms.push(geom);
    }
  }
  return [...groups.values()].map(({ geoms, ...segment }) => ({
    ...segment,
    polys: unionGeometries(geoms),
  }));
}

export function sectionColumnsFromTopology(model, a, b) {
  const columns = [];
  for (const region of model?.regions || []) {
    for (const [t0, t1] of lineIntervalsInMulti(a, b, region.geom)) {
      columns.push({
        t0,
        t1,
        stack: (region.stack || []).map((segment) => ({
          ...segment,
          frontSurface: segment.frontSurface ? { ...segment.frontSurface } : undefined,
          backSurface: segment.backSurface ? { ...segment.backSurface } : undefined,
        })),
      });
    }
  }
  return columns;
}

export function sectionSlicesFromTopology(model, a, b) {
  const slices = [];
  for (const column of sectionColumnsFromTopology(model, a, b)) {
    for (let index = 0; index < column.stack.length; index++) {
      const segment = column.stack[index],
        below = column.stack[index - 1] || null,
        above = column.stack[index + 1] || null;
      slices.push({
        ...segment,
        t0: column.t0,
        t1: column.t1,
        below: below ? { ...below } : null,
        above: above ? { ...above } : null,
      });
    }
  }
  return slices;
}

export function materialSolidsFromTopology(model, clip = null) {
  const layers = new Map();
  for (const item of extrusionGroupsFromTopology(model, clip)) {
    if (!layers.has(item.layerId)) layers.set(item.layerId, []);
    layers.get(item.layerId).push(item);
  }

  return [...layers].map(([layerId, items]) => {
    const events = new Map();
    for (const item of items) {
      for (const [z, kind] of [
        [item.z0, 'start'],
        [item.z1, 'end'],
      ]) {
        if (!events.has(z)) events.set(z, { start: [], end: [] });
        events.get(z)[kind].push(item);
      }
    }

    const levels = [...events.keys()].sort((a, b) => a - b),
      active = new Set(),
      slabs = [];
    for (let index = 0; index < levels.length - 1; index++) {
      const z0 = levels[index],
        z1 = levels[index + 1],
        event = events.get(z0);
      for (const item of event.end) active.delete(item);
      for (const item of event.start) active.add(item);
      const polys = unionGeometries([...active].map((item) => item.polys));
      slabs.push({ z0, z1, polys });
    }

    const caps = [];
    for (let index = 0; index < slabs.length; index++) {
      const slab = slabs[index];
      for (const [z, normal, neighbor] of [
        [slab.z0, -1, slabs[index - 1]],
        [slab.z1, 1, slabs[index + 1]],
      ]) {
        const polys = difference(slab.polys, neighbor?.polys || []);
        if (!isEmpty(polys)) caps.push({ z, normal, polys });
      }
    }

    return {
      layerId,
      slabs: slabs.filter((slab) => !isEmpty(slab.polys)),
      caps,
    };
  });
}

export function exposedLayerIdsFromTopology(model, area = model?.boundary, face = 'front') {
  if (!model || isEmpty(area)) return [];
  return [
    ...new Set(
      regionSurfaceFaces(model, { face, clip: area }).map((patch) => patch.layerId),
    ),
  ];
}

export function materialInterfaceGroups(model, { clip = null } = {}) {
  const groups = new Map();
  for (const region of model?.regions || []) {
    const geom = clippedRegionGeometry(region, clip);
    if (isEmpty(geom)) continue;
    const stack = region.stack || [];
    for (let index = 0; index < stack.length - 1; index++) {
      const lower = stack[index],
        upper = stack[index + 1];
      if (Math.abs(lower.z1 - upper.z0) > INTERFACE_EPSILON_UM) continue;
      const z = (lower.z1 + upper.z0) / 2,
        lowerAppearance = cloneAppearance(lower.frontSurface),
        upperAppearance = cloneAppearance(upper.backSurface),
        key = JSON.stringify([
          lower.layerId,
          upper.layerId,
          z,
          lowerAppearance,
          upperAppearance,
        ]);
      if (!groups.has(key)) {
        groups.set(key, {
          kind: 'material-interface',
          z,
          lowerLayerId: lower.layerId,
          upperLayerId: upper.layerId,
          lowerAppearance,
          upperAppearance,
          geoms: [],
        });
      }
      groups.get(key).geoms.push(geom);
    }
  }

  return [...groups.values()].flatMap(({ geoms, ...group }) =>
    safeUnionParts(geoms).map((geom) => ({ ...group, geom })),
  );
}

export function appearanceSurfaceGroupsFromTopology(model, clip = null) {
  const groups = new Map();
  const addAppearance = ({
    layerId,
    z,
    face,
    profileNormal,
    appearance,
    geom,
    buried,
  }) => {
    if (appearance?.kind !== 'rough' || isEmpty(geom)) return;
    const key = JSON.stringify([
      layerId,
      z,
      face,
      profileNormal,
      appearance.profileId,
      appearance.featureSize,
      appearance.meanHeight,
      appearance.featureCv,
      appearance.heightCv,
      appearance.seed,
      appearance.geometryMode,
      appearance.morphology,
      appearance.polarity,
      appearance.etchDepth,
      buried,
    ]);
    if (!groups.has(key)) {
      groups.set(key, {
        kind: buried ? 'buried-appearance-interface' : 'exposed-appearance',
        layerId,
        z,
        face,
        profileNormal,
        appearance: cloneAppearance(appearance),
        buried,
        geoms: [],
      });
    }
    groups.get(key).geoms.push(geom);
  };

  for (const region of model?.regions || []) {
    const geom = clippedRegionGeometry(region, clip);
    if (isEmpty(geom)) continue;
    const stack = region.stack || [];

    for (let index = 0; index < stack.length; index++) {
      const segment = stack[index],
        below = stack[index - 1] || null,
        above = stack[index + 1] || null,
        frontBuried = Boolean(
          above && Math.abs(above.z0 - segment.z1) <= INTERFACE_EPSILON_UM,
        ),
        backBuried = Boolean(
          below && Math.abs(below.z1 - segment.z0) <= INTERFACE_EPSILON_UM,
        ),
        frontAppearance =
          segment.frontSurface?.kind === 'rough'
            ? segment.frontSurface
            : above?.backSurface?.kind === 'rough'
              ? above.backSurface
              : null,
        backAppearance =
          segment.backSurface?.kind === 'rough'
            ? segment.backSurface
            : below?.frontSurface?.kind === 'rough'
              ? below.frontSurface
              : null;

      addAppearance({
        layerId: segment.layerId,
        z: segment.z1,
        face: 'front',
        profileNormal: segment.frontSurface?.kind === 'rough' ? 1 : -1,
        appearance: frontAppearance,
        geom,
        buried: frontBuried,
      });
      addAppearance({
        layerId: segment.layerId,
        z: segment.z0,
        face: 'back',
        profileNormal: segment.backSurface?.kind === 'rough' ? -1 : 1,
        appearance: backAppearance,
        geom,
        buried: backBuried,
      });
    }
  }

  return [...groups.values()].flatMap(({ geoms, ...group }) =>
    safeUnionParts(geoms).map((geom) => ({ ...group, polys: geom })),
  );
}

export function uncoveredDomain(model, clip = model?.boundary) {
  if (!model || isEmpty(clip)) return [];
  let uncovered = cloneGeom(clip);
  try {
    const coveredParts = safeUnionParts(
      (model.regions || [])
        .map((region) => intersection(region.geom, clip))
        .filter((geom) => !isEmpty(geom)),
    );
    for (const covered of coveredParts) {
      if (isEmpty(uncovered)) break;
      uncovered = difference(uncovered, covered);
    }
    return uncovered;
  } catch {
    return [];
  }
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

function geometryArea(geometry) {
  let total = 0;
  for (const polygon of geometry || []) {
    if (!polygon.length) continue;
    let value = Math.abs(ringArea(polygon[0]));
    for (let index = 1; index < polygon.length; index++) {
      value -= Math.abs(ringArea(polygon[index]));
    }
    total += Math.max(0, value);
  }
  return total;
}

export function classifyCoverageVoids(
  model,
  {
    clip = model?.boundary,
    crackTolerance = DEFAULT_COVERAGE_CRACK_TOLERANCE_UM,
  } = {},
) {
  const all = uncoveredDomain(model, clip),
    cracks = [],
    voids = [];

  for (const polygon of all) {
    const geom = [polygon],
      bounds = multiBounds(geom),
      area = geometryArea(geom),
      narrow =
        Math.min(bounds.width, bounds.height) <= crackTolerance + TOPOLOGY_EPSILON_UM,
      tiny = area <= crackTolerance ** 2 * 4,
      item = {
        kind: narrow || tiny ? 'numerical-crack' : 'true-void',
        geom,
        bounds,
        area,
      };
    (narrow || tiny ? cracks : voids).push(item);
  }

  return { all, cracks, voids };
}

export function conformalMaterialWallTargets(
  model,
  band,
  { face = 'front', sourceZ } = {},
) {
  const out = [];
  if (!model || isEmpty(band) || !Number.isFinite(sourceZ)) return out;

  for (const region of model.regions || []) {
    const localZ = stackSurfaceZ(region.stack, face),
      needsWall =
        localZ != null &&
        (face === 'front'
          ? localZ < sourceZ - TOPOLOGY_EPSILON_UM
          : localZ > sourceZ + TOPOLOGY_EPSILON_UM);
    if (!needsWall) continue;

    const geom = intersection(region.geom, band);
    if (isEmpty(geom)) continue;
    out.push({
      kind: 'material-wall',
      regionId: region.id,
      face,
      sourceZ,
      localZ,
      geom,
    });
  }
  return out;
}

export function conformalWallTargets(
  model,
  band,
  {
    face = 'front',
    source,
    voidDomain = [],
  } = {},
) {
  const sourceZ = Number(source?.z),
    materialWalls = conformalMaterialWallTargets(model, band, { face, sourceZ }).map(
      (target) => ({
        ...target,
        z0: Math.min(target.localZ, target.sourceZ),
        z1: Math.max(target.localZ, target.sourceZ),
      }),
    ),
    voidWalls = [];

  if (
    !isEmpty(voidDomain) &&
    Number.isFinite(sourceZ) &&
    Number.isFinite(Number(source?.oppositeZ))
  ) {
    const geom = intersection(band, voidDomain),
      oppositeZ = Number(source.oppositeZ),
      z0 = Math.min(sourceZ, oppositeZ),
      z1 = Math.max(sourceZ, oppositeZ);
    if (!isEmpty(geom) && z1 > z0 + TOPOLOGY_EPSILON_UM) {
      voidWalls.push({
        kind: 'void-wall',
        face,
        sourceZ,
        oppositeZ,
        z0,
        z1,
        geom,
      });
    }
  }

  return { materialWalls, voidWalls };
}

export function deriveProcessTopology(model, { face = 'front', clip = null } = {}) {
  const domain = clip || model?.boundary || [];
  const coverage = classifyCoverageVoids(model, { clip: domain });
  return {
    kernel: 'surface-topology-v2',
    face,
    exposedFaces: visibleSurfaceGroups(model, { face, clip }),
    materialInterfaces: materialInterfaceGroups(model, { clip }),
    appearanceFaces: appearanceSurfaceGroupsFromTopology(model, clip),
    voids: coverage.voids,
    numericalCracks: coverage.cracks,
  };
}
