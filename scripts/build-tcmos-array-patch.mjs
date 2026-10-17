// Derived 4x4 T-CMOS *inspection* array. Does not invent reticle routing,
// a published die map, or a wafer fabrication recipe for the entire patch.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTcmosInverter } from './build-tcmos-inverter-example.mjs';
import { loadGeometryKernel } from './process-benchmarks.mjs';

export const TCMOS_ARRAY_SPEC = Object.freeze({
  kind: 'rect-grid',
  rows: 4,
  columns: 4,
  pitchX: 14,
  pitchY: 8,
  activeSites: 16,
});

export async function createTcmosArrayPatch(source, spec = TCMOS_ARRAY_SPEC) {
  await loadGeometryKernel();
  const { createRectangularGridArrayModel } =
    await import('../site/model-array-construction.js');
  const { translateGeometry } = await import('../site/model-array.js');
  const { validateProjectFile } = await import('../site/project-schema.js');
  const { prepareProjectForWorkspaceStorage, readProjectFile } =
    await import('../site/project-io.js');

  assert.equal(spec.rows, 4, 'This prototype is limited to a reviewed 4×4 layout');
  assert.equal(spec.columns, 4);
  assert.equal(spec.activeSites, 16);
  assert.equal(spec.pitchX, source.model.width);
  assert.equal(spec.pitchY, source.model.height);
  assert.equal(source.model.kernel, 'vector-2.5d-v1');
  assert.equal(source.layout.elements.length, 232);
  assert.equal(
    source.model.layers.find((layer) => layer.name === 'Interlayer SiO2')?.visible,
    true,
    'The source must retain its supporting interlayer dielectric',
  );

  const patch = structuredClone(source);
  const leaf = source.model;
  const array = createRectangularGridArrayModel(leaf, spec);
  const cells = array.array.instances;
  // The native array kernel stores annotation geometry once per leaf.
  // Its top-level definitions cannot contain patches.
  for (const key of ['implants', 'electricalRegions']) {
    array[key] = (leaf[key] || []).map((annotation) => ({
      ...structuredClone(annotation),
      patches: [],
    }));
  }
  // Qualitative doping is not a concentration field. Preserve all 16
  // translated XY intents globally, and resolve them against translated
  // real material, never just the central unshifted source cell.
  array.dopantRegions = (leaf.dopantRegions || []).map((record) => ({
    ...structuredClone(record),
    area: cells.flatMap(({ x, y }) => translateGeometry(record.area, x, y)),
  }));
  patch.model = array;

  const shifted = (element, { x, y }) => ({
    ...element,
    points: element.points.map(([px, py]) => [px + x, py + y]),
  });
  patch.layout = {
    ...structuredClone(source.layout),
    name: source.layout.name + ' · 4×4 unconnected test patch',
    elements: cells.flatMap((cell) =>
      source.layout.elements.map((element) => shifted(element, cell)),
    ),
    linework: cells.flatMap((cell) =>
      (source.layout.linework || []).map((element) => shifted(element, cell)),
    ),
    combos: source.layout.combos.map((combo) => ({
      ...combo,
      count: combo.count * cells.length,
    })),
    bounds: {
      minX: -array.width / 2,
      maxX: array.width / 2,
      minY: -array.height / 2,
      maxY: array.height / 2,
      width: array.width,
      height: array.height,
    },
  };
  patch.name = 'T-CMOS inverter · 4×4 CELL ARRAY PROTOTYPE (NOT FOUNDRY FLOORPLAN)';
  patch.roi = null;
  patch.section = { a: [-array.width / 2, -5.2], b: [array.width / 2, -5.2] };
  patch.display.threeCamera = null;
  patch.display.threeFastMode = true;
  patch.display.threeOpacity = 0.55;
  // This project is a derived final-stage inspection artifact, NOT a
  // 16-cell Recipe replay or legitimate continuation of 1×1 History.
  // Remove misleading single-cell Process/History records. The original
  // candidate keeps its 23-step Recipe and both Variant branches.
  delete patch.processRecipe;
  delete patch.snapshots;
  delete patch.snapshotBranches;
  validateProjectFile(patch);
  const stored = prepareProjectForWorkspaceStorage(patch);
  const json = JSON.stringify(stored);
  const opened = await readProjectFile({
    size: Buffer.byteLength(json),
    text: async () => json,
  });
  validateProjectFile(opened);
  assert.equal(opened.model.array.instances.length, 16);
  assert.equal(opened.layout.elements.length, 232 * 16);
  return { project: patch, stored, json, cells };
}

async function main() {
  const { project: source } = await buildTcmosInverter({ includeComparison: false });
  const { project, json } = await createTcmosArrayPatch(source);
  const out = resolve('test-results/tcmos');
  await mkdir(out, { recursive: true });
  const name = 'tcmos-inverter-4x4-ARRAY-PROTOTYPE.wafercad';
  await writeFile(resolve(out, name), json);
  console.log(
    JSON.stringify({
      prototype: true,
      repeat: '4x4',
      maskElements: project.layout.elements.length,
      modelKernel: project.model.kernel,
      physicalTemplates: project.model.array.templates.length,
      instances: project.model.array.instances.length,
      sourceRecipeReplayable: false,
      bytes: Buffer.byteLength(json),
      output: resolve(out, name),
    }),
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
