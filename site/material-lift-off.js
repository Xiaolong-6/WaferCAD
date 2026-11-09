import { difference, isEmpty } from './vector-geometry.js';
import {
  analyzeMaterialContacts,
  retainedMaterialContactRegions,
} from './material-contact-graph.js';

const EPS = 1e-8;
export const LIFT_PERMANENT = 1,
  LIFT_RESIST = 2,
  LIFT_TOPCOAT = 4;

function validateSacrificial(model, ids) {
  return (
    Array.isArray(ids) &&
    ids.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => !['base', 'substrate'].includes(id) && model.layers.some((l) => l.id === id))
  );
}

/** The lift-off graph distinguishes permanent support, resist sidewall
 * support and a resist topcoat. Only the latter can form a release bridge.
 */
export function analyzeMaterialLiftOff(
  model,
  ids,
  { traceContacts = false, requireAllSacrificial = true, traceClosedTangencies = false } = {},
) {
  if (!validateSacrificial(model, ids))
    throw Error('Material Lift-off needs distinct non-base sacrificial layers.');
  const sacrificial = new Set(ids);
  const first = Math.min(...ids.map((id) => model.layers.findIndex((l) => l.id === id)));
  const permanent = new Set(model.layers.slice(0, first).map((l) => l.id));
  const analysis = analyzeMaterialContacts(model, {
    isDeposit: (layerId) => !sacrificial.has(layerId) && !permanent.has(layerId),
    supportFlags: (support, deposit, sameXY) => {
      if (permanent.has(support.layerId)) return LIFT_PERMANENT;
      if (!sacrificial.has(support.layerId)) return 0;
      return sameXY && Math.abs(deposit.z0 - support.z1) <= EPS
        ? LIFT_RESIST | LIFT_TOPCOAT
        : LIFT_RESIST;
    },
    operation: 'Material Lift-off',
    traceContacts,
    traceClosedTangencies,
  });
  if (requireAllSacrificial) {
    const present = new Set(analysis.pieces.flatMap((p) => p.stack.map((s) => s.layerId)));
    if (ids.some((id) => !present.has(id)))
      throw Error('A selected sacrificial layer has no material.');
  }
  return { ...analysis, sacrificial };
}

export function releaseMaterialComponents(model, analysis, removed, api) {
  const candidate = structuredClone(model);
  candidate.regions = retainedMaterialContactRegions(
    candidate,
    analysis,
    removed,
    api,
    analysis.sacrificial,
  );
  candidate.revision++;
  candidate.processRevision = (candidate.processRevision || 0) + 1;
  return candidate;
}

function witness(model, analysis, component) {
  const n = analysis.nodes[component.nodeIds[0]];
  return {
    material: model.layers.find((l) => l.id === n.layerId)?.name || n.layerId,
    z0: n.z0,
    z1: n.z1,
    xyBounds: n.piece.box,
    fragments: component.nodeIds.length,
  };
}

export function applyMaterialLiftOff(model, params, area, api) {
  if (!validateSacrificial(model, params.sacrificialLayerIds))
    return {
      changed: false,
      error: 'Material Lift-off needs distinct non-base sacrificial layers.',
    };
  if (params.face === 'back' || params.face === 'both')
    return { changed: false, error: 'Material Lift-off requires Front.' };
  if (!isEmpty(difference(model.boundary, area)))
    return { changed: false, error: 'Material Lift-off requires the whole face.' };
  const analysis = analyzeMaterialLiftOff(model, params.sacrificialLayerIds),
    removed = new Set();
  for (const [id, c] of analysis.components) {
    if (c.flags & LIFT_TOPCOAT && c.flags & LIFT_PERMANENT)
      return {
        changed: false,
        error:
          'Material Lift-off found a resist-to-device metal bridge; no material was committed.',
        witness: witness(model, analysis, c),
      };
    if (!(c.flags & (LIFT_RESIST | LIFT_PERMANENT)))
      return {
        changed: false,
        error:
          'Material Lift-off found an unsupported deposited component; no material was committed.',
        witness: witness(model, analysis, c),
      };
    if (!(c.flags & LIFT_PERMANENT)) removed.add(id);
  }
  Object.assign(model, releaseMaterialComponents(model, analysis, removed, api));
  return {
    changed: true,
    sacrificialLayerIds: [...params.sacrificialLayerIds],
    removedComponents: removed.size,
  };
}
