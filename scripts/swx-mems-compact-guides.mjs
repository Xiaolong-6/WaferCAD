/**
 * Source S7 structural-aligner candidate for compact SWX.
 *
 * Each guide links a BOX-supported stationary pad to the suspended
 * reflector/bridge with two 7um, 100nm-wide compliant beams and 1um truss.
 * The inter-beam spacing and pad locations are illustrative.
 * The x/y pad registration and cubic displacement interpolation are
 * explicit assumptions, NOT a reconstructed author GDS or a solved FEM.
 */
import { SWX_REPORTED, miteredPolyline } from './swx-mems-geometry.mjs';

const rect = (x, y, w, h) => [
  [x - w / 2, y - h / 2],
  [x + w / 2, y - h / 2],
  [x + w / 2, y + h / 2],
  [x - w / 2, y + h / 2],
];

export const SWX_COMPACT_GUIDE_ASSUMPTIONS = Object.freeze({
  padCentersUm: [
    [-14, -50],
    [34, -45],
  ],
  padWidthUm: 6,
  // Place the right pad OUTSIDE the bridge's vertical sweep x=24um;
  // a 7um flexure runs inward and contacts that moving bridge only
  // at its free tip. This provisional support is not author GDS.
  rightBridgeAttachUm: [24, -45],
  interpolationSamples: 16,
  // S7a shows multiple parallel flexures. Its inter-beam spacing was
  // not published; this is a clearance-tested illustrative hypothesis.
  parallelGuideSeparationUm: 0.8,
  paperAlignmentDimensions: true,
  validatedFEM: false,
});

export function createCompactSwxGuides(travelUm = 0) {
  if (!(travelUm >= 0 && travelUm <= 0.9)) throw new Error('Invalid guide stroke');
  const source = SWX_REPORTED;
  const options = SWX_COMPACT_GUIDE_ASSUMPTIONS;
  const fixed = [];
  const flexure = [];
  const guides = [];
  for (const side of [-1, 1]) {
    const isLeft = side < 0;
    const [px, py] = options.padCentersUm[isLeft ? 0 : 1];
    const pad = rect(px, py, options.padWidthUm, options.padWidthUm);
    fixed.push(pad);
    const fixedX = isLeft ? -11 : 31;
    const movingX = fixedX + side * -source.structuralAlignerLengthUm;
    const movingY = py + travelUm;
    const centerline = Array.from({ length: options.interpolationSamples + 1 }, (_, i) => {
      const t = i / options.interpolationSamples;
      const smooth = t * t * (3 - 2 * t);
      return [fixedX + (movingX - fixedX) * t, py + travelUm * smooth];
    });
    const spacing = options.parallelGuideSeparationUm;
    if (spacing <= source.structuralAlignerBeamUm)
      throw new Error('S7 guide beams must remain laterally separated');
    const centerlines = [-1, 1].map((offset) =>
      centerline.map(([x, y]) => [x, y + (offset * spacing) / 2]),
    );
    const beams = centerlines.flatMap((line) =>
      miteredPolyline(line, source.structuralAlignerBeamUm),
    );
    // Left guide reaches the movable reflector; right guide attaches
    // to the separate, movable actuator bridge (not the fixed pad).
    const truss = isLeft
      ? rect(-3.5, movingY, 1.2, source.structuralAlignerTrussUm)
      : rect(
          options.rightBridgeAttachUm[0],
          movingY,
          source.structuralAlignerTrussUm,
          source.structuralAlignerTrussUm,
        );
    flexure.push(...beams, truss);
    guides.push({ side, pad, beams, truss, centerline, centerlines });
  }
  return { fixed, flexure, guides, travelUm };
}
