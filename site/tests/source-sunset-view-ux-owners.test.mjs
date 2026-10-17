import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { NATIVE_VIEW_UX_OWNERS } from '../../scripts/v2/check-source-sunset-view-ux.mjs';

test('source retirement four-view candidates retain each native geometry and interaction gate', async () => {
  assert.deepEqual(NATIVE_VIEW_UX_OWNERS, [
    'scripts/v2/check-main-view.mjs',
    'scripts/v2/check-mask-view.mjs',
    'scripts/v2/check-mask-process-area.mjs',
    'scripts/v2/check-section-view.mjs',
    'scripts/v2/check-three-view.mjs',
    'scripts/v2/check-unit-roi-alignment-lifecycle.mjs',
    'scripts/v2/check-review-interactions.mjs',
  ]);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  for (const owner of NATIVE_VIEW_UX_OWNERS) {
    const contents = await readFile(join(root, owner), 'utf8');
    assert.match(contents, /assert\./, `Scientific/UI assertions must remain: ${owner}`);
    assert.doesNotMatch(
      contents,
      /app-legacy\.html|newLegacyUi(?:Context|Page)/,
      `Owner must run against real native v2: ${owner}`,
    );
  }
});
