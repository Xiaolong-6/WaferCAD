// Hardware acceptance must never treat two missing or malformed model hashes
// as successful scientific persistence. Hashing is computed independently
// on each page; the layer count rejects empty/unloaded model placeholders.
const MODEL_SHA256 = /^[0-9a-f]{64}$/;

export function hasVerifiedScientificModel(sample) {
  return Boolean(
    sample &&
    typeof sample.modelHash === 'string' &&
    MODEL_SHA256.test(sample.modelHash) &&
    Number.isSafeInteger(sample.modelLayerCount) &&
    sample.modelLayerCount > 0,
  );
}

export function sameVerifiedScientificModel(before, after) {
  return Boolean(
    hasVerifiedScientificModel(before) &&
    hasVerifiedScientificModel(after) &&
    before.modelHash === after.modelHash &&
    before.modelLayerCount === after.modelLayerCount,
  );
}
