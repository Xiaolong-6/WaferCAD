// Native-v2 release gate. The former executable Legacy DOM contract is
// reproducible at the immutable legacy-frozen tag, not at /app-legacy.html.
import { runNativeReleaseOwner } from './v2/check-source-sunset-release-owners.mjs';

// Retain the full external KLayout corpus gate, not only bundled sample imports.
import { spawnSync } from 'node:child_process';

runNativeReleaseOwner('klayout');
const args = process.argv.slice(2);
const base = process.env.WAFERCAD_V2_BASE || process.env.WAFERCAD_URL || 'http://127.0.0.1:4173';
const corpus = spawnSync(
  process.execPath,
  ['scripts/v2/check-klayout-corpus-ui.mjs', '--url', base, ...args],
  { env: { ...process.env, WAFERCAD_V2_BASE: base }, stdio: 'inherit' },
);
if (corpus.error) throw corpus.error;
if (corpus.status !== 0) throw new Error('Native KLayout full corpus failed');
