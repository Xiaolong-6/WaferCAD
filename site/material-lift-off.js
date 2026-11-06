import { difference, isEmpty } from './vector-geometry.js';
import {
  materialGeometriesShareBoundaryEdge,
  materialGeometriesTouch,
  materialBoundsQuery,
  materialGeometryBounds,
} from './material-process-boolean.js';

const EPS = 1e-8;
export const LIFT_PERMANENT = 1,
  LIFT_RESIST = 2,
  LIFT_TOPCOAT = 4;

function validateSacrificial(model, ids) {
  return (
    Array.isArray(ids) &&
    ids.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => !['base', 'substrate'].includes(id) && model.layers.some((l) => l.id === id))
  );
}

/** Analyze the original canonical partition, without Boolean dissolves or
 * sub-grid buffer polygons. One XY adjacency is reused for every Z interval;
 * all contacts retain the ordinary 1e-8 µm numerical contact tolerance.
 * The optional closed-contact graph is diagnostic only: physical lift-off
 * and its array owner always require finite-area lateral interfaces.
 */
export function analyzeMaterialLiftOff(
  model,
  ids,
  { traceContacts = false, requireAllSacrificial = true, traceClosedTangencies = false } = {},
) {
  if (!validateSacrificial(model, ids))
    throw Error('Material Lift-off needs distinct non-base sacrificial layers.');
  if (traceClosedTangencies && !traceContacts)
    throw Error('Closed-contact diagnostics require contact tracing.');
  const sacrificial = new Set(ids);
  const first = Math.min(...ids.map((id) => model.layers.findIndex((l) => l.id === id)));
  const permanent = new Set(model.layers.slice(0, first).map((l) => l.id));
  const pieces = [],
    nodes = [];
  for (const [regionIndex, r] of model.regions.entries())
    for (const [polygonIndex, p] of r.geom.entries()) {
      const geom = [p],
        piece = {
          regionIndex,
          polygonIndex,
          geom,
          box: materialGeometryBounds(geom),
          stack: r.stack,
          nodeIds: [],
        };
      for (const [index, s] of r.stack.entries()) {
        if (sacrificial.has(s.layerId) || permanent.has(s.layerId)) piece.nodeIds.push(-1);
        else {
          piece.nodeIds.push(nodes.length);
          nodes.push({ piece, index, ...s });
        }
      }
      pieces.push(piece);
    }
  // Canonical fragments share geometry and a bounded adjacency index. This
  // replaces the old 10k dissolved-component/all-pairs representation, not a
  // geometry or contact tolerance. Reject oversized working sets.
  if (nodes.length > 200000 || pieces.length > 200000)
    throw Error('Material Lift-off canonical contact budget exceeded.');
  const parent = Int32Array.from(nodes.map((_, i) => i)),
    rank = new Uint8Array(nodes.length),
    flags = new Uint8Array(nodes.length);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const contacts = [],
    supportContacts = [];
  const join = (a, b) => {
    a = find(a);
    b = find(b);
    if (a === b) return;
    if (rank[a] < rank[b]) [a, b] = [b, a];
    parent[b] = a;
    if (rank[a] === rank[b]) rank[a]++;
  };
  const contact = (a, ia, b, ib, sameXY) => {
    const na = a.nodeIds[ia],
      nb = b.nodeIds[ib];
    if (na >= 0 && nb >= 0) {
      if (traceContacts) contacts.push([na, nb, sameXY]);
      join(na, nb);
      return;
    }
    if (na < 0 && nb < 0) return;
    const node = na >= 0 ? na : nb,
      deposit = na >= 0 ? a.stack[ia] : b.stack[ib],
      support = na >= 0 ? b.stack[ib] : a.stack[ia];
    if (traceContacts)
      supportContacts.push({ node, piece: na >= 0 ? b : a, index: na >= 0 ? ib : ia, sameXY });
    if (permanent.has(support.layerId)) flags[node] |= LIFT_PERMANENT;
    if (sacrificial.has(support.layerId)) {
      flags[node] |= LIFT_RESIST;
      // Sidewall contact alone does not bond a device film to waste. Only a
      // positive-area horizontal resist support identifies the topcoat.
      if (sameXY && Math.abs(deposit.z0 - support.z1) <= EPS) flags[node] |= LIFT_TOPCOAT;
    }
  };
  for (const p of pieces)
    for (let i = 1; i < p.stack.length; i++)
      if (p.stack[i].z0 <= p.stack[i - 1].z1 + EPS) contact(p, i - 1, p, i, true);
  const indexed = pieces.map((piece, index) => ({ piece, index }));
  const query = materialBoundsQuery(indexed, (e) => e.piece.box);
  let candidates = 0;
  for (const [index, p] of pieces.entries()) {
    const box = [p.box[0] - EPS, p.box[1] - EPS, p.box[2] + EPS, p.box[3] + EPS];
    for (const e of query(box)) {
      if (e.index >= index) continue;
      if (++candidates > 10000000) throw Error('Material Lift-off adjacency budget exceeded.');
      const q = e.piece;
      if (
        !(traceClosedTangencies
          ? materialGeometriesTouch(p.geom, q.geom, EPS)
          : materialGeometriesShareBoundaryEdge(p.geom, q.geom, EPS))
      )
        continue;
      let firstOther = 0;
      for (let i = 0; i < p.stack.length; i++) {
        const a = p.stack[i];
        while (firstOther < q.stack.length && q.stack[firstOther].z1 < a.z0 - EPS) firstOther++;
        for (let j = firstOther; j < q.stack.length && q.stack[j].z0 <= a.z1 + EPS; j++) {
          const b = q.stack[j];
          // A lateral joint requires finite shared sidewall area, not a
          // height-only contact line at the top or bottom of a slab.
          if (traceClosedTangencies || Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > EPS)
            contact(p, i, q, j, false);
        }
      }
    }
  }
  const components = new Map();
  for (let i = 0; i < nodes.length; i++) {
    const root = find(i);
    if (!components.has(root)) components.set(root, { flags: 0, nodeIds: [] });
    const c = components.get(root);
    c.flags |= flags[i];
    c.nodeIds.push(i);
  }
  const present = new Set(pieces.flatMap((p) => p.stack.map((s) => s.layerId)));
  if (requireAllSacrificial && ids.some((id) => !present.has(id)))
    throw Error('A selected sacrificial layer has no material.');
  return {
    pieces,
    nodes,
    components,
    find,
    sacrificial,
    nodeFlags: flags,
    contacts,
    supportContacts,
  };
}

/** Filter original stacks by graph ownership. No material boundary is
 * clipped, rounded, dilated or re-created at release.
 */
export function releaseMaterialComponents(model, analysis, removed, api) {
  const candidate = structuredClone(model),
    groups = new Map();
  for (const p of analysis.pieces) {
    const stack = p.stack.filter(
      (s, i) =>
        !analysis.sacrificial.has(s.layerId) &&
        (p.nodeIds[i] < 0 || !removed.has(analysis.find(p.nodeIds[i]))),
    );
    if (!stack.length) continue;
    const key = `${p.regionIndex}|${JSON.stringify(stack)}`;
    if (!groups.has(key)) groups.set(key, { regionIndex: p.regionIndex, stack, polygons: [] });
    groups.get(key).polygons.push(p.geom[0]);
  }
  const used = new Set();
  candidate.regions = [...groups.values()].map((g) => {
    const old = model.regions[g.regionIndex];
    const id = used.has(g.regionIndex) ? `region-${candidate.nextRegionId++}` : old.id;
    used.add(g.regionIndex);
    return { id, geom: structuredClone(g.polygons), stack: api.normalizeStack(g.stack) };
  });
  candidate.revision++;
  candidate.processRevision = (candidate.processRevision || 0) + 1;
  return candidate;
}

function witness(model, analysis, component) {
  const n = analysis.nodes[component.nodeIds[0]];
  return {
    material: model.layers.find((l) => l.id === n.layerId)?.name || n.layerId,
    z0: n.z0,
    z1: n.z1,
    xyBounds: n.piece.box,
    fragments: component.nodeIds.length,
  };
}

export function applyMaterialLiftOff(model, params, area, api) {
  if (!validateSacrificial(model, params.sacrificialLayerIds))
    return {
      changed: false,
      error: 'Material Lift-off needs distinct non-base sacrificial layers.',
    };
  if (params.face === 'back' || params.face === 'both')
    return { changed: false, error: 'Material Lift-off requires Front.' };
  if (!isEmpty(difference(model.boundary, area)))
    return { changed: false, error: 'Material Lift-off requires the whole face.' };
  const analysis = analyzeMaterialLiftOff(model, params.sacrificialLayerIds),
    removed = new Set();
  for (const [id, c] of analysis.components) {
    if (c.flags & LIFT_TOPCOAT && c.flags & LIFT_PERMANENT)
      return {
        changed: false,
        error:
          'Material Lift-off found a resist-to-device metal bridge; no material was committed.',
        witness: witness(model, analysis, c),
      };
    if (!(c.flags & (LIFT_RESIST | LIFT_PERMANENT)))
      return {
        changed: false,
        error:
          'Material Lift-off found an unsupported deposited component; no material was committed.',
        witness: witness(model, analysis, c),
      };
    if (!(c.flags & LIFT_PERMANENT)) removed.add(id);
  }
  Object.assign(model, releaseMaterialComponents(model, analysis, removed, api));
  return {
    changed: true,
    sacrificialLayerIds: [...params.sacrificialLayerIds],
    removedComponents: removed.size,
  };
}
