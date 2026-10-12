// Compare complete values and own enumerable keys, without expanding shared
// geometry repeatedly. The memo lives only for this synchronous batch: live
// edits between calls must always be observed, even without a revision bump.
export function equalStatePairs(pairs) {
  let firstPartners = new WeakMap();
  let otherPartners = new WeakMap();

  function equal(left, right) {
    const pending = [[left, right]];
    while (pending.length) {
      const [a, b] = pending.pop();
      if (Object.is(a, b)) continue;
      if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      if (Array.isArray(a) && a.length !== b.length) return false;

      // Canonical XY pairs dominate large masks. Compare their scalar values
      // directly instead of allocating traversal pairs and memo entries for
      // every coordinate. Extra enumerable keys still invalidate the proof.
      if (
        Array.isArray(a) &&
        a.length === 2 &&
        typeof a[0] === 'number' &&
        typeof a[1] === 'number'
      ) {
        if (!Object.is(a[0], b[0]) || !Object.is(a[1], b[1])) return false;
        if (
          Object.hasOwn(a, 0) &&
          Object.hasOwn(a, 1) &&
          Object.hasOwn(b, 0) &&
          Object.hasOwn(b, 1) &&
          Object.keys(a).length === 2 &&
          Object.keys(b).length === 2
        )
          continue;
      }

      const first = firstPartners.get(a);
      if (first === b || otherPartners.get(a)?.has(b)) continue;
      if (!first) firstPartners.set(a, b);
      else {
        let others = otherPartners.get(a);
        if (!others) otherPartners.set(a, (others = new WeakSet()));
        others.add(b);
      }

      const keys = Object.keys(a);
      if (keys.length !== Object.keys(b).length) return false;
      for (const key of keys) {
        if (!Object.hasOwn(b, key)) return false;
        pending.push([a[key], b[key]]);
      }
    }
    return true;
  }

  return pairs.map(([left, right]) => {
    const result = equal(left, right);
    // A failed traversal may have left unfinished pairs in the memo. They
    // cannot prove equality for another state in the same batch.
    if (!result) {
      firstPartners = new WeakMap();
      otherPartners = new WeakMap();
    }
    return result;
  });
}

export function stateValuesEqual(left, right) {
  return equalStatePairs([[left, right]])[0];
}
