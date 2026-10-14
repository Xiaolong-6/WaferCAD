// Kernel stack normalization currently drops material segments at or below
// this Z increment. This is a NUMERICAL representation limit in micrometres,
// never a universal physical minimum film thickness or a deposition recipe rule.
export const MIN_RESOLVABLE_MATERIAL_SEGMENT_UM = 1e-9;

export function validateMaterialThicknessUm(value, label = 'Material thickness') {
  if (!Number.isFinite(value) || value <= 0) {
    return `${label} must be finite and greater than zero.`;
  }
  if (value <= MIN_RESOLVABLE_MATERIAL_SEGMENT_UM) {
    return `${label} cannot be represented as a nonzero material Z segment by this kernel.`;
  }
  return null;
}
