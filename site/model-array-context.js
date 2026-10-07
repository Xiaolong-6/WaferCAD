import { queryMaskInstances } from './mask-instance-index.js';
import {
  arrayParts,
  geometryBounds,
  boundsOverlap,
  translateGeometry,
  geometryPointCount,
  MAX_ARRAY_RESOLVED_POINTS,
  rectangleGeometry,
  translatedStack,
  translatedAppearance,
} from './model-array.js';
import { unionGeometries, intersection, difference, bufferPolyline } from './vector-geometry.js';

// Bounded temporary kernel inputs. These are derived working sets, never a
// second persisted geometry. Joining equal stacks removes artificial cell walls.
export function neighborhood(model, part, radius = 0) {
  const b = part.bounds;
  return arrayParts(model, {
    minX: b.minX - radius - 1e-7,
    minY: b.minY - radius - 1e-7,
    maxX: b.maxX + radius + 1e-7,
    maxY: b.maxY + radius + 1e-7,
  });
}
export function neighborhoodKey(part, parts) {
  return JSON.stringify(parts.map((p) => [p.templateId, p.x - part.x, p.y - part.y]));
}
const maskTemplateGeometries = new WeakMap();
export function localGeometry(geometry, part, domain, polygonBoundsCache = new WeakMap()) {
  if (geometry.arrayMaskQuery) {
    const { index, mode, limiter, boundary } = geometry.arrayMaskQuery;
    const worldDomain = intersection(domain, boundary),
      bounds = geometryBounds(worldDomain);
    const localDomain = translateGeometry(worldDomain, -part.x, -part.y);
    let selected = [];
    if (index) {
      const geoms = [];
      for (const instance of queryMaskInstances(index, bounds)) {
        const template = index.templates[instance.templateId];
        let geom = maskTemplateGeometries.get(template);
        if (!geom) {
          geom =
            template.kind === 'polygon'
              ? [[template.points]]
              : bufferPolyline(template.points, template.width / 2, 28, false);
          maskTemplateGeometries.set(template, geom);
        }
        const [dx, dy] = translateGeometry(
          [[[[instance.x, instance.y]]]],
          -part.x,
          -part.y,
        )[0][0][0];
        geoms.push(translateGeometry(geom, dx, dy));
      }
      selected = unionGeometries(geoms);
    }
    let active =
      mode === 'full'
        ? localDomain
        : mode === 'invert'
          ? difference(localDomain, selected)
          : intersection(selected, localDomain);
    if (limiter) active = intersection(active, translateGeometry(limiter, -part.x, -part.y));
    return active;
  }
  const bounds = geometryBounds(domain);
  const polygons = geometry.filter((p) => {
    let b = polygonBoundsCache.get(p);
    if (!b) {
      b = geometryBounds([p]);
      polygonBoundsCache.set(p, b);
    }
    return boundsOverlap(b, bounds);
  });
  return translateGeometry(intersection(polygons, domain), -part.x, -part.y);
}
export function arrayContext(model, part, parts, { annotations = true, clipBounds = null } = {}) {
  let points = 0;
  const charge = (g) => {
    points += geometryPointCount(g);
    if (points > MAX_ARRAY_RESOLVED_POINTS)
      throw new Error(
        'The array process neighborhood exceeds the bounded geometry point budget. Reduce the process distance or area.',
      );
  };
  for (const p of parts) {
    charge(p.model.boundary);
    for (const r of p.model.regions) charge(r.geom);
    if (annotations)
      for (const key of ['implants', 'electricalRegions'])
        for (const a of p.model[key] || []) for (const patch of a.patches) charge(patch.geom);
  }
  const groups = new Map(),
    domains = [];
  const clip = clipBounds ? rectangleGeometry(clipBounds) : null;
  const moved = (g, p) => {
    const translated = translateGeometry(g, p.x - part.x, p.y - part.y);
    return clip ? intersection(translated, clip) : translated;
  };
  const out = {
    ...model,
    kernel: 'vector-2.5d-v1',
    shape: 'rect',
    layers: structuredClone(model.layers),
    regions: [],
    implants: [],
    electricalRegions: [],
  };
  delete out.array;
  for (const p of parts) {
    domains.push(moved(p.model.boundary, p));
    for (const r of p.model.regions) {
      const stack = translatedStack(r.stack, p.x - part.x, p.y - part.y);
      const key = JSON.stringify(stack);
      if (!groups.has(key)) groups.set(key, { stack, geoms: [] });
      groups.get(key).geoms.push(moved(r.geom, p));
    }
  }
  out.boundary = unionGeometries(domains);
  const b = geometryBounds(out.boundary);
  out.width = b.width;
  out.height = b.height;
  const materialGroups = [...groups.values()]
    .map((g) => ({
      stack: g.stack,
      geom: unionGeometries(g.geoms),
    }))
    .filter((g) => g.geom.length);
  out.regions = materialGroups.map((g, index) => ({
    id: `context-${index}`,
    stack: structuredClone(g.stack),
    geom: g.geom,
  }));
  if (annotations)
    for (const key of ['implants', 'electricalRegions']) {
      out[key] = (model[key] || []).map((a) => {
        const patches = new Map();
        for (const p of parts)
          for (const patch of (p.model[key] || []).find((item) => item.id === a.id)?.patches ||
            []) {
            const { geom, ...meta } = patch;
            if (meta.surfaceAppearance)
              meta.surfaceAppearance = translatedAppearance(
                meta.surfaceAppearance,
                p.x - part.x,
                p.y - part.y,
              );
            const signature = JSON.stringify(meta);
            if (!patches.has(signature)) patches.set(signature, { meta, geoms: [] });
            patches.get(signature).geoms.push(moved(geom, p));
          }
        return {
          ...a,
          patches: [...patches.values()].map((g) => ({
            ...g.meta,
            geom: unionGeometries(g.geoms),
          })),
        };
      });
    }
  return out;
}
export function cropContext(context, domain) {
  const b = geometryBounds(domain);
  return {
    ...context,
    boundary: domain,
    width: b.width,
    height: b.height,
    regions: context.regions.flatMap((r, index) => {
      const geom = intersection(r.geom, domain);
      return geom.length ? [{ ...r, id: `region-${index + 1}`, geom }] : [];
    }),
    implants: (context.implants || []).map((a) => ({
      ...a,
      patches: a.patches.flatMap((p) => {
        const geom = intersection(p.geom, domain);
        return geom.length ? [{ ...p, geom }] : [];
      }),
    })),
    electricalRegions: (context.electricalRegions || []).map((a) => ({
      ...a,
      patches: a.patches.flatMap((p) => {
        const geom = intersection(p.geom, domain);
        return geom.length ? [{ ...p, geom }] : [];
      }),
    })),
  };
}
