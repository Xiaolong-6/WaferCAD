/**
 * Separate process-engine validation for the compact SWX proposal.
 * The previous canonical swx-photonic-mems.wafercad file is never overwritten.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSwxMemsUnified } from './build-swx-mems-example.mjs';
import { SWX_COMPACT_PROCESS_PROFILE } from './swx-mems-compact-process-geometry.mjs';

export async function buildSwxCompactCandidate() {
  const result = await buildSwxMemsUnified(SWX_COMPACT_PROCESS_PROFILE);
  return {
    ...result,
    validation: {
      ...result.validation,
      candidateStatus: 'isolated-draft-not-paper-accepted',
      gratingGroovesValidated: false,
      mechanicalAlignersValidated: false,
      calibratedFEMOrFDTD: false,
      nativeWaferCadVisualAccepted: false,
    },
  };
}
async function main() {
  const directory = resolve('test-results/swx-mems-compact');
  await mkdir(directory, { recursive: true });
  const { json, validation } = await buildSwxCompactCandidate();
  await writeFile(resolve(directory, 'swx-compact-candidate.wafercad'), json);
  await writeFile(resolve(directory, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
  console.log(JSON.stringify({
    project: 'swx-compact-candidate.wafercad',
    states: validation.branches,
    historyNodes: validation.historyNodes,
    projectBytes: validation.projectBytes,
    scienceSignoff: 'blocked',
  }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
