const DEFAULT_QUANTUM_UM = 1e-4;

function snap(value, quantum = DEFAULT_QUANTUM_UM) {
  const q = Math.max(1e-12, Number(quantum) || DEFAULT_QUANTUM_UM);
  const rounded = Math.round(Number(value) / q) * q;
  return Object.is(rounded, -0) ? 0 : Number(rounded.toPrecision(15));
}

function samePoint(a, b, tolerance = 1e-12) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    Math.abs(Number(a[0]) - Number(b[0])) <= tolerance &&
    Math.abs(Number(a[1]) - Number(b[1])) <= tolerance
  );
}

function openRing(ring) {
  const points = (ring || [])
    .map((point) => [Number(point?.[0]), Number(point?.[1])])
    .filter((point) => point.every(Number.isFinite));
  if (points.length > 1 && samePoint(points[0], points.at(-1))) points.pop();
  return points;
}

// Booth's minimum cyclic rotation on delimiter-terminated tokens. Comparing
// token + ';' is essential: raw token order can differ from the order of the
// joined signature when one numeric token is a prefix of another.
function minimalRingRotation(tokens) {
  const length = tokens.length;
  if (!length) return '';
  const units = tokens.map((token) => `${token};`);
  let left = 0,
    right = 1,
    offset = 0;
  while (left < length && right < length && offset < length) {
    const a = units[(left + offset) % length],
      b = units[(right + offset) % length];
    if (a === b) {
      offset++;
      continue;
    }
    if (a > b) {
      left += offset + 1;
      if (left <= right) left = right + 1;
    } else {
      right += offset + 1;
      if (right <= left) right = left + 1;
    }
    offset = 0;
  }
  const start = Math.min(left, right) % length;
  return tokens.slice(start).concat(tokens.slice(0, start)).join(';');
}

export function ringKey(points, quantum) {
  if (!points.length) return '';
  const tokens = points.map(([x, y]) => `${snap(x, quantum)},${snap(y, quantum)}`);
  const forward = minimalRingRotation(tokens),
    reverse = minimalRingRotation([...tokens].reverse());
  return forward <= reverse ? forward : reverse;
}

function polygonBounds(poly) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const ring of poly || []) {
    for (const [x, y] of ring || []) {
      minX = Math.min(minX, Number(x));
      minY = Math.min(minY, Number(y));
      maxX = Math.max(maxX, Number(x));
      maxY = Math.max(maxY, Number(y));
    }
  }
  return [minX, minY, maxX, maxY].every(Number.isFinite) ? { minX, minY, maxX, maxY } : null;
}

function translatedPolygonRecord(poly, quantum) {
  const bounds = polygonBounds(poly);
  if (!bounds) return null;
  const tx = snap(bounds.minX, quantum),
    ty = snap(bounds.minY, quantum),
    local = (poly || []).map((ring) => {
      const points = openRing(ring).map(([x, y]) => [snap(x - tx, quantum), snap(y - ty, quantum)]);
      if (points.length) points.push([...points[0]]);
      return points;
    });
  if (!local[0]?.length) return null;

  const outer = ringKey(openRing(local[0]), quantum),
    holes = local
      .slice(1)
      .map((ring) => ringKey(openRing(ring), quantum))
      .filter(Boolean)
      .sort(),
    signature = [outer, ...holes].join('|');

  return {
    signature,
    translation: [tx, ty],
    localPoly: local,
  };
}

export function translatedPolygonInstanceGroups(
  polys,
  { minInstances = 8, quantum = DEFAULT_QUANTUM_UM } = {},
) {
  const threshold = Math.max(2, Math.floor(Number(minInstances) || 8)),
    buckets = new Map(),
    leftovers = [];

  for (const poly of polys || []) {
    const record = translatedPolygonRecord(poly, quantum);
    if (!record) {
      leftovers.push(poly);
      continue;
    }
    if (!buckets.has(record.signature)) {
      buckets.set(record.signature, {
        localPoly: record.localPoly,
        translations: [],
        originals: [],
      });
    }
    const bucket = buckets.get(record.signature);
    bucket.translations.push(record.translation);
    bucket.originals.push(poly);
  }

  const groups = [];
  for (const bucket of buckets.values()) {
    if (bucket.translations.length >= threshold) {
      groups.push({
        localPoly: bucket.localPoly,
        translations: bucket.translations,
      });
    } else {
      leftovers.push(...bucket.originals);
    }
  }

  groups.sort((a, b) => b.translations.length - a.translations.length);
  return {
    groups,
    leftovers,
    instanceCount: groups.reduce((sum, group) => sum + group.translations.length, 0),
  };
}

export function translatedSidewallInstanceGroups(
  parts,
  { minInstances = 8, quantum = DEFAULT_QUANTUM_UM } = {},
) {
  const threshold = Math.max(2, Math.floor(Number(minInstances) || 8)),
    buckets = new Map(),
    leftovers = [];
  // Per-call, bounded memo: the snap is pure and quantum fixed. Real wafer
  // arrays reuse XY positions, edge deltas, and Z spans across many sidewalls.
  const snapped = new Map();
  let checked = 0;
  let hits = 0;
  let memoEnabled = true;
  const reuseSnap = (value) => {
    if (!memoEnabled) return snap(value, quantum);
    // Stop paying lookup costs on high-cardinality non-array meshes.
    // Only the work strategy changes; snap() itself remains authoritative.
    checked++;
    if (checked === 4096 && hits * 100 < checked * 45) {
      memoEnabled = false;
      snapped.clear();
      return snap(value, quantum);
    }
    const key = Number(value);
    if (snapped.has(key)) {
      hits++;
      return snapped.get(key);
    }
    const quantized = snap(value, quantum);
    if (snapped.size < 2048) snapped.set(key, quantized);
    return quantized;
  };

  for (const part of parts || []) {
    const p = part?.p,
      q = part?.q,
      z0 = Number(part?.z0),
      z1 = Number(part?.z1),
      hasAppearance = Boolean(part?.lowerSurface || part?.upperSurface),
      hasAnnotationDepth =
        Number.isFinite(Number(part?.lowerDepth)) || Number.isFinite(Number(part?.upperDepth));
    if (
      hasAppearance ||
      hasAnnotationDepth ||
      !Array.isArray(p) ||
      !Array.isArray(q) ||
      ![p[0], p[1], q[0], q[1], z0, z1].every((value) => Number.isFinite(Number(value)))
    ) {
      leftovers.push(part);
      continue;
    }

    const tx = reuseSnap(p[0]),
      ty = reuseSnap(p[1]),
      dx = reuseSnap(Number(q[0]) - Number(p[0])),
      dy = reuseSnap(Number(q[1]) - Number(p[1])),
      localZ0 = reuseSnap(z0),
      localZ1 = reuseSnap(z1);
    if (Math.hypot(dx, dy) <= 1e-12 || Math.abs(localZ1 - localZ0) <= 1e-12) {
      leftovers.push(part);
      continue;
    }

    const signature = `${dx},${dy}|${localZ0},${localZ1}`;
    if (!buckets.has(signature)) {
      buckets.set(signature, {
        template: {
          ...part,
          p: [0, 0],
          q: [dx, dy],
          z0: localZ0,
          z1: localZ1,
        },
        translations: [],
        originals: [],
      });
    }
    const bucket = buckets.get(signature);
    bucket.translations.push([tx, ty]);
    bucket.originals.push(part);
  }

  const groups = [];
  for (const bucket of buckets.values()) {
    if (bucket.translations.length >= threshold) {
      groups.push({
        template: bucket.template,
        translations: bucket.translations,
      });
    } else {
      leftovers.push(...bucket.originals);
    }
  }

  groups.sort((a, b) => b.translations.length - a.translations.length);
  return {
    groups,
    leftovers,
    instanceCount: groups.reduce((sum, group) => sum + group.translations.length, 0),
  };
}

export function spatialInstanceChunks(translations, { maxInstances = 64 } = {}) {
  const limit = Math.max(1, Math.floor(Number(maxInstances) || 64)),
    points = (translations || [])
      .map((point) => [Number(point?.[0]), Number(point?.[1])])
      .filter((point) => point.every(Number.isFinite))
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]),
    chunks = [];
  for (let index = 0; index < points.length; index += limit) {
    chunks.push(points.slice(index, index + limit));
  }
  return chunks;
}
