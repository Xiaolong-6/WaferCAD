// Native v2 ownership of History invariants after source-only Legacy retirement.
// The full retired Legacy regression is immutable under the legacy-frozen tag.
import { spawnSync } from 'node:child_process';

const base =
  process.env.WAFERCAD_V2_BASE || process.env.WAFERCAD_URL || 'http://127.0.0.1:4173';
const suites = [
  'scripts/v2/check-history-replay-rollback.mjs',
  'scripts/v2/check-history-variant-parity.mjs',
  'scripts/v2/check-history-pointer-parity.mjs',
];

for (const suite of suites) {
  const result = spawnSync(process.execPath, [suite], {
    stdio: 'inherit',
    env: { ...process.env, WAFERCAD_V2_BASE: base },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('Native-v2 History replay, Variant and pointer contracts: OK');
