import {
  bufferPolyline,
  cloneGeom,
  difference,
  intersection,
  isEmpty,
  lineIntervalsInMulti,
  multiBounds,
  unionGeometries,
} from './vector-geometry.js';
import {
  canonicalLineInterval,
  lineIntervalKey,
  partitionLineIntervals,
  pointAtLineT,
} from './line-intervals.js';

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

function safeUnionGeometry(geometries) {
  return safeUnionParts(geometries).flatMap((geom) => geom);
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
      const polys = safeUnionGeometry([...active].map((item) => item.polys));
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

export function solidBordersFromTopology({ slabs, caps }, thresholdDegrees = 20) {
  const lines = [];
  for (const { z, polys } of caps || [])
    for (const poly of polys || [])
      for (const ring of poly || [])
        for (let index = 1; index < ring.length; index++)
          lines.push([
            [...ring[index - 1], z],
            [...ring[index], z],
          ]);

  const threshold = Math.cos((thresholdDegrees * Math.PI) / 180);
  for (const { z0, z1, polys } of slabs || [])
    for (const poly of polys || [])
      for (const closed of poly || []) {
        const ring = closed.slice(0, -1);
        for (let index = 0; index < ring.length; index++) {
          const p = ring[index],
            before = ring[(index + ring.length - 1) % ring.length],
            after = ring[(index + 1) % ring.length],
            u = [p[0] - before[0], p[1] - before[1]],
            v = [after[0] - p[0], after[1] - p[1]],
            denominator = Math.hypot(...u) * Math.hypot(...v);
          if (!(denominator > 0)) continue;
          const cosine = (u[0] * v[0] + u[1] * v[1]) / denominator;
          if (cosine <= threshold)
            lines.push([
              [...p, z0],
              [...p, z1],
            ]);
        }
      }
  return lines;
}

function topologyZKey(value) {
  return Number(value).toPrecision(15);
}

function roughSurfaceKey(layerId, z, face) {
  return `${layerId}\u0000${topologyZKey(z)}\u0000${face}`;
}

function appearanceMapFromTopology(model, clip) {
  const map = new Map();
  for (const patch of appearanceSurfaceGroupsFromTopology(model, clip)) {
    const key = roughSurfaceKey(patch.layerId, patch.z, patch.face);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(patch);
  }
  return map;
}

function splitOwnedCapByAppearance(item, cap, roughMap, solidIndex) {
  const face = cap.normal > 0 ? 'front' : 'back',
    patches = roughMap.get(roughSurfaceKey(item.layerId, cap.z, face)) || [],
    parts = [];
  let remaining = cap.polys;

  for (const patch of patches) {
    const roughPolys = intersection(remaining, patch.polys);
    if (!isEmpty(roughPolys)) {
      parts.push({
        layerId: item.layerId,
        solidIndex,
        type: 'cap',
        face,
        z: cap.z,
        normal: cap.normal,
        polys: roughPolys,
        appearance: patch.appearance,
        profileNormal: patch.profileNormal,
        buried: Boolean(patch.buried),
      });
    }
    remaining = difference(remaining, patch.polys);
    if (isEmpty(remaining)) break;
  }

  if (!isEmpty(remaining)) {
    parts.push({
      layerId: item.layerId,
      solidIndex,
      type: 'cap',
      face,
      z: cap.z,
      normal: cap.normal,
      polys: remaining,
      appearance: null,
      profileNormal: cap.normal,
      buried: false,
    });
  }
  return parts;
}

function surfaceOwnerRank(part, layerOrder) {
  return [
    part.appearance ? 0 : 1,
    part.normal > 0 ? 0 : 1,
    layerOrder.get(part.layerId) ?? Number.MAX_SAFE_INTEGER,
    String(part.layerId),
  ];
}

function compareSurfaceOwnerRank(a, b) {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    if (a[index] === b[index]) continue;
    return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function ownsMaterialInterface(current, other, layerOrder) {
  return (
    compareSurfaceOwnerRank(
      surfaceOwnerRank(current, layerOrder),
      surfaceOwnerRank(other, layerOrder),
    ) <= 0
  );
}

function ownHorizontalMaterialCaps(rawCaps, layerOrder) {
  const owned = [];
  for (let index = 0; index < rawCaps.length; index++) {
    const cap = rawCaps[index];
    let remaining = cap.polys;

    for (let otherIndex = 0; otherIndex < rawCaps.length; otherIndex++) {
      if (otherIndex === index) continue;
      const other = rawCaps[otherIndex];
      if (other.layerId === cap.layerId) continue;
      if (Math.abs(other.z - cap.z) > INTERFACE_EPSILON_UM) continue;
      if (other.normal !== -cap.normal) continue;

      const overlap = intersection(remaining, other.polys);
      if (isEmpty(overlap)) continue;
      if (ownsMaterialInterface(cap, other, layerOrder)) {
        owned.push({
          ...cap,
          polys: overlap,
          buried: true,
          ownership: 'interface',
          interfaceLayerId: other.layerId,
        });
      }
      remaining = difference(remaining, overlap);
      if (isEmpty(remaining)) break;
    }

    if (!isEmpty(remaining)) {
      owned.push({
        ...cap,
        polys: remaining,
        ownership: cap.buried ? 'interface' : 'exterior',
        interfaceLayerId: null,
      });
    }
  }
  return owned;
}

function normalizeBoundaryRing(closed, isHole) {
  const points = Array.isArray(closed) ? closed : [],
    isClosed =
      points.length > 1 &&
      points[0][0] === points.at(-1)[0] &&
      points[0][1] === points.at(-1)[1],
    ring = (isClosed ? points.slice(0, -1) : points.slice()).map(([x, y]) => [x, y]);
  if (ring.length < 2) return [];

  const signedArea = ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point[0] * next[1] - point[1] * next[0];
  }, 0);
  if ((signedArea > 0) !== !isHole) ring.reverse();
  return ring;
}

function ownVerticalMaterialSidewalls(solids, layerOrder) {
  const groups = new Map();
  solids.forEach((item, solidIndex) => {
    for (const slab of item.slabs) {
      for (const poly of slab.polys) {
        for (let ringIndex = 0; ringIndex < poly.length; ringIndex++) {
          const ring = normalizeBoundaryRing(poly[ringIndex], ringIndex > 0);
          for (let index = 0; index < ring.length; index++) {
            const p = ring[index],
              q = ring[(index + 1) % ring.length],
              line = canonicalLineInterval(p, q);
            if (!line) continue;
            const part = {
                layerId: item.layerId,
                solidIndex,
                type: 'sidewall',
                p,
                q,
                z0: slab.z0,
                z1: slab.z1,
                line,
              },
              key = lineIntervalKey(line);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(part);
          }
        }
      }
    }
  });

  const owned = [];
  for (const entries of groups.values()) {
    const reference = entries[0].line;
    for (const { t0, t1, covering: xyCovering } of partitionLineIntervals(entries)) {
      const zLevels = [...new Set(xyCovering.flatMap((entry) => [entry.z0, entry.z1]))].sort(
        (a, b) => a - b,
      );
      for (let zIndex = 0; zIndex < zLevels.length - 1; zIndex++) {
        const z0 = zLevels[zIndex],
          z1 = zLevels[zIndex + 1];
        if (!(z1 > z0 + TOPOLOGY_EPSILON_UM)) continue;
        const covering = xyCovering.filter(
          (entry) =>
            entry.z0 <= z0 + TOPOLOGY_EPSILON_UM &&
            entry.z1 >= z1 - TOPOLOGY_EPSILON_UM,
        );
        if (!covering.length) continue;

        covering.sort((a, b) => {
          const ai = layerOrder.get(a.layerId) ?? Number.MAX_SAFE_INTEGER,
            bi = layerOrder.get(b.layerId) ?? Number.MAX_SAFE_INTEGER;
          if (ai !== bi) return ai - bi;
          return String(a.layerId).localeCompare(String(b.layerId));
        });

        const owner = covering[0],
          interfaceLayerIds = [
            ...new Set(
              covering
                .slice(1)
                .map((entry) => entry.layerId)
                .filter((id) => id !== owner.layerId),
            ),
          ],
          a = pointAtLineT(reference, t0),
          b = pointAtLineT(reference, t1),
          [p, q] = owner.line.forward ? [a, b] : [b, a];

        owned.push({
          ...owner,
          p,
          q,
          z0,
          z1,
          buried: interfaceLayerIds.length > 0,
          ownership: interfaceLayerIds.length ? 'interface' : 'exterior',
          interfaceLayerIds,
        });
      }
    }
  }
  return owned;
}

function topologyPointKey3d(point) {
  return point.map((value) => Number(value).toPrecision(14)).join(',');
}

function topologyLineKey(a, b) {
  const pa = topologyPointKey3d(a),
    pb = topologyPointKey3d(b);
  return pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`;
}

function topologyVerticalPointKey(point) {
  return `${Number(point[0]).toPrecision(14)},${Number(point[1]).toPrecision(14)}`;
}

function ownedVerticalBorderLines(solids) {
  const groups = new Map();
  for (const item of solids) {
    for (const [a, b] of solidBordersFromTopology(item)) {
      if (Math.abs(a[2] - b[2]) <= TOPOLOGY_EPSILON_UM) continue;
      const z0 = Math.min(a[2], b[2]),
        z1 = Math.max(a[2], b[2]),
        key = topologyVerticalPointKey(a);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        layerId: item.layerId,
        point: [a[0], a[1]],
        z0,
        z1,
      });
    }
  }

  const lines = [];
  for (const entries of groups.values()) {
    const levels = [
      ...new Set(entries.flatMap((entry) => [entry.z0, entry.z1]).map(topologyZKey)),
    ]
      .map(Number)
      .sort((a, b) => a - b);
    for (let index = 0; index < levels.length - 1; index++) {
      const z0 = levels[index],
        z1 = levels[index + 1];
      if (!(z1 > z0 + TOPOLOGY_EPSILON_UM)) continue;
      const covering = entries.filter(
          (entry) =>
            entry.z0 <= z0 + TOPOLOGY_EPSILON_UM &&
            entry.z1 >= z1 - TOPOLOGY_EPSILON_UM,
        ),
        uniqueLayers = new Set(covering.map((entry) => entry.layerId));
      if (uniqueLayers.size !== 1 || !covering.length) continue;
      const [x, y] = covering[0].point;
      lines.push([
        [x, y, z0],
        [x, y, z1],
      ]);
    }
  }
  return lines;
}

function ownedMaterialBorderLines(solids, caps) {
  const lines = ownedVerticalBorderLines(solids);
  for (const cap of caps) {
    if (cap.appearance || cap.buried) continue;
    for (const poly of cap.polys || [])
      for (const ring of poly || [])
        for (let index = 1; index < ring.length; index++)
          lines.push([
            [...ring[index - 1], cap.z],
            [...ring[index], cap.z],
          ]);
  }

  const unique = new Map();
  for (const line of lines) {
    const key = topologyLineKey(line[0], line[1]);
    if (!unique.has(key)) unique.set(key, line);
  }
  return [...unique.values()];
}

export function ownedMaterialSurfacesFromTopology(model, clip = null) {
  const layerOrder = new Map(
      (model?.layers || []).map((layer, index) => [layer.id, index]),
    ),
    solids = materialSolidsFromTopology(model, clip),
    roughMap = appearanceMapFromTopology(model, clip),
    rawCaps = [];

  solids.forEach((item, solidIndex) => {
    for (const cap of item.caps) {
      rawCaps.push(...splitOwnedCapByAppearance(item, cap, roughMap, solidIndex));
    }
  });

  const caps = ownHorizontalMaterialCaps(rawCaps, layerOrder),
    sidewalls = ownVerticalMaterialSidewalls(solids, layerOrder),
    borderLines = ownedMaterialBorderLines(solids, caps);
  return { caps, sidewalls, borderLines };
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

function packDisjointBands(bands, maxBatchSize = 8) {
  const batches = [];
  const overlaps = (a, b) =>
    !(
      a.maxX < b.minX - TOPOLOGY_EPSILON_UM ||
      b.maxX < a.minX - TOPOLOGY_EPSILON_UM ||
      a.maxY < b.minY - TOPOLOGY_EPSILON_UM ||
      b.maxY < a.minY - TOPOLOGY_EPSILON_UM
    );

  for (const band of bands || []) {
    if (isEmpty(band)) continue;
    const bounds = multiBounds(band);
    let batch = batches.find(
      (candidate) =>
        candidate.count < maxBatchSize &&
        candidate.bounds.every((otherBounds) => !overlaps(bounds, otherBounds)),
    );
    if (!batch) {
      batch = { geom: [], bounds: [], count: 0 };
      batches.push(batch);
    }
    batch.geom.push(...cloneGeom(band));
    batch.bounds.push(bounds);
    batch.count++;
  }
  return batches.map((batch) => batch.geom);
}

export function conformalBoundaryBands(geom, amount) {
  const distance = Math.max(0, Number(amount) || 0),
    bands = [];
  if (!(distance > TOPOLOGY_EPSILON_UM)) return bands;

  for (const polygon of geom || []) {
    for (const ring of polygon || []) {
      if (!Array.isArray(ring) || ring.length < 4) continue;
      const points = ring.slice(0, -1);
      try {
        const band = bufferPolyline(points, distance, 32, true);
        if (!isEmpty(band)) bands.push(band);
      } catch {
        // Keep boundary construction local. One pathological imported ring must
        // not cancel otherwise valid Conformal wall topology.
        for (let index = 1; index < ring.length; index++) {
          const band = bufferPolyline([ring[index - 1], ring[index]], distance, 20, false);
          if (!isEmpty(band)) bands.push(band);
        }
      }
    }
  }

  return packDisjointBands(bands);
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
