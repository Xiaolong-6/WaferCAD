// #290 native-v2 four-view acceptance candidate.
// Retain independent view/geometry oracles; do not silently drop tests on failure.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const NATIVE_VIEW_UX_OWNERS = Object.freeze([
  'scripts/v2/check-main-view.mjs',
  'scripts/v2/check-mask-view.mjs',
  'scripts/v2/check-mask-process-area.mjs',
  'scripts/v2/check-section-view.mjs',
  'scripts/v2/check-three-view.mjs',
  'scripts/v2/check-unit-roi-alignment-lifecycle.mjs',
  'scripts/v2/check-review-interactions.mjs',
]);

export function runNativeViewUxOwners() {
  const configuredBase = process.env.WAFERCAD_V2_BASE || process.env.WAFERCAD_URL;
  const base = configuredBase || 'http://127.0.0.1:4173';
  const env = { ...process.env, WAFERCAD_V2_BASE: base };
  for (const owner of NATIVE_VIEW_UX_OWNERS) {
    console.log(`NATIVE_VIEW_UX_OWNER ${owner}`);
    const run = spawnSync(process.execPath, [owner], { env, stdio: 'inherit' });
    if (run.error) throw run.error;
    if (run.status !== 0) {
      const status = run.status ?? 'signal';
      throw new Error(`Native View UX owner failed: ${owner} (${status})`);
    }
  }
  console.log('Native v2 Main, Mask, Section, 3D, ROI and interaction: PASS');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runNativeViewUxOwners();
}
