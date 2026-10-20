import { applyOperation, createModel } from './model.js';
import { intersection, isEmpty, pointInMulti, rectMulti } from './vector-geometry.js';
import { polygonAreaUm2, substrateShadowFootprint } from './shadow-exposure-geometry.js';

/**
 * Geometry-only comparison model of a lift-off pattern obtained from direct
 * line-of-sight Al exposure. Not a physical shadow-evaporation solver:
 * - Uses surface footprints and wafer-normal nominal thicknesses.
 * - Does not deposit on resist sidewalls or simulate dynamic self-shadowing.
 * - Does not create the AlOx tunnel dielectric (thickness unavailable).
 * - Do not call the result a superconducting Josephson junction.
 *
 * This is an opt-in scientific preview. No changes to the Process worker/UI.
 */
export function makeShadowAlPreview({
  layers,
  beams,
  substrateWidthUm = 40,
  substrateHeightUm = 30,
  substrateThicknessUm = 675,
  sampleStepUm = 0.0375,
} = {}) {
  if (!Array.isArray(beams) || beams.length === 0)
    throw new RangeError('At least one Al deposition beam is required.');
  if (
    ![substrateWidthUm, substrateHeightUm, substrateThicknessUm].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    throw new RangeError('Invalid substrate dimensions.');
  if (beams.some((b) => !(b.nominalThicknessUm > 0) || !Number.isFinite(b.nominalThicknessUm)))
    throw new RangeError('Each Al beam needs a positive nominal wafer-normal thickness.');

  const model = createModel({
    shape: 'rect',
    width: substrateWidthUm,
    height: substrateHeightUm,
    thickness: substrateThicknessUm,
  });
  model.layers[0].name = 'Si (100), intrinsic';
  const domain = rectMulti(substrateWidthUm, substrateHeightUm);
  const exposures = [];
  for (const [i, beam] of beams.entries()) {
    const visible = substrateShadowFootprint(layers, {
      thetaDeg: beam.thetaDeg,
      azimuthDeg: beam.azimuthDeg,
      heightStepUm: sampleStepUm,
    });
    const inside = intersection(visible.footprint, domain);
    if (isEmpty(inside)) throw new Error('Shadow exposure ' + i + ' has no substrate footprint.');
    const outcome = applyOperation(model, {
      type: 'add',
      name: beam.label || 'Al exposure ' + (i + 1),
      color: beam.color || ['#6e9dc8', '#c5a362', '#d48d89'][i % 3],
      thickness: beam.nominalThicknessUm,
      face: 'front',
      growth: 'direct',
      area: inside,
    });
    if (!outcome.changed) throw new Error('Shadow Al preview failed: ' + (outcome.error || i));
    exposures.push({
      ...visible,
      label: beam.label || 'Al exposure ' + (i + 1),
      layerId: outcome.layerId,
      nominalThicknessUm: beam.nominalThicknessUm,
      areaUm2: polygonAreaUm2(inside),
      footprint: inside,
    });
  }
  const sharedFirstTwo =
    exposures.length >= 2 ? intersection(exposures[0].footprint, exposures[1].footprint) : [];
  const summary = {
    status: 'idealized-lift-off geometry preview; NO tunnel barrier or deposition physics',
    zConvention: 'substrate physical µm; nominal thickness along wafer normal',
    exposures: exposures.map((e) => ({
      label: e.label,
      layerId: e.layerId,
      nominalThicknessUm: e.nominalThicknessUm,
      substrateFootprintAreaUm2: e.areaUm2,
      sampleCount: e.sampleCount,
      sampledHeightStepUm: e.heightStepUm,
    })),
    firstTwoOverlapAreaUm2: polygonAreaUm2(sharedFirstTwo),
    layerCount: model.layers.length,
    regionCount: model.regions.length,
    processRevision: model.processRevision,
    alOxPresent: false,
    liftOffMode: 'idealized: keep only substrate-reachable footprints',
  };
  return { model, exposures, sharedFirstTwo, summary };
}
