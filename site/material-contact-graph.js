import {
  materialGeometriesShareBoundaryEdge,
  materialGeometriesTouch,
  materialBoundsQuery,
  materialGeometryBounds,
} from './material-process-boolean.js';

const EPS = 1e-8;

/** Build components of selected material on the canonical column partition.
 * A lateral contact needs both a shared XY edge and finite Z overlap.
 * Closed tangencies are available only for diagnostic tracing.
 */
export function analyzeMaterialContacts(
  model,
  { isDeposit, supportFlags, operation, traceContacts = false, traceClosedTangencies = false },
) {
  if (traceClosedTangencies && !traceContacts)
    throw Error('Closed-contact diagnostics require contact tracing.');
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
        if (!isDeposit(s.layerId)) piece.nodeIds.push(-1);
        else {
          piece.nodeIds.push(nodes.length);
          nodes.push({ piece, index, ...s });
        }
      }
      piece.hasDeposit = piece.nodeIds.some((id) => id >= 0);
      pieces.push(piece);
    }
  // Canonical fragments share geometry and a bounded adjacency index. This
  // replaces the old 10k dissolved-component/all-pairs representation, not a
  // geometry or contact tolerance. Reject oversized working sets.
  if (nodes.length > 200000 || pieces.length > 200000)
    throw Error(`${operation} canonical contact budget exceeded.`);
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
    flags[node] |= supportFlags(support, deposit, sameXY);
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
      const q = e.piece;
      if (!p.hasDeposit && !q.hasDeposit) continue;
      if (++candidates > 10000000) throw Error(`${operation} adjacency budget exceeded.`);
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
  return {
    pieces,
    nodes,
    components,
    find,
    nodeFlags: flags,
    contacts,
    supportContacts,
  };
}

/** Filter original stacks by graph ownership. No material boundary is
 * clipped, rounded, dilated or re-created when removing disconnected components.
 */
export function retainedMaterialContactRegions(model, analysis, removed, api, excludedLayers) {
  const groups = new Map();
  for (const p of analysis.pieces) {
    const stack = p.stack.filter(
      (s, i) =>
        !excludedLayers?.has(s.layerId) &&
        (p.nodeIds[i] < 0 || !removed.has(analysis.find(p.nodeIds[i]))),
    );
    if (!stack.length) continue;
    const key = `${p.regionIndex}|${JSON.stringify(stack)}`;
    if (!groups.has(key)) groups.set(key, { regionIndex: p.regionIndex, stack, polygons: [] });
    groups.get(key).polygons.push(p.geom[0]);
  }
  const used = new Set();
  return [...groups.values()].map((g) => {
    const old = model.regions[g.regionIndex];
    const id = used.has(g.regionIndex) ? `region-${model.nextRegionId++}` : old.id;
    used.add(g.regionIndex);
    return { id, geom: structuredClone(g.polygons), stack: api.normalizeStack(g.stack) };
  });
}
