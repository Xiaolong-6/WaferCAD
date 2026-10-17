import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('formal Workstation regression entrypoint calls validated v2 owners', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url)));
  assert.equal(
    packageJson.scripts['test:ui:workstation'],
    'node scripts/workstation-regression.mjs && node scripts/view-ux-v3-regression.mjs',
  );
  const source = await readFile(
    new URL('../../scripts/workstation-regression.mjs', import.meta.url),
  );
  assert.match(String(source), /runNativeWorkstationOwners\(\)/);
  assert.doesNotMatch(String(source), /app-legacy\.html|newLegacyUi|waitForAppReady/);
});
