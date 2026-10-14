import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTcmosInverter,
  FIELD_UM,
  GATE_LENGTH_UM,
  TCMOS_DOI,
  TCMOS_MASKS,
  TCMOS_METAL_NETS,
  tcmosLayout,
} from '../../scripts/build-tcmos-inverter-example.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const v = await import('../vector-geometry.js');

test('TCMOS mask geometry is self-contained and resolves physical 130 nm POLY length', () => {
  const layout = tcmosLayout();
  assert.deepEqual(FIELD_UM, [14, 8]);
  assert.equal(GATE_LENGTH_UM, 0.13);
  assert.equal(layout.root, 'TCMOS_130NM_LOCAL');
  assert.equal(layout.units.hasPhysicalUnits, true);
  assert.equal(layout.combos.length, 13);
  assert.equal(
    layout.elements.length,
    TCMOS_MASKS.reduce((n, m) => n + m.rectangles.length, 0),
  );
  for (const layer of TCMOS_MASKS) {
    assert.equal(
      layout.elements.filter((e) => e.layer === layer.id).length,
      layer.rectangles.length,
    );
  }
  const gates = TCMOS_MASKS.find((m) => m.id === 6).rectangles;
  assert.equal(gates[0].w, GATE_LENGTH_UM);
  assert.equal(gates[1].w, GATE_LENGTH_UM);
  assert.equal(gates[0].h, gates[1].h);
  assert.equal(gates.length, 2, 'Fig.1b has two separate POLY gates connected at METAL1');
  assert.equal(TCMOS_MASKS.find((m) => m.id === 1).rectangles.length, 8);
  assert.equal(TCMOS_MASKS.find((m) => m.id === 10).rectangles.length, 38);
  assert.equal(TCMOS_MASKS.find((m) => m.id === 12).rectangles.length, 1);
  assert.equal(TCMOS_MASKS.find((m) => m.id === 13).rectangles.length, 1);
  assert.equal(TCMOS_DOI, '10.1038/s41928-019-0272-8');
});

test('TCMOS full geometric reconstruction preserves STI, annotated CMOS and exportable History', async () => {
  const { project, validation } = await buildTcmosInverter();
  const model = project.model;
  assert.equal(validation.pass, true);
  assert.equal(project.layout.elements.length > 0, true);
  assert.equal(project.processRecipe.steps.length, validation.recipeSteps);
  assert.equal(project.snapshotBranches.nodes.length, validation.processNodes);
  assert.equal(project.snapshots.length, 5);
  assert.equal(model.implants.length, 6);
  assert.match(model.implants[0].name, /HVTN As\+ pMOS/);
  assert.match(model.implants[1].name, /HVTP BF2\+ nMOS/);
  for (const body of model.implants.slice(0, 2)) {
    assert.equal(body.depthStart, 0.08, 'HVT marker must leave the top 80nm unannotated');
    assert.equal(body.thickness, 0.24, 'HVT marker ends 240nm from the original surface');
  }
  const { implantSectionBands } = await import('../model-view-geometry.js');
  const bodyIds = new Set(model.implants.slice(0, 2).map((item) => item.id));
  const bodyBands = implantSectionBands(model, [-5.5, 0], [5.5, 0]).filter((b) =>
    bodyIds.has(b.implantId),
  );
  assert.ok(bodyBands.length >= 2, 'Both HVT buried regions intersect A-B');
  for (const band of bodyBands) {
    assert.ok(Math.abs(band.outerZ - 0.92) < 1e-8, 'Buried zone must not touch the top Si surface');
    assert.ok(
      Math.abs(band.innerZ - 0.76) < 1e-8,
      'Buried interval must end at the recorded depth',
    );
  }
  assert.equal(
    project.processRecipe.steps.filter(
      (step) => step.command === 'implant' && step.params.startDepthUm === 0.08,
    ).length,
    2,
  );
  assert.equal(model.electricalRegions.length, 2);
  assert.ok(model.layers.some((l) => l.name === 'STI SiO2 fill'));
  assert.ok(model.layers.some((l) => l.name === 'POLY gate'));
  assert.ok(model.layers.some((l) => l.name === 'W contacts'));
  assert.ok(model.layers.some((l) => l.name === 'METAL1 Al'));
  const ild = model.layers.find((l) => l.name === 'Interlayer SiO2');
  assert.ok(ild, 'Physical ILD remains present in the process geometry');
  assert.equal(ild.visible, false, 'Final inspection hides only the dielectric');
  assert.equal(project.display.threeOpacity, 0.75);
  assert.deepEqual(project.display.threeCamera, {
    position: [10.3, -11.1, 8.1],
    target: [0, -0.2, 0.95],
    fov: 34,
  });
  const head = project.snapshotBranches.nodes.at(-1);
  assert.equal(head.state.model.layers.find((l) => l.id === ild.id)?.visible, false);
  assert.equal(
    project.snapshotBranches.branches[0].headState.model.layers.find((l) => l.id === ild.id)
      ?.visible,
    false,
  );
  assert.equal(
    project.snapshots[0].state.model.layers.find((l) => l.id === ild.id)?.visible,
    false,
  );
  assert.ok(
    project.snapshotBranches.nodes
      .slice(0, -1)
      .some((node) => node.state.model.layers.some((l) => l.id === ild.id && l.visible !== false)),
    'Earlier process History must retain visible ILD',
  );
  const at = (x, y) =>
    model.regions.find((r) => v.pointInMulti([x, y], r.geom))?.stack?.at(-1)?.layerId;
  assert.ok(at(-4, 0));
  assert.ok(at(0, 0));
  const branch = project.snapshotBranches.branches[0];
  assert.equal(branch.headNodeId, project.snapshotBranches.cursorNodeId);
  assert.equal(project.processRecipe.base.thickness, 2);
  assert.ok(
    project.processRecipe.steps.some((s) => s.command === 'etch' && s.params.area === 'invert'),
  );
  assert.equal(project.processRecipe.steps.filter((s) => s.command === 'implant').length, 6);
  assert.equal(project.processRecipe.steps.at(-1).command, 'deposit');
  const metals = TCMOS_MASKS.find((mask) => mask.id === 11).rectangles;
  const contains = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  const nets = [
    { name: 'VDD', point: [-4.34, 0] },
    { name: 'VOUT p-drain', point: [-1.66, 0] },
    { name: 'VOUT n-drain', point: [1.66, 0] },
    { name: 'GND', point: [4.34, 0] },
    { name: 'VIN pMOS gate', point: [-3, 1.15] },
    { name: 'VIN nMOS gate', point: [3, 1.15] },
    { name: 'VDD pMOS body tie', point: [-5.35, -0.85] },
    { name: 'GND nMOS body tie', point: [5.35, -0.85] },
  ];
  for (const {
    name,
    point: [x, y],
  } of nets) {
    assert.ok(
      metals.some((r) => contains(r, x, y)),
      name + ' must overlap Metal1',
    );
    const region = model.regions.find((r) => v.pointInMulti([x, y], r.geom));
    const present = new Set(
      region?.stack.map(
        (segment) => model.layers.find((layer) => layer.id === segment.layerId)?.name,
      ),
    );
    assert.ok(present.has('W contacts'), name + ' must have a W contact');
    assert.ok(present.has('METAL1 Al'), name + ' must touch real Metal1');
    if (name.includes('VIN'))
      assert.ok(present.has('POLY gate'), 'VIN gate contact must sit on POLY');
  }
  assert.equal(TCMOS_METAL_NETS.length, 4, 'four independently routed Metal1 nets');
  assert.equal(
    metals.length,
    TCMOS_METAL_NETS.reduce((sum, net) => sum + net.rectangles.length, 0),
  );
  // Electrical net safety: no physical XY overlap between different Metal1 nets.
  const overlapArea = (a, b) =>
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  for (let i = 0; i < TCMOS_METAL_NETS.length; i++) {
    for (let j = i + 1; j < TCMOS_METAL_NETS.length; j++) {
      for (const first of TCMOS_METAL_NETS[i].rectangles) {
        for (const second of TCMOS_METAL_NETS[j].rectangles) {
          assert.ok(
            overlapArea(first, second) < 1e-12,
            `Metal1 short: ${TCMOS_METAL_NETS[i].name} / ${TCMOS_METAL_NETS[j].name}`,
          );
        }
      }
    }
  }
  assert.equal(
    model.implants.every((implant) => implant.tilt === 0),
    true,
    'Source does not report a nonzero beam incidence angle; no fabricated tilt allowed',
  );
  assert.ok(
    validation.keyAssumptions.some((a) => /not calibrated concentration/i.test(a)),
    'Source-vs-model disclosure must not be lost',
  );
});

test('source-correct 0° HVT and explicitly non-paper 18° tilt diagnostic remain isolated', async () => {
  const paper = await buildTcmosInverter();
  const demo = await buildTcmosInverter({ illustrativeTiltDeg: 18 });
  assert.deepEqual(
    paper.project.model.implants.map((item) => item.tilt),
    [0, 0, 0, 0, 0, 0],
  );
  assert.deepEqual(
    demo.project.model.implants.map((item) => item.tilt),
    [18, 18, 0, 0, 0, 0],
  );
  assert.deepEqual(
    demo.project.model.regions,
    paper.project.model.regions,
    'Changing display-only Implant angle must not affect simulated solid materials',
  );
  assert.equal(paper.validation.tiltSourceReported, false);
  assert.equal(demo.validation.tiltSourceReported, false);
  assert.equal(demo.validation.tiltDegrees, 18);
  assert.match(demo.project.name, /NOT REPORTED IN PAPER/);
  assert.deepEqual(demo.project.section, { a: [-4.45, 0], b: [-2.95, 0] });
  assert.equal(
    demo.project.processRecipe.steps.filter(
      (step) => step.command === 'implant' && step.params.tilt === 18,
    ).length,
    2,
  );
  const lateralWithinBuriedBand = Math.tan((18 * Math.PI) / 180) * (0.24 - 0.08);
  assert.ok(lateralWithinBuriedBand > 0.05 && lateralWithinBuriedBand < 0.055);
});
