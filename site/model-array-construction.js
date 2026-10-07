import { createModel } from './model.js';
import { intersection, unionGeometries, pointInMulti } from './vector-geometry.js';
import {
  ARRAY_MODEL_KERNEL,
  geometryBounds,
  translateGeometry,
  rectangleGeometry,
} from './model-array.js';

const rounded = (g) =>
  g.map((p) => p.map((r) => r.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))])));
export function createWaferArrayTiling({
  rows = 25,
  columns = 25,
  pitchX = 1600,
  pitchY = 1600,
  diameter = 76200,
} = {}) {
  if (
    ![rows, columns].every((n) => Number.isInteger(n) && n > 0 && n % 2 === 1) ||
    ![pitchX, pitchY, diameter].every((n) => Number.isFinite(n) && n > 0)
  )
    throw new Error('Wafer arrays require positive dimensions and odd integer row/column counts.');
  const wafer = createModel({ shape: 'circle', width: diameter, height: diameter, thickness: 500 });
  const waferBoundary = rounded(wafer.boundary),
    templates = [],
    instances = [],
    byGeometry = new Map(),
    domains = [];
  const maxX = Math.ceil(diameter / 2 / pitchX),
    maxY = Math.ceil(diameter / 2 / pitchY);
  if ((maxX * 2 + 1) * (maxY * 2 + 1) > 10000)
    throw new Error('The wafer tiling exceeds the instance budget.');
  const field = {
    minX: (-columns * pitchX) / 2,
    maxX: (columns * pitchX) / 2,
    minY: (-rows * pitchY) / 2,
    maxY: (rows * pitchY) / 2,
  };
  const cell = rectangleGeometry({
    minX: -pitchX / 2,
    maxX: pitchX / 2,
    minY: -pitchY / 2,
    maxY: pitchY / 2,
  });
  for (let row = -maxY; row <= maxY; row++)
    for (let column = -maxX; column <= maxX; column++) {
      const x = column * pitchX,
        y = row * pitchY,
        world = translateGeometry(cell, x, y),
        inside = rounded(intersection(world, waferBoundary));
      if (!inside.length) continue;
      const device = Math.abs(column) < columns / 2 && Math.abs(row) < rows / 2;
      if (device && JSON.stringify(inside) !== JSON.stringify(world))
        throw new Error('The device field must fit entirely inside the wafer.');
      let templateId = 'site';
      if (!device) {
        const local = translateGeometry(inside, -x, -y),
          key = JSON.stringify(local);
        if (!byGeometry.has(key)) {
          const id = `background-${templates.length}`;
          templates.push({ id, boundary: local });
          byGeometry.set(key, id);
        }
        templateId = byGeometry.get(key);
      }
      instances.push({
        id: `tile-${row + maxY}-${column + maxX}`,
        templateId,
        x,
        y,
        role: device ? 'device' : 'background',
      });
      domains.push(inside);
    }
  return {
    version: 1,
    rows,
    columns,
    pitchX,
    pitchY,
    diameter,
    field,
    templates,
    instances,
    boundary: unionGeometries(domains),
  };
}
export function createWaferArrayModel(source, tiling) {
  if (
    source.kernel !== 'vector-2.5d-v1' ||
    source.width !== tiling.pitchX ||
    source.height !== tiling.pitchY ||
    source.boundary.length !== 1 ||
    source.boundary[0].length !== 1 ||
    source.boundary[0][0].length !== 5 ||
    !source.boundary[0][0].every(
      ([x, y]) => Math.abs(x) === source.width / 2 && Math.abs(y) === source.height / 2,
    )
  )
    throw new Error('The array source must be one canonical rectangular site matching the pitch.');
  const corner = [-source.width / 2 + 1, -source.height / 2 + 1],
    owner = source.regions.find((r) => pointInMulti(corner, r.geom));
  if (!owner) throw new Error('The site must define its background substrate.');
  const receiver = source.layers.find((l) => l.id !== 'base')?.id;
  const backgroundStack = owner.stack.filter((s) => s.layerId === 'base' || s.layerId === receiver);
  const backgroundModels = tiling.templates.map(({ id, boundary }) => {
    const bounds = geometryBounds(boundary);
    const model = {
      ...source,
      shape: 'rect',
      width: Number(bounds.width.toFixed(4)),
      height: Number(bounds.height.toFixed(4)),
      boundary,
      regions: [{ id: 'background', geom: boundary, stack: structuredClone(backgroundStack) }],
      implants: [],
      electricalRegions: [],
    };
    model.layers = source.layers.filter((l) => backgroundStack.some((s) => s.layerId === l.id));
    model.revision = 0;
    model.processRevision = 0;
    model.nextRegionId = 2;
    model.nextLayerId = receiver && backgroundStack.some((s) => s.layerId === receiver) ? 2 : 1;
    model.nextImplantId = 1;
    model.nextElectricalRegionId = 1;
    return { id, model };
  });
  return {
    ...source,
    kernel: ARRAY_MODEL_KERNEL,
    shape: 'circle',
    width: tiling.diameter,
    height: tiling.diameter,
    boundary: tiling.boundary,
    regions: [],
    implants: (source.implants || []).map((a) => ({ ...a, patches: [] })),
    electricalRegions: (source.electricalRegions || []).map((a) => ({ ...a, patches: [] })),
    array: {
      version: 1,
      templates: [{ id: 'site', model: source }, ...backgroundModels],
      instances: tiling.instances,
    },
  };
}
export function createWaferArrayProject(project, options = {}) {
  const p = structuredClone(project),
    tiling = createWaferArrayTiling(options),
    models = new WeakMap(),
    layouts = new WeakMap();
  if (tiling.rows * tiling.pitchY !== tiling.columns * tiling.pitchX)
    throw new Error('Recipe reconstruction currently requires a square device field.');
  const mapModel = (source) => {
    if (!models.has(source)) models.set(source, createWaferArrayModel(source, tiling));
    return models.get(source);
  };
  const centers = tiling.instances.filter((i) => i.role === 'device');
  const mapLayout = (source) => {
    if (!layouts.has(source)) {
      const move = (e) =>
        centers.map((i) => ({ ...e, points: e.points.map(([x, y]) => [x + i.x, y + i.y]) }));
      const elements = source.elements.flatMap(move),
        linework = (source.linework || []).flatMap(move);
      const { field: f } = tiling;
      layouts.set(source, {
        ...source,
        name: `${source.name} · ${centers.length} sites`,
        elements,
        linework,
        bounds: { ...f, width: f.maxX - f.minX, height: f.maxY - f.minY },
        combos: source.combos.map((c) => ({ ...c, count: c.count * centers.length })),
      });
    }
    return layouts.get(source);
  };
  const mapState = (s) => {
    s.model = mapModel(s.model);
    s.layout = mapLayout(s.layout);
  };
  mapState(p);
  for (const s of p.snapshots || []) mapState(s.state);
  for (const n of p.snapshotBranches?.nodes || [])
    if (n.state) {
      mapState(n.state);
      const op = n.operation;
      // Assembly preserves the verified site recipe. Subsequent whole-face steps
      // were scoped to the device field; the receiver oxide alone covers the wafer.
      if (
        op?.replay?.areaMode === 'full' &&
        op.resultLayerId !== 'layer-1' &&
        op.kind !== 'record'
      ) {
        const roi = {
          type: 'square',
          c: [0, 0],
          size: Math.max(tiling.columns * tiling.pitchX, tiling.rows * tiling.pitchY),
          rotation: 0,
        };
        op.maskRoi = true;
        op.maskContext = { ...op.maskContext, roi };
        op.replay.maskContext = { ...op.replay.maskContext, roi };
      }
    }
  for (const b of p.snapshotBranches?.branches || []) if (b.headState) mapState(b.headState);
  p.name = `Native Fig3 · ${centers.length}-site wafer array`;
  p.roi = null;
  p.section = { a: [-tiling.diameter / 2, 0], b: [tiling.diameter / 2, 0] };
  p.display.threeCamera = null;
  p.display.threeFastMode = true;
  const active = p.snapshotBranches?.branches?.find(
    (b) => b.id === p.snapshotBranches.activeBranchId,
  );
  if (active?.headState) {
    active.headState.roi = null;
    active.headState.section = structuredClone(p.section);
    active.headState.display.threeCamera = null;
  }
  return p;
}
