/** Real Kernel/Recipe OFF/ON process for the isolated experimental bulk-Si field. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildSwxMemsUnified } from './build-swx-mems-example.mjs';
import {
  createSwxSemPerimeterContext,
  SWX_PERIMETER_CONTEXT_ASSUMPTIONS,
  SWX_PERIMETER_CONTEXT_PROCESS_PROFILE,
} from './swx-mems-sem-perimeter-context.mjs';

const { project, json, validation } = await buildSwxMemsUnified(
  SWX_PERIMETER_CONTEXT_PROCESS_PROFILE,
);
const source = createSwxSemPerimeterContext('off');
assert.deepEqual(project.layout.elements, source.layout.elements);
assert.equal(project.snapshotBranches.branches.length, 2);
const dir = resolve('test-results/swx-sem-v2-perimeter');
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, 'swx-sem-perimeter-context.wafercad'), json);
await writeFile(
  resolve(dir, 'science-report.json'),
  JSON.stringify(
    {
      ...validation,
      comparisonRole:
        'real process geometry for inferred peripheral Si and isolation cavity',
      perimeter: SWX_PERIMETER_CONTEXT_ASSUMPTIONS,
      sourceAuthorPerimeterGdsAccepted: false,
      sourceIsolationTrenchAccepted: false,
      paperDeviceFootprintAccepted: false,
      postHFMechanicalFEMVerified: false,
      fullSingleUnitPaperFidelityAccepted: false,
      productionExampleAccepted: false,
      fullArrayAccepted: false,
    },
    null,
    2,
  ) + '\n',
);
console.log('Real OFF/ON process+History built with experimental external Si field');
