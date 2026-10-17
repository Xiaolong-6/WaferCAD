// #290 native-v2 Workstation acceptance candidate.
// Keep the active release entrypoint unchanged until actual Chromium acceptance.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const NATIVE_WORKSTATION_OWNERS = Object.freeze([
  'scripts/v2/check-startup.mjs',
  'scripts/v2/check-startup-shell.mjs',
  'scripts/v2/check-welcome-preview-isolation.mjs',
  'scripts/v2/check-desktop-docking.mjs',
  'scripts/v2/check-mobile-workstation.mjs',
]);

export function runNativeWorkstationOwners() {
  const configuredBase = process.env.WAFERCAD_V2_BASE || process.env.WAFERCAD_URL;
  const base = configuredBase || 'http://127.0.0.1:4173';
  const env = { ...process.env, WAFERCAD_V2_BASE: base };
  for (const owner of NATIVE_WORKSTATION_OWNERS) {
    console.log(`NATIVE_WORKSTATION_OWNER ${owner}`);
    const run = spawnSync(process.execPath, [owner], { env, stdio: 'inherit' });
    if (run.error) throw run.error;
    if (run.status !== 0) {
      const status = run.status ?? 'signal';
      throw new Error(`Native Workstation owner failed: ${owner} (${status})`);
    }
  }
  console.log('Native v2 Workstation startup, lease isolation, docking and mobile: PASS');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runNativeWorkstationOwners();
}
