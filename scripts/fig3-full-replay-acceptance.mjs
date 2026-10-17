// Preserve the archived full Fig3 harness at the immutable legacy-frozen tag.
// Require successful native-v2 Fig3 science/Process/GLB checks, and carry their
// actual generated evidence into the pre-Main release artifact.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runNativeReleaseOwner } from './v2/check-source-sunset-release-owners.mjs';

runNativeReleaseOwner('fig3');

const output = resolve('test-results/native-fig3/full-replay');
const evidence = [
  { name: 'shared-workstation-physical-replay', directory: 'ui-v2-sync' },
  { name: 'physical-unit-science', directory: 'ui-v2-physical-process' },
  { name: 'full-model-glb-export-abort', directory: 'ui-v2-three-export-abort' },
];
await mkdir(output, { recursive: true });
const accepted = [];
for (const { name, directory } of evidence) {
  const source = resolve('test-results', directory);
  const report = JSON.parse(await readFile(join(source, 'report.json'), 'utf8'));
  assert.equal(report.result, 'pass', `Fig3 evidence failed or incomplete: ${name}`);
  await cp(source, join(output, directory), { recursive: true });
  accepted.push({ name, directory, result: report.result });
}
await writeFile(
  join(output, 'report.json'),
  JSON.stringify(
    {
      result: 'pass',
      coverage: 'native-v2 Fig3 scientific and Worker/GLB owner evidence',
      retainedHistoricalOwner: 'legacy-frozen',
      checks: accepted,
    },
    null,
    2,
  ) + '\n',
);
console.log('Fig3 native-v2 Process, GLB, scientific and browser evidence: PASS');
