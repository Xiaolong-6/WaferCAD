import { applyOperation, createModel } from './model.js';
import { intersection, isEmpty, rectMulti, unionGeometries } from './vector-geometry.js';
import { polygonAreaUm2, substrateShadowFootprint } from './shadow-exposure-geometry.js';

/**
 * Geometry-only comparison model of a lift-off pattern obtained from direct
 * line-of-sight Al exposure. Not a physical shadow-evaporation solver:
 * - Uses surface footprints and wafer-normal nominal thicknesses.
 * - Does not deposit on resist sidewalls or simulate dynamic self-shadowing.
 * - An optional explicitly sourced AlOx spacer can be created as a geometric hypothesis.
 * - Does not simulate oxidation kinetics, sidewalls or tunneling.
 * - Do not call the result a superconducting Josephson junction.
 *
 * This is an opt-in scientific preview. No changes to the Process worker/UI.
 */
export function makeShadowAlPreview({
  layers,
  beams,
  barrier = null,
  substrateWidthUm = 40,
  substrateHeightUm = 30,
  substrateThicknessUm = 675,
  sampleStepUm = 0.0375,
  transport = 'precomputed',
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

  if (barrier !== null) {
    if (beams.length < 2) throw new RangeError('Barrier requires two Al beams.');
    if (!Number.isFinite(barrier.thicknessUm) || barrier.thicknessUm <= 0)
      throw new RangeError('An explicit positive oxide thickness is required.');
    if (!['hypothesis', 'measurement'].includes(barrier.provenance))
      throw new RangeError('Oxide thickness provenance must be declared.');
    if (typeof barrier.source !== 'string' || !barrier.source.trim())
      throw new RangeError('Oxide thickness provenance source is required.');
  }

  if (!['precomputed', 'native-direct'].includes(transport))
    throw new RangeError('Unsupported shadow transport mode.');
  const model = createModel({
    shape: 'rect',
    width: substrateWidthUm,
    height: substrateHeightUm,
    thickness: substrateThicknessUm,
  });
  model.layers[0].name = 'Si (100), intrinsic';
  const domain = rectMulti(substrateWidthUm, substrateHeightUm);
  const exposures = [];
  let barrierLayerId = null;
  for (const [i, beam] of beams.entries()) {
    const native = transport === 'native-direct';
    const visible = native
      ? { heightStepUm: sampleStepUm, sampleCount: null, method: 'native-direct' }
      : substrateShadowFootprint(layers, {
          thetaDeg: beam.thetaDeg,
          azimuthDeg: beam.azimuthDeg,
          heightStepUm: sampleStepUm,
        });
    const inside = native ? domain : intersection(visible.footprint, domain);
    if (isEmpty(inside)) throw new Error('Shadow exposure ' + i + ' has no substrate footprint.');
    const outcome = applyOperation(model, {
      type: 'add',
      name: beam.label || 'Al exposure ' + (i + 1),
      color: beam.color || ['#6e9dc8', '#c5a362', '#d48d89'][i % 3],
      thickness: beam.nominalThicknessUm,
      face: 'front',
      growth: 'direct',
      area: inside,
      ...(native
        ? {
            incidence: {
              tiltDeg: beam.thetaDeg,
              azimuthDeg: beam.azimuthDeg,
              heightStepUm: sampleStepUm,
              apertureStack: layers.map(({ bottomUm, topUm, opening }) => ({
                bottomZUm: substrateThicknessUm / 2 + bottomUm,
                topZUm: substrateThicknessUm / 2 + topUm,
                opening,
              })),
            },
          }
        : {}),
    });
    if (!outcome.changed) throw new Error('Shadow Al preview failed: ' + (outcome.error || i));
    const footprint = native
      ? unionGeometries(
          model.regions
            .filter((region) => region.stack.some((segment) => segment.layerId === outcome.layerId))
            .map((region) => region.geom),
        )
      : inside;
    exposures.push({
      ...visible,
      label: beam.label || 'Al exposure ' + (i + 1),
      layerId: outcome.layerId,
      nominalThicknessUm: beam.nominalThicknessUm,
      areaUm2: polygonAreaUm2(footprint),
      footprint,
    });
    if (i === 0 && barrier !== null) {
      const oxide = applyOperation(model, {
        type: 'add',
        name: 'AlOx geometric spacer (' + barrier.provenance + ')',
        color: '#e5a34a',
        thickness: barrier.thicknessUm,
        face: 'front',
        growth: 'direct',
        area: footprint,
      });
      if (!oxide.changed)
        throw new Error('AlOx geometric spacer failed: ' + (oxide.error || 'unknown'));
      barrierLayerId = oxide.layerId;
    }
  }
  const sharedFirstTwo =
    exposures.length >= 2 ? intersection(exposures[0].footprint, exposures[1].footprint) : [];
  const summary = {
    transport,
    status:
      barrier === null
        ? 'idealized-lift-off geometry preview; NO tunnel barrier or deposition physics'
        : 'hypothetical AlOx geometry spacer only; NOT a validated tunnel junction',
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
    alOxPresent: barrier !== null,
    alOxLayerId: barrierLayerId,
    alOxThicknessUm: barrier?.thicknessUm ?? null,
    alOxProvenance: barrier?.provenance ?? null,
    alOxSource: barrier?.source ?? null,
    tunnelJunctionValidated: false,
    liftOffMode: 'idealized: keep only substrate-reachable footprints',
  };
  return { model, exposures, sharedFirstTwo, summary };
}
