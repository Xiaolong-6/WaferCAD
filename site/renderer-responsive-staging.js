// Display-only staging / revision helpers. No scientific model mutation.
export class SupersededRendererBuild extends Error {
  constructor() {
    super('A newer 3D model, ROI, or inspection request superseded this build');
    this.name = 'SupersededRendererBuild';
  }
}

export function shouldStageRendererScene({
  enabled = false,
  hasCommittedGroup = false,
  hasPresentation = false,
  variant = null,
} = {}) {
  return (
    enabled === true &&
    hasCommittedGroup === true &&
    hasPresentation === true &&
    (variant === 'opaque' || variant === 'transparent')
  );
}

export function isRendererBuildSuperseded({
  pending = false,
  originalModel = null,
  currentModel = null,
  originalSignature = '',
  currentSignature = '',
  originalVariant = '',
  currentVariant = '',
} = {}) {
  return (
    pending === true &&
    (originalModel !== currentModel ||
      originalSignature !== currentSignature ||
      originalVariant !== currentVariant)
  );
}

// Preview may omit costly internal display surfaces only while the camera
// is actively manipulated. Never omit exposed material geometry or ROI cuts.
const INTERACTION_PREVIEW_HIDDEN_KINDS = new Set([
  'material-interface',
  'electrical-internal',
  'electrical-depth',
  'implant-internal',
  'implant-depth',
]);

export function shouldHideRendererPreviewMesh({
  enabled = false,
  sceneVariant = null,
  arrayInstances = 0,
  kind = null,
  visible = false,
  hasRoi = false,
} = {}) {
  return (
    enabled === true &&
    sceneVariant === 'transparent' &&
    !hasRoi &&
    Number.isFinite(Number(arrayInstances)) &&
    Number(arrayInstances) >= 64 &&
    visible === true &&
    INTERACTION_PREVIEW_HIDDEN_KINDS.has(kind)
  );
}


// Exact export is intentionally independent from the approximate interaction
// preview. The presenter may prepare rough detail on demand, but cannot
// capture a stale, uncommitted, superseded, or context-lost main scene.
export function assertRendererExactCaptureReady({
  rendererReady = false,
  contextStatus = 'uninitialized',
  assembling = false,
  hasCommittedGroup = false,
  stale = false,
  modelMatches = false,
  signatureMatches = false,
  variantMatches = false,
} = {}) {
  if (!rendererReady || contextStatus !== 'ready')
    throw new Error('Exact 3D export requires a ready WebGL renderer.');
  if (
    assembling ||
    !hasCommittedGroup ||
    stale ||
    !modelMatches ||
    !signatureMatches ||
    !variantMatches
  )
    throw new Error('Exact 3D model is still building or outdated; cannot export preview.');
}
