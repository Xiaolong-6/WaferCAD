/**
 * Qualitative dopant-region semantics; never represents N_D/N_A concentrations.
 *
 * A region is a logical implant/well intent projected onto *existing* host
 * material. Resolving against the current model is essential: subsequent
 * etches and voids may remove the material that originally carried doping.
 * No electrical current, diffusion, activation or BTBT is inferred.
 */
const POLARITIES = new Set(['donor', 'acceptor']);
const ROLES = new Set(['well', 'body', 'source-drain', 'channel', 'contact']);
const validNumber = (value) => typeof value === 'number' && Number.isFinite(value);

export function addQualitativeDopantRegion(model, spec, vectorApi) {
  const id = String(spec?.id ?? '');
  const hostLayerId = String(spec?.hostLayerId ?? '');
  const area = spec?.area;
  const start = spec?.depthStartUm;
  const end = spec?.depthEndUm;
  const sourceZ = spec?.sourceZ;
  if (!id || id.length > 128 || (model.dopantRegions || []).some((r) => r.id === id)) {
    return { changed: false, error: 'Dopant Region requires a unique, nonempty ID.' };
  }
  if (
    !POLARITIES.has(spec?.polarity) ||
    !ROLES.has(spec?.role) ||
    !['front', 'back'].includes(spec?.face)
  ) {
    return { changed: false, error: 'Unsupported dopant polarity, role or face.' };
  }
  if (
    !validNumber(sourceZ) ||
    !validNumber(start) ||
    !validNumber(end) ||
    start < 0 ||
    end <= start
  ) {
    return { changed: false, error: 'Dopant depth must be finite with 0 <= start < end.' };
  }
  if (
    !model.layers?.some((layer) => layer.id === hostLayerId) ||
    !Array.isArray(area) ||
    !area.length
  ) {
    return {
      changed: false,
      error: 'Dopant region requires a nonempty mask and valid host layer.',
    };
  }
  const field = {
    id,
    name: String(spec.name || id),
    polarity: spec.polarity,
    role: spec.role,
    face: spec.face,
    hostLayerId,
    area: structuredClone(area),
    sourceZ,
    depthStartUm: start,
    depthEndUm: end,
    profile: { kind: 'qualitative-interval' },
    ...(spec.sourceImplantId ? { sourceImplantId: spec.sourceImplantId } : {}),
    provenance: String(spec.provenance || 'illustrative'),
  };
  const fragments = resolveQualitativeDopantRegion(model, field, vectorApi);
  if (!fragments.length) {
    return { changed: false, error: 'No surviving host material overlaps the dopant interval.' };
  }
  model.dopantRegions ||= [];
  model.dopantRegions.push(field);
  model.revision++;
  return { changed: true, id, fragmentCount: fragments.length };
}

/**
 * Return a material-clipped qualitative region, recalculated for current model
 * topology. The input area and depth intent are never changed by this call.
 */
export function resolveQualitativeDopantRegion(model, dopant, vectorApi) {
  if (!dopant || dopant.profile?.kind !== 'qualitative-interval') return [];
  const face = dopant.face === 'back' ? 'back' : 'front';
  const z0 =
    face === 'front' ? dopant.sourceZ - dopant.depthEndUm : dopant.sourceZ + dopant.depthStartUm;
  const z1 =
    face === 'front' ? dopant.sourceZ - dopant.depthStartUm : dopant.sourceZ + dopant.depthEndUm;
  const out = [];
  for (const region of model.regions || []) {
    const segments = (region.stack || []).filter(
      (segment) =>
        segment.layerId === dopant.hostLayerId &&
        Math.min(z1, segment.z1) > Math.max(z0, segment.z0) + 1e-12,
    );
    if (!segments.length) continue;
    const area = vectorApi.intersection(region.geom, dopant.area);
    if (vectorApi.isEmpty(area)) continue;
    for (const segment of segments) {
      const low = Math.max(z0, segment.z0);
      const high = Math.min(z1, segment.z1);
      if (high > low + 1e-12) {
        out.push({
          dopantRegionId: dopant.id,
          polarity: dopant.polarity,
          role: dopant.role,
          hostLayerId: dopant.hostLayerId,
          geom: area,
          z0: low,
          z1: high,
        });
      }
    }
  }
  return out;
}

export function resolveQualitativeDopantRegions(model, vectorApi) {
  return (model.dopantRegions || []).flatMap((dopant) =>
    resolveQualitativeDopantRegion(model, dopant, vectorApi),
  );
}

/**
 * Qualitative opposite-polarity overlap diagnostic. Neither depletion width
 * nor a conducting junction is asserted by a nonempty result.
 */
export function findDopantPolarityOverlaps(model, vectorApi) {
  const fragments = resolveQualitativeDopantRegions(model, vectorApi);
  const overlaps = [];
  for (let i = 0; i < fragments.length; i++) {
    for (let j = i + 1; j < fragments.length; j++) {
      const a = fragments[i],
        b = fragments[j];
      if (a.polarity === b.polarity || a.hostLayerId !== b.hostLayerId) continue;
      const lo = Math.max(a.z0, b.z0),
        hi = Math.min(a.z1, b.z1);
      if (hi <= lo + 1e-12) continue;
      const xy = vectorApi.intersection(a.geom, b.geom);
      if (vectorApi.isEmpty(xy)) continue;
      overlaps.push({
        ids: [a.dopantRegionId, b.dopantRegionId],
        z0: lo,
        z1: hi,
        geom: xy,
      });
    }
  }
  return overlaps;
}

/**
 * Attribute *qualitative* opposite-polarity body/source-drain co-occupancy
 * to caller-supplied terminal footprints. A foundry terminal cannot be
 * identified from shared S/D doping alone: callers must provide its geometry.
 * The result is not a PN interface, activation profile, depletion region,
 * or BTBT conduction path.
 */
export function findTerminalQualifiedDopantOverlaps(model, terminals, vectorApi) {
  const byId = new Map((model.dopantRegions || []).map((region) => [region.id, region]));
  const bodySourceDrain = findDopantPolarityOverlaps(model, vectorApi).filter((overlap) => {
    const roles = overlap.ids.map((id) => byId.get(id)?.role);
    return roles.includes('body') && roles.includes('source-drain');
  });
  const qualified = [];
  for (const terminal of terminals || []) {
    if (
      !terminal ||
      !['source', 'drain'].includes(terminal.kind) ||
      !Array.isArray(terminal.geom) ||
      vectorApi.isEmpty(terminal.geom)
    ) {
      continue;
    }
    for (const overlap of bodySourceDrain) {
      const geom = vectorApi.intersection(overlap.geom, terminal.geom);
      if (vectorApi.isEmpty(geom)) continue;
      qualified.push({
        terminalId: String(terminal.id),
        kind: terminal.kind,
        ids: overlap.ids,
        z0: overlap.z0,
        z1: overlap.z1,
        geom,
      });
    }
  }
  return qualified;
}
