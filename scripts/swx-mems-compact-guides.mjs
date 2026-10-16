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
  padCentersUm: [[-14, -50], [14, -50]],
  padWidthUm: 6,
  fixedBeamXUm: 11,
  movingBeamXUm: 4,
  trussAttachXUm: 3,
  beamCenterYUm: -50,
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
    const pad = rect(side * 14, options.beamCenterYUm, options.padWidthUm, options.padWidthUm);
    fixed.push(pad);
    const centerline = Array.from({ length: options.interpolationSamples + 1 }, (_, i) => {
      const t = i / options.interpolationSamples;
      const smooth = t * t * (3 - 2 * t);
      return [
        side * (options.fixedBeamXUm - t * source.structuralAlignerLengthUm),
        options.beamCenterYUm + travelUm * smooth,
      ];
    });
    const beam = miteredPolyline(centerline, source.structuralAlignerBeamUm);
    // The 1um truss overlays the moving end of each 0.1um guide. Its
    // in-plane length is illustrative; source S7 specifies truss width.
    const truss = rect(
      side * (options.movingBeamXUm + options.trussAttachXUm) / 2,
      options.beamCenterYUm + travelUm,
      options.movingBeamXUm - options.trussAttachXUm + 0.2,
      source.structuralAlignerTrussUm,
    );
    flexure.push(...beam, truss);
    guides.push({ side, pad, beam: beam[0], truss, centerline });
  }
  return { fixed, flexure, guides, travelUm };
}
