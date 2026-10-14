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
  foldedSpringLongBeamUm: 30,
  foldedSpringShortBeamUm: 22,
  foldedSpringClearanceUm: 1.5,
  structuralAlignerBeamUm: 0.1,
  structuralAlignerLengthUm: 7,
  structuralAlignerTrussUm: 1,
  shuttleWidthUm: 6,
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
  // Paper supplies stopper function/ON gap, not its precise lateral placement.
  stopperCentersXUm: [-35.35, -26.65],
  stopperPadWidthUm: 0.56,
  stopperPadHeightUm: 0.7,
  // Two representative fiber-facing couplers; source contains no mask/GDS
  // that would justify exact periods, tooth lengths or full optical routing.
  gratingCentersUm: [
    [-45, 25],
    [-45, -25],
  ],
  gratingRadiiUm: [1.7, 2.3, 2.9, 3.5, 4.1, 4.7],
  gratingToothWidthUm: 0.22,
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
  const nx = -(b[1] - a[1]) / len,
    ny = (b[0] - a[0]) / len;
  return [
    [a[0] + (nx * wa) / 2, a[1] + (ny * wa) / 2],
    [b[0] + (nx * wb) / 2, b[1] + (ny * wb) / 2],
    [b[0] - (nx * wb) / 2, b[1] - (ny * wb) / 2],
    [a[0] - (nx * wa) / 2, a[1] - (ny * wa) / 2],
  ];
}

function polyline(points, width) {
  // Joined straight/arc segments may share an exact endpoint. Remove the
  // repeated point rather than allowing an invalid zero-length polygon.
  const compact = points.filter(
    (point, i) =>
      i === 0 || Math.hypot(point[0] - points[i - 1][0], point[1] - points[i - 1][1]) > 1e-12,
  );
  return compact.slice(1).map((next, i) => strip(compact[i], next, width));
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
  return [...edge, [x1, backY], [x0, backY]];
}

function makeOptics(moveY) {
  const x0 =
    SWX_ASSUMPTIONS.facetCenterXUm - (SWX_ASSUMPTIONS.facetPeriods * SWX_REPORTED.swtPeriodUm) / 2;
  const x1 = x0 + SWX_ASSUMPTIONS.facetPeriods * SWX_REPORTED.swtPeriodUm;
  const fixedEdge = SWX_REPORTED.offGapUm / 2;
  const movingEdge = -SWX_REPORTED.offGapUm / 2 + moveY;
  const fixed = [toothFacet(x0, fixedEdge, +1)];
  const moving = [toothFacet(x0, movingEdge, -1)];
  const wa = SWX_REPORTED.waveguideCoreUm,
    wb = SWX_REPORTED.mmiWidthUm;
  for (const [target, offset, sign] of [
    [fixed, 0, 1],
    [moving, moveY, -1],
  ]) {
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

function makeMechanicalStoppers(moveY) {
  const fixed = [],
    movable = [];
  const gapAtOff = SWX_REPORTED.offGapUm;
  const halfGap = gapAtOff / 2;
  const {
    stopperCentersXUm: centers,
    stopperPadWidthUm: width,
    stopperPadHeightUm: height,
  } = SWX_ASSUMPTIONS;
  const x0 =
    SWX_ASSUMPTIONS.facetCenterXUm - (SWX_ASSUMPTIONS.facetPeriods * SWX_REPORTED.swtPeriodUm) / 2;
  const x1 = x0 + SWX_ASSUMPTIONS.facetPeriods * SWX_REPORTED.swtPeriodUm;
  for (const [i, x] of centers.entries()) {
    const attachX = i === 0 ? x0 + 0.25 : x1 - 0.25;
    const upper = halfGap + height / 2;
    const lower = -halfGap - height / 2 + moveY;
    fixed.push(rect(x, upper, width, height));
    movable.push(rect(x, lower, width, height));
    // Connect each hard stop to its own reflector, never across the air gap.
    fixed.push(strip([x, upper], [attachX, upper], 0.18));
    movable.push(strip([x, lower], [attachX, lower], 0.18));
  }
  return {
    fixed,
    movable,
    clearanceUm: gapAtOff - moveY,
  };
}

function gratingArcBand(cx, cy, inner, outer, sign) {
  const steps = 12;
  const halfAngle = Math.PI / 3.5;
  const outerPoints = [],
    innerPoints = [];
  for (let i = 0; i <= steps; i++) {
    const angle = -halfAngle + (2 * halfAngle * i) / steps;
    outerPoints.push([cx + outer * Math.cos(angle), cy + sign * outer * Math.sin(angle)]);
    innerPoints.push([cx + inner * Math.cos(angle), cy + sign * inner * Math.sin(angle)]);
  }
  return [...outerPoints, ...innerPoints.reverse()];
}

function makeIllustrativeGratingCouplers() {
  const polys = [];
  for (const [cx, cy] of SWX_ASSUMPTIONS.gratingCentersUm) {
    const sign = Math.sign(cy);
    const sourceY = sign * 13;
    polys.push(
      ...polyline(
        [
          [-53, sourceY],
          [-50.7, sign * 18],
          [cx, cy],
        ],
        0.4,
      ),
    );
    polys.push(taperedStrip([cx, cy], [cx + 2.3, cy], 0.4, 1.1));
    for (const radius of SWX_ASSUMPTIONS.gratingRadiiUm) {
      polys.push(
        gratingArcBand(cx, cy, radius, radius + SWX_ASSUMPTIONS.gratingToothWidthUm, sign),
      );
    }
  }
  return polys;
}

function makeMeanders(moveY) {
  const paths = [];
  // Geometric flexure: the fixed optical end is stationary; displacement is
  // gradually introduced along the two-bend meander towards the shuttle.
  for (const side of [-1, 1]) {
    const y = side * 16;
    const x = -15;
    const original = [
      [x - 1, y],
      [x + 1, y],
      ...traceArc(x + 1, y + side * 3, 3, -Math.PI / 2, Math.PI / 2),
      [x + 1, y + side * 6],
      ...traceArc(x + 1, y + side * 11, 5, -Math.PI / 2, Math.PI / 2),
      [x + 16, y + side * 16],
    ];
    const points = original.map(([px, py], i) => [px, py + (moveY * i) / (original.length - 1)]);
    paths.push(...polyline(points, SWX_REPORTED.waveguideCoreUm));
  }
  return paths;
}

function makeFoldedSprings(moveY) {
  const parts = [];
  // Paper Fig S7: 30um/22um beams, 200nm width and 1.5um clear gap.
  // The loop path joins a stationary pad at +/-40um to a moving
  // triangular shuttle rail, with displacements graded along the beam.
  for (const sign of [-1, 1]) {
    const y = (distance) => sign * distance;
    const pitch = SWX_REPORTED.foldedSpringClearanceUm + SWX_REPORTED.foldedSpringWidthUm;
    const long = SWX_REPORTED.foldedSpringLongBeamUm;
    const short = SWX_REPORTED.foldedSpringShortBeamUm;
    const path = [
      [0, y(40)],
      [0, y(40 - long)],
      [pitch, y(40 - long)],
      [pitch, y(40 - long + short)],
      [2 * pitch, y(40 - long + short)],
      [2 * pitch, y(40 - long)],
      [3 * pitch, y(40 - long)],
      [3 * pitch, sign * SWX_REPORTED.shuttleWidthUm / 2],
    ];
    const deform = path.map(([x, py], i) => [x, py + (moveY * i) / (path.length - 1)]);
    parts.push(...polyline(deform, SWX_REPORTED.foldedSpringWidthUm));
  }
  return parts;
}

// Paper Fig S7: guided 7um beam, 100nm flexural width, 1um truss.
// The GDS does not specify exact anchor placement, which remains inferred.
function makeStructuralAligners(moveY) {
  const fixed = [],
    flexure = [];
  for (const sign of [-1, 1]) {
    const anchor = [-18, sign * 9.5];
    fixed.push(rect(anchor[0], anchor[1], 6, 6));
    const first = [anchor[0] - SWX_REPORTED.structuralAlignerLengthUm, anchor[1]];
    const corner = [first[0], sign * 5.7];
    const elbow = [-22, sign * 5.7 + moveY * 0.4];
    const attach = [-22, sign * SWX_REPORTED.shuttleWidthUm / 2 + moveY];
    flexure.push(
      ...polyline([anchor, first, corner, elbow, attach], SWX_REPORTED.structuralAlignerBeamUm),
    );
    flexure.push(
      strip(
        [corner[0] - 0.4, corner[1]],
        [corner[0] + 0.6, corner[1]],
        SWX_REPORTED.structuralAlignerBeamUm,
      ),
    );
  }
  return { fixed, flexure };
}

function makeShuttle(moveY) {
  const left = -23,
    right = 44,
    halfHeight = SWX_REPORTED.shuttleWidthUm / 2;
  const top = halfHeight + moveY;
  const bottom = -halfHeight + moveY;
  const beams = [
    strip([left, top], [right, top], 0.55),
    strip([left, bottom], [right, bottom], 0.55),
    // Rigid moving SWX half attaches to the central triangular truss.
    strip([-28, -1.6 + moveY], [left + 0.2, bottom], 0.7),
  ];
  const pitch = 5;
  for (let x = left; x + pitch <= right; x += pitch) {
    beams.push(strip([x, top], [x + pitch * 0.5, bottom], 0.4));
    beams.push(strip([x + pitch * 0.5, bottom], [x + pitch, top], 0.4));
  }
  return beams;
}

function makeCombs(moveY) {
  const fixed = [
    rect(25, 9, 39, SWX_REPORTED.fixedCombHandleUm),
    rect(25, -21, 39, SWX_REPORTED.fixedCombHandleUm),
  ];
  const moving = [
    rect(25, moveY, 39, SWX_REPORTED.movableCombHandleUm),
    rect(25, -11.2 + moveY, 39, SWX_REPORTED.movableCombHandleUm),
    strip([42, -11.2 + moveY], [42, moveY], 0.9),
  ];
  // Adjacent comb fingers have 500nm width, 300nm lateral clearance and
  // a real 2D interdigitation overlap; each bank has 20 finger pairs.
  for (let i = 0; i < 20; i++) {
    const x = 8.8 + i * 1.65;
    fixed.push(rect(x, 4.6, SWX_REPORTED.combFingerWidthUm, SWX_REPORTED.combFingerLengthUm));
    moving.push(
      rect(x + 0.8, 3.0 + moveY, SWX_REPORTED.combFingerWidthUm, SWX_REPORTED.combFingerLengthUm),
    );
    fixed.push(rect(x, -16.4, SWX_REPORTED.combFingerWidthUm, SWX_REPORTED.combFingerLengthUm));
    moving.push(
      rect(
        x + 0.8,
        -14.15 + moveY,
        SWX_REPORTED.combFingerWidthUm,
        SWX_REPORTED.combFingerLengthUm,
      ),
    );
  }
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
  const stoppers = makeMechanicalStoppers(travel);
  const gratings = makeIllustrativeGratingCouplers();
  const anchors = [
    rect(-49, 34, 9, 9),
    rect(-49, -34, 9, 9),
    rect(2, 40, 10, 10),
    rect(2, -40, 10, 10),
    rect(46, 9, 9, 9),
    rect(46, -21, 9, 9),
  ];
  const shuttle = makeShuttle(travel);
  const aligners = makeStructuralAligners(travel);
  const flexure = [...makeFoldedSprings(travel), ...makeMeanders(travel), ...aligners.flexure];
  const fixed = [
    ...optics.fixed,
    ...combs.fixed,
    ...anchors,
    ...stoppers.fixed,
    ...gratings,
    ...aligners.fixed,
  ];
  const movable = [...optics.moving, ...combs.moving, ...shuttle, ...stoppers.movable];
  const silicon = [...fixed, ...movable, ...flexure];
  // Ridge mask: representative narrow routing transitions (not full
  // 64x64 array routing). Ridge 150nm etch leaves 70nm silicon slab.
  const ridge = [
    rect(-50, 13, 3, 1.4),
    rect(-50, -13 + travel, 3, 1.4),
    rect(-12, 13, 3, 1.4),
    rect(-12, -13 + travel, 3, 1.4),
  ];
  // Every electrode must meet a mechanically supported silicon contact pad.
  // The previous upper/lower contacts at x=25um sat directly on exposed BOX,
  // isolated from the anchored spring electrical terminals at x=2um.
  const electrodes = [
    rect(2, 40, 5.5, 5.5),
    rect(2, -40, 5.5, 5.5),
    rect(46, 9, 5, 5),
    rect(46, -21, 5, 5),
  ];
  const polys = new Map([
    [1, silicon],
    [2, ridge],
    [3, electrodes],
  ]);
  const elements = [...polys].flatMap(([layer, polygons]) =>
    polygons.map((points) => ({
      kind: 'polygon',
      sourceCell: 'SWX_MEMS_UNIT',
      layer,
      datatype: 0,
      points,
    })),
  );
  const [width, height] = SWX_ASSUMPTIONS.fieldUm;
  const layout = {
    name: 'Hu 2025 SWX MEMS ' + state.toUpperCase() + ' · reconstructed, not authors GDS',
    root: 'SWX_MEMS_UNIT',
    elements,
    linework: [],
    hierarchy: {},
    combos: MASK_INFO.map(([layer]) => ({
      key: 'SWX_MEMS_UNIT|' + layer + '|0',
      cell: 'SWX_MEMS_UNIT',
      layer,
      datatype: 0,
      count: polys.get(layer).length,
    })),
    bounds: {
      minX: -width / 2,
      minY: -height / 2,
      maxX: width / 2,
      maxY: height / 2,
      width,
      height,
    },
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
  return {
    state,
    travelUm: travel,
    gapUm: optics.fixedEdge - optics.movingEdge,
    layout,
    maskPolygons: polys,
    maskNames: MASK_INFO.map(([layer, name]) => ({ layer, name })),
    physicalGroups: {
      fixed,
      movable,
      flexure,
      stopperFixed: stoppers.fixed,
      stopperMovable: stoppers.movable,
      gratingCouplers: gratings,
      structuralAligners: aligners,
      shuttle,
    },
    stopperClearanceUm: stoppers.clearanceUm,
    anchorTestPoint: [2, 40],
    releasedBeamTestPoint: [-31, -1.7 + travel],
  };
}
