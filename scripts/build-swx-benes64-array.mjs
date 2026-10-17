/**
 * Importable WaferCAD project for FULL 64x64 Benes network.
 * The 3520 Mask objects are diagnostic. 3D model is a display-only
 * substrate, NOT a fabricated 352-MEMS or released-BOX reconstruction.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';
import {
  createBenes64Network,
  createBenes64DiagnosticLayout,
  BENES64_LAYOUT,
} from './swx-benes64-network.mjs';

export async function buildBenes64Project() {
  await loadGeometryKernel();
  const { createModel } = await import('../site/model.js');
  const { validateProjectFile } = await import('../site/project-schema.js');
  const { prepareProjectForWorkspaceStorage, readProjectFile } =
    await import('../site/project-io.js');
  const network = createBenes64Network();
  assert.equal(network.switches.length, 352);
  assert.equal(network.crossings.length, 1824);
  const [width, height] = BENES64_LAYOUT.fieldUm;
  const model = createModel({ shape: 'rect', width, height, thickness: 5 });
  model.layers[0].name = 'Si handle display placeholder, no MEMS SOI fabrication';
  const project = projectForBenchmark({
    model,
    section: { a: [-60, 0], b: [60, 0] },
  });
  project.name = 'Hu 2025 / 64x64 Benes / 352 SWX / 1824 crossings / TOPOLOGY';
  project.layout = createBenes64DiagnosticLayout(network);
  project.maskSourceMode = 'file';
  project.activeCell = 'BENES64_ARRAY_TOPOLOGY';
  project.selectedLayerKeys = ['90|0', '91|0', '92|0'];
  project.maskRoi = null;
  project.drawMask = { nextShapeId: 1, shapes: [] };
  validateProjectFile(project);
  const stored = prepareProjectForWorkspaceStorage(project);
  const json = JSON.stringify(stored);
  const loaded = await readProjectFile({
    size: Buffer.byteLength(json),
    text: async () => json,
  });
  validateProjectFile(loaded);
  assert.equal(loaded.layout.elements.length, 3520);
  assert.deepEqual(loaded.layout.elements, project.layout.elements);
  return {
    json,
    project: loaded,
    network,
    report: {
      doi: network.source.doi,
      stageBits: network.stageBits,
      stages: 11,
      switches: 352,
      interstageLinks: 640,
      crossingPositions: 1824,
      intersectionsByStageBoundary: network.crossingsPerTransition,
      sourceMMIArmWidthsUm: network.source.mmiArmWidthsUm,
      fabricatedEulerMMI: false,
      fabricatedMEMSAndBOX: false,
      sourceExactPlacementGds: false,
      validWaferCadSerialization: true,
      scienceSignoff: 'blocked-array-topology-only',
    },
  };
}
async function main() {
  const dest = resolve('test-results/swx-benes64');
  await mkdir(dest, { recursive: true });
  const { json, report, network } = await buildBenes64Project();
  await writeFile(resolve(dest, 'hu-2025-benes-64x64-topology.wafercad'), json);
  await writeFile(resolve(dest, 'network-contract.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(
    resolve(dest, 'network-route-inventory.json'),
    JSON.stringify({
      switches: network.switches,
      links: network.links,
      crossings: network.crossings,
      sourceCoordinatesVerified: false,
    }) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
