// Observational draw-checkpoint GL state, not proof of raster causality.
// Comparable GL enum/boolean/float values only; never compare GPU object IDs.
export const RENDERER_RASTER_STATE_FIELDS = Object.freeze([
  'viewport',
  'scissorBox',
  'scissorTest',
  'blend',
  'blendSrcRgb',
  'blendDstRgb',
  'blendSrcAlpha',
  'blendDstAlpha',
  'blendEquationRgb',
  'blendEquationAlpha',
  'blendColor',
  'colorMask',
  'depthTest',
  'depthMask',
  'depthFunc',
  'depthRange',
  'stencilTest',
  'cullFace',
  'cullFaceMode',
  'frontFace',
  'dither',
  'polygonOffsetFill',
  'polygonOffsetFactor',
  'polygonOffsetUnits',
  'sampleAlphaToCoverage',
  'sampleCoverage',
  'sampleCoverageValue',
  'sampleCoverageInvert',
  'samples',
]);

const ARRAY_LENGTHS = {
  viewport: 4,
  scissorBox: 4,
  blendColor: 4,
  colorMask: 4,
  depthRange: 2,
};
const BOOLEAN_FIELDS = new Set([
  'scissorTest',
  'blend',
  'depthTest',
  'depthMask',
  'stencilTest',
  'cullFace',
  'dither',
  'polygonOffsetFill',
  'sampleAlphaToCoverage',
  'sampleCoverage',
  'sampleCoverageInvert',
]);

export function validRendererRasterState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  return RENDERER_RASTER_STATE_FIELDS.every((field) => {
    if (!Object.hasOwn(state, field)) return false;
    const value = state[field];
    if (Object.hasOwn(ARRAY_LENGTHS, field)) {
      if (!Array.isArray(value) || value.length !== ARRAY_LENGTHS[field]) return false;
      return value.every((item) =>
        field === 'colorMask'
          ? typeof item === 'boolean'
          : typeof item === 'number' && Number.isFinite(item),
      );
    }
    if (BOOLEAN_FIELDS.has(field)) return typeof value === 'boolean';
    return typeof value === 'number' && Number.isFinite(value);
  });
}

export function compareRendererRasterStateEvidence(left, right) {
  const a = left?.phaseCheckpoints;
  const b = right?.phaseCheckpoints;
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) {
    return { status: 'not-captured', firstDifferentState: null };
  }
  if (a.length !== b.length || a.some((checkpoint, i) => checkpoint.afterDraw !== b[i].afterDraw)) {
    return { status: 'sequence-mismatch', firstDifferentState: null };
  }
  if ([...a, ...b].some((checkpoint) => !validRendererRasterState(checkpoint.rasterState))) {
    return { status: 'invalid-raster-state', firstDifferentState: null };
  }
  const index = a.findIndex((checkpoint, i) =>
    RENDERER_RASTER_STATE_FIELDS.some(
      (field) =>
        JSON.stringify(checkpoint.rasterState[field]) !== JSON.stringify(b[i].rasterState[field]),
    ),
  );
  if (index < 0) return { status: 'sampled-states-identical', firstDifferentState: null };
  const fields = RENDERER_RASTER_STATE_FIELDS.filter(
    (field) =>
      JSON.stringify(a[index].rasterState[field]) !== JSON.stringify(b[index].rasterState[field]),
  );
  return {
    status: 'sampled-state-mismatch',
    firstDifferentState: {
      index,
      afterDraw: a[index].afterDraw,
      fields,
      left: Object.fromEntries(fields.map((field) => [field, a[index].rasterState[field]])),
      right: Object.fromEntries(fields.map((field) => [field, b[index].rasterState[field]])),
    },
  };
}
