import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vendor = { exports: {} };
new Function(
  'module',
  'exports',
  readFileSync(new URL('../vendor/polygon-clipping.umd.js', import.meta.url), 'utf8'),
)(vendor, vendor.exports);
globalThis.polygonClipping = vendor.exports;

const { createModel, applyOperation } = await import('../model.js');
const { rectMulti, pointInMulti } = await import('../vector-geometry.js');
const { attachContinuousEtchModel, continuousModelMaterialAt } =
  await import('../continuous-etch-model.js');
const { continuousSectionAnnotationPolygons } = await import('../continuous-etch-annotations.js');
const { sectionContours, electricalRegionSectionBands, implantSectionBands } =
  await import('../model-view-geometry.js');
const { validateExperimentalPhysicalFacetModel, attachExperimentalPhysicalFacetOwner } =
  await import('../experimental/physical-facets/physical-facet-model.js');

const A = [-10, 0];
const B = [10, 0];
function annotatedPredecessor() {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 20 });
  for (const op of [
    {
      type: 'electrical',
      name: 'Buried channel',
      thickness: 8,
      face: 'front',
      area: rectMulti(14, 14),
      electricalRegionType: 'n-accumulation',
      electricalRegionSource: 'induced',
    },
    {
      type: 'implant',
      name: 'Buried dopant',
      thickness: 7,
      depthStart: 0.2,
      face: 'front',
      area: rectMulti(12, 12),
    },
  ]) {
    const result = applyOperation(model, op);
    assert.equal(result.changed, true, result.error);
  }
  return model;
}
function releasedModel() {
  return attachContinuousEtchModel(annotatedPredecessor(), {
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 4,
    verticalUm: 4,
    shape: 'circular',
  });
}

test('Continuous Section intersects each Electrical/Implant annotation with surviving owner material', () => {
  const model = releasedModel();
  const original = JSON.stringify(model);
  const beforeElectrical = electricalRegionSectionBands(model, A, B);
  const beforeImplants = implantSectionBands(model, A, B);
  assert.ok(beforeElectrical.length && beforeImplants.length);
  const contours = sectionContours(model, A, B);
  const { electrical, implants } = continuousSectionAnnotationPolygons(model, A, B, contours);
  assert.ok(electrical.length && implants.length, 'Some deep annotation must survive release');
  const sourceElectricalId = model.electricalRegions[0].id;
  const sourceImplantId = model.implants[0].id;
  assert.ok(electrical.every((item) => item.electricalRegionId === sourceElectricalId));
  assert.ok(implants.every((item) => item.implantId === sourceImplantId));

  let keptElectrical = 0;
  let keptImplants = 0;
  let rejectedVoid = 0;
  for (let x = -8; x <= 8; x += 0.4) {
    for (let z = 0; z < 10; z += 0.25) {
      const t = (x + 10) / 20;
      const material = continuousModelMaterialAt(model, [x, 0, z]);
      const e = electrical.some((item) => pointInMulti([t, z], item.polys));
      const i = implants.some((item) => pointInMulti([t, z], item.polys));
      if (!material) {
        assert.equal(e, false, `Electrical leaked into release void at ${x}, ${z}`);
        assert.equal(i, false, `Implant leaked into release void at ${x}, ${z}`);
        rejectedVoid++;
      } else {
        if (e) keptElectrical++;
        if (i) keptImplants++;
      }
    }
  }
  assert.ok(keptElectrical > 15 && keptImplants > 15);
  assert.ok(rejectedVoid > 15);
  assert.equal(
    JSON.stringify(model),
    original,
    'Rendering derivation must not mutate physical owner',
  );
});

test('Continuous annotations respect visibility and zero surviving material', () => {
  const source = annotatedPredecessor();
  source.electricalRegions[0].visible = false;
  source.implants[0].visible = false;
  const model = attachContinuousEtchModel(source, {
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 4,
    verticalUm: 4,
    shape: 'circular',
  });
  const empty = continuousSectionAnnotationPolygons(model, A, B);
  assert.equal(empty.electrical.length, 0);
  assert.equal(empty.implants.length, 0);
  assert.equal(continuousSectionAnnotationPolygons(model, [0, 0], [0, 0]).electrical.length, 0);
  const tampered = structuredClone(model);
  tampered.implants[0].visible = true;
  assert.throws(
    () => continuousSectionAnnotationPolygons(tampered, A, B),
    /reference material changed/,
    'Continuous model must reject unauthorized annotation changes',
  );
});

test('Experimental Physical Facet rejects annotated source models rather than painting fake sections', () => {
  const model = createModel({ shape: 'rect', width: 12.8, height: 12.8, thickness: 251 });
  const annotated = annotatedPredecessor();
  model.electricalRegions = structuredClone(annotated.electricalRegions);
  assert.throws(
    () =>
      attachExperimentalPhysicalFacetOwner(model, {
        layerId: 'base',
        pitch: 6.4,
        height: 4.5,
        topPlaneZ: 125.5,
        bottomPlaneZ: -125.5,
        domain: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 },
      }),
    /annotations are not supported/,
  );
  assert.equal(validateExperimentalPhysicalFacetModel(model), null);
});
