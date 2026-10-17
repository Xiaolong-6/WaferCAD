// Candidate native-v2 scientific owners. Archived Legacy DOM test scripts remain
// under legacy-frozen. A passed subset is not full scientific parity.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const NATIVE_SCIENTIFIC_CANDIDATES = Object.freeze({
  process: Object.freeze([
    'scripts/v2/check-physical-process-units.mjs',
    'scripts/v2/check-manual-both.mjs',
    'scripts/v2/check-recipe-preflight-atomicity.mjs',
    'scripts/v2/check-recipe-prefix-stop-parity.mjs',
    'scripts/v2/check-worker-fault-parity.mjs',
    'scripts/v2/check-mask-process-area.mjs',
  ]),
  interchange: Object.freeze([
    'scripts/v2/check-legacy-project-recovery.mjs',
    'scripts/v2/check-klayout-mask-process.mjs',
    'scripts/v2/check-report-export.mjs',
    'scripts/v2/check-three-export-abort.mjs',
  ]),
  array: Object.freeze([
    'scripts/v2/check-array-625-science.mjs',
    'scripts/v2/check-array-6400-worker-replay.mjs',
    'scripts/v2/check-array-renderer-isolation.mjs',
  ]),
  examples: Object.freeze([
    'scripts/v2/check-m4-projects.mjs',
    'scripts/v2/check-metalens-recipe-science.mjs',
  ]),
});

export function runNativeScientificCandidates(domain) {
  const owners = NATIVE_SCIENTIFIC_CANDIDATES[domain];
  if (!owners) throw new Error(`Unknown native science domain: ${domain}`);
  const configuredBase = process.env.WAFERCAD_V2_BASE || process.env.WAFERCAD_URL;
  const base = configuredBase || 'http://127.0.0.1:4173';
  const env = { ...process.env, WAFERCAD_V2_BASE: base };
  for (const owner of owners) {
    console.log(`NATIVE_SCIENCE_OWNER ${domain}: ${owner}`);
    const result = spawnSync(process.execPath, [owner], {
      stdio: 'inherit',
      env,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Native ${domain} science failed: ${owner} (${result.status ?? 'signal'})`);
    }
  }
  console.log(`Native v2 ${domain} scientific candidate checks: PASS`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const domain = process.argv[2];
  runNativeScientificCandidates(domain);
}
