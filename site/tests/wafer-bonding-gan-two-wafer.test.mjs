import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const modelApi = await import('../model.js');
const vectorApi = await import('../vector-geometry.js');
const { validateProcessModel } = await import('../project-schema.js');
const { bondWaferModels } = await import('../wafer-bonding.js');

// Dimensions from Lian et al. (2022), Fig. 1/2; six straight channels and
// the 6000 × 5000 µm viewing field are explicitly *inferred* in PR #229.
// This is a two-independent-wafer geometry contract, not original author GDS.
const siliconWafer = () =>
  modelApi.createModel({ shape: 'rect', width: 6000, height: 5000, thickness: 400 });

const layerAt = (model, x, y, z) => {
  const region = model.regions.find((item) => vectorApi.pointInMulti([x, y], item.geom));
  return region?.stack.find((segment) => segment.z0 < z && z1Above(segment, z))?.layerId ?? null;
};
const z1Above = (segment, z) => segment.z1 > z;

function etched(model, face, geometry, depthUm) {
  const result = modelApi.applyOperation(model, {
    type: 'etch',
    face,
    thickness: depthUm,
    area: geometry,
    etchProfile: 'directional',
  });
  assert.equal(result.changed, true, result.error);
}

test('two independent 400 µm Si wafers form 800 µm interposer and preserve connected 2-sided stepped voids', () => {
  const lower = siliconWafer();
  const upper = siliconWafer();
  // Reported lower cavity XY 700×900 µm, DRIE 200 µm from first wafer front.
  etched(lower, 'front', vectorApi.rectMulti(700, 900), 200);
  // Reported top channel envelope 380×760 µm, DRIE 200 µm from upper back.
  etched(upper, 'back', vectorApi.rectMulti(380, 760), 200);
  const stripeCenters = [-150, -90, -30, 30, 90, 150];
  const straightStripes = vectorApi.unionGeometries(
    stripeCenters.map((x) => vectorApi.rectMulti(30, 760, x, 0)),
  );
  // Illustrative cap microchannel etch: 30 µm opening/30 µm ribs, inferred six lanes.
  etched(upper, 'front', straightStripes, 200);
  const priorLower = structuredClone(lower);
  const priorUpper = structuredClone(upper);

  const result = bondWaferModels(lower, upper, {
    receiverFace: 'front',
    donorFace: 'back',
    donorId: 'independent-upper-silicon',
  });
  const assembled = result.model;
  assert.deepEqual(lower, priorLower, 'separate lower process must remain intact');
  assert.deepEqual(upper, priorUpper, 'separate upper process must remain intact');
  const [lowZ, highZ] = modelApi.modelBoundsZ(assembled);
  assert.equal(highZ - lowZ, 800);
  assert.equal(lowZ, -200);
  assert.equal(highZ, 600);
  assert.equal(assembled.layers.length, 2);
  assert.equal(result.interface.z, 200);

  // Inspect a representative channel (X=-30, Y=0) at each physical tier.
  for (const z of [100, 250, 350, 450, 550]) {
    assert.equal(layerAt(assembled, -30, 0, z), null, 'connected coolant void at Z=' + z);
  }
  assert.equal(layerAt(assembled, 0, 0, 550), result.donorLayerIds.base, 'rib is solid');
  assert.equal(layerAt(assembled, 300, 0, 350), result.donorLayerIds.base);
  assert.equal(layerAt(assembled, 600, 0, 100), 'base', 'lower wafer support intact');
  assert.equal(layerAt(assembled, 600, 0, 500), result.donorLayerIds.base);

  // Contact occupies solid-Si land only; do not manufacture a phantom bond
  // spanning the 700 × 900 µm lower cavity.
  assert.equal(result.interface.contactAreaUm2, 6000 * 5000 - 700 * 900);
  assert.equal(vectorApi.pointInMulti([-30, 0], result.interface.contactGeometry), false);
  assert.equal(vectorApi.pointInMulti([600, 0], result.interface.contactGeometry), true);
  validateProcessModel(assembled);
});
