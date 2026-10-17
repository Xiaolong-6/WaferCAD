// Active v2 storage/Recovery acceptance after source-only Legacy retirement.
// The original Legacy regression remains available under the legacy-frozen tag.
import { spawnSync } from 'node:child_process';

const configuredBase = process.env.WAFERCAD_V2_BASE || process.env.WAFERCAD_URL;
const base = configuredBase || 'http://127.0.0.1:4173';
const suites = [
  'scripts/v2/check-recovery-restore-parity.mjs',
  'scripts/v2/check-recovery-two-tab-takeover.mjs',
  'scripts/v2/check-recovery-failure-atomicity.mjs',
];

for (const suite of suites) {
  const result = spawnSync(process.execPath, [suite], {
    stdio: 'inherit',
    env: { ...process.env, WAFERCAD_V2_BASE: base },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('Native-v2 Recovery restore, ownership and fault atomicity contracts: OK');
