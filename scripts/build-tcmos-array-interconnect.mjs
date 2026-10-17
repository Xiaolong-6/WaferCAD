// Illustrative multi-metal routing OVERLAY for the 4x4 T-CMOS cells.
// Separate from the approved source SVG and 23-step Recipe. No foundry
// metal stack, contact resistance or electrical device behavior is claimed.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTcmosReferenceMask } from './tcmos-svg-mask.mjs';
import { TCMOS_ARRAY_SPEC } from './build-tcmos-array-patch.mjs';

export const ROUTED_4X4_SPEC = Object.freeze({
  variant: 'tcmos-4x4-illustrative-multimetal-fanout-v2',
  buses: ['VDD', 'GND', 'VIN'],
  individualOutputs: 16,
  layers: ['M1', 'M2', 'M3', 'M4'],
  viaSize: 0.24,
  viaEnclosure: 0.08,
  minimumSameLayerNetSpacing: 0.2,
  // Engineering assumptions (µm): NOT extracted from Jeong et al.
  m2PadWidth: 0.64,
  m3WireWidth: 0.42,
  m4BusWidth: 0.42,
  outputPadWidth: 0.64,
  outputPadLocalX: 3.3,
  // Move shared supply/control straps into the outer frame so every
  // output can fan out independently on M4 without same-plane crossings.
  m4BusY: { VDD: 15.2, VIN: 14.4, GND: -15.4 },
  outputM4PitchUm: 1.2,
  outputM4TrackOffsetUm: -2.5,
  outputPadXUm: 27,
  outputM4PadWidthUm: 0.7,
});

const NAMES = ['VIN', 'VOUT', 'VDD', 'GND']; // Exact source SVG METAL1 ordering.
const PIN = {
  VIN: [0, 2.85],
  VOUT: [1.5, 1.7],
  VDD: [-6, 1.7],
  GND: [6, 1.7],
};

const n4 = (n) => Number(n.toFixed(4));
const box = (x0, y0, x1, y1) => [n4(x0), n4(y0), n4(x1), n4(y1)];
const square = (x, y, width) => box(x - width / 2, y - width / 2, x + width / 2, y + width / 2);
const horizontal = (x0, x1, y, width) => box(x0, y - width / 2, x1, y + width / 2);
const vertical = (x, y0, y1, width) => box(x - width / 2, y0, x + width / 2, y1);
const moved = (point, cell) => [n4(point[0] + cell.x), n4(point[1] + cell.y)];
// File Mask is source geometry: NEVER re-quantize these approved vertices.
const movedSource = (point, cell) => [point[0] + cell.x, point[1] + cell.y];
const localNet = (name, cell) => (name === 'VOUT' ? 'VOUT/' + cell.id : name);

export function tcmosRoutingCells(spec = TCMOS_ARRAY_SPEC) {
  assert.deepEqual(
    [spec.rows, spec.columns, spec.pitchX, spec.pitchY, spec.activeSites],
    [4, 4, 14, 8, 16],
    'Routing is scoped to the reviewed 4x4 / 14x8 geometry',
  );
  const cells = [];
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      cells.push({
        id: 'site-' + (row * 4 + column),
        row,
        column,
        x: n4((column + 0.5) * spec.pitchX - 28),
        y: n4((row + 0.5) * spec.pitchY - 16),
      });
    }
  }
  return cells;
}

export function buildTcmosRoutedOverlay() {
  const spec = ROUTED_4X4_SPEC;
  const cells = tcmosRoutingCells();
  const source = readTcmosReferenceMask();
  const sourceMetal = source.find((group) => group.name === 'METAL1')?.shapes;
  assert.equal(sourceMetal?.length, 4);
  assert.equal(source.find((group) => group.name === 'CNT')?.shapes.length, 218);
  const m1 = [];
  const metal = [];
  const vias = [];
  const ports = [];
  const emit = (layer, net, id, rect) => {
    metal.push({ layer, net, id, rect });
  };
  for (const cell of cells) {
    for (const [index, name] of NAMES.entries()) {
      const net = localNet(name, cell);
      const point = moved(PIN[name], cell);
      m1.push({
        id: 'm1/' + cell.id + '/' + net,
        layer: 'M1',
        net,
        cellId: cell.id,
        // The only M1 geometry comes from the approved original SVG.
        points: sourceMetal[index].points.map((p) => movedSource(p, cell)),
      });
      emit('M2', net, 'm2/' + cell.id + '/' + net, square(point[0], point[1], spec.m2PadWidth));
      for (const [from, to] of [
        ['M1', 'M2'],
        ['M2', 'M3'],
      ]) {
        vias.push({
          id: 'via-' + from + '-' + to + '/' + cell.id + '/' + net,
          from,
          to,
          net,
          cellId: cell.id,
          rect: square(point[0], point[1], spec.viaSize),
        });
      }
    }
    const [outX, outY] = moved(PIN.VOUT, cell);
    const padX = n4(cell.x + spec.outputPadLocalX);
    const outputNet = localNet('VOUT', cell);
    emit(
      'M3',
      outputNet,
      'm3-output-trace/' + cell.id,
      horizontal(outX - spec.m3WireWidth / 2, padX, outY, spec.m3WireWidth),
    );
    emit('M3', outputNet, 'm3-output-pad/' + cell.id, square(padX, outY, spec.outputPadWidth));
    // Each VOUT now has a complete physical VIA34/M4 fanout to its own
    // perimeter terminal. Column-dependent tracks isolate all 16 outputs.
    const trackY = n4(cell.y + spec.outputM4TrackOffsetUm + cell.column * spec.outputM4PitchUm);
    vias.push({
      id: 'via-M3-M4-VOUT/' + cell.id,
      from: 'M3',
      to: 'M4',
      net: outputNet,
      cellId: cell.id,
      rect: square(padX, outY, spec.viaSize),
    });
    emit(
      'M4',
      outputNet,
      'm4-output-drop/' + cell.id,
      vertical(
        padX,
        Math.min(outY, trackY) - spec.m4BusWidth / 2,
        Math.max(outY, trackY) + spec.m4BusWidth / 2,
        spec.m4BusWidth,
      ),
    );
    emit(
      'M4',
      outputNet,
      'm4-output-fanout/' + cell.id,
      horizontal(padX - spec.m4BusWidth / 2, spec.outputPadXUm, trackY, spec.m4BusWidth),
    );
    emit(
      'M4',
      outputNet,
      'm4-output-pad/' + cell.id,
      square(spec.outputPadXUm, trackY, spec.outputM4PadWidthUm),
    );
    ports.push({
      id: 'port-VOUT/' + cell.id,
      net: outputNet,
      layer: 'M4',
      point: [spec.outputPadXUm, trackY],
      role: 'individual-output-test-port',
    });
  }

  // Three isolated M3 vertical trunks PER COLUMN. The VOUT local pad is
  // offset from the VIN trunk, preventing an accidental output-to-input short.
  for (let column = 0; column < 4; column++) {
    const sites = cells.filter((cell) => cell.column === column);
    for (const name of spec.buses) {
      const x = n4(sites[0].x + PIN[name][0]);
      const y0 = sites[0].y + PIN[name][1];
      const y1 = sites.at(-1).y + PIN[name][1];
      emit(
        'M3',
        name,
        'm3-trunk/' + name + '/' + column,
        vertical(
          x,
          Math.min(y0, spec.m4BusY[name]) - spec.m3WireWidth / 2,
          Math.max(y1, spec.m4BusY[name]) + spec.m3WireWidth / 2,
          spec.m3WireWidth,
        ),
      );
      vias.push({
        id: 'via-M3-M4/' + name + '/' + column,
        from: 'M3',
        to: 'M4',
        net: name,
        rect: square(x, spec.m4BusY[name], spec.viaSize),
      });
    }
  }
  for (const name of spec.buses) {
    const xs = [0, 1, 2, 3].map((column) => n4(cells[column].x + PIN[name][0]));
    emit(
      'M4',
      name,
      'm4-bus/' + name,
      horizontal(
        xs[0] - spec.m4BusWidth / 2,
        xs.at(-1) + spec.m4BusWidth / 2,
        spec.m4BusY[name],
        spec.m4BusWidth,
      ),
    );
    ports.push({
      id: 'port-' + name,
      net: name,
      layer: 'M4',
      point: [xs[0], spec.m4BusY[name]],
      role: 'shared-bus-test-port',
    });
  }
  return {
    kind: spec.variant,
    source: 'layout-complete.svg',
    sourceFileMaskElementCount: 232 * 16,
    sourceCntCount: 218 * 16,
    scientificStatus: 'illustrative-routing-topology-only',
    physicalModelIntegrated: false,
    layers: spec.layers,
    cells,
    m1,
    metal,
    vias,
    ports,
  };
}

const gap = (a, b) => {
  const dx = Math.max(a[0] - b[2], b[0] - a[2], 0);
  const dy = Math.max(a[1] - b[3], b[1] - a[3], 0);
  return Math.hypot(dx, dy);
};
const touchingWithEdge = (a, b) => {
  const dx = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const dy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return (dx > 0 && dy >= 0) || (dy > 0 && dx >= 0);
};
const enclosure = (outer, inner, margin) =>
  inner[0] - outer[0] >= margin - 1e-9 &&
  inner[1] - outer[1] >= margin - 1e-9 &&
  outer[2] - inner[2] >= margin - 1e-9 &&
  outer[3] - inner[3] >= margin - 1e-9;
const contains = (poly, point) => {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[i],
      [bx, by] = poly[j];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (
      Math.abs(cross) < 1e-10 &&
      x >= Math.min(ax, bx) &&
      x <= Math.max(ax, bx) &&
      y >= Math.min(ay, by) &&
      y <= Math.max(ay, by)
    )
      return true;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
};
const corners = (rect) => [
  [rect[0], rect[1]],
  [rect[2], rect[1]],
  [rect[2], rect[3]],
  [rect[0], rect[3]],
];

export function auditTcmosRoutedOverlay(layout) {
  const s = ROUTED_4X4_SPEC;
  assert.equal(layout.kind, s.variant);
  assert.equal(layout.cells.length, 16);
  assert.equal(layout.m1.length, 64);
  assert.equal(layout.metal.length, 64 + 16 * 2 + 16 * 3 + 12 + 3);
  assert.equal(layout.vias.length, 64 * 2 + 12 + 16);
  assert.equal(layout.ports.length, 19);
  const nodes = [...layout.m1, ...layout.metal];
  assert.equal(new Set(nodes.map((node) => node.id)).size, nodes.length);
  const parent = new Map(nodes.map((node) => [node.id, node.id]));
  const root = (id) => {
    let n = id;
    while (parent.get(n) !== n) n = parent.get(n);
    return n;
  };
  const join = (a, b) => parent.set(root(a), root(b));
  const expectedNets = new Set([
    'VIN',
    'VDD',
    'GND',
    ...layout.cells.map((cell) => 'VOUT/' + cell.id),
  ]);
  const actualNets = new Set(nodes.map((node) => node.net));
  assert.deepEqual([...actualNets].sort(), [...expectedNets].sort());
  const byLayer = (layer) => nodes.filter((node) => node.layer === layer);
  for (const layer of ['M2', 'M3', 'M4']) {
    const shapes = byLayer(layer);
    for (const [i, a] of shapes.entries()) {
      assert.ok(a.rect[0] < a.rect[2] && a.rect[1] < a.rect[3], a.id + ': invalid rectangle');
      for (const b of shapes.slice(i + 1)) {
        if (a.net === b.net) {
          if (touchingWithEdge(a.rect, b.rect)) join(a.id, b.id);
        } else {
          assert.ok(
            gap(a.rect, b.rect) >= s.minimumSameLayerNetSpacing - 1e-9,
            layer + ' SHORT/spacing: ' + a.id + ' vs ' + b.id,
          );
        }
      }
    }
  }
  const stack = { M1: layout.m1, M2: byLayer('M2'), M3: byLayer('M3'), M4: byLayer('M4') };
  for (const via of layout.vias) {
    const targets = [via.from, via.to].map((layer) => {
      const matched = stack[layer].filter((shape) => {
        if (layer === 'M1') {
          return corners(via.rect).every((point) => contains(shape.points, point));
        }
        return enclosure(shape.rect, via.rect, s.viaEnclosure);
      });
      assert.equal(
        matched.length,
        1,
        via.id + ': expected exactly one complete ' + layer + ' landing',
      );
      assert.equal(matched[0].net, via.net, via.id + ': crossing to wrong net on ' + layer);
      return matched[0];
    });
    join(targets[0].id, targets[1].id);
  }
  const owners = new Map();
  for (const node of nodes) {
    const component = root(node.id);
    if (owners.has(component))
      assert.equal(owners.get(component), node.net, 'Different nets shorted');
    owners.set(component, node.net);
  }
  const partsByNet = new Map();
  for (const node of nodes) {
    if (!partsByNet.has(node.net)) partsByNet.set(node.net, new Set());
    partsByNet.get(node.net).add(root(node.id));
  }
  for (const [net, parts] of partsByNet) {
    assert.equal(parts.size, 1, net + ': OPEN CIRCUIT among designed layers');
  }
  assert.equal(owners.size, 19, 'Expected three global nets plus 16 isolated VOUT nets');
  for (const port of layout.ports) {
    assert.ok(
      stack[port.layer].some(
        (shape) =>
          shape.net === port.net &&
          (shape.rect
            ? enclosure(shape.rect, square(...port.point, 0.001), 0)
            : contains(shape.points, port.point)),
      ),
      port.id + ': port lacks metal',
    );
  }
  return {
    pass: true,
    continuousNets: owners.size,
    sharedNets: s.buses,
    isolatedOutputs: 16,
    m1SourcePolygons: layout.m1.length,
    m2Shapes: byLayer('M2').length,
    m3Shapes: byLayer('M3').length,
    m4Shapes: byLayer('M4').length,
    via12: layout.vias.filter((via) => via.from === 'M1').length,
    via23: layout.vias.filter((via) => via.from === 'M2').length,
    via34: layout.vias.filter((via) => via.from === 'M3').length,
    minimumSameLayerNetSpacing: s.minimumSameLayerNetSpacing,
    calibratedElectricalResistance: false,
    physicalModelIntegrated: false,
  };
}

export function renderTcmosRoutingOverlaySvg(layout) {
  const colors = {
    VIN: '#d97706',
    VDD: '#dc2626',
    GND: '#2563eb',
  };
  const color = (net) => colors[net] || '#16a34a';
  const rect = (r) =>
    'x="' +
    r[0] +
    '" y="' +
    r[1] +
    '" width="' +
    n4(r[2] - r[0]) +
    '" height="' +
    n4(r[3] - r[1]) +
    '"';
  const m1 = layout.m1
    .map(
      (p) =>
        '<polygon points="' +
        p.points.map((v) => v.join(',')).join(' ') +
        '" fill="#a5a7d8" fill-opacity=".3" stroke="#6366a4" stroke-width=".045"/>',
    )
    .join('');
  const metal = layout.metal
    .map(
      (shape) =>
        '<rect ' +
        rect(shape.rect) +
        ' fill="' +
        color(shape.net) +
        '" fill-opacity="' +
        { M2: 0.55, M3: 0.8, M4: 0.75 }[shape.layer] +
        '" stroke="none"/>',
    )
    .join('');
  const vias = layout.vias
    .map((via) => {
      const attributes = rect(via.rect);
      return `<rect ${attributes} fill="#111827" stroke="#ffffff" stroke-width=".035"/>`;
    })
    .join('');
  const outlines = layout.cells
    .map(
      (cell) =>
        '<rect x="' +
        (cell.x - 7) +
        '" y="' +
        (cell.y - 4) +
        '" width="14" height="8" fill="none" stroke="#a3a3a3" stroke-width=".04"/>',
    )
    .join('');
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="800" ' +
    'viewBox="-28 -16 56 32"><rect x="-28" y="-16" width="56" height="32" fill="#ffffff"/>' +
    '<g transform="scale(1,-1)">' +
    outlines +
    m1 +
    metal +
    vias +
    '</g></svg>'
  );
}

async function main() {
  const layout = buildTcmosRoutedOverlay();
  const audit = auditTcmosRoutedOverlay(layout);
  const directory = resolve('test-results/tcmos');
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, 'tcmos-4x4-routing-overlay.json'),
    JSON.stringify({ layout, audit }, null, 2),
  );
  await writeFile(
    resolve(directory, 'tcmos-4x4-routing-overlay.svg'),
    renderTcmosRoutingOverlaySvg(layout),
  );
  console.log(JSON.stringify(audit));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
