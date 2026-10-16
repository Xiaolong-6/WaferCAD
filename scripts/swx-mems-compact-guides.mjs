/**
 * Source S7 structural-aligner candidate for compact SWX.
 *
 * Each guide links a BOX-supported stationary pad to the suspended
 * reflector with a 7um, 100nm-wide compliant beam and 1um truss.
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
  padCentersUm: [[-14, -50], [17, -45]],
  padWidthUm: 6,
  // Move the right guide to a separately supported corridor above the
  // moving optical taper, connecting its moving truss to the shuttle
  // bridge outside the stationary pad rather than crossing the pad.
  rightBridgeAttachUm: [7, -49.6],
  interpolationSamples: 16,
  interpolationSamples: 16,
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
    const fixedX = isLeft ? -11 : 14;
    const movingX = fixedX + side * -source.structuralAlignerLengthUm;
    const movingY = py + travelUm;
    const centerline = Array.from({ length: options.interpolationSamples + 1 }, (_, i) => {
      const t = i / options.interpolationSamples;
      const smooth = t * t * (3 - 2 * t);
      return [
        fixedX + (movingX - fixedX) * t,
        py + travelUm * smooth,
      ];
    });
    const beam = miteredPolyline(centerline, source.structuralAlignerBeamUm);
    // Left guide reaches the movable reflector; right guide attaches
    // to the separate, movable actuator bridge (not the fixed pad).
    const truss = isLeft
      ? rect(-3.5, movingY, 1.2, source.structuralAlignerTrussUm)
      : rect(
          options.rightBridgeAttachUm[0],
          (movingY + options.rightBridgeAttachUm[1] + travelUm) / 2,
          source.structuralAlignerTrussUm,
          Math.abs(movingY - (options.rightBridgeAttachUm[1] + travelUm)) + 0.2,
        );
    flexure.push(...beam, truss);
    guides.push({ side, pad, beam: beam[0], truss, centerline });
  }
  return { fixed, flexure, guides, travelUm };
}
