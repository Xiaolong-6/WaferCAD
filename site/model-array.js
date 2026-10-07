import { robustIntersection } from './polygon-boolean.js';

// Canonical, translation-only model instances. This record survives workers,
// History and JSON; derived views never replace the stored template geometry.
export const ARRAY_MODEL_KERNEL = 'vector-2.5d-array-v1';
export const MAX_ARRAY_INSTANCES = 10000;
export const MAX_ARRAY_TEMPLATES = 2048;
export const MAX_ARRAY_RESOLVED_POINTS = 3000000;
export const isArrayModel = (model) => model?.kernel === ARRAY_MODEL_KERNEL;

export function geometryBounds(geometry) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const polygon of geometry || [])
    for (const ring of polygon || [])
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
export function boundsOverlap(a, b, touch = false) {
  return touch
    ? a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY
    : a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}
export function shiftedBounds(bounds, x, y) {
  return {
    ...bounds,
    minX: bounds.minX + x,
    maxX: bounds.maxX + x,
    minY: bounds.minY + y,
    maxY: bounds.maxY + y,
  };
}
function shiftedCoordinate(value, delta) {
  const a = Math.round(value * 10000),
    b = Math.round(delta * 10000);
  return Number.isSafeInteger(a) &&
    Number.isSafeInteger(b) &&
    Object.is(Number((a / 10000).toFixed(4)), value) &&
    Object.is(Number((b / 10000).toFixed(4)), delta)
    ? Number(((a + b) / 10000).toFixed(4))
    : value + delta;
}
export function translateGeometry(geometry, x, y) {
  return geometry.map((p) =>
    p.map((r) => r.map(([a, b]) => [shiftedCoordinate(a, x), shiftedCoordinate(b, y)])),
  );
}
export function geometryPointCount(geometry) {
  return (geometry || []).reduce((n, p) => n + p.reduce((m, r) => m + r.length, 0), 0);
}
export function storedModelParts(model) {
  return [model, ...(isArrayModel(model) ? model.array.templates.map((t) => t.model) : [])];
}
export function referencedModelParts(model) {
  if (!isArrayModel(model)) return [model];
  const ids = new Set(model.array.instances.map((i) => i.templateId));
  return model.array.templates.filter((t) => ids.has(t.id)).map((t) => t.model);
}

const partCache = new WeakMap();
export function arrayParts(model, queryBounds = null, { touch = false } = {}) {
  if (!isArrayModel(model))
    return [{ model, x: 0, y: 0, id: 'root', bounds: geometryBounds(model.boundary) }];
  let entry = partCache.get(model);
  const signature = JSON.stringify([
    model.revision,
    model.processRevision,
    model.layers,
    ...(model.implants || []).map(({ patches, ...a }) => a),
    ...(model.electricalRegions || []).map(({ patches, ...a }) => a),
  ]);
  if (
    !entry ||
    entry.signature !== signature ||
    entry.templates !== model.array.templates ||
    entry.instances !== model.array.instances
  ) {
    const definitions = new Map(model.array.templates.map((t) => [t.id, t.model]));
    const leaves = new Map();
    const annotations = (local, key) =>
      (local[key] || []).map((a) => ({
        ...a,
        ...(model[key] || []).find((r) => r.id === a.id),
        patches: a.patches,
      }));
    const parts = model.array.instances.map((instance) => {
      const source = definitions.get(instance.templateId);
      if (!source) throw new Error('Array instance references an unknown template.');
      if (!leaves.has(source))
        leaves.set(source, {
          ...source,
          layers: model.layers,
          implants: annotations(source, 'implants'),
          electricalRegions: annotations(source, 'electricalRegions'),
        });
      return {
        ...instance,
        model: leaves.get(source),
        bounds: shiftedBounds(geometryBounds(source.boundary), instance.x, instance.y),
      };
    });
    entry = {
      signature,
      templates: model.array.templates,
      instances: model.array.instances,
      parts,
    };
    partCache.set(model, entry);
  }
  return queryBounds
    ? entry.parts.filter((p) => boundsOverlap(p.bounds, queryBounds, touch))
    : entry.parts;
}
export function rectangleGeometry(bounds) {
  const { minX: x, minY: y, maxX: r, maxY: t } = bounds;
  return [
    [
      [
        [x, y],
        [r, y],
        [r, t],
        [x, t],
        [x, y],
      ],
    ],
  ];
}
export function lineBounds(a, b) {
  return {
    minX: Math.min(a[0], b[0]),
    maxX: Math.max(a[0], b[0]),
    minY: Math.min(a[1], b[1]),
    maxY: Math.max(a[1], b[1]),
  };
}
export function resolveArrayModel(
  model,
  query = null,
  { crop = false, touch = false, maxPoints = MAX_ARRAY_RESOLVED_POINTS } = {},
) {
  if (!isArrayModel(model)) return model;
  const queryBounds = Array.isArray(query) ? geometryBounds(query) : query;
  const parts = arrayParts(model, queryBounds, { touch });
  let points = 0;
  const charge = (geometry) => {
    points += geometryPointCount(geometry);
    if (points > maxPoints)
      throw new Error(
        'The requested array area exceeds the bounded geometry point budget. Reduce the process or inspection area.',
      );
  };
  for (const part of parts) {
    for (const r of part.model.regions) charge(r.geom);
    for (const key of ['implants', 'electricalRegions'])
      for (const a of part.model[key] || []) for (const p of a.patches) charge(p.geom);
  }
  const domain =
    crop && queryBounds
      ? robustIntersection(
          model.boundary,
          Array.isArray(query) ? query : rectangleGeometry(queryBounds),
        )
      : model.boundary;
  const bounds = geometryBounds(domain);
  const result = {
    ...model,
    layers: structuredClone(model.layers),
    kernel: 'vector-2.5d-v1',
    shape: 'rect',
    boundary: domain,
    width: bounds.width,
    height: bounds.height,
    regions: [],
    implants: (model.implants || []).map((a) => ({ ...a, patches: [] })),
    electricalRegions: (model.electricalRegions || []).map((a) => ({ ...a, patches: [] })),
  };
  delete result.array;
  const transformed = (g, part) => {
    const moved = translateGeometry(g, part.x, part.y);
    return crop ? robustIntersection(moved, domain) : moved;
  };
  for (const part of parts) {
    for (const [index, region] of part.model.regions.entries()) {
      const geom = transformed(region.geom, part);
      if (geom.length)
        result.regions.push({
          ...region,
          stack: translatedStack(region.stack, part.x, part.y),
          id: `${part.id}:r${index}`,
          geom,
        });
    }
    for (const key of ['implants', 'electricalRegions'])
      for (const annotation of part.model[key] || []) {
        const target = result[key].find((a) => a.id === annotation.id);
        if (!target) throw new Error('Array annotation is missing its global definition.');
        for (const patch of annotation.patches) {
          const geom = transformed(patch.geom, part);
          if (geom.length)
            target.patches.push({
              ...patch,
              ...(patch.surfaceAppearance
                ? {
                    surfaceAppearance: translatedAppearance(
                      patch.surfaceAppearance,
                      part.x,
                      part.y,
                    ),
                  }
                : {}),
              geom,
            });
        }
      }
  }
  return result;
}

// Rough profiles belong to the local physical frame of their template. Derived
// world-coordinate views translate that frame without modifying the definition.
export function translatedAppearance(a, x, y) {
  if (a?.kind !== 'rough') return a;
  return { ...a, sampleOrigin: [(a.sampleOrigin?.[0] || 0) + x, (a.sampleOrigin?.[1] || 0) + y] };
}
export function translatedStack(stack, x, y) {
  return stack.map((s) => ({
    ...s,
    ...(s.frontSurface ? { frontSurface: translatedAppearance(s.frontSurface, x, y) } : {}),
    ...(s.backSurface ? { backSurface: translatedAppearance(s.backSurface, x, y) } : {}),
  }));
}
