import { isArrayModel } from './model-array.js';

function ringSignature(ring) {
  const integers = ring.map((point) => point.map((n) => Math.round(n * 10000)));
  if (
    integers.some((point, i) =>
      point.some((n, axis) => !Number.isSafeInteger(n) || n / 10000 !== ring[i][axis]),
    )
  )
    return null;
  if (JSON.stringify(integers[0]) === JSON.stringify(integers.at(-1))) integers.pop();
  const corners = integers.filter((p, i) => {
    const a = integers[(i + integers.length - 1) % integers.length],
      b = integers[(i + 1) % integers.length];
    const dx = p[0] - a[0],
      dy = p[1] - a[1],
      ux = b[0] - p[0],
      uy = b[1] - p[1];
    return BigInt(dx) * BigInt(uy) !== BigInt(dy) * BigInt(ux) || dx * ux + dy * uy < 0;
  });
  if (corners.length < 3) return null;
  const rotate = (input) => {
    let start = 0;
    for (let i = 1; i < input.length; i++)
      if (
        input[i][0] < input[start][0] ||
        (input[i][0] === input[start][0] && input[i][1] < input[start][1])
      )
        start = i;
    return JSON.stringify([...input.slice(start), ...input.slice(0, start)]);
  };
  const forward = rotate(corners),
    reverse = rotate([...corners].reverse());
  return forward < reverse ? forward : reverse;
}
function geometrySignature(geometry) {
  const polygons = [];
  for (const polygon of geometry) {
    const rings = polygon.map(ringSignature);
    if (rings.some((ring) => ring === null)) return null;
    polygons.push(JSON.stringify([rings[0], rings.slice(1).sort()]));
  }
  return JSON.stringify(polygons.sort());
}
function signature(model) {
  const { regions, nextRegionId: _counter, boundary, ...metadata } = model;
  const domain = geometrySignature(boundary);
  if (domain === null) return null;
  const pieces = [];
  for (const region of regions) {
    const { id: _id, geom, ...rest } = region;
    const shape = geometrySignature(geom);
    if (shape === null) return null;
    pieces.push(JSON.stringify([rest, shape]));
  }
  return JSON.stringify([metadata, domain, pieces.sort()]);
}

/** Deduplicate equal unannotated physical templates, retaining one original
 * model verbatim. Geometry is never changed: exact collinear nodes and ring
 * ordering are ignored only in the comparison key. Instance IDs and global
 * counters remain unchanged; local region IDs have no external annotations.
 */
export function compactMaterialArrayStorage(model) {
  if (
    !isArrayModel(model) ||
    [model, ...model.array.templates.map((t) => t.model)].some((m) =>
      ['implants', 'electricalRegions', 'dopantRegions'].some((key) => m[key]?.length),
    )
  )
    return { changed: false, reason: 'not an unannotated material array' };
  const referenced = new Set(model.array.instances.map((i) => i.templateId));
  const bySignature = new Map(),
    aliases = new Map(),
    templates = [];
  for (const template of model.array.templates) {
    if (!referenced.has(template.id)) continue;
    const key = signature(template.model);
    const previous = key === null ? null : bySignature.get(key);
    if (previous) aliases.set(template.id, previous);
    else {
      templates.push(template);
      aliases.set(template.id, template.id);
      if (key !== null) bySignature.set(key, template.id);
    }
  }
  const count = (list) =>
    list.reduce((n, t) => n + t.model.regions.reduce((s, r) => s + r.geom.length, 0), 0);
  const report = {
    changed: templates.length !== model.array.templates.length,
    templatesBefore: model.array.templates.length,
    templatesAfter: templates.length,
    polygonsBefore: count(model.array.templates),
    polygonsAfter: count(templates),
  };
  if (report.changed)
    model.array = {
      ...model.array,
      templates,
      instances: model.array.instances.map((i) => ({
        ...i,
        templateId: aliases.get(i.templateId),
      })),
    };
  return report;
}
