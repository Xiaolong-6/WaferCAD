/**
 * Build an ISOLATED, fully processed single-unit SEM-frame experiment.
 * Refuse to claim author mask or source-level release contour fidelity.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildSwxMemsUnified } from './build-swx-mems-example.mjs';
import {
  SWX_SEM_V2_PROCESS_PROFILE,
  createSwxSemV2ProcessGeometry,
} from './swx-mems-sem-v2-unit.mjs';

export async function buildSwxSemV2Candidate() {
  const result = await buildSwxMemsUnified(SWX_SEM_V2_PROCESS_PROFILE);
  const source = createSwxSemV2ProcessGeometry('off');
  assert.deepEqual(
    result.project.layout.elements,
    source.layout.elements,
    'Fabricated project must retain SEM v2 real mask polygons',
  );
  assert.equal(result.project.snapshotBranches.branches.length, 2);
  return result;
}
const dir = resolve('test-results/swx-sem-v2');
await mkdir(dir, { recursive: true });
const { json, validation, project } = await buildSwxSemV2Candidate();
await writeFile(resolve(dir, 'swx-sem-v2-unit.wafercad'), json);
await writeFile(
  resolve(dir, 'science-report.json'),
  JSON.stringify(
    {
      ...validation,
      physicalSourceFidelity: 'blocked-awaiting-SEM-visual-and-source-figure-review',
      physicallyProcessedUnit: true,
      fullArrayAccepted: false,
      trueOffOnVariantCount: project.snapshotBranches.branches.length,
      sourcePadAndUnderetchCoordinatesVerified: false,
    },
    null,
    2,
  ) + '\n',
);
console.log('SEM v2 single-cell isolated project built and validated');
