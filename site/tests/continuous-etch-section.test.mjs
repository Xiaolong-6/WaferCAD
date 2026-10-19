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

const { expandProjectStorage } = await import('../project-io.js');
const { attachContinuousEtchModel, continuousModelMaterialAt } =
  await import('../continuous-etch-model.js');
const { continuousSectionContours } = await import('../continuous-etch-section.js');
const { sectionContours } = await import('../model-view-geometry.js');
const { pointInMulti } = await import('../vector-geometry.js');
const { restoreContinuousMaterialOwner } = await import('../continuous-material-owner.js');
const { continuousFrontZ } = await import('../continuous-etch-geometry.js');

const project = expandProjectStorage(
  JSON.parse(readFileSync(new URL('../examples/suspended-silica-microdisks.wafercad', import.meta.url))),
);
const predecessor = project.snapshots.find((node) => node.id === 'snapshot-microdisk-07')?.state?.model;
const sectionA = [-175, 0];
const sectionB = [175, 0];
function device() {
  return attachContinuousEtchModel(predecessor, {
    face: 'front',
    targetLayerIds: ['base'],
    lateralUm: 36,
    verticalUm: 36,
    shape: 'circular',
  });
}

test('native Microdisk Section unifies the continuous material silhouette', () => {
  const model = device();
  const before = JSON.stringify(model);
  const contours = sectionContours(model, sectionA, sectionB);
  assert.deepEqual(contours.map((c) => c.layerId).sort(), ['base', 'layer-1']);
  assert.equal(contours.find((c) => c.layerId === 'base').polys.length, 1);
  assert.equal(contours.find((c) => c.layerId === 'layer-1').polys.length, 1);
  assert.equal(JSON.stringify(model), before, 'No display operation may change canonical geometry');
});

test('native Section polygons agree with exact Kernel away from chord discretization', () => {
  const model = device();
  const contours = sectionContours(model, sectionA, sectionB);
  const front = restoreContinuousMaterialOwner(model.continuousEtchOwner).fronts[0];
  let checked = 0;
  for (let x = -158; x <= 158; x += 4.5) {
    for (let z = -38; z <= 41; z += 3.3) {
      if (Math.abs(z - continuousFrontZ(front, [x, 0])) < 0.65) continue;
      const expected = continuousModelMaterialAt(model, [x, 0, z]);
      const actual = contours.filter((item) =>
        pointInMulti([(x + 175) / 350, z], item.polys),
      ).map((item) => item.layerId);
      assert.deepEqual(actual, expected ? [expected] : [],
        'Material mismatch at X=' + x + ' Z=' + z);
      checked++;
    }
  }
  assert.ok(checked > 1600);
});

test('Section display sampling cannot modify continuous release geometry', () => {
  const model = device();
  const before = JSON.stringify(model);
  const fine = continuousSectionContours(model, sectionA, sectionB, { maxStepUm: 0.12 });
  const coarse = continuousSectionContours(model, sectionA, sectionB, { maxStepUm: 1.2 });
  const n = (contours) => contours.reduce(
    (total, entry) => total + entry.polys.reduce((sum, poly) => sum + poly[0].length, 0), 0);
  assert.ok(n(fine) > n(coarse));
  assert.equal(JSON.stringify(model), before);
  assert.throws(() => continuousSectionContours(model, sectionA, sectionB, { maxStepUm: 0 }), RangeError);
});
