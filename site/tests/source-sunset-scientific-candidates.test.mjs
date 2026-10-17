import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { NATIVE_SCIENTIFIC_CANDIDATES } from '../../scripts/v2/check-source-sunset-science.mjs';

test('native-v2 Process, IO, Array and Example candidates all retain real assertions', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  for (const [domain, owners] of Object.entries(NATIVE_SCIENTIFIC_CANDIDATES)) {
    assert.ok(owners.length >= 2, domain);
    for (const owner of owners) {
      const source = await readFile(join(root, owner), 'utf8');
      assert.match(source, /assert\./, `Missing scientific test predicates: ${owner}`);
      assert.doesNotMatch(source, /app-legacy\.html|newLegacyUi(?:Context|Page)/, owner);
    }
  }
});
