/**
 * Parametric, paper-constrained SWX photonic MEMS geometry.
 * Hu et al., Nature Communications 16, 331 (2025).
 * DOI: 10.1038/s41467-024-55528-9
 *
 * This is a reconstruction, NOT the authors' GDS. Reported dimensions are
 * kept separate from illustrative placement and schematic facet contours.
 * All XY coordinates and dimensions are in physical micrometres.
 */
export const SWX_DOI = '10.1038/s41467-024-55528-9';
export const SWX_REPORTED = Object.freeze({
  siliconUm: 0.22,
  boxUm: 2,
  ridgeEtchUm: 0.15,
  fullEtchUm: 0.22,
  crUm: 0.05,
  auUm: 0.3,
  photonicFootprintUm: [23, 23],
  fullFootprintUm: [95, 100],
  swtPeriodUm: 0.29,
  swtDepthUm: 0.3,
  waveguideCoreUm: 0.4,
  mmiWidthUm: 2.68,
  offGapUm: 0.9,
  onGapUm: 0.015,
  meanderRadiiUm: [5, 3],
  meanderLengthUm: 15,
  foldedSpringWidthUm: 0.2,
  fixedCombHandleUm: 6,
  movableCombHandleUm: 3,
  combFingerWidthUm: 0.5,
  combFingerLengthUm: 3.2,
  combFingerGapUm: 0.3,
  combFingerUnits: 40,
});

export const SWX_ASSUMPTIONS = Object.freeze({
  fieldUm: [112, 104],
  handleSiUm: 5,
  releaseUndercutUm: 2,
  facetCenterXUm: -31,
  facetPeriods: 24,
  // Published diagrams and dimensions are insufficient to recover a true GDS.
  maskSource: 'paper-constrained illustrative reconstruction, not measured/author layout',
  // Alternative ON is a geometric pose, not a voltage-driven elastic simulation.
  onPose: 'rigid-body translation of movable geometry; no FEM',
});

function ensureState(state) {
  if (state !== 'off' && state !== 'on') throw new Error('SWX state must be off or on');
  return state;
}

function rect(x, y, width, height) {
  if (!(width > 0 && height > 0)) throw new Error('Invalid rectangle');
  return [
    [x - width / 2, y - height / 2],
    [x + width / 2, y - height / 2],
    [x + width / 2, y + height / 2],
    [x - width / 2, y + height / 2],
  ];
}

function strip(a, b, width) {
  if (!(width > 0)) throw new Error('Invalid strip width');
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(len > 0)) throw new Error('Zero-length segment');
  const nx = (-width * (b[1] - a[1])) / (2 * len);
  const ny = (width * (b[0] - a[0])) / (2 * len);
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
}

function taperedStrip(a, b, wa, wb) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!(len > 0)) throw new Error('Zero-length taper');
  const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
  return [
    [a[0] + nx * wa / 2, a[1] + ny * wa / 2],
    [b[0] + nx * wb / 2, b[1] + ny * wb / 2],
    [b[0] - nx * wb / 2, b[1] - ny * wb / 2],
    [a[0] - nx * wa / 2, a[1] - ny * wa / 2],
  ];
}

function polyline(points, width) {
  return points.slice(1).map((next, i) => strip(points[i], next, width));
}

function traceArc(cx, cy, r, a0, a1, steps = 16) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / steps;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

// The facet pitch and lateral groove depth are reported. Its tooth outline
// and the distance to the adjacent tapers are schematic approximations.
function toothFacet(x0, edgeY, direction) {
  const { swtPeriodUm: p, swtDepthUm: d, mmiWidthUm: w } = SWX_REPORTED;
  const n = SWX_ASSUMPTIONS.facetPeriods;
  const x1 = x0 + n * p;
  const edge = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + i * p;
    edge.push([x, edgeY], [x + p * 0.5, edgeY + direction * d]);
  }
  edge.push([x1, edgeY]);
  const backY = edgeY + direction * w;
  return direction > 0
    ? [...edge, [x1, backY], [x0, backY]]
    : [...edge, [x1, backY], [x0, backY]];
}

function makeOptics(moveY) {
  const x0 = SWX_ASSUMPTIONS.facetCenterXUm -
    SWX_ASSUMPTIONS.facetPeriods * SWX_REPORTED.swtPeriodUm / 2;
  const x1 = x0 + SWX_ASSUMPTIONS.facetPeriods * SWX_REPORTED.swtPeriodUm;
  const fixedEdge = SWX_REPORTED.offGapUm / 2;
  const movingEdge = -SWX_REPORTED.offGapUm / 2 + moveY;
  const fixed = [toothFacet(x0, fixedEdge, +1)];
  const moving = [toothFacet(x0, movingEdge, -1)];
  const wa = SWX_REPORTED.waveguideCoreUm, wb = SWX_REPORTED.mmiWidthUm;
  for (const [target, offset, sign] of [[fixed, 0, 1], [moving, moveY, -1]]) {
    const y = sign * 13 + offset;
    target.push(
      taperedStrip([-50, y], [x0 + 0.9, sign * 2.1 + offset], wa, wb),
      taperedStrip([-12, y], [x1 - 0.9, sign * 2.1 + offset], wa, wb),
      strip([-53, y], [-49, y], wa),
      strip([-13, y], [-10, y], wa),
    );
  }
  return { fixed, moving, fixedEdge, movingEdge };
}

function makeMeanders(moveY) {
  const paths = [];
  // Two 180-degree bends per spring waveguide are the paper-reported topology.
  for (const side of [-1, 1]) {
    const y = side * 16;
    const x = -15;
    const points = [
      [x - 1, y + moveY],
      [x + 1, y + moveY],
      ...traceArc(x + 1, y + 3 + moveY, 3, -Math.PI / 2, Math.PI / 2),
      [x + 1, y + 6 + moveY],
      ...traceArc(x + 1, y + 11 + moveY, 5, -Math.PI / 2, Math.PI / 2),
      [x + 16, y + 16 + moveY],
    ];
    paths.push(...polyline(points, SWX_REPORTED.waveguideCoreUm));
  }
  return paths;
}

function makeFoldedSprings(moveY) {
  const items = [];
  for (const side of [-1, 1]) {
    const y = side * 32;
    // Reconstructed placements; paper reports 30/22 um beams and 200 nm width.
    const xs = [-3, -1.5, 0, 1.5];
    const high = y + (side * 8);
    const low = y - (side * 8) + moveY;
    const zigzag = [
      [xs[0], high], [xs[0], low],
      [xs[1], low], [xs[1], high],
      [xs[2], high], [xs[2], low],
      [xs[3], low], [xs[3], high],
    ];
    items.push(...polyline(zigzag, SWX_REPORTED.foldedSpringWidthUm));
    items.push(rect(0, high, 11, 7));
  }
  return items;
}

function makeCombs(moveY) {
  const fixed = [rect(25, 9, 39, SWX_REPORTED.fixedCombHandleUm)];
  const moving = [rect(25, -1 + moveY, 39, SWX_REPORTED.movableCombHandleUm)];
  // There are 40 reported comb unit cells. This reconstructed arrangement
  // uses two mirrored banks of 20 opposing finger pairs.
  for (let i = 0; i < 20; i++) {
    const x = 8.8 + i * 1.65;
    fixed.push(rect(x, 5.7, SWX_REPORTED.combFingerWidthUm, SWX_REPORTED.combFingerLengthUm));
    moving.push(rect(x + 0.8, 2.3 + moveY, SWX_REPORTED.combFingerWidthUm,
      SWX_REPORTED.combFingerLengthUm));
    fixed.push(rect(x, -17.7, SWX_REPORTED.combFingerWidthUm, SWX_REPORTED.combFingerLengthUm));
    moving.push(rect(x + 0.8, -14.3 + moveY, SWX_REPORTED.combFingerWidthUm,
      SWX_REPORTED.combFingerLengthUm));
  }
  fixed.push(rect(25, -21, 39, SWX_REPORTED.fixedCombHandleUm));
  moving.push(rect(25, -11 + moveY, 39, SWX_REPORTED.movableCombHandleUm));
  return { fixed, moving };
}

const MASK_INFO = Object.freeze([
  [1, 'Full-etched 220 nm silicon: SWX, springs, combs and anchors'],
  [2, '150 nm ridge etch in photonic routing transitions'],
  [3, 'Patterned Cr/Au electrical electrodes'],
]);

export function createSwxGeometry(state = 'off') {
  ensureState(state);
  const travel = state === 'off' ? 0 : SWX_REPORTED.offGapUm - SWX_REPORTED.onGapUm;
  const optics = makeOptics(travel);
  const combs = makeCombs(travel);
  const anchors = [
    rect(-49, 34, 9, 9),
    rect(-49, -34, 9, 9),
    rect(25, 43, 12, 10),
    rect(25, -43, 12, 10),
    rect(46, 9, 9, 9),
    rect(46, -21, 9, 9),
  ];
  const bridge = [
    ...polyline([[-9, -10 + travel], [-7, -10 + travel], [-7, 22 + travel]],
      SWX_REPORTED.movableCombHandleUm),
    ...polyline([[-7, 0 + travel], [6, 0 + travel], [6, -11 + travel]], 1),
  ];
  const silicon = [
    ...optics.fixed, ...optics.moving,
    ...makeMeanders(travel), ...makeFoldedSprings(travel),
    ...combs.fixed, ...combs.moving, ...anchors, ...bridge,
  ];
  // Ridge mask: representative narrow routing transitions (not full
  // 64x64 array routing). Ridge 150nm etch leaves 70nm silicon slab.
  const ridge = [
    rect(-50, 13, 3, 1.4), rect(-50, -13 + travel, 3, 1.4),
    rect(-12, 13, 3, 1.4), rect(-12, -13 + travel, 3, 1.4),
  ];
  const electrodes = [
    rect(25, 43, 5.5, 5.5), rect(25, -43, 5.5, 5.5),
    rect(46, 9, 5, 5), rect(46, -21, 5, 5),
  ];
  const polys = new Map([[1, silicon], [2, ridge], [3, electrodes]]);
  const elements = [...polys].flatMap(([layer, polygons]) =>
    polygons.map((points) => ({
      kind: 'polygon', sourceCell: 'SWX_MEMS_UNIT', layer, datatype: 0, points,
    })),
  );
  const [width, height] = SWX_ASSUMPTIONS.fieldUm;
  const layout = {
    name: 'Hu 2025 SWX MEMS ' + state.toUpperCase() + ' · reconstructed, not authors GDS',
    root: 'SWX_MEMS_UNIT',
    elements, linework: [], hierarchy: {},
    combos: MASK_INFO.map(([layer]) => ({
      key: 'SWX_MEMS_UNIT|' + layer + '|0', cell: 'SWX_MEMS_UNIT',
      layer, datatype: 0, count: polys.get(layer).length,
    })),
    bounds: {
      minX: -width / 2, minY: -height / 2,
      maxX: width / 2, maxY: height / 2, width, height,
    },
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
  return {
    state, travelUm: travel, gapUm: optics.fixedEdge - optics.movingEdge,
    layout, maskPolygons: polys,
    maskNames: MASK_INFO.map(([layer, name]) => ({ layer, name })),
    anchorTestPoint: [25, 43],
    releasedBeamTestPoint: [-31, -1.7 + travel],
  };
}
