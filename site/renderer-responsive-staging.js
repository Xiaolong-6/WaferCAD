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
