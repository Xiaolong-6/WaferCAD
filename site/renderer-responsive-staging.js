// Display-only staging / revision helpers. No scientific model mutation.
export class SupersededRendererBuild extends Error {
  constructor() {
    super('A newer 3D model, ROI, or inspection request superseded this build');
    this.name = 'SupersededRendererBuild';
  }
}

export function shouldStageRendererScene({ enabled = false, hasCommittedGroup = false, hasPresentation = false, variant = null } = {}) {
  return enabled === true && hasCommittedGroup === true && hasPresentation === true &&
    (variant === 'opaque' || variant === 'transparent');
}

export function isRendererBuildSuperseded({ pending = false, originalModel = null, currentModel = null, originalSignature = '', currentSignature = '', originalVariant = '', currentVariant = '' } = {}) {
  return pending === true && (
    originalModel !== currentModel || originalSignature !== currentSignature || originalVariant !== currentVariant
  );
}
