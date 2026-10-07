export function createDerivedDataCache() {
  const entries = new WeakMap();
  let hits = 0;
  let misses = 0;

  function get(source, variant, create) {
    if (!source || (typeof source !== 'object' && typeof source !== 'function')) {
      misses++;
      return create();
    }
    let variants = entries.get(source);
    if (!variants) {
      variants = new Map();
      entries.set(source, variants);
    }
    const key = String(variant);
    if (variants.has(key)) {
      hits++;
      return variants.get(key);
    }
    const value = create();
    variants.set(key, value);
    misses++;
    return value;
  }

  function stats() {
    return { hits, misses };
  }

  return { get, stats };
}
