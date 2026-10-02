import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const vendorSource = readFileSync(
  new URL('./vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;

const vg = await import('./vector-geometry.js');
const modelApi = await import('./model.js');
const { parseGDS, flattenGDS, makeDemoLayout } = await import('./gds.js');
const { validateProjectFile } = await import('./project-schema.js');
const { roughLod, roughNoise1D, roughProfileOffsetAtPoint, roughVisualBoundsZ } =
  await import('./surface-rendering.js');
const { applyOperation, createModel, layerById, recolorLayer, renameLayer, surfaceSegment } =
  modelApi;
const { difference, intersection, isEmpty, pointInMulti, rectMulti } = vg;

function regionAt(model, point) {
  return model.regions.find((region) => pointInMulti(point, region.geom)) || null;
}

assert.equal(roughLod(0).detail, 0);
assert.equal(roughLod(20).micro, 1);
const roughNoiseSample = roughNoise1D(1.25, { featureSize: 0.5, seed: 42 });
assert.equal(roughNoiseSample, roughNoise1D(1.25, { featureSize: 0.5, seed: 42 }));
assert.notEqual(roughNoiseSample, roughNoise1D(1.25, { featureSize: 0.5, seed: 43 }));

const roughAppearance = {
  featureSize: 0.5,
  meanHeight: 0.4,
  featureCv: 0.25,
  heightCv: 0.25,
  etchDepth: 0.8,
  seed: 42,
  profileId: 'rough-test',
};
const roughProfileSample = roughProfileOffsetAtPoint(1.25, -0.75, roughAppearance);
assert.equal(
  roughProfileSample,
  roughProfileOffsetAtPoint(1.25, -0.75, roughAppearance),
);
assert.ok(roughProfileSample >= -1e-12);
assert.ok(roughProfileSample <= roughAppearance.etchDepth + 1e-12);
const zeroCvAppearance = { ...roughAppearance, featureCv: 0, heightCv: 0 };
assert.equal(
  roughProfileOffsetAtPoint(1.25, -0.75, zeroCvAppearance),
  zeroCvAppearance.meanHeight,
);

const defaults = createModel();
assert.equal(defaults.width, 100000);
assert.equal(defaults.height, 100000);
assert.equal(defaults.units.xy, 'µm');
assert.equal(defaults.units.z, 'µm');
assert.equal(defaults.processRevision, 0);

const m = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const area = rectMulti(4, 4);
const add = applyOperation(m, {
  type: 'add',
  name: 'Film',
  thickness: 2,
  face: 'front',
  area,
  growth: 'direct',
});
assert.equal(add.changed, true);
assert.equal(layerById(m, add.layerId).name, 'Film');
assert.equal(surfaceSegment(regionAt(m, [0, 0]).stack).layerId, add.layerId);

const beforeTop = surfaceSegment(regionAt(m, [0, 0]).stack).z1;
applyOperation(m, {
  type: 'grow',
  targetLayerId: add.layerId,
  thickness: 1,
  face: 'front',
  area,
  growth: 'direct',
});
assert.equal(surfaceSegment(regionAt(m, [0, 0]).stack).z1, beforeTop + 1);

applyOperation(m, { type: 'etch', thickness: 4, face: 'front', area });
assert.equal(surfaceSegment(regionAt(m, [0, 0]).stack).layerId, 'base');

const roughEtch = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const roughResult = applyOperation(roughEtch, {
  type: 'etch',
  thickness: 1,
  face: 'front',
  area,
  surface: {
    kind: 'rough',
    featureSize: 0.4,
    meanHeight: 0.8,
    featureCv: 0.2,
    heightCv: 0.3,
    geometryMode: 'ideal',
  },
});
assert.equal(roughResult.changed, true);
const roughSurface = surfaceSegment(regionAt(roughEtch, [0, 0]).stack);
assert.equal(roughSurface.z1, 4);
assert.equal(roughSurface.frontSurface.kind, 'rough');
assert.equal(roughSurface.frontSurface.featureSize, 0.4);
assert.equal(roughSurface.frontSurface.meanHeight, 0.8);
assert.equal(roughSurface.frontSurface.featureCv, 0.2);
assert.equal(roughSurface.frontSurface.heightCv, 0.3);
assert.equal(typeof roughSurface.frontSurface.profileId, 'string');
assert.equal(roughSurface.frontSurface.geometryMode, 'ideal');
assert.equal(Number.isInteger(roughSurface.frontSurface.seed), true);

assert.equal(roughSurface.frontSurface.etchDepth, 1);
assert.deepEqual(roughVisualBoundsZ(roughEtch, [-5, 4]), [-5, 5]);

const invalidRoughEtch = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const invalidRoughResult = applyOperation(invalidRoughEtch, {
  type: 'etch',
  thickness: 0.5,
  face: 'front',
  area,
  surface: {
    kind: 'rough',
    featureSize: 0.2,
    meanHeight: 0.8,
    featureCv: 0.2,
    heightCv: 0.2,
    geometryMode: 'ideal',
  },
});
assert.equal(invalidRoughResult.changed, false);
assert.match(invalidRoughResult.error, /Height cannot exceed Etch Depth/);
assert.equal(surfaceSegment(regionAt(invalidRoughEtch, [0, 0]).stack).z1, 5);

const smoothEtch = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
applyOperation(smoothEtch, { type: 'etch', thickness: 1, face: 'front', area });
const smoothSurface = surfaceSegment(regionAt(smoothEtch, [0, 0]).stack);
assert.equal(smoothSurface.z1, roughSurface.z1);
assert.equal(smoothSurface.frontSurface, undefined);

applyOperation(roughEtch, {
  type: 'add',
  name: 'Rough-following film',
  thickness: 0.5,
  face: 'front',
  area,
  growth: 'direct',
});
const inheritedRough = surfaceSegment(regionAt(roughEtch, [0, 0]).stack);
assert.equal(inheritedRough.frontSurface.kind, 'rough');
assert.equal(inheritedRough.frontSurface.seed, roughSurface.frontSurface.seed);
assert.equal(inheritedRough.frontSurface.profileId, roughSurface.frontSurface.profileId);

applyOperation(roughEtch, {
  type: 'etch',
  thickness: 0.1,
  face: 'front',
  area,
});
assert.equal(surfaceSegment(regionAt(roughEtch, [0, 0]).stack).frontSurface, undefined);

const direct = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const d = applyOperation(direct, {
  type: 'add',
  name: 'D',
  thickness: 2,
  face: 'front',
  area,
  growth: 'direct',
});
assert.notEqual(surfaceSegment(regionAt(direct, [2.5, 0]).stack).layerId, d.layerId);

const conformal = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const c = applyOperation(conformal, {
  type: 'add',
  name: 'C',
  thickness: 2,
  face: 'front',
  area,
  growth: 'conformal',
});
assert.equal(surfaceSegment(regionAt(conformal, [2.5, 0]).stack).layerId, c.layerId);

const directStep = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
applyOperation(directStep, {
  type: 'add',
  name: 'Ridge',
  thickness: 2,
  face: 'front',
  area: rectMulti(4, 20),
  growth: 'direct',
});
const directBlanket = applyOperation(directStep, {
  type: 'add',
  name: 'Direct blanket',
  thickness: 1,
  face: 'front',
  area: rectMulti(20, 20),
  growth: 'direct',
});
const directSide = regionAt(directStep, [2.5, 0]).stack.find(
  (segment) => segment.layerId === directBlanket.layerId,
);
assert.equal(directSide.z0, 5);
assert.equal(directSide.z1, 6);

const conformalStep = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
applyOperation(conformalStep, {
  type: 'add',
  name: 'Ridge',
  thickness: 2,
  face: 'front',
  area: rectMulti(4, 20),
  growth: 'direct',
});
const conformalBlanket = applyOperation(conformalStep, {
  type: 'add',
  name: 'Conformal blanket',
  thickness: 1,
  face: 'front',
  area: rectMulti(20, 20),
  growth: 'conformal',
});
const conformalSide = regionAt(conformalStep, [2.5, 0]).stack.find(
  (segment) => segment.layerId === conformalBlanket.layerId,
);
assert.equal(conformalSide.z0, 5);
assert.equal(conformalSide.z1, 8);
const conformalFlat = regionAt(conformalStep, [4, 0]).stack.find(
  (segment) => segment.layerId === conformalBlanket.layerId,
);
assert.equal(conformalFlat.z0, 5);
assert.equal(conformalFlat.z1, 6);

const conformalGrowStep = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const conformalGrowSeed = applyOperation(conformalGrowStep, {
  type: 'add',
  name: 'Grow seed',
  thickness: 2,
  face: 'front',
  area: rectMulti(4, 20),
  growth: 'direct',
});
applyOperation(conformalGrowStep, {
  type: 'grow',
  targetLayerId: conformalGrowSeed.layerId,
  thickness: 1,
  face: 'front',
  area: rectMulti(20, 20),
  growth: 'conformal',
});
const conformalGrowSide = regionAt(conformalGrowStep, [2.5, 0]).stack.find(
  (segment) => segment.layerId === conformalGrowSeed.layerId,
);
assert.equal(conformalGrowSide.z0, 5);
assert.equal(conformalGrowSide.z1, 8);
assert.equal(conformalGrowSide.role, 'conformal-sidewall');
assert.equal(surfaceSegment(regionAt(conformalGrowStep, [0, 0]).stack).z1, 8);

const buriedGrow = createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 });
const buriedSeed = applyOperation(buriedGrow, {
  type: 'add',
  name: 'Seed',
  thickness: 1,
  face: 'front',
  area: rectMulti(20, 20),
  growth: 'direct',
});
applyOperation(buriedGrow, {
  type: 'add',
  name: 'Cap',
  thickness: 1,
  face: 'front',
  area: rectMulti(20, 20),
  growth: 'direct',
});
const buriedRevision = buriedGrow.revision;
const buriedProcessRevision = buriedGrow.processRevision;
const buriedResult = applyOperation(buriedGrow, {
  type: 'grow',
  targetLayerId: buriedSeed.layerId,
  thickness: 1,
  face: 'front',
  area: rectMulti(20, 20),
  growth: 'direct',
});
assert.equal(buriedResult.changed, false);
assert.match(buriedResult.error, /not exposed/);
assert.equal(buriedGrow.revision, buriedRevision);
assert.equal(buriedGrow.processRevision, buriedProcessRevision);

assert.equal(renameLayer(conformal, c.layerId, 'Contact'), true);
assert.equal(layerById(conformal, c.layerId).name, 'Contact');
assert.equal(recolorLayer(conformal, c.layerId, '#55aacc'), true);
assert.equal(layerById(conformal, c.layerId).color, '#55aacc');
assert.ok(conformal.processRevision > 0);

const full = rectMulti(20, 20),
  inside = intersection(full, area),
  outside = difference(full, area);
assert.equal(isEmpty(inside), false);
assert.equal(pointInMulti([0, 0], outside), false);
assert.equal(pointInMulti([7, 0], outside), true);

const circle = createModel({ shape: 'circle', width: 20, height: 20, thickness: 10 });
assert.ok(circle.boundary[0][0].length > 100);
assert.equal(pointInMulti([0, 0], circle.boundary), true);
assert.equal(pointInMulti([10.1, 0], circle.boundary), false);

const demo = makeDemoLayout();
assert.equal(demo.linework.length, 1);
assert.ok(!demo.combos.some((x) => x.layer === 99));

function gdsReal8(value) {
  const out = new Uint8Array(8);
  if (value === 0) return out;
  let x = Math.abs(value),
    exp = 0;
  while (x >= 1) {
    x /= 16;
    exp++;
  }
  while (x < 1 / 16) {
    x *= 16;
    exp--;
  }
  out[0] = (value < 0 ? 0x80 : 0) | (exp + 64);
  for (let i = 1; i < 8; i++) {
    x *= 256;
    out[i] = Math.floor(x);
    x -= out[i];
  }
  return out;
}
function gdsRecord(type, dataType, data = new Uint8Array()) {
  const out = new Uint8Array(4 + data.length),
    v = new DataView(out.buffer);
  v.setUint16(0, out.length, false);
  out[2] = type;
  out[3] = dataType;
  out.set(data, 4);
  return out;
}
function gdsString(value) {
  const raw = new TextEncoder().encode(value),
    out = new Uint8Array(raw.length + (raw.length % 2));
  out.set(raw);
  return out;
}
function gdsI16(value) {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setInt16(0, value, false);
  return out;
}
function gdsXY(points) {
  const out = new Uint8Array(points.length * 8),
    v = new DataView(out.buffer);
  points.forEach(([x, y], i) => {
    v.setInt32(i * 8, x, false);
    v.setInt32(i * 8 + 4, y, false);
  });
  return out;
}
function concatBytes(parts) {
  const n = parts.reduce((sum, p) => sum + p.length, 0),
    out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
const units = concatBytes([gdsReal8(1e-3), gdsReal8(1e-9)]);
const gdsBytes = concatBytes([
  gdsRecord(0x03, 0x05, units),
  gdsRecord(0x05, 0x02),
  gdsRecord(0x06, 0x06, gdsString('TOP')),
  gdsRecord(0x08, 0x00),
  gdsRecord(0x0d, 0x02, gdsI16(1)),
  gdsRecord(0x0e, 0x02, gdsI16(0)),
  gdsRecord(
    0x10,
    0x03,
    gdsXY([
      [0, 0],
      [10000, 0],
      [10000, 20000],
      [0, 20000],
      [0, 0],
    ]),
  ),
  gdsRecord(0x11, 0x00),
  gdsRecord(0x07, 0x00),
]);
const parsed = parseGDS(gdsBytes.buffer),
  flat = flattenGDS(parsed, 'TOP');
assert.equal(parsed.units.xy, 'µm');
assert.ok(Math.abs(parsed.units.dbuToMicron - 0.001) < 1e-12);
assert.ok(Math.abs(flat.bounds.width - 10) < 1e-9);
assert.ok(Math.abs(flat.bounds.height - 20) < 1e-9);
assert.deepEqual(flat.elements[0].points[2], [10, 20]);

const validProject = {
  format: 'WaferCAD-vector',
  model: createModel({ shape: 'rect', width: 20, height: 20, thickness: 10 }),
  layout: {
    name: 'Empty',
    root: '',
    elements: [],
    linework: [],
    bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10, width: 20, height: 20 },
    combos: [],
    hierarchy: {},
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  },
  selectedLayerKeys: [],
  activeCell: null,
  maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
  activeFace: 'front',
  roi: null,
  section: { a: [-5, 0], b: [5, 0] },
  planViews: {
    mask: { zoom: 1, panX: 0, panY: 0 },
    main: { zoom: 1, panX: 0, panY: 0 },
  },
  display: { xyUnit: 'um', structurePalette: 'balanced', customStructurePalette: null },
};
assert.equal(validateProjectFile(validProject), validProject);

const roughProject = structuredClone(validProject);
roughProject.model.regions[0].stack[0].frontSurface = {
  kind: 'rough',
  featureSize: 0.4,
  meanHeight: 0.4,
  featureCv: 0.25,
  heightCv: 0.3,
  seed: 0xffffffff,
  profileId: 'rough-schema-test',
  etchDepth: 0.8,
  geometryMode: 'ideal',
};
assert.equal(validateProjectFile(roughProject), roughProject);

const futureRoughGeometry = structuredClone(roughProject);
futureRoughGeometry.model.regions[0].stack[0].frontSurface.geometryMode = 'explicit';
assert.throws(() => validateProjectFile(futureRoughGeometry), /geometryMode/);

const badStack = structuredClone(validProject);
badStack.model.regions[0].stack[0].z1 = badStack.model.regions[0].stack[0].z0;
assert.throws(() => validateProjectFile(badStack), /z1 > z0/);

const badLayerReference = structuredClone(validProject);
badLayerReference.model.regions[0].stack[0].layerId = 'missing-layer';
assert.throws(() => validateProjectFile(badLayerReference), /unknown layer/);

const badLayout = structuredClone(validProject);
badLayout.layout = null;
assert.throws(() => validateProjectFile(badLayout), /layout must be an object/);

console.log('WaferCAD self-test: OK');
