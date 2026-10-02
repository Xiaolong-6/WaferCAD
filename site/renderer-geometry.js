import {
  difference,
  intersection,
  isEmpty,
} from './vector-geometry.js';
import {
  appearanceSurfaceGroups,
  materialSolids,
  solidBorders,
} from './model-view-geometry.js';

const Z_EPSILON = 1e-9;

function zKey(value) {
  return Number(value).toPrecision(15);
}

function roughSurfaceKey(layerId, z, face) {
  return `${layerId}\u0000${zKey(z)}\u0000${face}`;
}

function appearanceMap(model, clip) {
  const map = new Map();
  for (const patch of appearanceSurfaceGroups(model, clip)) {
    const key = roughSurfaceKey(patch.layerId, patch.z, patch.face);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(patch);
  }
  return map;
}

function splitCapByAppearance(item, cap, roughMap, solidIndex) {
  const face = cap.normal > 0 ? 'front' : 'back';
  const patches = roughMap.get(roughSurfaceKey(item.layerId, cap.z, face)) || [];
  const parts = [];
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

function ownerRank(part, layerOrder) {
  return [
    part.appearance ? 0 : 1,
    part.normal > 0 ? 0 : 1,
    layerOrder.get(part.layerId) ?? Number.MAX_SAFE_INTEGER,
    String(part.layerId),
  ];
}

function compareRank(a, b) {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    if (a[index] === b[index]) continue;
    return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function ownsInterface(current, other, layerOrder) {
  return compareRank(ownerRank(current, layerOrder), ownerRank(other, layerOrder)) <= 0;
}

function ownHorizontalCaps(rawCaps, layerOrder) {
  const owned = [];

  for (let index = 0; index < rawCaps.length; index++) {
    const cap = rawCaps[index];
    let remaining = cap.polys;

    for (let otherIndex = 0; otherIndex < rawCaps.length; otherIndex++) {
      if (otherIndex === index) continue;
      const other = rawCaps[otherIndex];
      if (other.layerId === cap.layerId) continue;
      if (Math.abs(other.z - cap.z) > Z_EPSILON) continue;
      if (other.normal !== -cap.normal) continue;

      const overlap = intersection(remaining, other.polys);
      if (isEmpty(overlap)) continue;

      if (ownsInterface(cap, other, layerOrder)) {
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

function normalizeRing(closed, isHole) {
  const points = Array.isArray(closed) ? closed : [];
  const isClosed =
    points.length > 1 &&
    points[0][0] === points.at(-1)[0] &&
    points[0][1] === points.at(-1)[1];
  const ring = (isClosed ? points.slice(0, -1) : points.slice()).map(([x, y]) => [x, y]);
  if (ring.length < 2) return [];

  const signedArea = ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point[0] * next[1] - point[1] * next[0];
  }, 0);
  if ((signedArea > 0) !== !isHole) ring.reverse();
  return ring;
}

function pointKey(point) {
  return point.map((value) => Number(value).toPrecision(14)).join(',');
}

function sidewallLineDescriptor(p, q) {
  const dx = q[0] - p[0],
    dy = q[1] - p[1],
    length = Math.hypot(dx, dy);
  if (!(length > 1e-12)) return null;

  let ux = dx / length,
    uy = dy / length;
  if (ux < -1e-12 || (Math.abs(ux) <= 1e-12 && uy < 0)) {
    ux = -ux;
    uy = -uy;
  }

  const nx = -uy,
    ny = ux,
    offset = nx * p[0] + ny * p[1],
    pT = ux * p[0] + uy * p[1],
    qT = ux * q[0] + uy * q[1];

  return {
    ux,
    uy,
    nx,
    ny,
    offset,
    t0: Math.min(pT, qT),
    t1: Math.max(pT, qT),
    forward: qT >= pT,
  };
}

function sidewallLineKey(line) {
  return [line.ux, line.uy, line.offset]
    .map((value) => Number(value).toPrecision(13))
    .join('|');
}

function ownSidewalls(solids, layerOrder) {
  const groups = new Map();

  solids.forEach((item, solidIndex) => {
    for (const slab of item.slabs) {
      for (const poly of slab.polys) {
        for (let ringIndex = 0; ringIndex < poly.length; ringIndex++) {
          const ring = normalizeRing(poly[ringIndex], ringIndex > 0);
          for (let index = 0; index < ring.length; index++) {
            const p = ring[index],
              q = ring[(index + 1) % ring.length],
              line = sidewallLineDescriptor(p, q);
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
              key = sidewallLineKey(line);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(part);
          }
        }
      }
    }
  });

  const owned = [];
  for (const entries of groups.values()) {
    const reference = entries[0].line,
      tLevels = [...new Set(entries.flatMap((entry) => [entry.line.t0, entry.line.t1]))].sort(
        (a, b) => a - b,
      ),
      pointAt = (t) => [
        reference.ux * t + reference.nx * reference.offset,
        reference.uy * t + reference.ny * reference.offset,
      ];

    for (let tIndex = 0; tIndex < tLevels.length - 1; tIndex++) {
      const t0 = tLevels[tIndex],
        t1 = tLevels[tIndex + 1];
      if (!(t1 > t0 + 1e-12)) continue;

      const xyCovering = entries.filter(
        (entry) => entry.line.t0 <= t0 + 1e-10 && entry.line.t1 >= t1 - 1e-10,
      );
      if (!xyCovering.length) continue;

      const zLevels = [...new Set(xyCovering.flatMap((entry) => [entry.z0, entry.z1]))].sort(
        (a, b) => a - b,
      );

      for (let zIndex = 0; zIndex < zLevels.length - 1; zIndex++) {
        const z0 = zLevels[zIndex],
          z1 = zLevels[zIndex + 1];
        if (!(z1 > z0 + Z_EPSILON)) continue;

        const covering = xyCovering.filter(
          (entry) => entry.z0 <= z0 + Z_EPSILON && entry.z1 >= z1 - Z_EPSILON,
        );
        if (!covering.length) continue;

        covering.sort((a, b) => {
          const ai = layerOrder.get(a.layerId) ?? Number.MAX_SAFE_INTEGER;
          const bi = layerOrder.get(b.layerId) ?? Number.MAX_SAFE_INTEGER;
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
          a = pointAt(t0),
          b = pointAt(t1),
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

function pointKey3d(point) {
  return point.map((value) => Number(value).toPrecision(14)).join(',');
}

function lineKey(a, b) {
  const pa = pointKey3d(a);
  const pb = pointKey3d(b);
  return pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`;
}

function verticalPointKey(point) {
  return `${Number(point[0]).toPrecision(14)},${Number(point[1]).toPrecision(14)}`;
}

function ownedVerticalBorders(solids) {
  const groups = new Map();

  for (const item of solids) {
    for (const [a, b] of solidBorders(item)) {
      if (Math.abs(a[2] - b[2]) <= Z_EPSILON) continue;
      const z0 = Math.min(a[2], b[2]),
        z1 = Math.max(a[2], b[2]),
        key = verticalPointKey(a);
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
      ...new Set(entries.flatMap((entry) => [entry.z0, entry.z1]).map((z) => zKey(z))),
    ]
      .map(Number)
      .sort((a, b) => a - b);

    for (let index = 0; index < levels.length - 1; index++) {
      const z0 = levels[index],
        z1 = levels[index + 1];
      if (!(z1 > z0 + Z_EPSILON)) continue;
      const covering = entries.filter(
          (entry) => entry.z0 <= z0 + Z_EPSILON && entry.z1 >= z1 - Z_EPSILON,
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

function ownedBorderLines(solids, caps) {
  const lines = ownedVerticalBorders(solids);

  for (const cap of caps) {
    if (cap.appearance || cap.buried) continue;
    for (const poly of cap.polys || []) {
      for (const ring of poly || []) {
        for (let index = 1; index < ring.length; index++) {
          lines.push([
            [...ring[index - 1], cap.z],
            [...ring[index], cap.z],
          ]);
        }
      }
    }
  }

  const unique = new Map();
  for (const line of lines) {
    const key = lineKey(line[0], line[1]);
    if (!unique.has(key)) unique.set(key, line);
  }
  return [...unique.values()];
}

export function buildRenderSurfacePlan(model, clip = null) {
  const layerOrder = new Map(
    (model?.layers || []).map((layer, index) => [layer.id, index]),
  );
  const solids = materialSolids(model, clip);
  const roughMap = appearanceMap(model, clip);
  const rawCaps = [];

  solids.forEach((item, solidIndex) => {
    for (const cap of item.caps) {
      rawCaps.push(...splitCapByAppearance(item, cap, roughMap, solidIndex));
    }
  });

  const caps = ownHorizontalCaps(rawCaps, layerOrder);
  const sidewalls = ownSidewalls(solids, layerOrder);
  const borderLines = ownedBorderLines(solids, caps);

  return {
    caps,
    sidewalls,
    borderLines,
  };
}
