import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { isArrayModel, rectangleGeometry, resolveArrayModel } from '../site/model-array.js';
import { multiBounds, pointInMulti } from '../site/vector-geometry.js';

const EPS = 1e-8;
const AL_NAMES = ['Al1', 'Al2', 'Al3', 'Al4 contact', 'Al5 contact', 'Al6 contact'];
const BARRIER = 'AlOx (illustrative thickness)';
const RESISTS = ['AZ 5214E', 'MMA', 'PMMA'];

// Reject vertex-only XY contact. A vertical metal contact must share a
// boundary segment and a positive Z span to have a conductive face.
function sharedEdge(left, right) {
  for (const [ax, ay, dx, dy, length] of left) {
    for (const [bx, by, ex, ey] of right) {
      const u = bx - ax;
      const v = by - ay;
      if (
        Math.abs(dx * v - dy * u) > EPS * length ||
        Math.abs(dx * (v + ey) - dy * (u + ex)) > EPS * length
      )
        continue;
      const start = (u * dx + v * dy) / length;
      const end = start + (ex * dx + ey * dy) / length;
      if (Math.min(length, Math.max(start, end)) - Math.max(0, Math.min(start, end)) > EPS)
        return true;
    }
  }
  return false;
}

export async function auditQ2ReleasedMaterial(
  source,
  {
    origin = [0, 0],
    halfWidthUm = 20,
    probes = [],
    traceBypass = false,
    traceMorphology = false,
  } = {},
) {
  await loadGeometryKernel();
  const { analyzeMaterialLiftOff } = await import('../site/material-lift-off.js');
  const { intersection, materialGeometryArea } =
    await import('../site/material-process-boolean.js');
  const [x, y] = origin;
  if (![x, y].every(Number.isFinite)) throw new TypeError('Supply a finite Q2 origin.');
  if (!Number.isFinite(halfWidthUm) || halfWidthUm <= 12 || halfWidthUm > 20)
    throw new RangeError(
      'The Q2 audit half-width must include both terminal probes and fit the 40 µm process window.',
    );
  const bounds = {
    minX: x - halfWidthUm,
    maxX: x + halfWidthUm,
    minY: y - halfWidthUm,
    maxY: y + halfWidthUm,
  };
  const window = rectangleGeometry(bounds);
  const isInside = (geom) => {
    const box = multiBounds(geom);
    return (
      box.minX >= bounds.minX &&
      box.maxX <= bounds.maxX &&
      box.minY >= bounds.minY &&
      box.maxY <= bounds.maxY
    );
  };
  const model = isArrayModel(source)
    ? resolveArrayModel(source, window, { crop: true })
    : isInside(source.boundary)
      ? source
      : {
          ...source,
          regions: source.regions
            .map((region) => ({ ...region, geom: intersection(region.geom, window) }))
            .filter(({ geom }) => geom.length),
        };
  const names = new Map(model.layers.map(({ id, name }) => [id, name]));
  const conductors = model.layers.filter(({ name }) => name === 'Nb' || AL_NAMES.includes(name));
  const conductorIds = new Set(conductors.map(({ id }) => id));
  const metal = model.regions
    .map((region) => ({
      ...region,
      stack: region.stack.filter(({ layerId }) => conductorIds.has(layerId)),
      sourceStack: region.stack,
    }))
    .filter(({ stack }) => stack.length);
  const marker = 'q2-proof-graph-marker';
  const graph = analyzeMaterialLiftOff(
    { ...model, layers: [{ id: marker }, ...conductors], regions: metal },
    [marker],
    { requireAllSacrificial: false, traceContacts: true },
  );
  const parents = Int32Array.from(graph.nodes, (_, i) => i);
  const root = (i) => {
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]];
      i = parents[i];
    }
    return i;
  };
  const cache = new WeakMap();
  function edges(piece) {
    if (!cache.has(piece)) {
      cache.set(
        piece,
        piece.geom
          .flatMap((polygon) =>
            polygon.flatMap((ring) =>
              ring.slice(1).map(([x1, y1], index) => {
                const [x0, y0] = ring[index];
                return [x0, y0, x1 - x0, y1 - y0, Math.hypot(x1 - x0, y1 - y0)];
              }),
            ),
          )
          .filter((edge) => edge[4] > EPS),
      );
    }
    return cache.get(piece);
  }
  const directJunctionContacts = [];
  const adjacency = traceBypass ? Array.from(graph.nodes, () => []) : null;
  for (const [i, j, sameXY] of graph.contacts) {
    const a = graph.nodes[i];
    const b = graph.nodes[j];
    if (
      !sameXY &&
      (!(Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > EPS) ||
        !sharedEdge(edges(a.piece), edges(b.piece)))
    )
      continue;
    parents[root(i)] = root(j);
    if (adjacency) {
      adjacency[i].push(j);
      adjacency[j].push(i);
    }
    const pair = [names.get(a.layerId), names.get(b.layerId)].sort();
    if (pair[0] === 'Al1' && ['Al2', 'Al3'].includes(pair[1]))
      directJunctionContacts.push({ pair, sameXY, bounds: a.piece.box });
  }
  const terminalNodes = [
    [x, y - 12],
    [x, y + 12],
  ].map((point) =>
    graph.nodes.findIndex(
      (node) => names.get(node.layerId) === 'Nb' && pointInMulti(point, node.piece.geom),
    ),
  );
  const terminalsFound = terminalNodes.every((i) => i >= 0);
  const terminalRoots = new Set(terminalsFound ? terminalNodes.map(root) : []);
  const terminalName = (component) => {
    if (!terminalsFound) return 'unassigned';
    const [south, north] = terminalNodes.map(root);
    if (component === south && component === north) return 'both Nb pads';
    if (component === south) return 'south Nb pad';
    if (component === north) return 'north Nb pad';
    return 'detached from Nb pads';
  };
  const metallicShort = terminalsFound && terminalRoots.size === 1;
  const potentialTouch =
    terminalsFound && graph.find(terminalNodes[0]) === graph.find(terminalNodes[1]);
  const components = new Map();
  for (const [i, node] of graph.nodes.entries()) {
    const id = root(i);
    const { box } = node.piece;
    const component = components.get(id) || { volumeUm3: 0, layers: new Set(), bounds: [...box] };
    const { bounds } = component;
    bounds[0] = Math.min(bounds[0], box[0]);
    bounds[1] = Math.min(bounds[1], box[1]);
    bounds[2] = Math.max(bounds[2], box[2]);
    bounds[3] = Math.max(bounds[3], box[3]);
    component.volumeUm3 += materialGeometryArea(node.piece.geom) * (node.z1 - node.z0);
    component.layers.add(names.get(node.layerId));
    components.set(id, component);
  }
  let sandwichAreaUm2 = 0;
  let terminalSandwichAreaUm2 = 0;
  let shuntedSandwichAreaUm2 = 0;
  const sandwichPatches = [];
  let largestShunt;
  for (const piece of graph.pieces) {
    const stack = metal[piece.regionIndex].sourceStack;
    for (let i = 1; i + 1 < stack.length; i++) {
      const [lower, barrier, upper] = stack.slice(i - 1, i + 2);
      if (
        names.get(lower.layerId) !== 'Al1' ||
        names.get(barrier.layerId) !== BARRIER ||
        !['Al2', 'Al3'].includes(names.get(upper.layerId)) ||
        Math.abs(lower.z1 - barrier.z0) > EPS ||
        Math.abs(barrier.z1 - upper.z0) > EPS
      )
        continue;
      const findNode = (segment) =>
        piece.nodeIds[piece.stack.findIndex((candidate) => candidate === segment)];
      const lowerNode = findNode(lower);
      const upperNode = findNode(upper);
      const lowerRoot = root(lowerNode);
      const upperRoot = root(upperNode);
      const area = materialGeometryArea(piece.geom);
      const terminalConnected =
        lowerRoot !== upperRoot && terminalRoots.has(lowerRoot) && terminalRoots.has(upperRoot);
      sandwichAreaUm2 += area;
      if (terminalConnected) terminalSandwichAreaUm2 += area;
      if (lowerRoot === upperRoot) {
        shuntedSandwichAreaUm2 += area;
        if (adjacency && (!largestShunt || area > largestShunt.area))
          largestShunt = { lowerNode, upperNode, area };
      }
      sandwichPatches.push({
        areaUm2: area,
        bounds: piece.box,
        terminalConnected,
        lowerTerminal: terminalName(lowerRoot),
        upperTerminal: terminalName(upperRoot),
        sameMetalComponent: lowerRoot === upperRoot,
      });
    }
  }
  const materialVolumesUm3 = Object.fromEntries(model.layers.map(({ name }) => [name, 0]));
  for (const { geom, stack } of model.regions) {
    const area = materialGeometryArea(geom);
    for (const { layerId, z0, z1 } of stack)
      materialVolumesUm3[names.get(layerId)] += area * (z1 - z0);
  }
  const detached = [...components.entries()]
    .filter(([id]) => !terminalRoots.has(id))
    .map(([id, { volumeUm3, layers, bounds }]) => ({
      id,
      volumeUm3,
      layers: [...layers].sort(),
      bounds,
    }))
    .sort((a, b) => b.volumeUm3 - a.volumeUm3);
  let detachedGeometry;
  if (traceMorphology) {
    const fragments = new Map(detached.map(({ id }) => [id, []]));
    const closedTerminals = terminalsFound ? terminalNodes.map(graph.find) : [];
    for (const [i, { layerId, piece, z0, z1 }] of graph.nodes.entries()) {
      fragments.get(root(i))?.push({
        layer: names.get(layerId),
        geom: piece.geom,
        zUm: [z0, z1],
      });
    }
    detachedGeometry = detached.map(({ id, ...fragment }) => ({
      ...fragment,
      closedContactTerminals: ['south Nb pad', 'north Nb pad'].filter(
        (_, i) => closedTerminals[i] === graph.find(id),
      ),
      slabs: fragments.get(id),
    }));
  }
  const describeNode = (i) => {
    const { layerId, piece, z0, z1 } = graph.nodes[i];
    return { layer: names.get(layerId), bounds: piece.box, zUm: [z0, z1] };
  };
  const probeResults = probes.map(({ label, xy, materials, maxZUm = Infinity }) => {
    const hits = graph.nodes.flatMap((node, i) =>
      node.z1 <= maxZUm &&
      materials.includes(names.get(node.layerId)) &&
      pointInMulti(xy, node.piece.geom)
        ? [{ ...describeNode(i), component: root(i), terminal: terminalName(root(i)) }]
        : [],
    );
    const componentsByProbe = [...new Set(hits.map((hit) => hit.component))].map((id) => ({
      id,
      layers: [...components.get(id).layers].sort(),
    }));
    return { label, xy, hits, components: componentsByProbe };
  });
  let bypassPath = null;
  if (largestShunt) {
    const { lowerNode, upperNode } = largestShunt;
    const previous = new Int32Array(graph.nodes.length).fill(-1);
    previous[lowerNode] = lowerNode;
    const queue = [lowerNode];
    for (let head = 0; head < queue.length && previous[upperNode] < 0; head++) {
      for (const next of adjacency[queue[head]]) {
        if (previous[next] >= 0) continue;
        previous[next] = queue[head];
        queue.push(next);
      }
    }
    bypassPath = [describeNode(upperNode)];
    for (let node = upperNode; node !== lowerNode;) {
      node = previous[node];
      bypassPath.push(describeNode(node));
    }
    bypassPath.reverse();
  }
  let closedContactPath = null;
  if (traceBypass && potentialTouch && !metallicShort) {
    const [south, north] = terminalNodes.map(root);
    const connected = graph.find(terminalNodes[0]);
    const contacts = new Map();
    const link = (component, next, from, to) => {
      if (!contacts.has(component)) contacts.set(component, []);
      contacts.get(component).push({ next, from, to });
    };
    for (const [a, b] of graph.contacts) {
      const left = root(a),
        right = root(b);
      if (left === right || graph.find(a) !== connected) continue;
      link(left, right, a, b);
      link(right, left, b, a);
    }
    const previous = new Map([[south, null]]);
    const queue = [south];
    for (let head = 0; head < queue.length && !previous.has(north); head++)
      for (const edge of contacts.get(queue[head]) || []) {
        if (previous.has(edge.next)) continue;
        previous.set(edge.next, edge);
        queue.push(edge.next);
      }
    closedContactPath = [];
    for (let component = north; component !== south;) {
      const { from, to } = previous.get(component);
      closedContactPath.push({ from: describeNode(from), to: describeNode(to) });
      component = root(from);
    }
    closedContactPath.reverse();
  }
  return {
    originUm: origin,
    auditWidthUm: 2 * halfWidthUm,
    terminalsFound,
    metallicShort,
    potentialTouch,
    terminals: [...terminalRoots].map((id) => ({
      name: terminalName(id),
      layers: [...components.get(id).layers].sort(),
    })),
    sandwichAreaUm2,
    terminalSandwichAreaUm2,
    shuntedSandwichAreaUm2,
    sandwichPatches: sandwichPatches.sort((a, b) => b.areaUm2 - a.areaUm2).slice(0, 8),
    directJunctionContactCount: directJunctionContacts.length,
    directJunctionContacts: directJunctionContacts.slice(0, 6),
    detachedComponentCount: detached.length,
    detachedComponents: detached.slice(0, 6).map(({ volumeUm3, layers, bounds }) => ({
      volumeUm3,
      layers,
      bounds,
    })),
    ...(traceMorphology ? { detachedGeometry } : {}),
    materialVolumesUm3,
    ...(probes.length ? { probes: probeResults } : {}),
    ...(traceBypass ? { bypassPath, closedContactPath } : {}),
    geometryAccepted:
      terminalsFound &&
      !potentialTouch &&
      terminalSandwichAreaUm2 > 0 &&
      shuntedSandwichAreaUm2 === 0 &&
      AL_NAMES.every((name) => materialVolumesUm3[name] > 0) &&
      RESISTS.every((name) => !materialVolumesUm3[name]),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const traceMorphology = args.includes('--trace-morphology');
  const [input, x = '0', y = '0', output, halfWidthUm = '20'] = args.filter(
    (arg) => arg !== '--trace-morphology',
  );
  if (!input) throw Error('Supply a local .wafercad or compressed model checkpoint.');
  const bytes = await readFile(input);
  const { expandProjectStorage } = await import('../site/project-io.js');
  const raw = JSON.parse(input.endsWith('.gz') ? gunzipSync(bytes) : bytes);
  const model = raw.model ? expandProjectStorage(raw).model : raw;
  const report = await auditQ2ReleasedMaterial(model, {
    origin: [Number(x), Number(y)],
    halfWidthUm: Number(halfWidthUm),
    traceBypass: true,
    traceMorphology,
  });
  const json = JSON.stringify(report, null, 2) + '\n';
  if (output) await writeFile(output, json);
  process.stdout.write(json);
  if (!report.geometryAccepted) process.exitCode = 1;
}
