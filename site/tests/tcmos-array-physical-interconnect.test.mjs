// Scientific validation of the SEPARATE 4x4 routed-material experiment.
// This does not certify paper fidelity, ohmic contacts, transport or a
// replayable 23-step routed Recipe/History.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { buildTcmosPhysicalRoutedVariant } from '../../scripts/build-tcmos-array-physical-interconnect.mjs';
import { readTcmosReferenceMask } from '../../scripts/tcmos-svg-mask.mjs';

await loadGeometryKernel();
const { pointInMulti } = await import('../vector-geometry.js');
const { validateProjectFile, validateProcessModel } = await import('../project-schema.js');
const { readProjectFile } = await import('../project-io.js');
const approx = (a, b) => Math.abs(a - b) < 1e-9;
// Prefer the APPROVED persisted result of the existing 23-step reconstruction
// over recomputing 23 process steps for every routed science test. The separate
// reconstruction tests still enforce source Recipe/History/rebuild parity.
const approvedProjectUrl = new URL(
  '../../examples/projects/tcmos-ternary-inverter-2019-candidate/tcmos-ternary-inverter-130nm.wafercad',
  import.meta.url,
);
let generated;
async function fixture() {
  if (!generated) generated = (async () => {
    const source = await readProjectFile(new Blob([await readFile(approvedProjectUrl)]));
    validateProjectFile(source);
    assert.equal(source.processRecipe?.steps?.length, 23,
      'The routed candidate must come from the approved 23-step source project');
    assert.equal(source.layout.elements.length, 232);
    const approvedSvg = readTcmosReferenceMask();
    const approvedMasks = approvedSvg.flatMap((group) => group.shapes.map((shape) => ({
      layer: group.layer, datatype: group.datatype, points: shape.points,
    })));
    assert.deepEqual(
      source.layout.elements.map(({ layer, datatype, points }) => ({ layer, datatype, points })),
      approvedMasks,
      'Persisted paper-derived source must preserve all 232 exact approved SVG polygons',
    );
    assert.equal(source.model.kernel, 'vector-2.5d-v1');
    const beforeModel = structuredClone(source.model);
    const beforeLayout = structuredClone(source.layout);
    const beforeHistory = structuredClone(source.snapshotBranches);
    const routed = await buildTcmosPhysicalRoutedVariant(source);
    assert.deepEqual(source.model, beforeModel,
      'Routed physical prototype mutated the original 23-step material model');
    assert.deepEqual(source.layout, beforeLayout,
      'Routed physical prototype changed the approved original File Mask');
    assert.deepEqual(source.snapshotBranches, beforeHistory,
      'Routed prototype mutated source Recovery/History');
    assert.equal(routed.report.originalModelKernel, 'vector-2.5d-array-v1');
    return routed;
  })();
  return generated;
}
test('physical post-Recipe 4x4 contains nine genuine new 2.5D material layers, source intact', async () => {
  const { project, json, report } = await fixture();
  validateProcessModel(project.model);
  validateProjectFile(project);
  assert.equal(project.model.kernel, 'vector-2.5d-v1');
  assert.ok(!project.model.array);
  assert.equal(report.physicalModelIntegrated, true);
  assert.equal(report.originalMaskPolygons, 3712);
  assert.equal(report.extraMaskPolygons, 251);
  assert.equal(project.layout.elements.length, 3963);
  assert.equal(project.layout.combos.length, 14);
  assert.equal(report.materialLayersAdded, 9);
  assert.equal(report.graph.continuousNets, 19);
  assert.equal(report.dielectricAndViaStages.length, 3);
  assert.deepEqual(report.viaFootprintChecks.map((check) => check.viaSites),
    [64, 64, 12]);
  assert.deepEqual(report.viaFootprintChecks.map((check) => check.name),
    ['VIA12 W (illustrative)', 'VIA23 W (illustrative)', 'VIA34 W (illustrative)']);
  for (const check of report.viaFootprintChecks) {
    assert.ok(check.actualAreaUm2 > 0);
    assert.ok(check.missingAreaUm2 < 1e-12,
      check.name + ': real physical Via opening was only partly filled');
    assert.ok(check.extraAreaUm2 < 1e-12,
      check.name + ': real physical Via conductor leaked beyond its mask');
  }
  assert.deepEqual(report.metalFootprintChecks.map((check) => check.shapeCount),
    [64, 44, 3]);
  assert.deepEqual(report.metalFootprintChecks.map((check) => check.name),
    ['METAL2 Al (illustrative)', 'METAL3 Al (illustrative)', 'METAL4 Al (illustrative)']);
  for (const check of report.metalFootprintChecks) {
    assert.ok(check.actualAreaUm2 > 0);
    assert.ok(check.missingAreaUm2 < 1e-12,
      check.name + ': 2.5D film is missing part of an interconnect');
    assert.ok(check.extraAreaUm2 < 1e-12,
      check.name + ': 2.5D metal is outside the approved routed footprint');
  }
  assert.ok(report.finalRegionCount > report.baselineRegionCount);
  assert.ok(report.routedSurfaceMaxZ > report.originalSurfaceMaxZ);
  assert.ok(!project.processRecipe && !project.snapshots && !project.snapshotBranches);
  assert.equal(project.model.layers.filter((l) => /^(ILD[234]|VIA\d\d|METAL[234])/.test(l.name)).length, 9);
  const roundtrip = await readProjectFile({
    size: Buffer.byteLength(json), text: async () => json,
  });
  validateProjectFile(roundtrip);
  assert.equal(roundtrip.model.regions.length, project.model.regions.length);
  assert.equal(roundtrip.layout.elements.length, project.layout.elements.length);
});

test('all 140 Via physical columns land on actual metal above and below, without oxide-filled holes', async () => {
  const { project, routed, report } = await fixture();
  const regions = project.model.regions;
  const byId = new Map(project.model.layers.map(({ id, name }) => [id, name]));
  const mating = {
    M1: ['METAL1 Al', 'VIA12 W (illustrative)', 'METAL2 Al (illustrative)'],
    M2: ['METAL2 Al (illustrative)', 'VIA23 W (illustrative)', 'METAL3 Al (illustrative)'],
    M3: ['METAL3 Al (illustrative)', 'VIA34 W (illustrative)', 'METAL4 Al (illustrative)'],
  };
  for (const via of routed.vias) {
    const rect = via.rect;
    const mid = [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2];
    const owned = regions.filter((r) => pointInMulti(mid, r.geom));
    assert.equal(owned.length, 1, via.id + ': physical XY partition ambiguity');
    const stack = owned[0].stack;
    const names = stack.map((segment) => byId.get(segment.layerId));
    const [lower, viaName, upper] = mating[via.from];
    const index = names.indexOf(viaName);
    assert.ok(index >= 1 && index + 1 < names.length,
      via.id + ': missing physical via material');
    assert.equal(names[index - 1], lower, via.id + ': lower metal is absent');
    assert.equal(names[index + 1], upper, via.id + ': upper metal is absent');
    assert.ok(approx(stack[index - 1].z1, stack[index].z0),
      via.id + ': lower contact is floating');
    assert.ok(approx(stack[index].z1, stack[index + 1].z0),
      via.id + ': upper contact is floating');
    assert.ok(stack[index].z1 > stack[index].z0,
      via.id + ': zero-height conductor');
    for (let j = 1; j < stack.length; j++)
      assert.ok(stack[j].z0 >= stack[j - 1].z1 - 1e-9,
        via.id + ': overlapping Z materials');
  }
  assert.deepEqual(report.dielectricAndViaStages.map((s) => s.layer), ['M2', 'M3', 'M4']);
  assert.ok(report.dielectricAndViaStages.every((s) => s.viaCount > 0));
  assert.equal(routed.vias.length, 140);
});

test('routed final fixture keeps the original 3712 SVG polygons as exact unchanged prefix', async () => {
  const { project } = await fixture();
  const original = project.layout.elements.slice(0, 3712);
  const additions = project.layout.elements.slice(3712);
  assert.equal(original.filter((s) => s.layer === 10).length, 3488);
  assert.equal(original.filter((s) => s.layer === 11).length, 64);
  assert.equal(additions.length, 251);
  assert.ok(additions.every((e) => e.sourceCell === project.layout.root),
    'Supplemental polygon must belong to the actual GDS/OAS root cell');
  for (const number of [21, 22, 23, 24, 25, 26]) {
    assert.ok(project.selectedLayerKeys.includes(number + '|0'),
      'Supplemental layer must be visible in default Mask state');
  }
  assert.deepEqual([...new Set(additions.map((s) => s.layer))].sort((a, b) => a - b),
    [21, 22, 23, 24, 25, 26]);
  const layers = new Map();
  for (const e of additions) layers.set(e.layer, (layers.get(e.layer) || 0) + 1);
  assert.deepEqual([...layers.values()], [64, 64, 64, 44, 12, 3]);
});
