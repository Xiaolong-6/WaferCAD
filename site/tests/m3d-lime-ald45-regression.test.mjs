import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { applyOperation } = await import('../model.js');
const { readProjectFile } = await import('../project-io.js');
const { validateProcessModel } = await import('../project-schema.js');

// Replay exactly the published sample's complex topography at the final ALD
// stage. The committed History state avoids rebuilding 47 preceding processes.
test('M3D-LIME 45nm top ALD: reproduce physical Kernel result and protect rollback', async () => {
  const bytes = await readFile(
    new URL('../examples/m3d-lime-rram-cntfet.wafercad', import.meta.url),
  );
  const project = await readProjectFile(new Blob([bytes]));
  const nodes = project.snapshotBranches.nodes;
  const aldStep = nodes.find((node) =>
    node.operation?.label?.includes('ALD Al2O3 RRAM protection 45nm'),
  );
  assert.ok(aldStep, 'Missing the published 45nm Al2O3 ALD process');
  const predecessor = nodes.find((node) => node.id === aldStep.parentId);
  assert.ok(predecessor?.state?.model, 'Missing pre-ALD History state');
  assert.equal(
    predecessor.state.model.layers.some((layer) => layer.name === 'Digital Al2O3 passivation 45nm'),
    false,
    'The diagnostic must start before ALD, not from the already-coated final model',
  );

  const before = structuredClone(predecessor.state.model);
  validateProcessModel(before);
  const candidate = structuredClone(before);
  const result = applyOperation(candidate, {
    type: 'add',
    name: 'Digital Al2O3 passivation 45nm',
    thickness: 0.045,
    growth: 'conformal',
    face: 'front',
    area: candidate.boundary,
  });

  if (!result.changed) {
    assert.deepEqual(
      candidate,
      before,
      'Failed Conformal must roll back all geometry and counters',
    );
    assert.fail('45nm top ALD is still blocked after rollback: ' + result.error);
  }

  validateProcessModel(candidate);
  const films = candidate.regions.flatMap((region) =>
    region.stack.filter((segment) => segment.layerId === result.layerId),
  );
  assert.ok(
    films.some((segment) => Math.abs(segment.z1 - segment.z0 - 0.045) < 1e-9),
    'The successful ALD must retain a 45nm horizontal film',
  );
  assert.ok(
    films.some((segment) => segment.role === 'conformal-sidewall'),
    'The successful ALD must coat actual vertical RRAM topography',
  );
  console.log(
    JSON.stringify({
      test: 'm3d-lime-top-ald45',
      status: 'geometry-success-candidate',
      regions: candidate.regions.length,
      sidewallSegments: films.filter((segment) => segment.role === 'conformal-sidewall').length,
    }),
  );
});
