import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const modelApi = await import('../model.js');
const v = await import('../vector-geometry.js');
const { validateProcessModel } = await import('../project-schema.js');
const { addQualitativeDopantRegion, resolveQualitativeDopantRegion, findDopantPolarityOverlaps } =
  await import('../dopant-regions.js');
const { findTerminalQualifiedDopantOverlaps, auditSchematicWellBodyCoverage } =
  await import('../dopant-regions.js');

test('legacy models retain their original storage shape until qualitative doping is requested', () => {
  const model = modelApi.createModel({ shape: 'rect', width: 4, height: 4, thickness: 2 });
  assert.equal(Object.hasOwn(model, 'dopantRegions'), false);
  validateProcessModel(model);
  assert.equal(JSON.stringify(model).includes('"dopantRegions"'), false);
});

test('dopant intents are host-material clipped and updated after etch without a dopant diffusion solver', () => {
  const model = modelApi.createModel({ shape: 'rect', width: 4, height: 2, thickness: 2 });
  const host = model.layers[0].id;
  const area = v.rectMulti(3, 1);
  const donor = {
    id: 'd-1',
    name: 'Illustrative donor body',
    polarity: 'donor',
    role: 'body',
    face: 'front',
    hostLayerId: host,
    area,
    sourceZ: 1,
    depthStartUm: 0.08,
    depthEndUm: 0.24,
    provenance: 'assumed',
  };
  assert.equal(addQualitativeDopantRegion(model, donor, v).changed, true);
  validateProcessModel(model);
  const before = structuredClone(model);
  for (const changes of [
    { id: 'd-1' },
    { id: 'd-2', polarity: 'n+' },
    { id: 'd-2', depthStartUm: 0.3 },
    { id: 'd-2', sourceZ: Infinity },
    { id: 'd-2', hostLayerId: 'missing' },
    { id: 'd-2', area: [] },
  ]) {
    const bad = addQualitativeDopantRegion(model, { ...donor, ...changes }, v);
    assert.equal(bad.changed, false);
    assert.deepEqual(model, before, 'Rejected semantic doping must be atomic');
  }
  const resolved = resolveQualitativeDopantRegion(model, model.dopantRegions[0], v);
  assert.ok(resolved.length);
  assert.equal(resolved[0].z0, 0.76);
  assert.equal(resolved[0].z1, 0.92);
  const actualFootprint = modelApi.geometryArea(resolved[0].geom);
  assert.ok(Math.abs(actualFootprint - 3) < 1e-8);
  assert.equal(model.regions.length, 1, 'Dopant record never becomes material layer');

  // Remove all silicon beneath half the mask. The stored intent stays put;
  // the derived dopant material volume must *not* continue through the void.
  const removed = modelApi.applyOperation(model, {
    type: 'etch',
    face: 'front',
    thickness: 2,
    area: v.rectMulti(1.5, 1, -0.75, 0),
  });
  assert.equal(removed.changed, true);
  const after = resolveQualitativeDopantRegion(model, model.dopantRegions[0], v);
  const footprint = v.unionGeometries(after.map((fragment) => fragment.geom));
  assert.ok(modelApi.geometryArea(footprint) < actualFootprint - 1);
  assert.ok(modelApi.geometryArea(footprint) > 1.4);
  validateProcessModel(model);
});

test('overlaps report qualitative opposite polarity without claiming a working junction', () => {
  const model = modelApi.createModel({ shape: 'rect', width: 4, height: 4, thickness: 2 });
  const hostLayerId = 'base';
  const common = {
    face: 'front',
    hostLayerId,
    sourceZ: 1,
    depthStartUm: 0.1,
    depthEndUm: 0.3,
    area: v.rectMulti(2, 2),
    provenance: 'illustrative',
  };
  assert.equal(
    addQualitativeDopantRegion(model, { ...common, id: 'a', role: 'body', polarity: 'acceptor' }, v)
      .changed,
    true,
  );
  assert.equal(
    addQualitativeDopantRegion(
      model,
      { ...common, id: 'd', role: 'source-drain', polarity: 'donor' },
      v,
    ).changed,
    true,
  );
  const overlaps = findDopantPolarityOverlaps(model, v);
  assert.equal(overlaps.length, 1);
  assert.equal(overlaps[0].z0, 0.7);
  assert.equal(overlaps[0].z1, 0.9);
  assert.ok(modelApi.geometryArea(overlaps[0].geom) > 3.9);
  const terminals = [
    { id: 'source', kind: 'source', geom: v.rectMulti(1, 2, -0.5, 0) },
    { id: 'drain', kind: 'drain', geom: v.rectMulti(1, 2, 0.5, 0) },
    { id: 'excluded', kind: 'drain', geom: v.rectMulti(1, 2, 3, 0) },
  ];
  const qualified = findTerminalQualifiedDopantOverlaps(model, terminals, v);
  assert.equal(qualified.length, 2);
  assert.equal(qualified[0].terminalId, 'source');
  assert.equal(qualified[1].terminalId, 'drain');
  for (const item of qualified) {
    assert.equal(item.z0, 0.7);
    assert.equal(item.z1, 0.9);
    assert.ok(Math.abs(modelApi.geometryArea(item.geom) - 2) < 1e-9);
  }
  validateProcessModel(model);
  assert.throws(() => {
    const invalid = structuredClone(model);
    invalid.dopantRegions[0].profile = { kind: 'gaussian', peakConcentration: 1e20 };
    validateProcessModel(invalid);
  }, /qualitative-interval/);
  assert.throws(() => {
    const invalid = structuredClone(model);
    invalid.dopantRegions[0].depthEndUm = -1;
    validateProcessModel(invalid);
  }, /depthEndUm/);
  const well = modelApi.applyOperation(model, {
    type: 'electrical',
    face: 'front',
    name: 'Schematic P-well',
    electricalRegionType: 'p-type',
    electricalRegionSource: 'doped',
    thickness: 0.25,
    area: v.rectMulti(1, 2, -0.5, 0),
  });
  assert.equal(well.changed, true);
  const audit = auditSchematicWellBodyCoverage(model, v, modelApi.geometryArea);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].hasMatchingSchematicWell, true);
  assert.ok(Math.abs(audit[0].bodyVolumeUm3 - 0.8) < 1e-9);
  assert.ok(Math.abs(audit[0].matchingWellVolumeUm3 - 0.3) < 1e-9);
  assert.ok(Math.abs(audit[0].outsideMatchingWellVolumeUm3 - 0.5) < 1e-9);
  assert.equal(audit[0].oppositeWellVolumeUm3, 0);
  const legacy = structuredClone(model);
  delete legacy.dopantRegions;
  validateProcessModel(legacy);
});
