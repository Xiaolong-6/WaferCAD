/**
 * Hu et al. (2025), Suppl. S16: full 64x64 Benes connectivity audit.
 * Logical topology and diagnostic Mask only, NOT author routed GDS or SOI process.
 */
export const BENES64_SOURCE = Object.freeze({
  doi: '10.1038/s41467-024-55528-9',
  ports: 64,
  stages: 11,
  cellsPerStage: 32,
  switchCount: 352,
  waveguideCrossings: 1824,
  ridgeEtchUm: 0.15,
  shuffleWidthUm: 1.2,
  mmiArmLengthUm: 5.74,
  mmiArmWidthsUm: Object.freeze([
    1.2, 1.521, 1.772, 1.792, 1.704, 1.711, 1.642, 1.779, 1.744, 1.871, 2.078, 2.075, 0.7,
  ]),
});
export const BENES64_PAIR_BITS = Object.freeze([0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0]);
export const BENES64_LAYOUT = Object.freeze({
  fieldUm: [10000, 5300],
  stagePitchUm: 900,
  lanePitchUm: 76,
  cellWidthUm: 120,
  cellHeightUm: 124,
  authorMaskCoordinatesKnown: false,
  eulerRoutingFabricationVerified: false,
  physicalMMIPlaced: false,
});
function reverseBits(value, bits) {
  let result = 0;
  for (let k = 0; k < bits; k++) {
    result = (result << 1) | (value & 1);
    value >>= 1;
  }
  return result;
}
export function benesStageOrder(pairBit) {
  if (!Number.isInteger(pairBit) || pairBit < 0 || pairBit > 5) {
    throw new Error('Benes pairing bit must be between 0 and 5');
  }
  const block = 2 ** (pairBit + 1);
  return Array.from(
    { length: 64 },
    (_, lane) => Math.floor(lane / block) * block + reverseBits(lane % block, pairBit + 1),
  );
}
const laneY = (index) => (index - 31.5) * BENES64_LAYOUT.lanePitchUm;
const stageX = (stage) => (stage - 5) * BENES64_LAYOUT.stagePitchUm;

export function createBenes64Network() {
  const orders = BENES64_PAIR_BITS.map(benesStageOrder);
  const switches = [];
  const links = [];
  const crossings = [];
  const crossingsPerTransition = [];
  for (let stage = 0; stage < 11; stage++) {
    for (let cell = 0; cell < 32; cell++) {
      const a = orders[stage][cell * 2];
      const b = orders[stage][cell * 2 + 1];
      switches.push({
        id: 'stage-' + (stage + 1) + '-cell-' + (cell + 1),
        stage,
        cell,
        wireIds: [a, b],
        centerUm: [stageX(stage), (laneY(2 * cell) + laneY(2 * cell + 1)) / 2],
      });
    }
  }
  for (let stage = 0; stage < 10; stage++) {
    const wires = orders[stage];
    const targetSlots = new Map(orders[stage + 1].map((id, index) => [id, index]));
    const permutation = wires.map((id) => targetSlots.get(id));
    const firstX = stageX(stage) + BENES64_LAYOUT.cellWidthUm / 2;
    const lastX = stageX(stage + 1) - BENES64_LAYOUT.cellWidthUm / 2;
    for (let lane = 0; lane < 64; lane++) {
      links.push({
        stage,
        wireId: wires[lane],
        startSlot: lane,
        endSlot: permutation[lane],
        startUm: [firstX, laneY(lane)],
        endUm: [lastX, laneY(permutation[lane])],
      });
    }
    let count = 0;
    for (let i = 0; i < 64; i++) {
      for (let j = i + 1; j < 64; j++) {
        if (permutation[i] <= permutation[j]) continue;
        const t = (j - i) / (permutation[i] - i - permutation[j] + j);
        if (!(t > 0 && t < 1)) throw new Error('Non-interior waveguide crossing');
        const location = [firstX + t * (lastX - firstX), laneY(i + t * (permutation[i] - i))];
        crossings.push({
          id: 'cross-' + stage + '-' + count,
          stage,
          wireIds: [wires[i], wires[j]],
          atUm: location,
          mmiFabricationVerified: false,
        });
        count++;
      }
    }
    crossingsPerTransition.push(count);
  }
  return {
    source: BENES64_SOURCE,
    switches,
    links,
    crossings,
    orders,
    stageBits: [...BENES64_PAIR_BITS],
    crossingsPerTransition,
    physicalStatus: 'array-topology-inspection-not-manufacturing',
    originalAuthorRoutingKnown: false,
  };
}

const rect = (cx, cy, w, h) => [
  [cx - w / 2, cy - h / 2],
  [cx + w / 2, cy - h / 2],
  [cx + w / 2, cy + h / 2],
  [cx - w / 2, cy + h / 2],
];
export function createBenes64DiagnosticLayout(network = createBenes64Network()) {
  const elements = [];
  const add = (layer, kind, points, width = 0) => {
    elements.push({
      sourceCell: 'BENES64_ARRAY_TOPOLOGY',
      kind,
      layer,
      datatype: 0,
      points,
      ...(kind === 'path' ? { width } : {}),
    });
  };
  for (const cell of network.switches) {
    const [x, y] = cell.centerUm;
    add(90, 'polygon', rect(x, y, 120, 124));
    for (const d of [-38, 38]) {
      add(
        91,
        'path',
        [
          [x - 60, y + d],
          [x + 60, y + d],
        ],
        1.2,
      );
    }
  }
  for (const link of network.links) {
    add(91, 'path', [link.startUm, link.endUm], 1.2);
  }
  // Four-micron squares are DIAGNOSTIC CROSSING COUNTERS.
  // They are not the paper's multiwidth MMI fabrication polygons.
  for (const cross of network.crossings) {
    add(92, 'polygon', rect(cross.atUm[0], cross.atUm[1], 4, 4));
  }
  const counts = new Map();
  for (const e of elements) {
    const key = 'BENES64_ARRAY_TOPOLOGY|' + e.layer + '|0';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const combos = [...counts.entries()].map(([key, count]) => ({
    key,
    count,
    cell: 'BENES64_ARRAY_TOPOLOGY',
    layer: Number(key.split('|')[1]),
    datatype: 0,
  }));
  const [width, height] = BENES64_LAYOUT.fieldUm;
  return {
    name: '64x64 Benes topology inspection (not fabricated GDS)',
    root: 'BENES64_ARRAY_TOPOLOGY',
    elements,
    linework: [],
    hierarchy: {},
    combos,
    bounds: {
      minX: -width / 2,
      maxX: width / 2,
      minY: -height / 2,
      maxY: height / 2,
      width,
      height,
    },
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
}
