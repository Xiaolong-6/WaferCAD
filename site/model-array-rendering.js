import { arrayParts, resolveArrayModel, geometryBounds } from './model-array.js';
import { neighborhood, neighborhoodKey } from './model-array-context.js';
import { pointInMulti, difference } from './vector-geometry.js';
import { sectionColumnsFromTopology } from './process-topology.js';

const EPS = 1e-7;
function boundaryLine(p, q, domain) {
  const mx = (p[0] + q[0]) / 2,
    my = (p[1] + q[1]) / 2;
  for (const poly of domain)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i],
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          len = Math.hypot(dx, dy);
        if (!len) continue;
        const t = ((mx - a[0]) * dx + (my - a[1]) * dy) / (len * len);
        if (t >= -EPS && t <= 1 + EPS && Math.abs((mx - a[0]) * dy - (my - a[1]) * dx) / len <= EPS)
          return true;
      }
  return false;
}
function ownBoundaryWall(w, part, neighbors, layerOrder) {
  if (!boundaryLine(w.p, w.q, part.model.boundary)) return [w];
  const dx = w.q[0] - w.p[0],
    dy = w.q[1] - w.p[1],
    length = Math.hypot(dx, dy);
  let nx = (-dy / length) * 1e-6,
    ny = (dx / length) * 1e-6;
  const midpoint = [(w.p[0] + w.q[0]) / 2, (w.p[1] + w.q[1]) / 2];
  if (pointInMulti([midpoint[0] + nx, midpoint[1] + ny], part.model.boundary)) {
    nx = -nx;
    ny = -ny;
  }
  const columns = [];
  for (const neighbor of neighbors) {
    if (neighbor.id === part.id) continue;
    const ox = part.x - neighbor.x,
      oy = part.y - neighbor.y;
    const a = [w.p[0] + ox + nx, w.p[1] + oy + ny],
      b = [w.q[0] + ox + nx, w.q[1] + oy + ny];
    columns.push(...sectionColumnsFromTopology(neighbor.model, a, b));
  }
  const ts = [...new Set([0, 1, ...columns.flatMap((c) => [c.t0, c.t1])])].sort((a, b) => a - b),
    out = [];
  for (let i = 1; i < ts.length; i++) {
    const t0 = ts[i - 1],
      t1 = ts[i];
    if (t1 - t0 <= 1e-12) continue;
    const stack = columns
      .filter((c) => c.t0 <= (t0 + t1) / 2 && c.t1 >= (t0 + t1) / 2)
      .flatMap((c) => c.stack);
    const zs = [
      ...new Set([
        w.z0,
        w.z1,
        ...stack.flatMap((s) => [s.z0, s.z1]).filter((z) => z > w.z0 && z < w.z1),
      ]),
    ].sort((a, b) => a - b);
    for (let j = 1; j < zs.length; j++) {
      const z0 = zs[j - 1],
        z1 = zs[j];
      const other = stack.find((s) => s.z0 <= z0 + 1e-10 && s.z1 >= z1 - 1e-10);
      if (other?.layerId === w.layerId) continue;
      if (
        other &&
        (layerOrder.get(other.layerId) ?? Infinity) < (layerOrder.get(w.layerId) ?? Infinity)
      )
        continue;
      out.push({
        ...w,
        p: [w.p[0] + dx * t0, w.p[1] + dy * t0],
        q: [w.p[0] + dx * t1, w.p[1] + dy * t1],
        z0,
        z1,
        line: null,
        buried: Boolean(other),
        ownership: other ? 'interface' : 'exterior',
        interfaceLayerIds: other ? [other.layerId] : [],
      });
    }
  }
  return out;
}
export function buildArrayRenderPlan(model, clip, build) {
  if (clip) return build(resolveArrayModel(model, geometryBounds(clip)), clip);
  const groups = new Map(),
    order = new Map(model.layers.map((l, i) => [l.id, i]));
  for (const part of arrayParts(model)) {
    const neighbors = neighborhood(model, part),
      key = neighborhoodKey(part, neighbors);
    let entry = groups.get(key);
    if (!entry) {
      const plan = build(part.model);
      const sidewalls = plan.sidewalls.flatMap((w) => ownBoundaryWall(w, part, neighbors, order));
      const borders = plan.borderLines.filter(([a, b]) => !boundaryLine(a, b, part.model.boundary));
      for (const w of sidewalls)
        if (boundaryLine(w.p, w.q, part.model.boundary) && !w.buried)
          borders.push(
            [
              [...w.p, w.z0],
              [...w.q, w.z0],
            ],
            [
              [...w.p, w.z1],
              [...w.q, w.z1],
            ],
            [
              [...w.p, w.z0],
              [...w.p, w.z1],
            ],
            [
              [...w.q, w.z0],
              [...w.q, w.z1],
            ],
          );
      entry = { caps: plan.caps, sidewalls, borderLines: borders, translations: [] };
      groups.set(key, entry);
    }
    entry.translations.push([part.x, part.y]);
  }
  const entries = [...groups.values()],
    capMap = new Map(),
    wallMap = new Map(),
    borderLines = [];
  entries.forEach((entry, index) => {
    for (const cap of entry.caps) {
      if (!capMap.has(cap)) capMap.set(cap, []);
      capMap.get(cap).push(index);
    }
    for (const wall of entry.sidewalls) {
      if (!wallMap.has(wall)) wallMap.set(wall, []);
      wallMap.get(wall).push(index);
    }
    for (const [a, b] of entry.borderLines)
      for (const [x, y] of entry.translations)
        borderLines.push([
          [a[0] + x, a[1] + y, a[2]],
          [b[0] + x, b[1] + y, b[2]],
        ]);
  });
  const translations = new Map();
  const instanceTranslations = (indices) => {
    const key = indices.join(',');
    if (!translations.has(key))
      translations.set(
        key,
        indices.flatMap((i) => entries[i].translations),
      );
    return translations.get(key);
  };
  const caps = [...capMap].map(([cap, indices]) => ({
    ...cap,
    instanceTranslations: instanceTranslations(indices),
  }));
  const wallGroups = new Map();
  for (const [wall, indices] of wallMap) {
    const key = JSON.stringify([indices, wall.layerId, wall.buried]);
    if (!wallGroups.has(key))
      wallGroups.set(key, {
        ...wall,
        parts: [],
        instanceTranslations: instanceTranslations(indices),
      });
    wallGroups.get(key).parts.push(wall);
  }
  let sidewalls = [...wallGroups.values()];
  // A uniform, complete substrate has one physical outside surface. Prove this
  // from every template before drawing it as one wafer mesh, rather than one
  // mesh per tile. This changes renderer batching only.
  const leaves = [...new Set(arrayParts(model).map((p) => p.model))];
  const firstBase = leaves[0]?.regions[0]?.stack.find((s) => s.layerId === 'base');
  const uniform =
    firstBase &&
    !firstBase.frontSurface &&
    !firstBase.backSurface &&
    leaves.every(
      (leaf) =>
        leaf.regions.length &&
        leaf.regions.every((r) => {
          const s = r.stack.find((s) => s.layerId === 'base');
          return (
            s && s.z0 === firstBase.z0 && s.z1 === firstBase.z1 && !s.frontSurface && !s.backSurface
          );
        }) &&
        !difference(
          leaf.boundary,
          leaf.regions.flatMap((r) => r.geom),
        ).length,
    );
  if (uniform) {
    const bottoms = caps.filter(
      (c) => c.layerId === 'base' && c.z === firstBase.z0 && c.normal === -1,
    );
    if (bottoms.length && bottoms.every((c) => !c.appearance && !c.buried)) {
      for (let i = caps.length - 1; i >= 0; i--) if (bottoms.includes(caps[i])) caps.splice(i, 1);
      caps.push({ ...bottoms[0], polys: model.boundary, instanceTranslations: null });
    }
    const wafer = build({
      ...leaves[0],
      layers: model.layers,
      boundary: model.boundary,
      width: model.width,
      height: model.height,
      regions: [{ id: 'uniform-substrate', geom: model.boundary, stack: [firstBase] }],
      implants: [],
      electricalRegions: [],
    });
    sidewalls = sidewalls.filter((w) => w.layerId !== 'base');
    sidewalls.push(...wafer.sidewalls);
  }
  return {
    caps,
    sidewalls,
    borderLines,
    arrayInstances: model.array.instances.length,
    arrayNeighborhoods: groups.size,
  };
}
