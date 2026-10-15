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
  combFingerInitialOverlapUm: 0.2,
  combFingerUnits: 40,
});

export const SWX_ASSUMPTIONS = Object.freeze({
  fieldUm: [112, 104],
  handleSiUm: 5,
  // Illustrative HF reach between the 3um movable handle half-width (1.5um)
  // and the 6um fixed handle half-width (3um). This releases the moving
  // handles while retaining BOX below the stationary comb cores.
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
  // Illustrative coordinates, not recovered GDS. The actuator axis is +Y.
  shuttleVerticalExtentUm: [-9, 9],
  lowerStationaryCombYUm: -5.8,
  lowerMovableCombYUm: -15.2,
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
  // Butt-joined rectangles have only shared boundary edges. Polygon union
  // may preserve them as disconnected islands, especially at sharp turns.
  // A square-cap overlap of half the linewidth creates a finite silicon
  // bridge without increasing the actual nominal centerline length.
  return compact.slice(1).map((next, i) => {
    const a = compact[i];
    const length = Math.hypot(next[0] - a[0], next[1] - a[1]);
    const ux = (next[0] - a[0]) / length;
    const uy = (next[1] - a[1]) / length;
    const cap = Math.min(width / 2, length / 4);
    return strip(
      [a[0] - cap * ux, a[1] - cap * uy],
      [next[0] + cap * ux, next[1] + cap * uy],
      width,
    );
  });
}

// A single miter-joined contour for long, narrow MEMS flexures.
// Segment rectangles with overlapping end caps are connectivity-safe but
// create visible extrusion lips at elbows. Their separate faces can also
// produce renderer seams. This produces ONE constant-width polygon instead.
export function miteredPolyline(points, width) {
  if (!(width > 0)) throw new Error('Mitered path width must be positive');
  const compact = points.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-12,
  );
  if (compact.length < 2) throw new Error('Mitered path requires two distinct vertices');

  const tangents = compact.slice(1).map((p, i) => {
    const a = compact[i];
    const length = Math.hypot(p[0] - a[0], p[1] - a[1]);
    return [(p[0] - a[0]) / length, (p[1] - a[1]) / length];
  });
  const half = width / 2;
  const cap = (point, direction, tangent, side) => [
    point[0] + side * -tangent[1] * half + direction * tangent[0] * half,
    point[1] + side * tangent[0] * half + direction * tangent[1] * half,
  ];
  const edge = (side) => {
    const chain = [cap(compact[0], -1, tangents[0], side)];
    for (let i = 1; i < compact.length - 1; i++) {
      const before = tangents[i - 1];
      const after = tangents[i];
      const cos = before[0] * after[0] + before[1] * after[1];
      // Reversal and near-reversal corners cannot have a finite miter.
      // Reject the invalid centerline rather than inventing a sharp spike.
      if (cos < -0.95) throw new Error('Mitered path contains a near-reversal');
      const factor = (side * half) / (1 + cos);
      chain.push([
        compact[i][0] + -(before[1] + after[1]) * factor,
        compact[i][1] + (before[0] + after[0]) * factor,
      ]);
    }
    chain.push(cap(compact.at(-1), 1, tangents.at(-1), side));
    return chain;
  };
  return [edge(1).concat(edge(-1).reverse())];
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

function makeIllustrativeGratingCouplers(moveY) {
  const silicon = [],
    fixedSilicon = [],
    flexibleSilicon = [],
    shallowEtch = [],
    groups = [];
  for (const [cx, cy] of SWX_ASSUMPTIONS.gratingCentersUm) {
    const sign = Math.sign(cy);
    const sourceY = sign * 13;
    const feed = polyline(
      [
        [-53, sourceY + (sign < 0 ? moveY : 0)],
        [-50.7, sign * 18],
        [cx, cy],
      ],
      0.4,
    );
    const taper = taperedStrip([cx, cy], [cx + 2.3, cy], 0.4, 1.1);
    const outerRadius =
      Math.max(...SWX_ASSUMPTIONS.gratingRadiiUm) + SWX_ASSUMPTIONS.gratingToothWidthUm + 0.18;
    const halfAngle = Math.PI / 3.5;
    const slab = [
      [cx, cy],
      ...Array.from({ length: 17 }, (_, i) => {
        const angle = -halfAngle + (2 * halfAngle * i) / 16;
        return [cx + outerRadius * Math.cos(angle), cy + sign * outerRadius * Math.sin(angle)];
      }),
    ];
    // Grating teeth are shallow-etched grooves in one continuous silicon
    // sector. Standalone full-etched arcs would be disconnected silicon
    // islands with no realistic optical substrate beneath them.
    silicon.push(...feed, taper, slab);
    fixedSilicon.push(taper, slab);
    // The lower grating is stationary but the SWX lower optical port moves
    // by 885nm. Its routed waveguide must flex rather than remain welded
    // in the OFF position (or be misclassified as a rigid fixed component).
    if (sign < 0) flexibleSilicon.push(...feed);
    else fixedSilicon.push(...feed);
    groups.push(taper, slab);
    for (const radius of SWX_ASSUMPTIONS.gratingRadiiUm) {
      const groove = gratingArcBand(
        cx,
        cy,
        radius,
        radius + SWX_ASSUMPTIONS.gratingToothWidthUm,
        sign,
      );
      shallowEtch.push(groove);
      groups.push(groove);
    }
  }
  return { silicon, fixedSilicon, flexibleSilicon, shallowEtch, groups };
}

function makeMeanders(moveY) {
  const paths = [];
  // A compliant optical link must have both ends attached. The original
  // illustrative curves ended freely near (1,+/-32um), as seen in the
  // visual acceptance screenshot. Build a 3um/5um double-bend centerline
  // from the actual SWX output port to a BOX-supported fixed anchor.
  for (const sign of [-1, 1]) {
    const fixedPort = [
      [-10, 13],
      [-13, 13],
      ...traceArc(-13, 16, SWX_REPORTED.meanderRadiiUm[1], -Math.PI / 2, Math.PI / 2),
      [-18, 19],
      ...traceArc(-18, 24, SWX_REPORTED.meanderRadiiUm[0], -Math.PI / 2, Math.PI / 2),
      [-19, 30],
      [-7, 36],
      [2, 40],
    ];
    const points = fixedPort.map(([x, y], i) => {
      const shift = sign < 0 ? moveY * (1 - i / (fixedPort.length - 1)) : 0;
      return [x, sign * y + shift];
    });
    paths.push(...polyline(points, SWX_REPORTED.waveguideCoreUm));
  }
  return paths;
}

function makeFoldedSprings(moveY) {
  const parts = [];
  // Supplement S7/S8: two pairs (four separate spring paths), mirrored
  // on the two sides of the Y-actuated shuttle. Retain the 30/22um,
  // 200nm and 1.5um reported dimensions; anchor/site coordinates are inferred.
  const halfShuttle = SWX_REPORTED.shuttleWidthUm / 2;
  const pitch = SWX_REPORTED.foldedSpringClearanceUm + SWX_REPORTED.foldedSpringWidthUm;
  const long = SWX_REPORTED.foldedSpringLongBeamUm;
  const short = SWX_REPORTED.foldedSpringShortBeamUm;
  for (const signY of [-1, 1]) {
    for (const signX of [-1, 1]) {
      const x = (distance) => signX * distance;
      const y = (distance) => signY * distance;
      const path = [
        [x(2), y(40)],
        [x(2), y(40 - long)],
        [x(2 + pitch), y(40 - long)],
        [x(2 + pitch), y(40 - long + short)],
        [x(2 + 2 * pitch), y(40 - long + short)],
        [x(2 + 2 * pitch), y(40 - long)],
        [x(2 + 3 * pitch), y(40 - long)],
        [x(2 + 3 * pitch), signY * halfShuttle],
      ];
      const deformed = path.map(([px, py], i) => [px, py + (moveY * i) / (path.length - 1)]);
      parts.push(...miteredPolyline(deformed, SWX_REPORTED.foldedSpringWidthUm));
    }
  }
  return parts;
}

// Paper Fig S7: guided 7um beam, 100nm flexural width, 1um truss.
// The GDS does not specify exact anchor placement, which remains inferred.
function makeStructuralAligners(moveY) {
  const fixed = [],
    flexure = [];
  const halfShuttle = SWX_REPORTED.shuttleWidthUm / 2;
  for (const sign of [-1, 1]) {
    // Keep the structural-aligner anchor away from the lower movable
    // optical taper (the former -18um x -9.5um pad intersected it by
    // 8.72um²). A 10um pad also retains BOX under a 4um HF lateral release.
    // The precise anchor location is inferred, not copied from author GDS.
    const anchor = [-2, sign * 27];
    fixed.push(rect(anchor[0], anchor[1], 10, 10));
    const first = [anchor[0] - SWX_REPORTED.structuralAlignerLengthUm, anchor[1]];
    const corner = [first[0], sign * 5.7];
    const elbow = [-22, sign * 5.7 + moveY * 0.4];
    const attach = [-22, sign * halfShuttle + moveY];
    flexure.push(
      ...miteredPolyline(
        [anchor, first, corner, elbow, attach],
        SWX_REPORTED.structuralAlignerBeamUm,
      ),
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
  // S8: the shuttle's *long* axis follows its +Y actuation. Reconstruct a
  // perforated 6um-wide ladder, rather than a 67um transverse truss. Exact
  // hole spacing and the span between the spring attachments are inferred.
  const [y0, y1] = SWX_ASSUMPTIONS.shuttleVerticalExtentUm;
  const railX = (SWX_REPORTED.shuttleWidthUm - 0.7) / 2;
  const beams = [
    strip([-railX, y0 + moveY], [-railX, y1 + moveY], 0.7),
    strip([railX, y0 + moveY], [railX, y1 + moveY], 0.7),
  ];
  for (let y = y0 + 1; y < y1; y += 4) {
    beams.push(strip([-railX, y + moveY], [railX, y + moveY], 0.45));
  }
  beams.push(
    // The lower SWX reflector translates with the vertical shuttle.
    strip([-28, -1.6 + moveY], [-railX, -1.6 + moveY], 0.7),
    // Both suspended 3um comb handles belong to ONE moving Si net.
    strip([railX, moveY], [5.8, moveY], 1),
    strip([railX, -8 + moveY], [5.8, SWX_ASSUMPTIONS.lowerMovableCombYUm + moveY], 1),
  );
  // All four spring tips must attach to the corresponding moving rail.
  // Place finite-area bridges under the 200nm flexure terminals.
  const springTipX =
    2 + 3 * (SWX_REPORTED.foldedSpringClearanceUm + SWX_REPORTED.foldedSpringWidthUm);
  for (const signY of [-1, 1]) {
    for (const signX of [-1, 1]) {
      beams.push(
        strip(
          [signX * railX, signY * 3 + moveY],
          [signX * springTipX, signY * 3 + moveY],
          0.45,
        ),
      );
    }
  }
  return beams;
}

function makeCombs(moveY) {
  const lowerFixedY = SWX_ASSUMPTIONS.lowerStationaryCombYUm;
  const lowerMovingY = SWX_ASSUMPTIONS.lowerMovableCombYUm;
  const fixed = [
    rect(25, 9, 39, SWX_REPORTED.fixedCombHandleUm),
    rect(25, lowerFixedY, 39, SWX_REPORTED.fixedCombHandleUm),
  ];
  const moving = [
    rect(25, moveY, 39, SWX_REPORTED.movableCombHandleUm),
    rect(25, lowerMovingY + moveY, 39, SWX_REPORTED.movableCombHandleUm),
  ];
  // Both pairs must produce +Y force: each stationary finger points
  // downward from a supported handle toward a suspended finger pointing
  // upward. At OFF the axial overlap is Lc-ac=0.2um; at ON it rises to
  // 1.085um. Horizontal edge-to-edge spacing stays 0.3um in both states.
  // Twenty interleaved finger pairs per bank give 40 comb cells overall.
  const banks = [
    { fixedY: 5.7, movingY: 2.7 },
    { fixedY: -9.5, movingY: -12.5 },
  ];
  for (const bank of banks) {
    for (let i = 0; i < 20; i++) {
      const x = 8.8 + i * 1.65;
      fixed.push(
        rect(x, bank.fixedY, SWX_REPORTED.combFingerWidthUm, SWX_REPORTED.combFingerLengthUm),
      );
      moving.push(
        rect(
          x + 0.8,
          bank.movingY + moveY,
          SWX_REPORTED.combFingerWidthUm,
          SWX_REPORTED.combFingerLengthUm,
        ),
      );
    }
  }
  return { fixed, moving };
}

const MASK_INFO = Object.freeze([
  [1, 'Full-etched 220 nm silicon: SWX, springs, combs and anchors'],
  [2, '150 nm partial Si etch: ridge transitions and grating grooves'],
  [3, 'Patterned Cr/Au electrical electrodes'],
]);

export function createSwxGeometry(state = 'off') {
  ensureState(state);
  const travel = state === 'off' ? 0 : SWX_REPORTED.offGapUm - SWX_REPORTED.onGapUm;
  const optics = makeOptics(travel);
  const combs = makeCombs(travel);
  const stoppers = makeMechanicalStoppers(travel);
  const gratings = makeIllustrativeGratingCouplers(travel);
  const anchors = [
    // The former (-49,+/-34) boxes were unsupported free-standing islands
    // with no connection to the waveguide or mechanical network.
    rect(2, 40, 10, 10),
    rect(2, -40, 10, 10),
    rect(46, 9, 9, 9),
    rect(46, SWX_ASSUMPTIONS.lowerStationaryCombYUm, 9, 6),
  ];
  const shuttle = makeShuttle(travel);
  const aligners = makeStructuralAligners(travel);
  const foldedSprings = makeFoldedSprings(travel);
  const flexure = [
    ...foldedSprings,
    ...makeMeanders(travel),
    ...aligners.flexure,
    ...gratings.flexibleSilicon,
  ];
  const fixed = [
    ...optics.fixed,
    ...combs.fixed,
    ...anchors,
    ...stoppers.fixed,
    ...gratings.fixedSilicon,
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
    ...gratings.shallowEtch,
  ];
  // Every electrode must meet a mechanically supported silicon contact pad.
  // The previous upper/lower contacts at x=25um sat directly on exposed BOX,
  // isolated from the anchored spring electrical terminals at x=2um.
  const electrodes = [
    rect(2, 40, 5.5, 5.5),
    rect(2, -40, 5.5, 5.5),
    rect(46, 9, 5, 5),
    rect(46, SWX_ASSUMPTIONS.lowerStationaryCombYUm, 5, 5),
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
      combBanks: combs,
      stopperFixed: stoppers.fixed,
      stopperMovable: stoppers.movable,
      gratingCouplers: gratings.groups,
      gratingSlabs: gratings.silicon,
      gratingFeeds: gratings.flexibleSilicon,
      gratingGrooves: gratings.shallowEtch,
      structuralAligners: aligners,
      foldedSprings,
      shuttle,
    },
    stopperClearanceUm: stoppers.clearanceUm,
    anchorTestPoint: [2, 40],
    releasedBeamTestPoint: [-31, -1.7 + travel],
  };
}
