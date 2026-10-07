// Storage-only templates. Expansion restores ordinary canonical polygon arrays;
// Process, Main, Section and physical exports never consume approximate geometry.
const GRID = 10_000;
const COORDINATE_LIMIT = 1e9;
const MAX_ITEMS = 250_000;
export const MAX_TEMPLATE_EXPANDED_POINTS = 12_000_000;

function invalid() {
  throw new Error('Project file contains an invalid polygon template dictionary.');
}

function gridCoordinate(value) {
  const units = Math.round(value * GRID);
  return Number.isSafeInteger(units) && Object.is(Number((units / GRID).toFixed(4)), value)
    ? units
    : null;
}

function encodePolygon(polygon) {
  const x = gridCoordinate(polygon[0][0][0]),
    y = gridCoordinate(polygon[0][0][1]);
  if (x == null || y == null) return { template: { raw: polygon }, placement: [] };
  const rings = [];
  for (const ring of polygon) {
    const deltas = [];
    let previousX = x,
      previousY = y;
    for (let i = 0; i < ring.length - 1; i++) {
      const px = gridCoordinate(ring[i][0]),
        py = gridCoordinate(ring[i][1]);
      if (px == null || py == null) return { template: { raw: polygon }, placement: [] };
      deltas.push(px - previousX, py - previousY);
      previousX = px;
      previousY = py;
    }
    rings.push(deltas);
  }
  return { template: { rings }, placement: [x, y] };
}

export function compactGeometryDictionary(project) {
  const source = project.sharedGeometries;
  const templates = [],
    byContent = new Map(),
    byIdentity = new WeakMap();
  let expandedPoints = 0;
  const placements = source.map((geometry) =>
    geometry.map((polygon) => {
      const known = byIdentity.get(polygon);
      if (known) return known;
      const { template, placement } = encodePolygon(polygon),
        // Workspace packing distinguishes -0 from +0 even in raw sub-grid polygons.
        key = template.raw
          ? JSON.stringify(template, (_key, value) => (Object.is(value, -0) ? '-0' : value))
          : JSON.stringify(template);
      let ref = byContent.get(key);
      if (ref === undefined) {
        ref = templates.length;
        templates.push(template);
        byContent.set(key, ref);
      }
      const entry = [ref, ...placement];
      byIdentity.set(polygon, entry);
      expandedPoints += polygon.reduce((sum, ring) => sum + ring.length, 0);
      return entry;
    }),
  );
  if (templates.length > MAX_ITEMS || expandedPoints > MAX_TEMPLATE_EXPANDED_POINTS) return false;
  const beforeBytes = JSON.stringify(source).length,
    afterBytes = JSON.stringify(placements).length + JSON.stringify(templates).length + 64;
  // Small/non-repetitive projects retain v2 and pay no extra decoding cost.
  if (beforeBytes - afterBytes < 2048 || afterBytes > beforeBytes * 0.85) return false;
  project.sharedGeometries = placements;
  project.sharedPolygonTemplates = templates;
  return true;
}

function validateTemplate(template) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) invalid();
  if (Object.hasOwn(template, 'raw')) {
    if (Object.hasOwn(template, 'rings') || !Array.isArray(template.raw)) invalid();
    if (!template.raw.length || template.raw.length > MAX_ITEMS) invalid();
    for (const ring of template.raw) {
      if (!Array.isArray(ring) || ring.length < 4 || ring.length > MAX_TEMPLATE_EXPANDED_POINTS)
        invalid();
      for (const point of ring) {
        if (
          !Array.isArray(point) ||
          point.length !== 2 ||
          point.some((v) => !Number.isFinite(v) || Math.abs(v) > COORDINATE_LIMIT)
        )
          invalid();
      }
      const first = ring[0],
        last = ring.at(-1);
      if (first[0] !== last[0] || first[1] !== last[1]) invalid();
    }
    return template.raw.reduce((sum, ring) => sum + ring.length, 0);
  }
  if (!Array.isArray(template.rings) || !template.rings.length || template.rings.length > MAX_ITEMS)
    invalid();
  let count = 0;
  for (const ring of template.rings) {
    if (
      !Array.isArray(ring) ||
      ring.length < 6 ||
      ring.length % 2 ||
      ring.length > MAX_TEMPLATE_EXPANDED_POINTS * 2 ||
      ring.some((v) => !Number.isSafeInteger(v))
    )
      invalid();
    count += ring.length / 2 + 1;
  }
  return count;
}

function placementKey(entry, templates) {
  if (!Array.isArray(entry) || !Number.isInteger(entry[0])) invalid();
  const [ref, x, y] = entry,
    template = templates[ref];
  if (!template || ref < 0 || ref >= templates.length) invalid();
  if (entry.length !== (template.raw ? 1 : 3)) invalid();
  if (
    !template.raw &&
    (![x, y].every(Number.isSafeInteger) ||
      Math.abs(x) > COORDINATE_LIMIT * GRID ||
      Math.abs(y) > COORDINATE_LIMIT * GRID)
  )
    invalid();
  return entry.join('|');
}

export function expandGeometryDictionary(project) {
  const templates = project.sharedPolygonTemplates,
    placements = project.sharedGeometries;
  if (
    !Array.isArray(templates) ||
    templates.length > MAX_ITEMS ||
    !Array.isArray(placements) ||
    placements.length > MAX_ITEMS
  )
    invalid();
  const costs = templates.map(validateTemplate),
    used = new Map();
  let expandedPoints = 0;
  // Preflight every reference and the unique expansion cost before allocating
  // any translated point arrays. Repeated placements share one restored polygon.
  for (const geometry of placements) {
    if (!Array.isArray(geometry) || geometry.length > MAX_ITEMS) invalid();
    for (const entry of geometry) {
      const key = placementKey(entry, templates);
      if (used.has(key)) continue;
      expandedPoints += costs[entry[0]];
      if (expandedPoints > MAX_TEMPLATE_EXPANDED_POINTS)
        throw new Error('Project polygon templates exceed the expanded geometry point limit.');
      used.set(key, { entry, polygon: null });
    }
  }
  project.sharedGeometries = placements.map((geometry) =>
    geometry.map((entry) => {
      const record = used.get(entry.join('|'));
      if (record.polygon) return record.polygon;
      const [ref, x, y] = record.entry,
        template = templates[ref];
      record.polygon =
        template.raw ||
        template.rings.map((deltas) => {
          const ring = [];
          let px = x,
            py = y;
          for (let i = 0; i < deltas.length; i += 2) {
            px += deltas[i];
            py += deltas[i + 1];
            if (
              !Number.isSafeInteger(px) ||
              !Number.isSafeInteger(py) ||
              Math.abs(px) > COORDINATE_LIMIT * GRID ||
              Math.abs(py) > COORDINATE_LIMIT * GRID
            )
              invalid();
            ring.push([Number((px / GRID).toFixed(4)), Number((py / GRID).toFixed(4))]);
          }
          ring.push([...ring[0]]);
          return ring;
        });
      return record.polygon;
    }),
  );
  delete project.sharedPolygonTemplates;
}
