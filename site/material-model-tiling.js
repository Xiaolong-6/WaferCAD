import {
  ARRAY_MODEL_KERNEL,
  MAX_ARRAY_INSTANCES,
  MAX_ARRAY_TEMPLATES,
  geometryBounds,
  geometryPointCount,
  rectangleGeometry,
  translateGeometry,
} from './model-array.js';
import { intersection } from './material-process-boolean.js';

const simpleMaterialModel = (model) =>
  model.kernel === 'vector-2.5d-v1' &&
  model.shape === 'rect' &&
  !model.array &&
  ['implants', 'electricalRegions', 'dopantRegions'].every((key) => !(model[key] || []).length) &&
  model.regions.every((r) => r.stack.every((s) => !s.frontSurface && !s.backSurface));

export function shouldTileMaterialModel(model) {
  const bounds = geometryBounds(model.boundary);
  return (
    (bounds.width > 120 || bounds.height > 120) &&
    simpleMaterialModel(model) &&
    model.regions.reduce((n, r) => n + geometryPointCount(r.geom), 0) > 100000
  );
}

function canonicalGeometry(geometry) {
  const ring = (input) => {
    const open = input.slice(0, -1);
    let start = 0;
    for (let i = 1; i < open.length; i++)
      if (
        open[i][0] < open[start][0] ||
        (open[i][0] === open[start][0] && open[i][1] < open[start][1])
      )
        start = i;
    const output = [...open.slice(start), ...open.slice(0, start)];
    output.push([...output[0]]);
    return output;
  };
  const byText = (a, b) => {
    const x = JSON.stringify(a),
      y = JSON.stringify(b);
    return x < y ? -1 : x > y ? 1 : 0;
  };
  return geometry.map((p) => [ring(p[0]), ...p.slice(1).map(ring).sort(byText)]).sort(byText);
}

/** Exact storage partition, with no scaling, simplification or dropped source
 * feature. Repeated physical cells share native array templates. Material
 * operations use neighbor halos; tile edges are never manufacturing masks.
 */
export function tileMaterialModel(model, { cellSizeUm = 120 } = {}) {
  if (!simpleMaterialModel(model))
    throw Error('Material tiling requires an unannotated rectangular material model.');
  if (!(Number.isFinite(cellSizeUm) && cellSizeUm > 0)) throw Error('Invalid material tile size.');
  const bounds = geometryBounds(model.boundary);
  if (
    model.boundary.length !== 1 ||
    model.boundary[0].length !== 1 ||
    model.boundary[0][0].length !== 5 ||
    model.boundary[0][0]
      .slice(1)
      .some((p, i) => p[0] !== model.boundary[0][0][i][0] && p[1] !== model.boundary[0][0][i][1])
  )
    throw Error('Material tiling requires an axis-aligned rectangular domain.');
  const minimum =
    Math.max(bounds.width, bounds.height) / Math.floor(Math.sqrt(MAX_ARRAY_INSTANCES));
  const size = cellSizeUm >= minimum ? cellSizeUm : Math.ceil(minimum / 40) * 40;
  const columns = Math.ceil(bounds.width / size),
    rows = Math.ceil(bounds.height / size);
  if (columns * rows > MAX_ARRAY_INSTANCES) throw Error('Material tile instance budget exceeded.');
  const templates = [],
    instances = [],
    bySignature = new Map();
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const box = {
        minX: bounds.minX + column * size,
        minY: bounds.minY + row * size,
        maxX: Math.min(bounds.maxX, bounds.minX + (column + 1) * size),
        maxY: Math.min(bounds.maxY, bounds.minY + (row + 1) * size),
      };
      const x = Math.round((box.minX + box.maxX) * 5000) / 10000,
        y = Math.round((box.minY + box.maxY) * 5000) / 10000;
      const domain = rectangleGeometry(box);
      const regions = model.regions.flatMap((r) => {
        const clipped = intersection(r.geom, domain);
        return clipped.length
          ? [
              {
                ...r,
                geom: canonicalGeometry(translateGeometry(clipped, -x, -y)),
                stack: structuredClone(r.stack),
              },
            ]
          : [];
      });
      const boundary = translateGeometry(domain, -x, -y);
      const leaf = {
        ...model,
        width: box.maxX - box.minX,
        height: box.maxY - box.minY,
        boundary,
        regions,
      };
      const signature = JSON.stringify([boundary, regions]);
      let templateId = bySignature.get(signature);
      if (!templateId) {
        if (templates.length >= MAX_ARRAY_TEMPLATES)
          throw Error('Material tile template budget exceeded.');
        templateId = `material-tile-${templates.length}`;
        templates.push({ id: templateId, model: leaf });
        bySignature.set(signature, templateId);
      }
      instances.push({ id: `material-tile-${row}-${column}`, templateId, x, y });
    }
  return {
    ...model,
    kernel: ARRAY_MODEL_KERNEL,
    regions: [],
    array: { version: 1, templates, instances },
  };
}

/** Maximum front-ray lateral reach across exposed source heights. */
export function materialShadowRadius(model, params) {
  const parts = model.array ? model.array.templates.map((t) => t.model) : [model];
  let top = -Infinity,
    low = Infinity;
  for (const part of parts)
    for (const r of part.regions)
      for (let i = 0; i < r.stack.length; i++) {
        const s = r.stack[i];
        top = Math.max(top, s.z1);
        if (!r.stack[i + 1] || r.stack[i + 1].z0 > s.z1 + 1e-8) low = Math.min(low, s.z1);
      }
  const theta = Number(params.incidence.tiltDeg),
    thickness = Number(params.thickness);
  if (
    !Number.isFinite(theta) ||
    theta < 0 ||
    theta >= 89 ||
    !Number.isFinite(thickness) ||
    thickness <= 0
  )
    throw Error('Invalid material Direct angle or thickness.');
  const radius = (top - low + thickness) * Math.tan((theta * Math.PI) / 180) + 0.0002;
  if (!Number.isFinite(radius) || radius < 0)
    throw Error('Invalid material Direct source envelope.');
  return radius;
}
