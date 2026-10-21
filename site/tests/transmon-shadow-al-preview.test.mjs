import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { produceAuthorShadowPreview } = await import('../../scripts/transmon-shadow-al-preview.mjs');
const { expandProjectStorage } = await import('../project-io.js');
const { validateProjectFile } = await import('../project-schema.js');

test(
  'author GDS independently builds and restores an explicitly non-Josephson Al preview',
  {
    skip: !process.env.WAFERCAD_TRANSMON_GDS,
  },
  async () => {
    const bytes = readFileSync(process.env.WAFERCAD_TRANSMON_GDS);
    const { project, report } = await produceAuthorShadowPreview(bytes);
    assert.equal(report.storageMode, 'lossless');
    assert.equal(report.actualModelThicknessUm, 675);
    assert.equal(report.alOxPresent, false);
    assert.equal(report.exposures.length, 3);
    assert.equal(report.regionCount, 8);
    assert.ok(Math.abs(report.firstTwoOverlapAreaUm2 - 0.03226249) < 1e-6);
    const exported = JSON.parse(project);
    expandProjectStorage(exported);
    validateProjectFile(exported);
    assert.equal(exported.layout.root, 'jj_width0p18');
    assert.equal(exported.model.processRevision, 3);
    assert.equal(exported.model.layers.length, 4);
    assert.equal(exported.model.regions.length, 8);
    assert.equal(
      exported.model.layers.some((layer) => /AlOx/i.test(layer.name)),
      false,
    );
  },
);

test(
  'real author Q2 three-beam preview includes a separately restored hypothetical AlOx spacer',
  { skip: !process.env.WAFERCAD_TRANSMON_GDS },
  async () => {
    const source = readFileSync(process.env.WAFERCAD_TRANSMON_GDS);
    const barrier = {
      thicknessUm: 0.002,
      provenance: 'hypothesis',
      source: 'Illustrative research thickness only; not published by the authors',
    };
    const { project, report } = await produceAuthorShadowPreview(source, { barrier });
    assert.equal(report.alOxPresent, true);
    assert.equal(report.alOxProvenance, 'hypothesis');
    assert.equal(report.tunnelJunctionValidated, false);
    assert.equal(report.exposures.length, 3);
    assert.equal(report.processRevision, 4);
    assert.equal(report.regionCount, 8);
    assert.ok(Math.abs(report.firstTwoOverlapAreaUm2 - 0.03226249) < 1e-6);
    const restored = JSON.parse(project);
    expandProjectStorage(restored);
    validateProjectFile(restored);
    assert.equal(restored.model.layers.length, 5);
    const crossing = restored.model.regions.find((region) => region.stack.length === 5);
    assert.ok(crossing, 'Restored project must contain all three Al layers and an oxide interface.');
    assert.ok(Math.abs(crossing.stack[2].z1 - crossing.stack[2].z0 - 0.002) < 1e-9);
  },
);

test(
  'author Q2 native Direct recomputes visibility for the current material height and restores all layers',
  { skip: !process.env.WAFERCAD_TRANSMON_GDS },
  async () => {
    const original = readFileSync(process.env.WAFERCAD_TRANSMON_GDS);
    const barrier = {
      thicknessUm: 0.002,
      provenance: 'hypothesis',
      source: 'Illustrative thickness only; not a published or calibrated oxide measurement',
    };
    const { project, report } = await produceAuthorShadowPreview(original, {
      barrier,
      transport: 'native-direct',
    });
    assert.equal(report.transport, 'native-direct');
    assert.equal(report.processRevision, 4);
    assert.equal(report.regionCount, 8);
    assert.equal(report.layerCount, 5);
    assert.equal(report.alOxPresent, true);
    assert.equal(report.tunnelJunctionValidated, false);
    assert.ok(Math.abs(report.firstTwoOverlapAreaUm2 - 0.03226302) < 1e-5);
    assert.ok(Math.abs(report.exposures[0].substrateFootprintAreaUm2 - 2.55611647) < 1e-5);
    const restored = JSON.parse(project);
    expandProjectStorage(restored);
    validateProjectFile(restored);
    const junction = restored.model.regions.find((region) => region.stack.length === 5);
    assert.ok(junction);
    assert.ok(Math.abs(junction.stack[2].z1 - junction.stack[2].z0 - 0.002) < 1e-9);
  },
);
