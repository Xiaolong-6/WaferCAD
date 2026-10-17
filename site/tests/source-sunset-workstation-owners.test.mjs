import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { NATIVE_WORKSTATION_OWNERS } from '../../scripts/v2/check-source-sunset-workstation.mjs';

test('source retirement Workstation candidates retain every scientific UI ownership slice', async () => {
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
