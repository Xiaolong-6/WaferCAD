import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { NATIVE_WORKSTATION_OWNERS } from '../../scripts/v2/check-source-sunset-workstation.mjs';

test('Workstation native owners cover startup, desktop and mobile UI', async () => {
  assert.deepEqual(NATIVE_WORKSTATION_OWNERS, [
    'scripts/v2/check-startup.mjs',
    'scripts/v2/check-startup-shell.mjs',
    'scripts/v2/check-welcome-preview-isolation.mjs',
    'scripts/v2/check-desktop-docking.mjs',
    'scripts/v2/check-mobile-workstation.mjs',
  ]);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  for (const owner of NATIVE_WORKSTATION_OWNERS) {
    const contents = await readFile(join(root, owner), 'utf8');
    assert.match(contents, /assert\./, `Scientific/UI assertions must remain: ${owner}`);
    assert.doesNotMatch(
      contents,
      /app-legacy\.html|newLegacyUi(?:Context|Page)/,
      `Owner must run against real native v2: ${owner}`,
    );
  }
});

test('formal Workstation and View UX commands call native owners', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['test:ui:workstation'],
    'node scripts/workstation-regression.mjs && node scripts/view-ux-v3-regression.mjs',
  );
  assert.equal(
    packageJson.scripts['test:ui:view-ux'],
    'node scripts/view-ux-v3-regression.mjs',
  );
  const source = await readFile(join(root, 'scripts/workstation-regression.mjs'), 'utf8');
  const viewSource = await readFile(join(root, 'scripts/view-ux-v3-regression.mjs'), 'utf8');
  assert.match(source, /runNativeWorkstationOwners\(\)/);
  assert.match(viewSource, /runNativeViewUxOwners\(\)/);
  assert.doesNotMatch(source + viewSource, /newLegacyUi|app-legacy\.html|waitForAppReady/);
});
