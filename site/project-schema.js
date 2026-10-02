export const CURRENT_PROJECT_VERSION = 10;

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
  drawMaskShapes: 10000,
  implants: 10000,
  implantPatches: 200000,
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

function assertPoint(value, path) {
  assertArray(value, path, 2);
  if (value.length !== 2) fail(path, 'must contain exactly two coordinates.');
  assertFinite(value[0], `${path}[0]`);
  assertFinite(value[1], `${path}[1]`);
}

function validatePointArray(points, path, { min = 2, budget }) {
  assertArray(points, path, LIMITS.points);
  if (points.length < min) fail(path, `must contain at least ${min} points.`);
  budget.points += points.length;
  if (budget.points > LIMITS.points) fail(path, 'exceeds the project point budget.');
  points.forEach((point, index) => assertPoint(point, `${path}[${index}]`));
}

function validateMultiPolygon(value, path, budget) {
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
    });
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
  if (appearance.kind !== 'rough') fail(`${path}.kind`, 'must be rough.');
  assertFinite(appearance.featureSize, `${path}.featureSize`, { min: 1e-12 });
  const meanHeight = assertFinite(appearance.meanHeight, `${path}.meanHeight`, { min: 1e-12 });
  assertFinite(appearance.featureCv, `${path}.featureCv`, { min: 0, max: 1 });
  assertFinite(appearance.heightCv, `${path}.heightCv`, { min: 0, max: 1 });
  assertInteger(appearance.seed, `${path}.seed`, { min: 0, max: 0xffffffff });
  assertString(appearance.profileId, `${path}.profileId`, { max: 128 });
  if (appearance.etchDepth != null) {
    const depth = assertFinite(appearance.etchDepth, `${path}.etchDepth`, { min: 1e-12 });
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
    const z0 = assertFinite(segment.z0, `${segmentPath}.z0`);
    const z1 = assertFinite(segment.z1, `${segmentPath}.z1`);
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

function geometryKernel() {
  const kernel = globalThis.polygonClipping;
  if (!kernel) throw new Error('Project geometry validation requires polygon-clipping.');
  return kernel;
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
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

function validateModelGeometry(model) {
  const pc = geometryKernel();
  const boundaryBounds = geometryBounds(model.boundary);
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
    .map((region, index) => ({ region, index, bounds: geometryBounds(region.geom) }))
    .sort((a, b) => a.bounds.minX - b.bounds.minX);
  const active = [];

  try {
    for (const current of entries) {
      const outside = pc.difference(current.region.geom, model.boundary);
      if (multiArea(outside) > areaTolerance) {
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
        const overlap = pc.intersection(previous.region.geom, current.region.geom);
        if (multiArea(overlap) > areaTolerance) {
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

function validateModel(model, budget) {
  assertObject(model, 'model');
  if (model.kernel !== 'vector-2.5d-v1') fail('model.kernel', 'is not supported.');
  if (!['circle', 'rect'].includes(model.shape)) fail('model.shape', 'must be circle or rect.');
  assertFinite(model.width, 'model.width', { min: 1e-12 });
  assertFinite(model.height, 'model.height', { min: 1e-12 });
  assertFinite(model.thickness, 'model.thickness', { min: 1e-12 });

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
      assertFinite(implant.thickness, `${path}.thickness`, { min: 1e-12 });
      assertFinite(implant.tilt, `${path}.tilt`, { min: -80, max: 80 });
      if (typeof implant.border !== 'boolean') fail(`${path}.border`, 'must be boolean.');

      const patches = assertArray(implant.patches, `${path}.patches`, LIMITS.implantPatches);
      patches.forEach((patch, patchIndex) => {
        const patchPath = `${path}.patches[${patchIndex}]`;
        assertObject(patch, patchPath);
        validateMultiPolygon(patch.geom, `${patchPath}.geom`, budget);
        if (patch.geom.length === 0) fail(`${patchPath}.geom`, 'must not be empty.');
        assertFinite(patch.z, `${patchPath}.z`);
        assertFinite(patch.zMin, `${patchPath}.zMin`);
        assertFinite(patch.zMax, `${patchPath}.zMax`);
        if (patch.zMax < patch.zMin) fail(patchPath, 'must have zMax >= zMin.');
        if (patch.z < patch.zMin - 1e-9 || patch.z > patch.zMax + 1e-9) {
          fail(`${patchPath}.z`, 'must lie within zMin/zMax.');
        }
        assertString(patch.layerId, `${patchPath}.layerId`, { max: 128 });
      });
    });
  }

  validateModelGeometry(model);

  if (model.nextImplantId != null) {
    assertInteger(model.nextImplantId, 'model.nextImplantId', { min: 1 });
  }
  assertInteger(model.nextLayerId, 'model.nextLayerId', { min: 1 });
  assertInteger(model.nextRegionId, 'model.nextRegionId', { min: 1 });
  assertInteger(model.revision, 'model.revision', { min: 0 });
  if (model.processRevision != null) {
    assertInteger(model.processRevision, 'model.processRevision', { min: 0 });
  }
}

function validateBounds(bounds, path) {
  assertObject(bounds, path);
  const minX = assertFinite(bounds.minX, `${path}.minX`);
  const minY = assertFinite(bounds.minY, `${path}.minY`);
  const maxX = assertFinite(bounds.maxX, `${path}.maxX`);
  const maxY = assertFinite(bounds.maxY, `${path}.maxY`);
  const width = assertFinite(bounds.width, `${path}.width`, { min: 0 });
  const height = assertFinite(bounds.height, `${path}.height`, { min: 0 });
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
  if (element.kind === 'path') assertFinite(element.width, `${path}.width`, { min: 0 });
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
  assertFinite(units.dbuToMicron, 'layout.units.dbuToMicron', { min: 0 });
  if (typeof units.hasPhysicalUnits !== 'boolean')
    fail('layout.units.hasPhysicalUnits', 'must be boolean.');
}

function validateMaskTransform(value) {
  const transform = assertObject(value, 'maskTransform');
  assertFinite(transform.x, 'maskTransform.x');
  assertFinite(transform.y, 'maskTransform.y');
  assertFinite(transform.scale, 'maskTransform.scale', { min: 1e-12 });
  assertFinite(transform.rotation, 'maskTransform.rotation');
}

function validateRoi(roi) {
  if (roi == null) return;
  assertObject(roi, 'roi');
  if (roi.type === 'rect') {
    assertPoint(roi.a, 'roi.a');
    assertPoint(roi.b, 'roi.b');
    return;
  }
  if (roi.type === 'circle' || roi.type === 'sector') {
    assertPoint(roi.c, 'roi.c');
    assertFinite(roi.r, 'roi.r', { min: 0 });
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
    assertFinite(maskRoi.size, 'maskRoi.size', { min: 1e-12 });
    assertFinite(maskRoi.rotation, 'maskRoi.rotation');
    return;
  }
  if (maskRoi.type === 'circle') {
    assertPoint(maskRoi.c, 'maskRoi.c');
    assertFinite(maskRoi.r, 'maskRoi.r', { min: 1e-12 });
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
      return;
    }
    if (shape.type === 'circle') {
      assertPoint(shape.c, `${path}.c`);
      assertFinite(shape.r, `${path}.r`, { min: 0 });
      return;
    }
    if (shape.type === 'polygon') {
      validatePointArray(shape.points, `${path}.points`, { min: 3, budget: { points: 0 } });
      return;
    }
    if (shape.type === 'ring' || shape.type === 'ring-sector') {
      assertPoint(shape.c, `${path}.c`);
      assertFinite(shape.innerR, `${path}.innerR`, { min: 0 });
      assertFinite(shape.outerR, `${path}.outerR`, { min: 0 });
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
}

function validatePlanViews(planViews) {
  assertObject(planViews, 'planViews');
  for (const key of ['mask', 'main']) {
    const view = assertObject(planViews[key], `planViews.${key}`);
    assertFinite(view.zoom, `planViews.${key}.zoom`, { min: 1e-6, max: 1e8 });
    assertFinite(view.panX, `planViews.${key}.panX`);
    assertFinite(view.panY, `planViews.${key}.panY`);
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
  if (display.threeShowBorders != null && typeof display.threeShowBorders !== 'boolean') {
    fail('display.threeShowBorders', 'must be boolean.');
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
    assertObject(record.state, `${path}.state`);
    if (record.state.snapshots != null) fail(`${path}.state.snapshots`, 'must not be nested.');
    validateProjectCore(record.state, false, shared);
  });
}

function validateProjectCore(
  project,
  allowSnapshots,
  shared = { models: new WeakSet(), layouts: new WeakSet() },
) {
  assertObject(project, 'project');
  if (project.format !== 'WaferCAD-vector') fail('format', 'is not supported.');
  if (project.name != null) assertString(project.name, 'name', { max: 256 });
  if (project.version != null) {
    assertInteger(project.version, 'version', { min: 1, max: CURRENT_PROJECT_VERSION });
  }

  const budget = { polygons: 0, rings: 0, points: 0 };
  if (!shared.models.has(project.model)) {
    validateModel(project.model, budget);
    shared.models.add(project.model);
  }
  if (!shared.layouts.has(project.layout)) {
    validateLayout(project.layout, budget);
    shared.layouts.add(project.layout);
  }

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
    !['center', 'top-left', 'bottom-left', 'top-right', 'bottom-right'].includes(project.maskRoiAnchor)
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
  if (allowSnapshots) validateSnapshotRecords(project.snapshots, shared);
  else if (project.snapshots != null) fail('snapshots', 'must not be nested.');

  return project;
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
  for (const region of model.regions || []) {
    for (const segment of region.stack || []) {
      for (const field of ['frontSurface', 'backSurface']) {
        const appearance = segment[field];
        if (!isObject(appearance) || appearance.kind !== 'rough') continue;
        const legacyHeight = Number(appearance.meanHeight ?? appearance.amplitude);
        if (!(appearance.meanHeight > 0) && legacyHeight > 0) appearance.meanHeight = legacyHeight;
        if (!(appearance.etchDepth > 0)) {
          appearance.etchDepth = Math.max(1e-12, Number(appearance.meanHeight) || legacyHeight || 1);
        }
        if (!Number.isFinite(appearance.featureCv)) appearance.featureCv = 0.25;
        if (!Number.isFinite(appearance.heightCv)) appearance.heightCv = 0.25;
        appearance.featureCv = Math.max(0, Math.min(1, appearance.featureCv));
        appearance.heightCv = Math.max(0, Math.min(1, appearance.heightCv));
        if (typeof appearance.profileId !== 'string' || !appearance.profileId) {
          appearance.profileId = `rough-${Number(appearance.seed) >>> 0}`;
        }
        delete appearance.amplitude;
      }
    }
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
  if (version < 9) migrateRoughAppearances(project.model);
  if (version < 10 && isObject(project.model)) {
    if (!Array.isArray(project.model.implants)) project.model.implants = [];
    if (!Number.isInteger(project.model.nextImplantId) || project.model.nextImplantId < 1) {
      project.model.nextImplantId = project.model.implants.length + 1;
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
  return migrated;
}

export function validateProjectFile(project) {
  return validateProjectCore(project, true, { models: new WeakSet(), layouts: new WeakSet() });
}
