// Fast REAL-KERNEL scientific contract for routed 4x4 2.5D geometry.
// This intentionally replaces the expensive paper-inspired 23-step cell
// with a minimal silicon/ILD/M1 seed. It must never be cited as full Recipe,
// device physics, foundry DRC, Chromium or actual 23-step source acceptance.
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';
import { readTcmosReferenceMask } from '../../scripts/tcmos-svg-mask.mjs';
import { buildTcmosPhysicalRoutedVariant } from '../../scripts/build-tcmos-array-physical-interconnect.mjs';

await loadGeometryKernel();
const { createModel, applyOperation } = await import('../model.js');
const { unionGeometries } = await import('../vector-geometry.js');
const { validateProjectFile, validateProcessModel } = await import('../project-schema.js');
const { readProjectFile } = await import('../project-io.js');

function m1MaskGeometry(groups) {
  const metal = groups.find((group) => group.name === 'METAL1');
  assert.equal(metal.shapes.length, 4);
  return unionGeometries(metal.shapes.map(({ points }) => [[points.concat([points[0]])]]));
}

function minimalPhysicalSource() {
  const groups = readTcmosReferenceMask();
  const model = createModel({ shape: 'rect', width: 14, height: 8, thickness: 2 });
  model.layers[0].name = 'Si 2 µm synthetic scientific seed';
  const oxide = applyOperation(model, {
    type: 'add', name: 'Interlayer SiO2',
    thickness: 0.45, face: 'front', growth: 'direct',
    area: model.boundary,
  });
  assert.equal(oxide.changed, true);
  const metal = applyOperation(model, {
    type: 'add', name: 'METAL1 Al',
    thickness: 0.2, face: 'front', growth: 'direct',
    area: m1MaskGeometry(groups),
  });
  assert.equal(metal.changed, true);
  assert.equal(model.layers.find((layer) => layer.name === 'Interlayer SiO2')?.visible,
    true);

  const project = projectForBenchmark({
    model,
    section: { a: [-7, 0], b: [7, 0] },
  });
  project.name = 'T-CMOS M1-only fast science seed (NOT complete Recipe)';
  project.layout = {
    name: 'Approved SVG source with minimal physical M1-only seed',
    root: 'TCMOS',
    elements: groups.flatMap((group) => group.shapes.map(({ points }) => ({
      kind: 'polygon', sourceCell: 'TCMOS',
      layer: group.layer, datatype: group.datatype, points,
    }))),
    linework: [],
    hierarchy: {},
    combos: groups.map((group) => ({
      key: 'TCMOS|' + group.layer + '|0',
      cell: 'TCMOS', layer: group.layer, datatype: 0,
      count: group.shapes.length,
    })),
    bounds: {
      minX: -7, minY: -4, maxX: 7, maxY: 4,
      width: 14, height: 8,
    },
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
    maskPresentation: {
      version: 1, background: '#ffffff',
      showStructure: true, showUnselected: true,
      layers: groups.map((group) => ({
        layer: group.layer, datatype: 0,
        color: '#92a8bf', mode: 'fill', opacity: 0.75,
      })),
    },
  };
  project.maskSourceMode = 'file';
  project.selectedLayerKeys = groups.map((group) => group.layer + '|0');
  project.drawMask = { nextShapeId: 1, shapes: [] };
  project.activeCell = 'TCMOS';
  validateProjectFile(project);
  return project;
}

test('fast real-Kernel 4x4 multimetal Via and M2-M4 physical geometry, storage', async () => {
  const source = minimalPhysicalSource();
  const approved = structuredClone(source.layout.elements);
  assert.equal(approved.length, 232);
  const { project, report, routed, json } = await buildTcmosPhysicalRoutedVariant(source);
  validateProcessModel(project.model);
  validateProjectFile(project);
  assert.equal(project.model.kernel, 'vector-2.5d-v1');
  assert.equal(project.layout.elements.length, 3963);
  assert.equal(project.model.layers.some((layer) => layer.name === 'Interlayer SiO2'), true);
  assert.deepEqual(project.layout.elements.slice(0, approved.length),
    approved, 'First original cell must preserve source-approved SVG vertices');

  assert.equal(report.graph.continuousNets, 19);
  assert.equal(report.materialLayersAdded, 9);
  assert.equal(routed.vias.length, 140);
  assert.deepEqual(report.viaFootprintChecks.map((check) => check.viaSites), [64, 64, 12]);
  assert.deepEqual(report.metalFootprintChecks.map((check) => check.shapeCount), [64, 44, 3]);
  for (const check of [...report.viaFootprintChecks, ...report.metalFootprintChecks]) {
    assert.ok(check.designedAreaUm2 > 0);
    assert.ok(check.actualAreaUm2 > 0);
    assert.ok(check.missingAreaUm2 < 1e-12,
      check.name + ': incomplete real physical material area');
    assert.ok(check.extraAreaUm2 < 1e-12,
      check.name + ': unexpected physically shorting extra conductor');
  }
  const restored = await readProjectFile({
    size: Buffer.byteLength(json), text: async () => json,
  });
  validateProjectFile(restored);
  assert.equal(restored.layout.elements.length, 3963);
  assert.ok(restored.model.regions.length > 80);
  assert.deepEqual(restored.layout.elements, project.layout.elements,
    'Lossless storage must preserve every original and routed SVG/mask vertex');
  assert.equal(restored.model.layers.length, project.model.layers.length);
  assert.ok(!restored.processRecipe && !restored.snapshotBranches,
    'Do not synthesize fake post-Recipe History in the science prototype');
});
