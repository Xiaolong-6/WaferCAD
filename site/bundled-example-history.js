const EDITABLE_PROCESS_KINDS = new Set(['add', 'grow', 'etch', 'implant', 'electrical']);
const REPLAY_AREA_MODES = new Set(['full', 'mask', 'invert']);

function normalizedAreaMode(value) {
  if (value === 'mask-inverted') return 'invert';
  return REPLAY_AREA_MODES.has(value) ? value : 'full';
}

function legacyReplayDescriptor(operation) {
  const kind = operation?.kind;
  if (kind === 'record') return { version: 1, kind: 'record' };
  if (!EDITABLE_PROCESS_KINDS.has(kind)) return null;

  const thickness = Number(operation.thickness),
    face = operation.face;
  if (!(thickness > 0) || !['front', 'back'].includes(face)) return null;

  const params = {
    type: kind,
    name: String(operation.name || ''),
    targetLayerId: kind === 'grow' ? operation.targetLayerId || '' : '',
    thickness,
    face,
  };

  if (kind === 'etch') {
    params.surface = operation.surface ? structuredClone(operation.surface) : null;
    params.etchProfile =
      operation.etchProfile === 'isotropic' || operation.profile === 'isotropic-release'
        ? 'isotropic'
        : 'directional';
    params.etchTargetLayerIds = Array.isArray(operation.etchTargetLayerIds)
      ? [...operation.etchTargetLayerIds]
      : operation.targetLayerId
        ? [operation.targetLayerId]
        : [];
  } else if (kind === 'implant') {
    if (!params.name) return null;
    const tilt = Number(operation.implantTilt);
    params.tilt = Number.isFinite(tilt) ? tilt : 0;
  } else if (kind === 'electrical') {
    if (!params.name || !operation.electricalRegionType || !operation.electricalRegionSource) {
      return null;
    }
    params.electricalRegionType = operation.electricalRegionType;
    params.electricalRegionSource = operation.electricalRegionSource;
  } else {
    if (kind === 'add' && !params.name) return null;
    if (kind === 'grow' && !params.targetLayerId) return null;
    params.growth = operation.growth === 'conformal' ? 'conformal' : 'direct';
  }

  return {
    version: 1,
    params,
    areaMode: normalizedAreaMode(operation.areaMode),
  };
}

export function upgradeBundledExampleHistory(project) {
  const nodes = project?.snapshotBranches?.nodes;
  if (!Array.isArray(nodes)) return { upgraded: 0, unsupported: [] };

  let upgraded = 0;
  const unsupported = [];

  for (const node of nodes) {
    const operation = node?.operation;
    if (!operation || operation.replay?.version === 1) continue;

    const replay = legacyReplayDescriptor(operation);
    if (replay) {
      operation.replay = replay;
      upgraded += 1;
    } else if (operation.kind !== 'base') {
      unsupported.push({
        id: node.id || null,
        kind: operation.kind || null,
        label: operation.label || null,
      });
    }
  }

  if (unsupported.length) {
    const labels = unsupported
      .slice(0, 3)
      .map((item) => item.label || item.id || item.kind || 'unknown Step')
      .join('; ');
    throw new Error(
      `Bundled example contains ${unsupported.length} Step(s) that cannot be upgraded for deterministic editing: ${labels}`,
    );
  }

  return { upgraded, unsupported };
}
