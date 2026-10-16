/**
 * Compact Fig. 1c / Supplement S8 ACTUATOR SUBASSEMBLY, in physical um.
 * Triangular shuttle apertures are represented by explicit positive silicon
 * diagonal ribs. Their 4um spacing/450nm brace width remain assumptions.
 * This is still not the authors' GDS, FEM or an accepted public example.
 */
import { SWX_REPORTED, miteredPolyline } from './swx-mems-geometry.mjs';

const rect = (x, y, w, h) => [
  [x - w / 2, y - h / 2],
  [x + w / 2, y - h / 2],
  [x + w / 2, y + h / 2],
  [x - w / 2, y + h / 2],
];
const strip = (a, b, width) => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length <= 0) throw new Error('Zero-length actuator beam');
  const dx = (-(b[1] - a[1]) * width) / (2 * length);
  const dy = ((b[0] - a[0]) * width) / (2 * length);
  return [
    [a[0] + dx, a[1] + dy],
    [b[0] + dx, b[1] + dy],
    [b[0] - dx, b[1] - dy],
    [a[0] - dx, a[1] - dy],
  ];
};

// Unreported positions are explicit assumptions, never paper metrology.
export const SWX_COMPACT_ASSUMPTIONS = Object.freeze({
  fixedBusYUm: -18,
  movingBusYUm: -27.4,
  shuttleExtentYUm: [-34, 8],
  springAnchorYUm: 40,
  springTipYUm: 6,
  springBaseXUm: [6, 16],
  fingerPitchUm: 1.65,
  firstFingerXUm: 8.8,
});

export function createCompactSwxActuator(state = 'off') {
  if (state !== 'off' && state !== 'on') throw new Error('Invalid SWX actuator state');
  const p = SWX_REPORTED;
  const a = SWX_COMPACT_ASSUMPTIONS;
  const travel = state === 'on' ? p.offGapUm - p.onGapUm : 0;
  const fixed = [],
    movable = [],
    flexure = [],
    springContours = [],
    anchors = [],
    banks = [];
  const railX = (p.shuttleWidthUm - 0.7) / 2;
  const shuttle = [
    strip([-railX, a.shuttleExtentYUm[0] + travel], [-railX, a.shuttleExtentYUm[1] + travel], 0.7),
    strip([railX, a.shuttleExtentYUm[0] + travel], [railX, a.shuttleExtentYUm[1] + travel], 0.7),
  ];
  const crossbarsYUm = [];
  const shuttleDiagonals = [];
  const triangularApertureProbes = [];
  for (let y = a.shuttleExtentYUm[0] + 1; y < a.shuttleExtentYUm[1]; y += 4) {
    crossbarsYUm.push(y);
    shuttle.push(strip([-railX, y + travel], [railX, y + travel], 0.45));
  }
  // Fig. 1c depicts triangular lightening openings in the perforated
  // shuttle. Alternate slender Si diagonal ribs between crossbars so the
  // positive Si mask contains TWO open triangular cells per 4um interval.
  // Actual source perforation dimensions/period are not published; this
  // is a topology-oriented surrogate, not the author's exact design.
  for (let i = 0; i < crossbarsYUm.length - 1; i++) {
    const y = crossbarsYUm[i];
    const direction = i % 2 === 0 ? 1 : -1;
    const brace = strip(
      [-direction * railX, y + travel],
      [direction * railX, crossbarsYUm[i + 1] + travel],
      0.45,
    );
    shuttleDiagonals.push(brace);
    triangularApertureProbes.push(
      [0, y + 1 + travel],
      [0, y + 3 + travel],
    );
    shuttle.push(brace);
  }
  for (const side of [-1, 1]) {
    const stationary = [rect(side * 26, a.fixedBusYUm, 37.5, p.fixedCombHandleUm)];
    const moving = [rect(side * 25, a.movingBusYUm + travel, 39, p.movableCombHandleUm)];
    for (let i = 0; i < 20; i++) {
      const x = side * (a.firstFingerXUm + i * a.fingerPitchUm);
      stationary.push(rect(x, a.fixedBusYUm - 3.7, p.combFingerWidthUm, p.combFingerLengthUm));
      moving.push(
        rect(
          x + side * (p.combFingerWidthUm + p.combFingerGapUm),
          a.fixedBusYUm - 6.7 + travel,
          p.combFingerWidthUm,
          p.combFingerLengthUm,
        ),
      );
    }
    banks.push({ side, stationary, moving });
    fixed.push(...stationary);
    movable.push(...moving);
    shuttle.push(
      strip([side * railX, a.movingBusYUm + travel], [side * 5.9, a.movingBusYUm + travel], 0.7),
    );
  }
  const springPitch = p.foldedSpringWidthUm + p.foldedSpringClearanceUm;
  for (const side of [-1, 1]) {
    for (const baseX of a.springBaseXUm) {
      const x = (offset) => side * (baseX + offset);
      const path = [
        [x(0), a.springAnchorYUm],
        [x(0), a.springAnchorYUm - p.foldedSpringLongBeamUm],
        [x(springPitch), a.springAnchorYUm - p.foldedSpringLongBeamUm],
        [x(springPitch), a.springAnchorYUm - p.foldedSpringLongBeamUm + p.foldedSpringShortBeamUm],
        [
          x(2 * springPitch),
          a.springAnchorYUm - p.foldedSpringLongBeamUm + p.foldedSpringShortBeamUm,
        ],
        [x(2 * springPitch), a.springAnchorYUm - p.foldedSpringLongBeamUm],
        [x(3 * springPitch), a.springAnchorYUm - p.foldedSpringLongBeamUm],
        [x(3 * springPitch), a.springTipYUm],
      ];
      const displaced = path.map(([px, py], i) => [px, py + (travel * i) / (path.length - 1)]);
      const [outline] = miteredPolyline(displaced, p.foldedSpringWidthUm);
      springContours.push(outline);
      flexure.push(outline);
      const anchor = rect(side * baseX, a.springAnchorYUm, 8, 8);
      anchors.push(anchor);
      fixed.push(anchor);
      shuttle.push(
        strip(
          [side * railX, a.springTipYUm + travel],
          [x(3 * springPitch), a.springTipYUm + travel],
          0.45,
        ),
      );
    }
  }
  movable.push(...shuttle);
  return {
    state,
    travelUm: travel,
    fixed,
    movable,
    flexure,
    shuttle,
    shuttleDiagonals,
    triangularApertureProbes,
    springContours,
    anchors,
    banks,
    integrationStatus: 'isolated-mechanical-candidate-not-manufacturing-project',
    unresolved: [
      'Must connect moving SWX reflector and both compliant optical ports without silicon shorts',
      'Must integrate structural aligners and independently check BOX support and release',
      'All placement coordinates are illustrative; author GDS and FEM are unavailable',
    ],
  };
}
