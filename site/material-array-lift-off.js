import { arrayParts, geometryBounds, MAX_ARRAY_TEMPLATES } from './model-array.js';
import { difference, isEmpty } from './vector-geometry.js';
import { materialBoundsQuery } from './material-process-boolean.js';
import { compactMaterialArrayStorage } from './material-array-compaction.js';
import {
  analyzeMaterialLiftOff,
  releaseMaterialComponents,
  LIFT_PERMANENT,
  LIFT_RESIST,
  LIFT_TOPCOAT,
} from './material-lift-off.js';

const EPS = 1e-8;
function rectangularDomain(model) {
  const g = model.boundary;
  return (
    g.length === 1 &&
    g[0].length === 1 &&
    g[0][0].length === 5 &&
    g[0][0].slice(1).every((p, i) => p[0] === g[0][0][i][0] || p[1] === g[0][0][i][1])
  );
}
function boundaryPorts(model, analysis, componentIndex) {
  const bounds = geometryBounds(model.boundary),
    groups = new Map();
  const add = (axis, position, lo, hi, s, component, role) => {
    const key = JSON.stringify([axis, position, s.z0, s.z1, component, role]);
    if (!groups.has(key))
      groups.set(key, { axis, position, z0: s.z0, z1: s.z1, component, role, intervals: [] });
    groups.get(key).intervals.push([lo, hi]);
  };
  for (const p of analysis.pieces)
    for (const [index, s] of p.stack.entries()) {
      const node = p.nodeIds[index],
        component = node < 0 ? -1 : componentIndex.get(analysis.find(node));
      const role =
        node >= 0 ? 0 : analysis.sacrificial.has(s.layerId) ? LIFT_RESIST : LIFT_PERMANENT;
      for (const ring of p.geom[0])
        for (let i = 1; i < ring.length; i++) {
          const a = ring[i - 1],
            b = ring[i];
          for (const [axis, position] of [
            [0, bounds.minX],
            [0, bounds.maxX],
            [1, bounds.minY],
            [1, bounds.maxY],
          ]) {
            const other = 1 - axis,
              ta = Math.abs(a[axis] - position) <= EPS,
              tb = Math.abs(b[axis] - position) <= EPS;
            if (ta && tb)
              add(
                axis,
                position,
                Math.min(a[other], b[other]),
                Math.max(a[other], b[other]),
                s,
                component,
                role,
              );
            else {
              if (ta) add(axis, position, a[other], a[other], s, component, role);
              if (tb) add(axis, position, b[other], b[other], s, component, role);
            }
          }
        }
    }
  const ports = [];
  for (const g of groups.values()) {
    g.intervals.sort((a, b) => a[0] - b[0]);
    let current;
    for (const [lo, hi] of g.intervals) {
      if (current && lo <= current.hi + EPS) current.hi = Math.max(current.hi, hi);
      else {
        current = {
          axis: g.axis,
          position: g.position,
          z0: g.z0,
          z1: g.z1,
          component: g.component,
          role: g.role,
          lo,
          hi,
        };
        ports.push(current);
      }
    }
  }
  const sides = new Map();
  for (const p of ports) {
    const key = `${p.axis}|${p.position}`;
    if (!sides.has(key)) sides.set(key, { axis: p.axis, position: p.position, ports: [] });
    sides.get(key).ports.push(p);
  }
  for (const side of sides.values())
    side.query = materialBoundsQuery(side.ports, (p) => [p.lo, p.z0, p.hi, p.z1]);
  return { ports, sides: [...sides.values()] };
}
function crossContacts(a, b, dx, dy) {
  const edges = [],
    seen = new Set(),
    offset = [dx, dy];
  for (const p of a.ports)
    for (const side of b.sides) {
      if (p.axis !== side.axis || Math.abs(p.position - side.position - offset[p.axis]) > EPS)
        continue;
      const shift = offset[1 - p.axis];
      for (const q of side.query([
        p.lo - shift - EPS,
        p.z0 - EPS,
        p.hi - shift + EPS,
        p.z1 + EPS,
      ])) {
        if (p.role && q.role) continue;
        const key = JSON.stringify([p.component, p.role, q.component, q.role]);
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ a: p.component, aRole: p.role, b: q.component, bRole: q.role });
      }
    }
  return edges;
}

/** Global release topology over native material tiles. Propagate connectivity
 * through every shared tile face before classifying any deposited component;
 * neither a halo nor a repeated-template boundary may sever a real bridge.
 */
export function applyArrayMaterialLiftOff(model, params, area, api) {
  const ids = params.sacrificialLayerIds;
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => ['base', 'substrate'].includes(id) || !model.layers.some((l) => l.id === id))
  )
    return {
      changed: false,
      error: 'Material Lift-off needs distinct non-base sacrificial layers.',
    };
  if (params.face === 'back' || params.face === 'both')
    return { changed: false, error: 'Material Lift-off requires Front.' };
  if (!isEmpty(difference(model.boundary, area)))
    return { changed: false, error: 'Material Lift-off requires the whole face.' };
  const definitions = new Map(),
    present = new Set();
  const referenced = new Set(model.array.instances.map((i) => i.templateId));
  let storedNodes = 0;
  for (const t of model.array.templates) {
    if (!referenced.has(t.id)) continue;
    const leaf = { ...t.model, layers: model.layers };
    if (!rectangularDomain(leaf))
      return {
        changed: false,
        error: 'Multi-resist array Lift-off requires rectangular process tiles.',
      };
    const analysis = analyzeMaterialLiftOff(leaf, params.sacrificialLayerIds, {
      requireAllSacrificial: false,
    });
    storedNodes += analysis.nodes.length;
    if (storedNodes > 1000000) throw Error('Material Lift-off stored contact budget exceeded.');
    for (const p of analysis.pieces) for (const s of p.stack) present.add(s.layerId);
    const roots = [...analysis.components.keys()],
      componentIndex = new Map(roots.map((id, i) => [id, i]));
    definitions.set(t.id, {
      leaf,
      analysis,
      roots,
      ...boundaryPorts(leaf, analysis, componentIndex),
    });
  }
  if (params.sacrificialLayerIds.some((id) => !present.has(id)))
    return { changed: false, error: 'A selected sacrificial layer has no material.' };
  const parts = arrayParts(model),
    offsets = new Map();
  let total = 0;
  for (const p of parts) {
    offsets.set(p.id, total);
    total += definitions.get(p.templateId).roots.length;
  }
  if (total > 1000000) throw Error('Material Lift-off global component budget exceeded.');
  const parent = Int32Array.from({ length: total }, (_, i) => i),
    rank = new Uint8Array(total),
    flags = new Uint8Array(total);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (a, b) => {
    a = find(a);
    b = find(b);
    if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parent[b] = a;
    if (rank[a] === rank[b]) rank[a]++;
  };
  for (const p of parts) {
    const d = definitions.get(p.templateId),
      start = offsets.get(p.id);
    d.roots.forEach((r, i) => (flags[start + i] = d.analysis.components.get(r).flags));
  }
  const indexed = parts.map((part, index) => ({ part, index }));
  const query = materialBoundsQuery(indexed, (e) => [
    e.part.bounds.minX,
    e.part.bounds.minY,
    e.part.bounds.maxX,
    e.part.bounds.maxY,
  ]);
  const cache = new Map();
  let comparisons = 0;
  for (const [index, p] of parts.entries())
    for (const e of query([
      p.bounds.minX - EPS,
      p.bounds.minY - EPS,
      p.bounds.maxX + EPS,
      p.bounds.maxY + EPS,
    ])) {
      if (e.index >= index) continue;
      if (++comparisons > 2000000) throw Error('Material Lift-off tile adjacency budget exceeded.');
      const q = e.part,
        dx = q.x - p.x,
        dy = q.y - p.y,
        key = JSON.stringify([p.templateId, q.templateId, dx, dy]);
      if (!cache.has(key))
        cache.set(
          key,
          crossContacts(definitions.get(p.templateId), definitions.get(q.templateId), dx, dy),
        );
      const pa = offsets.get(p.id),
        qa = offsets.get(q.id);
      for (const edge of cache.get(key)) {
        if (!edge.aRole && !edge.bRole) join(pa + edge.a, qa + edge.b);
        else if (!edge.aRole) flags[pa + edge.a] |= edge.bRole;
        else flags[qa + edge.b] |= edge.aRole;
      }
    }
  const globalFlags = new Uint8Array(total);
  for (let i = 0; i < total; i++) globalFlags[find(i)] |= flags[i];
  const removedGlobal = new Set();
  for (let i = 0; i < total; i++)
    if (find(i) === i) {
      const f = globalFlags[i];
      if (f & LIFT_PERMANENT && f & LIFT_TOPCOAT)
        return {
          changed: false,
          error:
            'Material Lift-off found a resist-to-device metal bridge across process tiles; no material was committed.',
        };
      if (!(f & (LIFT_PERMANENT | LIFT_RESIST)))
        return {
          changed: false,
          error:
            'Material Lift-off found an unsupported deposited component across process tiles; no material was committed.',
        };
      if (!(f & LIFT_PERMANENT)) removedGlobal.add(i);
    }
  const variants = new Map(),
    templates = [],
    instances = [],
    originals = new Map(model.array.instances.map((i) => [i.id, i]));
  let nextRegionId = model.nextRegionId;
  for (const p of parts) {
    const d = definitions.get(p.templateId),
      start = offsets.get(p.id);
    const removed = new Set(d.roots.filter((_, i) => removedGlobal.has(find(start + i))));
    const key = JSON.stringify([p.templateId, [...removed]]);
    let id = variants.get(key);
    if (!id) {
      if (templates.length >= MAX_ARRAY_TEMPLATES)
        throw Error('Material Lift-off template budget exceeded.');
      const leaf = releaseMaterialComponents(d.leaf, d.analysis, removed, api);
      nextRegionId = Math.max(nextRegionId, leaf.nextRegionId);
      id = `released-material-${templates.length}`;
      templates.push({ id, model: leaf });
      variants.set(key, id);
    }
    instances.push({ ...originals.get(p.id), templateId: id });
  }
  const candidate = {
    ...model,
    array: { ...model.array, templates, instances },
    nextRegionId,
    revision: model.revision + 1,
    processRevision: (model.processRevision || 0) + 1,
  };
  compactMaterialArrayStorage(candidate);
  Object.assign(model, candidate);
  return {
    changed: true,
    sacrificialLayerIds: [...params.sacrificialLayerIds],
    removedComponents: removedGlobal.size,
    arrayWorkingSets: definitions.size,
    arrayChangedInstances: instances.length,
  };
}
