import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { auditQ2ReleasedMaterial } from './transmon-q2-local-proof.mjs';
import { assertNominalTransmonDoses } from './transmon-paper-dose-contract.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../site/project-io.js');
const { arrayParts, rectangleGeometry, translateGeometry } = await import('../site/model-array.js');
const { intersection, materialGeometryArea, materialBoundsQuery } =
  await import('../site/material-process-boolean.js');
const { parseGDS } = await import('../site/gds.js');
const input = process.argv[2];
const gdsPath = process.env.WAFERCAD_TRANSMON_GDS;
if (!input || !gdsPath)
  throw Error('Supply the completed .wafercad path and WAFERCAD_TRANSMON_GDS.');
const bytes = await readFile(input);
const project = await readProjectFile(new Blob([bytes]));
const sourceBytes = await readFile(
  new URL(
    '../examples/projects/transmon-nature-communications-2025-candidate/chip2-full-source-mask-only.wafercad.gz',
    import.meta.url,
  ),
);
const source = await readProjectFile(new Blob([gunzipSync(sourceBytes)]));
const sha = (value) => createHash('sha256').update(value).digest('hex');
assert.equal(sha(sourceBytes), '6c7fdad7537dbafa9417515e60c1e9b8a145257fbd6bc5ef0274eeb4626e5205');
assert.deepEqual(project.layout, source.layout);
assert.equal(project.layout.elements.length, 39487);
assert.equal(project.model.width, 10000);
assert.equal(project.model.height, 10000);
assert.equal(project.snapshotBranches.nodes.length, 28);
assert.equal(project.processRecipe.steps.length, 27);
assert.equal(project.snapshotBranches.cursorNodeId, 'transmon-process-27');
assert.deepEqual(project.snapshotBranches.nodes.at(-1).state.model, project.model);
assertNominalTransmonDoses(project.processRecipe.steps);
const materialNames = new Map(project.model.layers.map((layer) => [layer.id, layer.name]));
const sacrificial = new Set(
  project.model.layers
    .filter((layer) => ['AZ 5214E', 'MMA', 'PMMA'].includes(layer.name))
    .map((layer) => layer.id),
);
const parts = arrayParts(project.model);
const query = materialBoundsQuery(parts, (part) => [
  part.bounds.minX,
  part.bounds.minY,
  part.bounds.maxX,
  part.bounds.maxY,
]);
for (const part of parts)
  for (const region of part.model.regions)
    assert.ok(
      region.stack.every((segment) => !sacrificial.has(segment.layerId)),
      'Saved final project contains sacrificial material.',
    );
const gds = await readFile(gdsPath);
assert.equal(sha(gds), '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02');
const parsed = parseGDS(gds.buffer.slice(gds.byteOffset, gds.byteOffset + gds.byteLength));
const refs = parsed.cells
  .get('chip2')
  .elements.filter((element) => element.kind === 'sref' && /^(?:jj|squid)_/.test(element.name));
assert.equal(refs.length, 12);
const sites = [];
for (const ref of refs) {
  const [x, y] = ref.xy;
  const box = { minX: x - 20, minY: y - 20, maxX: x + 20, maxY: y + 20 };
  const window = rectangleGeometry(box);
  const volumes = Object.fromEntries(project.model.layers.map((layer) => [layer.name, 0]));
  let barrierSandwichAreaUm2 = 0;
  for (const part of query([box.minX, box.minY, box.maxX, box.maxY])) {
    const localWindow = translateGeometry(window, -part.x, -part.y);
    for (const region of part.model.regions) {
      const area = materialGeometryArea(intersection(region.geom, localWindow));
      if (!area) continue;
      for (const segment of region.stack)
        volumes[materialNames.get(segment.layerId)] += area * (segment.z1 - segment.z0);
      for (let i = 1; i < region.stack.length - 1; i++) {
        const [lower, oxide, upper] = region.stack.slice(i - 1, i + 2);
        if (
          materialNames.get(lower.layerId) === 'Al1' &&
          materialNames.get(oxide.layerId) === 'AlOx (illustrative thickness)' &&
          ['Al2', 'Al3'].includes(materialNames.get(upper.layerId)) &&
          Math.abs(lower.z1 - oxide.z0) <= 1e-8 &&
          Math.abs(oxide.z1 - upper.z0) <= 1e-8
        )
          barrierSandwichAreaUm2 += area;
      }
    }
  }
  for (const name of ['Al1', 'Al2', 'Al3', 'Al4 contact', 'Al5 contact', 'Al6 contact'])
    assert.ok(volumes[name] > 0, `${ref.name} at (${x},${y}) has no retained ${name}.`);
  if (x !== 4500)
    assert.ok(
      barrierSandwichAreaUm2 > 0,
      `Primary junction (${x},${y}) has no saved Al/AlOx/Al sandwich.`,
    );
  sites.push({ sourceCell: ref.name, xUm: x, yUm: y, volumeUm3: volumes, barrierSandwichAreaUm2 });
}
const q2TerminalProof = await auditQ2ReleasedMaterial(project.model, { origin: [1400, 2513] });
const report = {
  artifact: resolve(input),
  artifactSha256: sha(bytes),
  originalPolygons: project.layout.elements.length,
  historyStates: 28,
  recipeSteps: 27,
  nativeArrayInstances: project.model.array?.instances.length || 1,
  nativeArrayTemplates: project.model.array?.templates.length || 1,
  sites,
  q2TerminalProof,
  evidenceBoundary:
    'Persisted geometric material and History proof with a Q2 terminal connectivity gate. Assumed undercut, angle alignment and illustrative horizontal oxide; no calibrated transport or experimental device acceptance.',
};
await writeFile(`${input}.persisted-proof.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
assert.ok(
  q2TerminalProof.geometryAccepted,
  'The released Q2 junction failed terminal connectivity.',
);
