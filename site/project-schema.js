import {
  ARRAY_MODEL_KERNEL,
  MAX_ARRAY_INSTANCES,
  MAX_ARRAY_TEMPLATES,
  isArrayModel,
  translateGeometry,
  geometryBounds as arrayGeometryBounds,
  geometryPointCount,
} from './model-array.js';
import { robustDifference, robustIntersection } from './polygon-boolean.js';
import { normalizeProcessRecipe } from './process-recipe.js';

export const CURRENT_PROJECT_VERSION = 14;
export const PROJECT_COORDINATE_LIMIT_UM = 1e9;
export const PROJECT_LENGTH_LIMIT_UM = PROJECT_COORDINATE_LIMIT_UM * 2;

const LIMITS = {
  layers: 10000,
  regions: 200000,
  stackDepth: 10000,
  polygons: 250000,
  rings: 500000,
  points: 3000000,
  layoutElements: 500000,
  hierarchyCells: 200000,
  selectedLayerKeys: 50000,
  paletteColors: 64,
  snapshots: 100,
  snapshotBranches: 32,
  processHistoryNodes: 1000,
  drawMaskShapes: 10000,
  implants: 10000,
  implantPatches: 200000,
  electricalRegions: 10000,
  electricalRegionPatches: 200000,
  recipeSteps: 1000,
  recipeValueNodes: 100000,
};

function fail(path, message) {
  throw new Error(`Invalid project: ${path} ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, path) {
  if (!isObject(value)) fail(path, 'must be an object.');
  return value;
}

function assertArray(value, path, max) {
  if (!Array.isArray(value)) fail(path, 'must be an array.');
  if (value.length > max) fail(path, `exceeds the limit of ${max} items.`);
  return value;
}

function assertString(value, path, { allowEmpty = false, max = 512 } = {}) {
  if (typeof value !== 'string') fail(path, 'must be a string.');
  if (!allowEmpty && value.length === 0) fail(path, 'must not be empty.');
  if (value.length > max) fail(path, `must be at most ${max} characters.`);
  return value;
}

function assertFinite(value, path, { min = -1e15, max = 1e15 } = {}) {
  if (!Number.isFinite(value)) fail(path, 'must be a finite number.');
  if (value < min || value > max) fail(path, `must be between ${min} and ${max}.`);
  return value;
}

function assertInteger(value, path, { min = -2147483648, max = 2147483647 } = {}) {
  if (!Number.isInteger(value)) fail(path, 'must be an integer.');
  if (value < min || value > max) fail(path, `must be between ${min} and ${max}.`);
  return value;
}

function assertCoordinate(value, path) {
  return assertFinite(value, path, {
    min: -PROJECT_COORDINATE_LIMIT_UM,
    max: PROJECT_COORDINATE_LIMIT_UM,
  });
}

function assertLength(value, path, { min = 0 } = {}) {
  return assertFinite(value, path, { min, max: PROJECT_LENGTH_LIMIT_UM });
}

function assertPoint(value, path) {
  assertArray(value, path, 2);
  if (value.length !== 2) fail(path, 'must contain exactly two coordinates.');
  assertCoordinate(value[0], `${path}[0]`);
  assertCoordinate(value[1], `${path}[1]`);
}

function validatePointArray(points, path, { min = 2, budget }) {
  assertArray(points, path, LIMITS.points);
  if (points.length < min) fail(path, `must contain at least ${min} points.`);
  budget.points += points.length;
  if (budget.points > LIMITS.points) fail(path, 'exceeds the project point budget.');
  points.forEach((point, index) => assertPoint(point, `${path}[${index}]`));
}

function validateMultiPolygon(value, path, budget) {
  const cached = budget.geometry?.validated.get(value);
  if (cached) {
    budget.polygons += cached.polygons;
    budget.rings += cached.rings;
    budget.points += cached.points;
    if (budget.polygons > LIMITS.polygons) fail(path, 'exceeds the project polygon budget.');
    if (budget.rings > LIMITS.rings) fail(path, 'exceeds the project ring budget.');
    if (budget.points > LIMITS.points) fail(path, 'exceeds the project point budget.');
    return;
  }
  const before = { polygons: budget.polygons, rings: budget.rings, points: budget.points };
  const polygons = assertArray(value, path, LIMITS.polygons);
  budget.polygons += polygons.length;
  if (budget.polygons > LIMITS.polygons) fail(path, 'exceeds the project polygon budget.');

  polygons.forEach((polygon, polygonIndex) => {
    const rings = assertArray(polygon, `${path}[${polygonIndex}]`, LIMITS.rings);
    if (rings.length === 0) fail(`${path}[${polygonIndex}]`, 'must contain at least one ring.');
    budget.rings += rings.length;
    if (budget.rings > LIMITS.rings) fail(path, 'exceeds the project ring budget.');

    rings.forEach((ring, ringIndex) => {
      const ringPath = `${path}[${polygonIndex}][${ringIndex}]`;
      validatePointArray(ring, ringPath, { min: 4, budget });
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        fail(ringPath, 'must be closed.');
      }
      if (!(Math.abs(ringArea(ring)) > 0)) {
        fail(ringPath, 'must enclose non-zero area.');
      }
    });
  });
  budget.geometry?.validated.set(value, {
    polygons: budget.polygons - before.polygons,
    rings: budget.rings - before.rings,
    points: budget.points - before.points,
  });
}

function validateLayer(layer, index, ids) {
  const path = `model.layers[${index}]`;
  assertObject(layer, path);
  const id = assertString(layer.id, `${path}.id`, { max: 128 });
  if (ids.has(id)) fail(`${path}.id`, 'must be unique.');
  ids.add(id);
  assertString(layer.name, `${path}.name`, { max: 256 });
  if (typeof layer.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(layer.color)) {
    fail(`${path}.color`, 'must be a six-digit hexadecimal color.');
  }
}

function validateSurfaceAppearance(appearance, path) {
  assertObject(appearance, path);
  if (appearance.sampleOrigin != null) assertPoint(appearance.sampleOrigin, `${path}.sampleOrigin`);
  if (appearance.kind !== 'rough') fail(`${path}.kind`, 'must be rough.');
  assertLength(appearance.featureSize, `${path}.featureSize`, { min: 1e-12 });
  const meanHeight = assertLength(appearance.meanHeight, `${path}.meanHeight`, { min: 1e-12 });
  assertFinite(appearance.featureCv, `${path}.featureCv`, { min: 0, max: 1 });
  assertFinite(appearance.heightCv, `${path}.heightCv`, { min: 0, max: 1 });
  assertString(appearance.morphology, `${path}.morphology`);
  if (!['stochastic', 'pyramid'].includes(appearance.morphology)) {
    fail(`${path}.morphology`, 'must be stochastic or pyramid.');
  }
  assertString(appearance.polarity, `${path}.polarity`);
  if (!['inverted', 'normal'].includes(appearance.polarity)) {
    fail(`${path}.polarity`, 'must be inverted or normal.');
  }
  assertInteger(appearance.seed, `${path}.seed`, { min: 0, max: 0xffffffff });
  assertString(appearance.profileId, `${path}.profileId`, { max: 128 });
  if (appearance.etchDepth != null) {
    const depth = assertLength(appearance.etchDepth, `${path}.etchDepth`, { min: 1e-12 });
    if (meanHeight > depth + 1e-9) {
      fail(`${path}.meanHeight`, 'must not exceed etchDepth.');
    }
  }
  if (appearance.geometryMode !== 'ideal') {
    fail(`${path}.geometryMode`, 'must be ideal for the current geometry kernel.');
  }
}

function validateStack(stack, path, layerIds) {
  assertArray(stack, path, LIMITS.stackDepth);
  let previousZ1 = -Infinity;

  stack.forEach((segment, index) => {
    const segmentPath = `${path}[${index}]`;
    assertObject(segment, segmentPath);
    const layerId = assertString(segment.layerId, `${segmentPath}.layerId`, { max: 128 });
    if (!layerIds.has(layerId)) fail(`${segmentPath}.layerId`, 'references an unknown layer.');
    const z0 = assertCoordinate(segment.z0, `${segmentPath}.z0`);
    const z1 = assertCoordinate(segment.z1, `${segmentPath}.z1`);
    if (!(z1 > z0)) fail(segmentPath, 'must satisfy z1 > z0.');
    if (z0 < previousZ1 - 1e-9) fail(segmentPath, 'overlaps the previous stack segment.');
    if (segment.frontSurface != null) {
      validateSurfaceAppearance(segment.frontSurface, `${segmentPath}.frontSurface`);
    }
    if (segment.backSurface != null) {
      validateSurfaceAppearance(segment.backSurface, `${segmentPath}.backSurface`);
    }
    previousZ1 = z1;
  });
}

function ringArea(ring) {
  let sum = 0;
  for (let index = 0; index < (ring?.length || 0); index++) {
    const a = ring[index],
      b = ring[(index + 1) % ring.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function multiArea(geom) {
  let total = 0;
  for (const polygon of geom || []) {
    if (!polygon.length) continue;
    let area = Math.abs(ringArea(polygon[0]));
    for (let i = 1; i < polygon.length; i++) area -= Math.abs(ringArea(polygon[i]));
    total += Math.max(0, area);
  }
  return total;
}

function geometryBounds(geom) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of geom || [])
    for (const ring of polygon || [])
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function createValidationContext() {
  return {
    models: new WeakMap(),
    layouts: new WeakMap(),
    geometry: {
      arrayDomains: new Set(),
      validated: new WeakMap(),
      canonical: new WeakMap(),
      byContent: new Map(),
      bounds: new WeakMap(),
      rectangles: new WeakMap(),
      components: new WeakMap(),
      differences: new WeakMap(),
      intersections: new WeakMap(),
    },
  };
}

function canonicalGeometry(geometry, cache) {
  if (cache.canonical.has(geometry)) return cache.canonical.get(geometry);
  const key = JSON.stringify(geometry);
  const canonical = cache.byContent.get(key) || geometry;
  cache.byContent.set(key, canonical);
  cache.canonical.set(geometry, canonical);
  return canonical;
}

function cachedGeometryBounds(geometry, cache) {
  geometry = canonicalGeometry(geometry, cache);
  if (!cache.bounds.has(geometry)) cache.bounds.set(geometry, geometryBounds(geometry));
  return cache.bounds.get(geometry);
}

// A closed four-corner axis-aligned boundary admits an exact containment
// proof from bounds. All other boundaries retain the robust polygon difference.
function rectangularBoundary(geometry, cache) {
  geometry = canonicalGeometry(geometry, cache);
  if (cache.rectangles.has(geometry)) return cache.rectangles.get(geometry);
  const ring = geometry.length === 1 && geometry[0].length === 1 ? geometry[0][0] : null;
  let rectangle = Boolean(ring && ring.length === 5);
  if (rectangle) {
    for (let i = 0; i < 4; i++) {
      const a = ring[i],
        b = ring[i + 1];
      if ((a[0] === b[0]) === (a[1] === b[1])) rectangle = false;
    }
    const bounds = cachedGeometryBounds(geometry, cache);
    rectangle &&=
      new Set(ring.slice(0, 4).map((p) => p.join('|'))).size === 4 &&
      ring
        .slice(0, 4)
        .every(
          ([x, y]) =>
            (x === bounds.minX || x === bounds.maxX) && (y === bounds.minY || y === bounds.maxY),
        );
  }
  cache.rectangles.set(geometry, rectangle);
  return rectangle;
}

function geometryComponents(geometry, cache) {
  if (!cache.components.has(geometry)) {
    cache.components.set(
      geometry,
      geometry
        .map((polygon, index) => ({
          index,
          bounds: geometryBounds([polygon]),
        }))
        .sort((a, b) => a.bounds.minX - b.bounds.minX),
    );
  }
  return cache.components.get(geometry);
}

// Discard only polygons whose bounds cannot have a positive-area intersection
// with any component on the other side. Intersect the remaining sets together,
// preserving the original aggregate area tolerance and polygon order.
function intersectionCandidates(left, right, cache) {
  const sides = [geometryComponents(left, cache), geometryComponents(right, cache)];
  const active = [[], []],
    selected = [new Set(), new Set()];
  const cursor = [0, 0];
  while (cursor[0] < sides[0].length || cursor[1] < sides[1].length) {
    const side =
      cursor[1] >= sides[1].length ||
      (cursor[0] < sides[0].length &&
        sides[0][cursor[0]].bounds.minX <= sides[1][cursor[1]].bounds.minX)
        ? 0
        : 1;
    const current = sides[side][cursor[side]++],
      other = 1 - side;
    active[other] = active[other].filter((entry) => entry.bounds.maxX > current.bounds.minX);
    for (const previous of active[other]) {
      if (
        previous.bounds.maxY <= current.bounds.minY ||
        current.bounds.maxY <= previous.bounds.minY
      )
        continue;
      selected[side].add(current.index);
      selected[other].add(previous.index);
    }
    active[side].push(current);
  }
  if (!selected[0].size) return null;
  return [left.filter((_, i) => selected[0].has(i)), right.filter((_, i) => selected[1].has(i))];
}

function cachedGeometryArea(left, right, geometryCache, kind, operation) {
  left = canonicalGeometry(left, geometryCache);
  right = canonicalGeometry(right, geometryCache);
  const cache = geometryCache[kind];
  let results = cache.get(left);
  if (!results) {
    results = new WeakMap();
    cache.set(left, results);
  }
  if (!results.has(right)) {
    const candidates =
      kind === 'intersections' ? intersectionCandidates(left, right, geometryCache) : [left, right];
    const area = candidates ? multiArea(operation(...candidates)) : 0;
    results.set(right, area);
    if (kind === 'intersections') {
      let reverse = cache.get(right);
      if (!reverse) {
        reverse = new WeakMap();
        cache.set(right, reverse);
      }
      reverse.set(left, area);
    }
  }
  return results.get(right);
}

function validateModelGeometry(model, cache) {
  const boundaryBounds = cachedGeometryBounds(model.boundary, cache);
  const rectangle = rectangularBoundary(model.boundary, cache);
  const dimensionTolerance = Math.max(1e-9, model.width, model.height) * 1e-9;

  if (
    Math.abs(boundaryBounds.width - model.width) > dimensionTolerance ||
    Math.abs(boundaryBounds.height - model.height) > dimensionTolerance
  ) {
    fail('model.boundary', 'bounds do not match model width/height.');
  }
  if (model.shape === 'circle' && Math.abs(model.width - model.height) > dimensionTolerance) {
    fail('model.height', 'must equal width for a circular base.');
  }

  const areaTolerance = Math.max(1e-18, model.width * model.height * 1e-15);
  const entries = model.regions
    .map((region, index) => ({ region, index, bounds: cachedGeometryBounds(region.geom, cache) }))
    .sort((a, b) => a.bounds.minX - b.bounds.minX);
  const active = [];

  try {
    for (const current of entries) {
      const bounds = current.bounds;
      const provablyContained =
        rectangle &&
        bounds.minX >= boundaryBounds.minX &&
        bounds.minY >= boundaryBounds.minY &&
        bounds.maxX <= boundaryBounds.maxX &&
        bounds.maxY <= boundaryBounds.maxY;
      const outsideArea = provablyContained
        ? 0
        : cachedGeometryArea(
            current.region.geom,
            model.boundary,
            cache,
            'differences',
            robustDifference,
          );
      if (outsideArea > areaTolerance) {
        fail(`model.regions[${current.index}].geom`, 'extends outside model.boundary.');
      }

      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i].bounds.maxX <= current.bounds.minX) active.splice(i, 1);
      }
      for (const previous of active) {
        if (
          previous.bounds.maxY <= current.bounds.minY ||
          current.bounds.maxY <= previous.bounds.minY
        ) {
          continue;
        }
        const overlapArea = cachedGeometryArea(
          previous.region.geom,
          current.region.geom,
          cache,
          'intersections',
          robustIntersection,
        );
        if (overlapArea > areaTolerance) {
          fail(
            `model.regions[${current.index}].geom`,
            `overlaps model.regions[${previous.index}].geom.`,
          );
        }
      }
      active.push(current);
    }
  } catch (error) {
    if (String(error?.message || '').startsWith('Invalid project:')) throw error;
    fail('model geometry', `cannot be validated: ${error.message}`);
  }
}

function validateModel(model, budget, geometryCache) {
  assertObject(model, 'model');
  if (model.kernel !== 'vector-2.5d-v1' && model.kernel !== ARRAY_MODEL_KERNEL)
    fail('model.kernel', 'is not supported.');
  if (model.array != null && !isArrayModel(model))
    fail('model.array', 'requires the array model kernel.');
  if (!['circle', 'rect'].includes(model.shape)) fail('model.shape', 'must be circle or rect.');
  assertLength(model.width, 'model.width', { min: 1e-12 });
  assertLength(model.height, 'model.height', { min: 1e-12 });
  assertLength(model.thickness, 'model.thickness', { min: 1e-12 });

  const units = assertObject(model.units, 'model.units');
  if (units.xy !== 'µm') fail('model.units.xy', 'must be µm.');
  if (units.z !== 'µm') fail('model.units.z', 'must be µm.');

  validateMultiPolygon(model.boundary, 'model.boundary', budget);
  if (model.boundary.length === 0) fail('model.boundary', 'must not be empty.');

  const layers = assertArray(model.layers, 'model.layers', LIMITS.layers);
  if (layers.length === 0) fail('model.layers', 'must contain at least one layer.');
  const layerIds = new Set();
  layers.forEach((layer, index) => validateLayer(layer, index, layerIds));
  if (!layerIds.has('base')) fail('model.layers', 'must contain the base layer.');

  const regionIds = new Set();
  const regions = assertArray(model.regions, 'model.regions', LIMITS.regions);
  regions.forEach((region, index) => {
    const path = `model.regions[${index}]`;
    assertObject(region, path);
    const id = assertString(region.id, `${path}.id`, { max: 128 });
    if (regionIds.has(id)) fail(`${path}.id`, 'must be unique.');
    regionIds.add(id);
    validateMultiPolygon(region.geom, `${path}.geom`, budget);
    if (region.geom.length === 0) fail(`${path}.geom`, 'must not be empty.');
    validateStack(region.stack, `${path}.stack`, layerIds);
    if (region.stack.length === 0) fail(`${path}.stack`, 'must not be empty.');
  });

  if (model.implants != null) {
    const implants = assertArray(model.implants, 'model.implants', LIMITS.implants),
      implantIds = new Set();
    implants.forEach((implant, implantIndex) => {
      const path = `model.implants[${implantIndex}]`;
      assertObject(implant, path);
      const id = assertString(implant.id, `${path}.id`, { max: 128 });
      if (implantIds.has(id)) fail(`${path}.id`, 'must be unique.');
      implantIds.add(id);
      assertString(implant.name, `${path}.name`, { max: 256 });
      if (typeof implant.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(implant.color)) {
        fail(`${path}.color`, 'must be a six-digit hexadecimal color.');
      }
      if (!['front', 'back'].includes(implant.face)) {
        fail(`${path}.face`, 'must be front or back.');
      }
      assertLength(implant.thickness, `${path}.thickness`, { min: 1e-12 });
      assertFinite(implant.tilt, `${path}.tilt`, { min: -80, max: 80 });
      if (implant.depthProfile != null && !['follow', 'smooth'].includes(implant.depthProfile)) {
        fail(`${path}.depthProfile`, 'must be follow or smooth.');
      }
      if (typeof implant.visible !== 'boolean') fail(`${path}.visible`, 'must be boolean.');

      const patches = assertArray(implant.patches, `${path}.patches`, LIMITS.implantPatches);
      patches.forEach((patch, patchIndex) => {
        const patchPath = `${path}.patches[${patchIndex}]`;
        assertObject(patch, patchPath);
        validateMultiPolygon(patch.geom, `${patchPath}.geom`, budget);
        if (patch.geom.length === 0) fail(`${patchPath}.geom`, 'must not be empty.');
        assertCoordinate(patch.z, `${patchPath}.z`);
        assertCoordinate(patch.zMin, `${patchPath}.zMin`);
        assertCoordinate(patch.zMax, `${patchPath}.zMax`);
        if (patch.zMax < patch.zMin) fail(patchPath, 'must have zMax >= zMin.');
        if (patch.z < patch.zMin - 1e-9 || patch.z > patch.zMax + 1e-9) {
          fail(`${patchPath}.z`, 'must lie within zMin/zMax.');
        }
        assertString(patch.layerId, `${patchPath}.layerId`, { max: 128 });
        if (patch.surfaceAppearance != null) {
          validateSurfaceAppearance(patch.surfaceAppearance, `${patchPath}.surfaceAppearance`);
        }
      });
    });
  }

  if (model.electricalRegions != null) {
    const regions = assertArray(
        model.electricalRegions,
        'model.electricalRegions',
        LIMITS.electricalRegions,
      ),
      ids = new Set(),
      allowedTypes = new Set([
        'p-type',
        'n-type',
        'p-inversion',
        'n-inversion',
        'p-accumulation',
        'n-accumulation',
        'depletion',
        'custom',
      ]),
      allowedSources = new Set(['induced', 'doped', 'interface', 'custom']);
    regions.forEach((electrical, regionIndex) => {
      const path = `model.electricalRegions[${regionIndex}]`;
      assertObject(electrical, path);
      const id = assertString(electrical.id, `${path}.id`, { max: 128 });
      if (ids.has(id)) fail(`${path}.id`, 'must be unique.');
      ids.add(id);
      assertString(electrical.name, `${path}.name`, { max: 256 });
      if (typeof electrical.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(electrical.color)) {
        fail(`${path}.color`, 'must be a six-digit hexadecimal color.');
      }
      if (!['front', 'back'].includes(electrical.face)) {
        fail(`${path}.face`, 'must be front or back.');
      }
      assertLength(electrical.thickness, `${path}.thickness`, { min: 1e-12 });
      if (!allowedTypes.has(electrical.regionType)) {
        fail(`${path}.regionType`, 'is not supported.');
      }
      if (!allowedSources.has(electrical.source)) {
        fail(`${path}.source`, 'is not supported.');
      }
      if (
        electrical.depthProfile != null &&
        !['follow', 'smooth'].includes(electrical.depthProfile)
      ) {
        fail(`${path}.depthProfile`, 'must be follow or smooth.');
      }
      if (typeof electrical.visible !== 'boolean') fail(`${path}.visible`, 'must be boolean.');

      const patches = assertArray(
        electrical.patches,
        `${path}.patches`,
        LIMITS.electricalRegionPatches,
      );
      patches.forEach((patch, patchIndex) => {
        const patchPath = `${path}.patches[${patchIndex}]`;
        assertObject(patch, patchPath);
        validateMultiPolygon(patch.geom, `${patchPath}.geom`, budget);
        if (patch.geom.length === 0) fail(`${patchPath}.geom`, 'must not be empty.');
        assertCoordinate(patch.z, `${patchPath}.z`);
        assertCoordinate(patch.zMin, `${patchPath}.zMin`);
        assertCoordinate(patch.zMax, `${patchPath}.zMax`);
        if (patch.zMax < patch.zMin) fail(patchPath, 'must have zMax >= zMin.');
        if (patch.z < patch.zMin - 1e-9 || patch.z > patch.zMax + 1e-9) {
          fail(`${patchPath}.z`, 'must lie within zMin/zMax.');
        }
        assertString(patch.layerId, `${patchPath}.layerId`, { max: 128 });
        if (patch.surfaceAppearance != null) {
          validateSurfaceAppearance(patch.surfaceAppearance, `${patchPath}.surfaceAppearance`);
        }
      });
    });
  }

  validateModelGeometry(model, geometryCache);
  if (isArrayModel(model)) validateModelArray(model, budget, geometryCache);

  if (model.nextImplantId != null) {
    assertInteger(model.nextImplantId, 'model.nextImplantId', { min: 1 });
  }
  if (model.nextElectricalRegionId != null) {
    assertInteger(model.nextElectricalRegionId, 'model.nextElectricalRegionId', { min: 1 });
  }
  assertInteger(model.nextLayerId, 'model.nextLayerId', { min: 1 });
  assertInteger(model.nextRegionId, 'model.nextRegionId', { min: 1 });
  assertInteger(model.revision, 'model.revision', { min: 0 });
  if (model.processRevision != null) {
    assertInteger(model.processRevision, 'model.processRevision', { min: 0 });
  }
}

function validateModelArray(model, budget, cache) {
  const array = assertObject(model.array, 'model.array');
  if (array.version !== 1) fail('model.array.version', 'is not supported.');
  if (model.regions.length) fail('model.regions', 'must be empty for an instanced model.');
  for (const key of ['implants', 'electricalRegions'])
    for (const a of model[key] || [])
      if (a.patches.length)
        fail(`model.${key}`, 'must contain only annotation definitions in an array model.');
  const templates = assertArray(array.templates, 'model.array.templates', MAX_ARRAY_TEMPLATES),
    definitions = new Map();
  if (!templates.length) fail('model.array.templates', 'must not be empty.');
  const layerIds = new Set(model.layers.map((l) => l.id));
  for (const [i, t] of templates.entries()) {
    const path = `model.array.templates[${i}]`;
    assertObject(t, path);
    assertString(t.id, `${path}.id`, { max: 128 });
    if (definitions.has(t.id)) fail(`${path}.id`, 'must be unique.');
    assertObject(t.model, `${path}.model`);
    if (t.model.kernel !== 'vector-2.5d-v1' || t.model.array != null)
      fail(`${path}.model`, 'must be a non-nested canonical model.');
    validateModel(t.model, budget, cache);
    for (const l of t.model.layers)
      if (!layerIds.has(l.id)) fail(`${path}.model.layers`, 'references a missing global layer.');
    for (const key of ['implants', 'electricalRegions'])
      for (const a of t.model[key] || []) {
        const definition = (model[key] || []).find((r) => r.id === a.id);
        if (!definition) fail(`${path}.model.${key}`, 'references a missing global annotation.');
        for (const field of ['face', 'thickness', 'tilt', 'regionType', 'source'])
          if (a[field] !== definition[field])
            fail(`${path}.model.${key}`, 'has inconsistent physical annotation metadata.');
      }
    definitions.set(t.id, t.model);
  }
  const instances = assertArray(array.instances, 'model.array.instances', MAX_ARRAY_INSTANCES),
    ids = new Set(),
    entries = [];
  if (!instances.length) fail('model.array.instances', 'must not be empty.');
  const domainKey = JSON.stringify([
    model.width,
    model.height,
    model.boundary,
    templates.map((t) => [t.id, t.model.boundary]),
    instances,
  ]);
  const proven = cache.arrayDomains.has(domainKey);
  let domainPoints = 0;
  for (const [i, instance] of instances.entries()) {
    const path = `model.array.instances[${i}]`;
    assertObject(instance, path);
    assertString(instance.id, `${path}.id`, { max: 64 });
    if (ids.has(instance.id)) fail(`${path}.id`, 'must be unique.');
    ids.add(instance.id);
    assertString(instance.templateId, `${path}.templateId`, { max: 128 });
    const template = definitions.get(instance.templateId);
    if (!template) fail(`${path}.templateId`, 'references an unknown template.');
    assertCoordinate(instance.x, `${path}.x`);
    assertCoordinate(instance.y, `${path}.y`);
    domainPoints += geometryPointCount(template.boundary);
    if (domainPoints > 250000)
      fail('model.array.instances', 'exceeds the instance domain point budget.');
    if (instance.role != null && !['device', 'background'].includes(instance.role))
      fail(`${path}.role`, 'must be device or background.');
    if (proven) continue;
    const geom = translateGeometry(template.boundary, instance.x, instance.y),
      bounds = arrayGeometryBounds(geom);
    for (const value of [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY])
      assertCoordinate(value, `${path}.bounds`);
    entries.push({ geom, bounds, path });
  }
  if (proven) return;
  const tolerance = Math.max(1e-18, model.width * model.height * 1e-15);
  const domains = entries.flatMap((e) => e.geom);
  if (
    cachedGeometryArea(domains, model.boundary, cache, 'differences', robustDifference) > tolerance
  )
    fail('model.array.instances', 'extends outside the physical model boundary.');
  if (
    cachedGeometryArea(model.boundary, domains, cache, 'differences', robustDifference) > tolerance
  )
    fail('model.array.instances', 'must cover the complete physical model domain.');
  entries.sort((a, b) => a.bounds.minX - b.bounds.minX);
  const active = [];
  for (const current of entries) {
    for (let i = active.length - 1; i >= 0; i--)
      if (active[i].bounds.maxX <= current.bounds.minX) active.splice(i, 1);
    for (const previous of active) {
      if (
        previous.bounds.maxY <= current.bounds.minY ||
        current.bounds.maxY <= previous.bounds.minY
      )
        continue;
      if (
        cachedGeometryArea(
          previous.geom,
          current.geom,
          cache,
          'intersections',
          robustIntersection,
        ) > tolerance
      )
        fail(current.path, 'overlaps another instance domain.');
    }
    active.push(current);
  }
  cache.arrayDomains.add(domainKey);
}

function validateBounds(bounds, path) {
  assertObject(bounds, path);
  const minX = assertCoordinate(bounds.minX, `${path}.minX`);
  const minY = assertCoordinate(bounds.minY, `${path}.minY`);
  const maxX = assertCoordinate(bounds.maxX, `${path}.maxX`);
  const maxY = assertCoordinate(bounds.maxY, `${path}.maxY`);
  const width = assertLength(bounds.width, `${path}.width`);
  const height = assertLength(bounds.height, `${path}.height`);
  if (maxX < minX || maxY < minY) fail(path, 'has inverted min/max bounds.');
  const tolerance = Math.max(1, Math.abs(maxX - minX), Math.abs(maxY - minY)) * 1e-9;
  if (Math.abs(width - (maxX - minX)) > tolerance)
    fail(`${path}.width`, 'does not match maxX - minX.');
  if (Math.abs(height - (maxY - minY)) > tolerance)
    fail(`${path}.height`, 'does not match maxY - minY.');
}

function validateLayoutElement(element, path, budget) {
  assertObject(element, path);
  if (!['polygon', 'path'].includes(element.kind)) fail(`${path}.kind`, 'must be polygon or path.');
  assertString(element.sourceCell, `${path}.sourceCell`, { max: 512 });
  assertInteger(element.layer, `${path}.layer`);
  assertInteger(element.datatype, `${path}.datatype`);
  validatePointArray(element.points, `${path}.points`, {
    min: element.kind === 'polygon' ? 3 : 2,
    budget,
  });
  if (element.kind === 'path') {
    assertLength(element.width, `${path}.width`);
  }
}

function validateLayout(layout, budget) {
  assertObject(layout, 'layout');
  assertString(layout.name, 'layout.name', { allowEmpty: true, max: 512 });
  assertString(layout.root, 'layout.root', { allowEmpty: true, max: 512 });

  const elements = assertArray(layout.elements, 'layout.elements', LIMITS.layoutElements);
  elements.forEach((element, index) =>
    validateLayoutElement(element, `layout.elements[${index}]`, budget),
  );

  const linework = assertArray(layout.linework, 'layout.linework', LIMITS.layoutElements);
  linework.forEach((element, index) =>
    validateLayoutElement(element, `layout.linework[${index}]`, budget),
  );

  validateBounds(layout.bounds, 'layout.bounds');

  const combos = assertArray(layout.combos, 'layout.combos', LIMITS.layoutElements);
  combos.forEach((combo, index) => {
    const path = `layout.combos[${index}]`;
    assertObject(combo, path);
    assertString(combo.key, `${path}.key`, { max: 1024 });
    assertString(combo.cell, `${path}.cell`, { max: 512 });
    assertInteger(combo.layer, `${path}.layer`);
    assertInteger(combo.datatype, `${path}.datatype`);
    assertInteger(combo.count, `${path}.count`, { min: 0 });
  });

  const hierarchy = assertObject(layout.hierarchy, 'layout.hierarchy');
  const entries = Object.entries(hierarchy);
  if (entries.length > LIMITS.hierarchyCells) fail('layout.hierarchy', 'contains too many cells.');
  for (const [cell, children] of entries) {
    assertString(cell, 'layout.hierarchy key', { max: 512 });
    assertArray(children, `layout.hierarchy[${JSON.stringify(cell)}]`, LIMITS.hierarchyCells);
    children.forEach((child, index) => {
      const path = `layout.hierarchy[${JSON.stringify(cell)}][${index}]`;
      assertObject(child, path);
      assertString(child.name, `${path}.name`, { max: 512 });
      assertInteger(child.count, `${path}.count`, { min: 1 });
    });
  }

  const units = assertObject(layout.units, 'layout.units');
  if (!['µm', 'DBU'].includes(units.xy)) fail('layout.units.xy', 'must be µm or DBU.');
  assertLength(units.dbuToMicron, 'layout.units.dbuToMicron');
  if (typeof units.hasPhysicalUnits !== 'boolean')
    fail('layout.units.hasPhysicalUnits', 'must be boolean.');
}

function validateMaskTransform(value) {
  const transform = assertObject(value, 'maskTransform');
  assertCoordinate(transform.x, 'maskTransform.x');
  assertCoordinate(transform.y, 'maskTransform.y');
  assertFinite(transform.scale, 'maskTransform.scale', { min: 1e-12 });
  assertFinite(transform.rotation, 'maskTransform.rotation');
}

function validateRoi(roi) {
  if (roi == null) return;
  assertObject(roi, 'roi');
  if (roi.type === 'rect') {
    assertPoint(roi.a, 'roi.a');
    assertPoint(roi.b, 'roi.b');
    if (!(Math.abs(roi.b[0] - roi.a[0]) > 0) || !(Math.abs(roi.b[1] - roi.a[1]) > 0)) {
      fail('roi', 'rectangle must have non-zero width and height.');
    }
    return;
  }
  if (roi.type === 'circle' || roi.type === 'sector') {
    assertPoint(roi.c, 'roi.c');
    assertLength(roi.r, 'roi.r', { min: 1e-12 });
    if (roi.type === 'sector') {
      assertFinite(roi.startDeg, 'roi.startDeg');
      assertFinite(roi.endDeg, 'roi.endDeg');
    }
    return;
  }
  fail('roi.type', 'must be rect, circle, or sector.');
}

function validateMaskRoi(maskRoi) {
  if (maskRoi == null) return;
  assertObject(maskRoi, 'maskRoi');
  if (maskRoi.type === 'square') {
    assertPoint(maskRoi.c, 'maskRoi.c');
    assertLength(maskRoi.size, 'maskRoi.size', { min: 1e-12 });
    assertFinite(maskRoi.rotation, 'maskRoi.rotation');
    return;
  }
  if (maskRoi.type === 'circle') {
    assertPoint(maskRoi.c, 'maskRoi.c');
    assertLength(maskRoi.r, 'maskRoi.r', { min: 1e-12 });
    return;
  }
  fail('maskRoi.type', 'must be square or circle.');
}

function validateDrawMask(drawMask) {
  assertObject(drawMask, 'drawMask');
  assertInteger(drawMask.nextShapeId, 'drawMask.nextShapeId', { min: 1, max: 1000000000 });
  const shapes = assertArray(drawMask.shapes, 'drawMask.shapes', LIMITS.drawMaskShapes);
  const ids = new Set();
  shapes.forEach((shape, index) => {
    const path = `drawMask.shapes[${index}]`;
    assertObject(shape, path);
    const id = assertString(shape.id, `${path}.id`, { max: 128 });
    if (ids.has(id)) fail(`${path}.id`, 'must be unique.');
    ids.add(id);
    if (shape.type === 'rect') {
      assertPoint(shape.a, `${path}.a`);
      assertPoint(shape.b, `${path}.b`);
      if (!(Math.abs(shape.b[0] - shape.a[0]) > 0) || !(Math.abs(shape.b[1] - shape.a[1]) > 0)) {
        fail(path, 'rectangle must have non-zero width and height.');
      }
      return;
    }
    if (shape.type === 'circle') {
      assertPoint(shape.c, `${path}.c`);
      assertLength(shape.r, `${path}.r`, { min: 1e-12 });
      return;
    }
    if (shape.type === 'polygon') {
      validatePointArray(shape.points, `${path}.points`, { min: 3, budget: { points: 0 } });
      if (!(Math.abs(ringArea(shape.points)) > 0)) {
        fail(`${path}.points`, 'must enclose non-zero area.');
      }
      return;
    }
    if (shape.type === 'ring' || shape.type === 'ring-sector') {
      assertPoint(shape.c, `${path}.c`);
      assertLength(shape.innerR, `${path}.innerR`);
      assertLength(shape.outerR, `${path}.outerR`);
      if (!(shape.outerR > shape.innerR)) {
        fail(`${path}.outerR`, 'must be greater than innerR.');
      }
      if (shape.type === 'ring-sector') {
        assertFinite(shape.startDeg, `${path}.startDeg`);
        assertFinite(shape.endDeg, `${path}.endDeg`);
        const rawSweep = shape.endDeg - shape.startDeg,
          sweep = ((rawSweep % 360) + 360) % 360;
        if (!(sweep > 1e-12 || Math.abs(rawSweep) >= 360 - 1e-9)) {
          fail(`${path}.endDeg`, 'must define a non-zero angular sweep.');
        }
      }
      return;
    }
    fail(`${path}.type`, 'must be rect, circle, polygon, ring, or ring-sector.');
  });
}

function validateSection(section) {
  assertObject(section, 'section');
  assertPoint(section.a, 'section.a');
  assertPoint(section.b, 'section.b');
  if (section.a[0] === section.b[0] && section.a[1] === section.b[1]) {
    fail('section', 'A and B must be distinct points.');
  }
}

function validatePlanViews(planViews) {
  assertObject(planViews, 'planViews');
  for (const key of ['mask', 'main']) {
    const view = assertObject(planViews[key], `planViews.${key}`);
    assertFinite(view.zoom, `planViews.${key}.zoom`, { min: 1e-6, max: 1e8 });
    assertCoordinate(view.panX, `planViews.${key}.panX`);
    assertCoordinate(view.panY, `planViews.${key}.panY`);
  }
}

function validateDisplay(display) {
  if (display == null) return;
  assertObject(display, 'display');
  if (display.xyUnit != null && !['nm', 'um', 'mm'].includes(display.xyUnit)) {
    fail('display.xyUnit', 'must be nm, um, or mm.');
  }
  if (display.structurePalette != null) {
    assertString(display.structurePalette, 'display.structurePalette', { max: 64 });
  }
  if (display.customStructurePalette != null) {
    const colors = assertArray(
      display.customStructurePalette,
      'display.customStructurePalette',
      LIMITS.paletteColors,
    );
    colors.forEach((color, index) => {
      if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) {
        fail(`display.customStructurePalette[${index}]`, 'must be a six-digit hexadecimal color.');
      }
    });
  }
  if (display.maskOpacity != null) {
    assertFinite(display.maskOpacity, 'display.maskOpacity', { min: 0, max: 1 });
  }
  if (display.threeOpacity != null) {
    assertFinite(display.threeOpacity, 'display.threeOpacity', { min: 0.1, max: 1 });
  }
  if (display.threeFastMode != null && typeof display.threeFastMode !== 'boolean') {
    fail('display.threeFastMode', 'must be boolean.');
  }
  if (display.threeShowBorders != null && typeof display.threeShowBorders !== 'boolean') {
    fail('display.threeShowBorders', 'must be boolean.');
  }
  if (display.threeCamera != null) {
    const view = assertObject(display.threeCamera, 'display.threeCamera'),
      position = assertArray(view.position, 'display.threeCamera.position', 3),
      target = assertArray(view.target, 'display.threeCamera.target', 3);
    if (position.length !== 3 || target.length !== 3) {
      fail('display.threeCamera', 'position and target must each contain exactly three values.');
    }
    position.forEach((value, index) =>
      assertFinite(value, `display.threeCamera.position[${index}]`, {
        min: -PROJECT_COORDINATE_LIMIT_UM * 100,
        max: PROJECT_COORDINATE_LIMIT_UM * 100,
      }),
    );
    target.forEach((value, index) =>
      assertFinite(value, `display.threeCamera.target[${index}]`, {
        min: -PROJECT_COORDINATE_LIMIT_UM * 100,
        max: PROJECT_COORDINATE_LIMIT_UM * 100,
      }),
    );
    assertFinite(view.fov, 'display.threeCamera.fov', { min: 1.000001, max: 178.999999 });
  }
  if (display.sectionShowBorders != null && typeof display.sectionShowBorders !== 'boolean') {
    fail('display.sectionShowBorders', 'must be boolean.');
  }
  if (display.sectionDetailRoi != null) {
    const roi = assertObject(display.sectionDetailRoi, 'display.sectionDetailRoi');
    assertFinite(roi.x, 'display.sectionDetailRoi.x', { min: 0, max: 1 });
    assertFinite(roi.y, 'display.sectionDetailRoi.y', { min: 0, max: 1 });
    assertFinite(roi.width, 'display.sectionDetailRoi.width', { min: 0, max: 1 });
    assertFinite(roi.height, 'display.sectionDetailRoi.height', { min: 0, max: 1 });
    if (
      !(roi.width > 0) ||
      !(roi.height > 0) ||
      roi.x + roi.width > 1.000001 ||
      roi.y + roi.height > 1.000001
    ) {
      fail('display.sectionDetailRoi', 'must stay inside the Section canvas.');
    }
    if (roi.shape != null && !['rect', 'circle'].includes(roi.shape)) {
      fail('display.sectionDetailRoi.shape', 'must be rect or circle.');
    }
  }
  if (display.sectionCollapse != null) {
    const collapse = assertObject(display.sectionCollapse, 'display.sectionCollapse');
    assertFinite(collapse.top, 'display.sectionCollapse.top', {
      min: -PROJECT_COORDINATE_LIMIT_UM,
      max: PROJECT_COORDINATE_LIMIT_UM,
    });
    assertFinite(collapse.bottom, 'display.sectionCollapse.bottom', {
      min: -PROJECT_COORDINATE_LIMIT_UM,
      max: PROJECT_COORDINATE_LIMIT_UM,
    });
    if (!(collapse.top > collapse.bottom)) {
      fail('display.sectionCollapse', 'top must be greater than bottom.');
    }
    if (collapse.enabled != null && typeof collapse.enabled !== 'boolean') {
      fail('display.sectionCollapse.enabled', 'must be boolean.');
    }
    if (collapse.scaleLinked != null && typeof collapse.scaleLinked !== 'boolean') {
      fail('display.sectionCollapse.scaleLinked', 'must be boolean.');
    }
    if (collapse.frontScale != null) {
      assertFinite(collapse.frontScale, 'display.sectionCollapse.frontScale', {
        min: 0.1,
        max: 10,
      });
    }
    if (collapse.backScale != null) {
      assertFinite(collapse.backScale, 'display.sectionCollapse.backScale', {
        min: 0.1,
        max: 10,
      });
    }
  }
  if (
    display.sectionScaleMode != null &&
    !['auto', 'physical'].includes(display.sectionScaleMode)
  ) {
    fail('display.sectionScaleMode', 'must be auto or physical.');
  }
}

function validateSnapshotRecords(snapshots, shared) {
  if (snapshots == null) return;
  const records = assertArray(snapshots, 'snapshots', LIMITS.snapshots);
  const ids = new Set();

  records.forEach((record, index) => {
    const path = `snapshots[${index}]`;
    assertObject(record, path);
    const id = assertString(record.id, `${path}.id`, { max: 128 });
    if (ids.has(id)) fail(`${path}.id`, 'must be unique.');
    ids.add(id);
    assertString(record.name, `${path}.name`, { max: 256 });
    const createdAt = assertString(record.createdAt, `${path}.createdAt`, { max: 64 });
    if (!Number.isFinite(Date.parse(createdAt))) fail(`${path}.createdAt`, 'must be a valid date.');
    if (record.branchId != null) assertString(record.branchId, `${path}.branchId`, { max: 128 });
    if (record.historyNodeId != null) {
      assertString(record.historyNodeId, `${path}.historyNodeId`, { max: 128 });
    }
    if (record.parentId != null) {
      assertString(record.parentId, `${path}.parentId`, { max: 128 });
      if (record.parentId === id) fail(`${path}.parentId`, 'must not reference itself.');
    }
    assertObject(record.state, `${path}.state`);
    if (record.state.snapshots != null) fail(`${path}.state.snapshots`, 'must not be nested.');
    if (record.state.snapshotBranches != null) {
      fail(`${path}.state.snapshotBranches`, 'must not be nested.');
    }
    validateProjectCore(record.state, false, shared);
  });

  records.forEach((record, index) => {
    if (record.parentId != null && !ids.has(record.parentId)) {
      fail(`snapshots[${index}].parentId`, 'references an unknown snapshot.');
    }
  });
}

function validateSnapshotBranches(snapshotBranches, snapshots, shared) {
  if (snapshotBranches == null) return;
  const value = assertObject(snapshotBranches, 'snapshotBranches');
  const version = assertInteger(value.version, 'snapshotBranches.version', { min: 1, max: 3 });
  const activeBranchId = assertString(value.activeBranchId, 'snapshotBranches.activeBranchId', {
    max: 128,
  });
  const branches = assertArray(
    value.branches,
    'snapshotBranches.branches',
    LIMITS.snapshotBranches,
  );
  const branchIds = new Set();
  const snapshotIds = new Set((snapshots || []).map((record) => record?.id).filter(Boolean));
  const nodeIds = new Set();
  const nodesById = new Map();

  if (version >= 2) {
    const nodes = assertArray(value.nodes, 'snapshotBranches.nodes', LIMITS.processHistoryNodes);
    nodes.forEach((node, index) => {
      const path = `snapshotBranches.nodes[${index}]`;
      assertObject(node, path);
      const id = assertString(node.id, `${path}.id`, { max: 128 });
      if (nodeIds.has(id)) fail(`${path}.id`, 'must be unique.');
      nodeIds.add(id);
      nodesById.set(id, node);
      assertString(node.branchId, `${path}.branchId`, { max: 128 });
      if (node.parentId != null) {
        assertString(node.parentId, `${path}.parentId`, { max: 128 });
        if (node.parentId === id) fail(`${path}.parentId`, 'must not reference itself.');
      }
      const createdAt = assertString(node.createdAt, `${path}.createdAt`, { max: 64 });
      if (!Number.isFinite(Date.parse(createdAt)))
        fail(`${path}.createdAt`, 'must be a valid date.');
      assertInteger(node.processRevision, `${path}.processRevision`, { min: 0, max: 2147483647 });
      assertObject(node.operation, `${path}.operation`);
      if (node.operation.kind != null) {
        assertString(node.operation.kind, `${path}.operation.kind`, { max: 64 });
      }
      if (node.operation.label != null) {
        assertString(node.operation.label, `${path}.operation.label`, { max: 512 });
      }
      if (version >= 3 && node.state == null) {
        fail(`${path}.state`, 'is required for restorable process history.');
      }
      if (node.state != null) {
        assertObject(node.state, `${path}.state`);
        if (node.state.snapshots != null) fail(`${path}.state.snapshots`, 'must not be nested.');
        if (node.state.snapshotBranches != null) {
          fail(`${path}.state.snapshotBranches`, 'must not be nested.');
        }
        validateProjectCore(node.state, false, shared);
      }
    });
    nodes.forEach((node, index) => {
      if (node.parentId != null && !nodeIds.has(node.parentId)) {
        fail(`snapshotBranches.nodes[${index}].parentId`, 'references an unknown process node.');
      }
    });

    if (value.cursorNodeId != null) {
      assertString(value.cursorNodeId, 'snapshotBranches.cursorNodeId', { max: 128 });
      if (!nodeIds.has(value.cursorNodeId)) {
        fail('snapshotBranches.cursorNodeId', 'references an unknown process node.');
      }
    }
    if (value.cursorSnapshotId != null) {
      assertString(value.cursorSnapshotId, 'snapshotBranches.cursorSnapshotId', { max: 128 });
      if (!snapshotIds.has(value.cursorSnapshotId)) {
        fail('snapshotBranches.cursorSnapshotId', 'references an unknown snapshot.');
      }
    }
  }

  branches.forEach((branch, index) => {
    const path = `snapshotBranches.branches[${index}]`;
    assertObject(branch, path);
    const id = assertString(branch.id, `${path}.id`, { max: 128 });
    if (branchIds.has(id)) fail(`${path}.id`, 'must be unique.');
    branchIds.add(id);
    assertString(branch.name, `${path}.name`, { max: 256 });
    if (version >= 3 && branch.parentBranchId != null) {
      assertString(branch.parentBranchId, `${path}.parentBranchId`, { max: 128 });
      if (branch.parentBranchId === id) {
        fail(`${path}.parentBranchId`, 'must not reference itself.');
      }
    }
    const createdAt = assertString(branch.createdAt, `${path}.createdAt`, { max: 64 });
    if (!Number.isFinite(Date.parse(createdAt))) fail(`${path}.createdAt`, 'must be a valid date.');

    for (const key of ['rootSnapshotId', 'headSnapshotId']) {
      if (branch[key] == null) continue;
      assertString(branch[key], `${path}.${key}`, { max: 128 });
      if (!snapshotIds.has(branch[key])) {
        fail(`${path}.${key}`, 'references an unknown snapshot.');
      }
    }

    if (version >= 2) {
      for (const key of ['rootNodeId', 'headNodeId']) {
        if (branch[key] == null) continue;
        assertString(branch[key], `${path}.${key}`, { max: 128 });
        if (!nodeIds.has(branch[key])) {
          fail(`${path}.${key}`, 'references an unknown process node.');
        }
      }
      if (branch.headState != null) {
        assertObject(branch.headState, `${path}.headState`);
        if (branch.headState.snapshots != null)
          fail(`${path}.headState.snapshots`, 'must not be nested.');
        if (branch.headState.snapshotBranches != null) {
          fail(`${path}.headState.snapshotBranches`, 'must not be nested.');
        }
        validateProjectCore(branch.headState, false, shared);
      }
    }
  });

  if (version >= 3) {
    const branchById = new Map(branches.map((branch) => [branch.id, branch]));
    branches.forEach((branch, index) => {
      if (branch.parentBranchId != null && !branchIds.has(branch.parentBranchId)) {
        fail(
          `snapshotBranches.branches[${index}].parentBranchId`,
          'references an unknown parent variant.',
        );
      }

      if (branch.id !== 'main' && branch.parentBranchId != null && branch.rootNodeId != null) {
        const origin = nodesById.get(branch.rootNodeId);
        if (origin && origin.branchId !== branch.parentBranchId) {
          fail(
            `snapshotBranches.branches[${index}].rootNodeId`,
            'must reference a Step owned by the parent Variant.',
          );
        }
      }

      const seenParents = new Set([branch.id]);
      let parentId = branch.parentBranchId;
      while (parentId != null) {
        if (seenParents.has(parentId)) {
          fail(
            `snapshotBranches.branches[${index}].parentBranchId`,
            'must not create a Variant ancestry cycle.',
          );
        }
        seenParents.add(parentId);
        parentId = branchById.get(parentId)?.parentBranchId ?? null;
      }

      if (branch.headNodeId != null && branch.rootNodeId == null) {
        fail(
          `snapshotBranches.branches[${index}].rootNodeId`,
          'is required when a Variant has a process HEAD.',
        );
      }
      if (branch.rootNodeId != null && branch.headNodeId != null) {
        const visited = new Set();
        let nodeId = branch.headNodeId;
        let reachedRoot = false;
        while (nodeId != null) {
          if (visited.has(nodeId)) {
            fail(
              `snapshotBranches.branches[${index}].headNodeId`,
              'must not traverse a cyclic Step chain.',
            );
          }
          visited.add(nodeId);
          const node = nodesById.get(nodeId);
          if (!node) break;
          if (nodeId === branch.rootNodeId) {
            reachedRoot = true;
            break;
          }
          if (node.branchId !== branch.id) {
            fail(
              `snapshotBranches.branches[${index}].headNodeId`,
              'must reach the origin through Steps owned by this Variant.',
            );
          }
          nodeId = node.parentId;
        }
        if (!reachedRoot) {
          fail(
            `snapshotBranches.branches[${index}].headNodeId`,
            'must descend from the Variant origin Step.',
          );
        }
      }
    });
  }

  if (!branchIds.has(activeBranchId)) {
    fail('snapshotBranches.activeBranchId', 'references an unknown branch.');
  }

  for (let index = 0; index < (snapshots || []).length; index++) {
    const record = snapshots[index];
    if (record?.branchId != null && !branchIds.has(record.branchId)) {
      fail(`snapshots[${index}].branchId`, 'references an unknown branch.');
    }
    if (version >= 2 && record?.historyNodeId != null && !nodeIds.has(record.historyNodeId)) {
      fail(`snapshots[${index}].historyNodeId`, 'references an unknown process node.');
    }
  }

  if (version >= 2) {
    for (let index = 0; index < value.nodes.length; index++) {
      if (!branchIds.has(value.nodes[index].branchId)) {
        fail(`snapshotBranches.nodes[${index}].branchId`, 'references an unknown branch.');
      }
    }
  }
}

// Reuse strict validation, while charging every workspace's model + layout
// totals. Shared identity must not let a later state bypass the size limits.
function validateAssetInBudget(asset, path, cache, budget, validate) {
  const keys = ['polygons', 'rings', 'points'],
    cost = cache.get(asset);
  if (cost) {
    for (const key of keys) {
      budget[key] += cost[key];
      if (budget[key] > LIMITS[key]) {
        fail(
          path,
          `exceeds the project ${key === 'polygons' ? 'polygon' : key === 'rings' ? 'ring' : 'point'} budget.`,
        );
      }
    }
    return;
  }
  const before = Object.fromEntries(keys.map((key) => [key, budget[key]]));
  validate();
  cache.set(asset, Object.fromEntries(keys.map((key) => [key, budget[key] - before[key]])));
}

function validateProjectCore(project, allowSnapshots, shared = createValidationContext()) {
  assertObject(project, 'project');
  if (project.format !== 'WaferCAD-vector') fail('format', 'is not supported.');
  if (project.name != null) assertString(project.name, 'name', { max: 256 });
  if (project.version != null) {
    assertInteger(project.version, 'version', { min: 1, max: CURRENT_PROJECT_VERSION });
  }

  const budget = { polygons: 0, rings: 0, points: 0, geometry: shared.geometry };
  validateAssetInBudget(project.model, 'model', shared.models, budget, () =>
    validateModel(project.model, budget, shared.geometry),
  );
  validateAssetInBudget(project.layout, 'layout', shared.layouts, budget, () =>
    validateLayout(project.layout, budget),
  );

  const selectedLayerKeys = assertArray(
    project.selectedLayerKeys,
    'selectedLayerKeys',
    LIMITS.selectedLayerKeys,
  );
  selectedLayerKeys.forEach((key, index) => {
    assertString(key, `selectedLayerKeys[${index}]`, { max: 128 });
  });

  if (project.activeCell != null) {
    assertString(project.activeCell, 'activeCell', { max: 512 });
  }
  validateMaskTransform(project.maskTransform);
  if (project.maskSourceMode != null && !['file', 'draw'].includes(project.maskSourceMode)) {
    fail('maskSourceMode', 'must be file or draw.');
  }
  if (project.drawMask != null) validateDrawMask(project.drawMask);
  if (!['front', 'back'].includes(project.activeFace)) fail('activeFace', 'must be front or back.');
  validateRoi(project.roi);
  validateMaskRoi(project.maskRoi);
  if (
    project.maskRoiAnchor != null &&
    !['center', 'top-left', 'bottom-left', 'top-right', 'bottom-right'].includes(
      project.maskRoiAnchor,
    )
  ) {
    fail('maskRoiAnchor', 'must be a supported ROI reference point.');
  }
  if (
    project.roiAnchor != null &&
    !['center', 'top-left', 'bottom-left', 'top-right', 'bottom-right'].includes(project.roiAnchor)
  ) {
    fail('roiAnchor', 'must be a supported ROI reference point.');
  }
  validateSection(project.section);
  validatePlanViews(project.planViews);
  validateDisplay(project.display);
  validateProcessRecipe(project.processRecipe);
  if (allowSnapshots) {
    validateSnapshotRecords(project.snapshots, shared);
    validateSnapshotBranches(project.snapshotBranches, project.snapshots, shared);
  } else {
    if (project.snapshots != null) fail('snapshots', 'must not be nested.');
    if (project.snapshotBranches != null) fail('snapshotBranches', 'must not be nested.');
  }

  return project;
}

function validateRecipeValue(value, path, budget, depth = 0) {
  budget.nodes += 1;
  if (budget.nodes > LIMITS.recipeValueNodes) {
    fail(path, 'exceeds the Process Recipe value budget.');
  }
  if (depth > 12) fail(path, 'is nested too deeply.');
  if (value == null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assertFinite(value, path);
    return;
  }
  if (typeof value === 'string') {
    assertString(value, path, { allowEmpty: true, max: 4096 });
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 10000) fail(path, 'contains too many items.');
    value.forEach((item, index) =>
      validateRecipeValue(item, `${path}[${index}]`, budget, depth + 1),
    );
    return;
  }
  assertObject(value, path);
  const entries = Object.entries(value);
  if (entries.length > 256) fail(path, 'contains too many fields.');
  for (const [key, item] of entries) {
    if (key.length > 128) fail(path, 'contains an overlong field name.');
    validateRecipeValue(item, `${path}.${key}`, budget, depth + 1);
  }
}

function validateProcessRecipe(recipe) {
  if (recipe == null) return;
  assertObject(recipe, 'processRecipe');
  if (recipe.version !== 1) fail('processRecipe.version', 'must be 1.');
  assertString(recipe.name, 'processRecipe.name', { max: 160 });
  const steps = assertArray(recipe.steps, 'processRecipe.steps', LIMITS.recipeSteps),
    ids = new Set(),
    budget = { nodes: 0 };
  steps.forEach((step, index) => {
    const path = `processRecipe.steps[${index}]`;
    assertObject(step, path);
    const id = assertString(step.id, `${path}.id`, { max: 128 });
    if (ids.has(id)) fail(`${path}.id`, 'must be unique.');
    ids.add(id);
    const command = assertString(step.command, `${path}.command`, { max: 32 });
    if (
      !['deposit', 'extend', 'etch', 'implant', 'electrical', 'record', 'snapshot'].includes(
        command,
      )
    ) {
      fail(`${path}.command`, 'is not supported.');
    }
    assertObject(step.params, `${path}.params`);
    validateRecipeValue(step.params, `${path}.params`, budget);
  });
  if (recipe.activeStepId != null) {
    assertString(recipe.activeStepId, 'processRecipe.activeStepId', { max: 128 });
    if (recipe.activeStepId && !ids.has(recipe.activeStepId)) {
      fail('processRecipe.activeStepId', 'references an unknown recipe step.');
    }
  }
  try {
    normalizeProcessRecipe(recipe);
  } catch (error) {
    fail('processRecipe', error?.message || 'is not a valid Process Recipe.');
  }
}

function legacyWorldPointToMaskLocal(point, transform) {
  const rotation = (-(Number(transform?.rotation) || 0) * Math.PI) / 180,
    cos = Math.cos(rotation),
    sin = Math.sin(rotation),
    scale = Math.max(1e-12, Math.abs(Number(transform?.scale) || 1)),
    dx = Number(point[0]) - (Number(transform?.x) || 0),
    dy = Number(point[1]) - (Number(transform?.y) || 0);
  return [(dx * cos - dy * sin) / scale, (dx * sin + dy * cos) / scale];
}

function migrateLegacyMaskRoiToLocal(maskRoi, transform) {
  if (!isObject(maskRoi)) return null;
  const scale = Math.max(1e-12, Math.abs(Number(transform?.scale) || 1));
  if (maskRoi.type === 'rect' && Array.isArray(maskRoi.a) && Array.isArray(maskRoi.b)) {
    const x0 = Math.min(Number(maskRoi.a[0]), Number(maskRoi.b[0])),
      x1 = Math.max(Number(maskRoi.a[0]), Number(maskRoi.b[0])),
      y0 = Math.min(Number(maskRoi.a[1]), Number(maskRoi.b[1])),
      y1 = Math.max(Number(maskRoi.a[1]), Number(maskRoi.b[1])),
      center = legacyWorldPointToMaskLocal([(x0 + x1) / 2, (y0 + y1) / 2], transform);
    return {
      type: 'square',
      c: center,
      size: Math.max(x1 - x0, y1 - y0) / scale,
      rotation: -(Number(transform?.rotation) || 0),
    };
  }
  if (maskRoi.type === 'circle' && Array.isArray(maskRoi.c)) {
    return {
      type: 'circle',
      c: legacyWorldPointToMaskLocal(maskRoi.c, transform),
      r: Math.abs(Number(maskRoi.r) || 0) / scale,
    };
  }
  return maskRoi;
}

function migrateRoughAppearances(model) {
  if (!isObject(model)) return;

  const migrateAppearance = (appearance) => {
    if (!isObject(appearance) || appearance.kind !== 'rough') return;
    const legacyHeight = Number(appearance.meanHeight ?? appearance.amplitude);
    if (!(appearance.meanHeight > 0) && legacyHeight > 0) appearance.meanHeight = legacyHeight;
    if (!(appearance.etchDepth > 0)) {
      appearance.etchDepth = Math.max(1e-12, Number(appearance.meanHeight) || legacyHeight || 1);
    }
    if (!Number.isFinite(appearance.featureCv)) appearance.featureCv = 0.25;
    if (!Number.isFinite(appearance.heightCv)) appearance.heightCv = 0.25;
    appearance.featureCv = Math.max(0, Math.min(1, appearance.featureCv));
    appearance.heightCv = Math.max(0, Math.min(1, appearance.heightCv));
    appearance.morphology = 'stochastic';
    if (!['inverted', 'normal'].includes(appearance.polarity)) appearance.polarity = 'inverted';
    if (typeof appearance.profileId !== 'string' || !appearance.profileId) {
      appearance.profileId = `rough-${Number(appearance.seed) >>> 0}`;
    }
    delete appearance.amplitude;
  };

  for (const region of model.regions || []) {
    for (const segment of region.stack || []) {
      migrateAppearance(segment.frontSurface);
      migrateAppearance(segment.backSurface);
    }
  }
  for (const implant of model.implants || []) {
    for (const patch of implant.patches || []) migrateAppearance(patch.surfaceAppearance);
  }
}

function migrateProjectCore(project) {
  if (!isObject(project)) return project;
  const version = project.version == null ? 1 : project.version;
  if (!Number.isInteger(version) || version < 1 || version > CURRENT_PROJECT_VERSION) {
    fail('version', `must be between 1 and ${CURRENT_PROJECT_VERSION}.`);
  }

  if (version < 2) {
    if (project.roiAnchor == null) project.roiAnchor = 'center';
    if (project.display == null) project.display = {};
    if (isObject(project.display)) {
      if (project.display.threeOpacity == null) project.display.threeOpacity = 1;
      if (project.display.threeShowBorders == null) project.display.threeShowBorders = false;
    }
  }
  if (version < 3 && isObject(project.model) && isObject(project.model.units)) {
    // Legacy relative-Z projects already used the same numeric Z amount as µm
    // for Conformal lateral offsets. Preserve those numbers and make the unit
    // contract explicit instead of inventing a non-recoverable scale factor.
    if (project.model.units.z === 'relative') project.model.units.z = 'µm';
  }
  if (version < 6) {
    if (!['file', 'draw'].includes(project.maskSourceMode)) project.maskSourceMode = 'file';
    if (!isObject(project.drawMask)) project.drawMask = { nextShapeId: 1, shapes: [] };
  }
  if (version < 7) {
    if (project.maskRoi == null) project.maskRoi = null;
    if (project.maskRoiAnchor == null) project.maskRoiAnchor = 'center';
  }
  if (version < 8 && project.maskRoi != null) {
    project.maskRoi = migrateLegacyMaskRoiToLocal(project.maskRoi, project.maskTransform);
  }
  if (version < 12) migrateRoughAppearances(project.model);
  if (version < 10 && isObject(project.model)) {
    if (!Array.isArray(project.model.implants)) project.model.implants = [];
    if (!Number.isInteger(project.model.nextImplantId) || project.model.nextImplantId < 1) {
      project.model.nextImplantId = project.model.implants.length + 1;
    }
  }
  if (version < 14 && isObject(project.model)) {
    if (!Array.isArray(project.model.electricalRegions)) project.model.electricalRegions = [];
    if (
      !Number.isInteger(project.model.nextElectricalRegionId) ||
      project.model.nextElectricalRegionId < 1
    ) {
      project.model.nextElectricalRegionId = project.model.electricalRegions.length + 1;
    }
  }
  if (version < 11) {
    if (project.display == null) project.display = {};
    if (isObject(project.display) && project.display.sectionShowBorders == null) {
      project.display.sectionShowBorders = false;
    }
    if (isObject(project.model)) {
      for (const implant of project.model.implants || []) {
        if (!isObject(implant)) continue;
        if (typeof implant.visible !== 'boolean') implant.visible = true;
        delete implant.border;
        for (const patch of implant.patches || []) {
          if (!isObject(patch) || patch.surfaceAppearance != null) continue;
          const match = (project.model.regions || []).find((region) => {
            const stack = region?.stack || [];
            const segment = implant.face === 'back' ? stack[0] : stack.at(-1);
            if (!segment || segment.layerId !== patch.layerId) return false;
            const z = implant.face === 'back' ? segment.z0 : segment.z1;
            return Math.abs(Number(z) - Number(patch.z)) <= 1e-9;
          });
          const stack = match?.stack || [];
          const segment = implant.face === 'back' ? stack[0] : stack.at(-1);
          const appearance = implant.face === 'back' ? segment?.backSurface : segment?.frontSurface;
          patch.surfaceAppearance = isObject(appearance) ? structuredClone(appearance) : null;
        }
      }
    }
  }
  project.version = CURRENT_PROJECT_VERSION;
  return project;
}

export function migrateProjectFile(project) {
  const migrated = structuredClone(project);
  migrateProjectCore(migrated);
  if (Array.isArray(migrated.snapshots)) {
    for (const record of migrated.snapshots) {
      if (isObject(record) && isObject(record.state)) migrateProjectCore(record.state);
    }
  }
  if (isObject(migrated.snapshotBranches)) {
    for (const node of migrated.snapshotBranches.nodes || []) {
      if (isObject(node) && isObject(node.state)) migrateProjectCore(node.state);
    }
    for (const branch of migrated.snapshotBranches.branches || []) {
      if (isObject(branch) && isObject(branch.headState)) migrateProjectCore(branch.headState);
    }
  }
  return migrated;
}

export function validateProcessModel(model) {
  const geometry = createValidationContext().geometry;
  const budget = { polygons: 0, rings: 0, points: 0, geometry };
  validateModel(model, budget, geometry);
  return model;
}

export function validateProjectFile(project) {
  return validateProjectCore(project, true, createValidationContext());
}

// A batch shares only transient validation work; no cache survives this synchronous call.
export function validateProjectFiles(projects) {
  const shared = createValidationContext();
  for (const project of projects) validateProjectCore(project, true, shared);
  return projects;
}
