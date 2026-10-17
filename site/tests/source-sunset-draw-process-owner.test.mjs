import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Draw-to-Process legacy gap has a real v2 Worker/Recovery owner', async () => {
  const source = await readFile(
    new URL('../../scripts/v2/check-source-sunset-draw-process.mjs', import.meta.url),
    'utf8',
  );
  for (const assertion of [
    "selectOption('mask')",
    'centerCovered',
    'outsideCovered',
    'workflow.steps',
    'maskSourceMode',
    'restored.model',
    'restored.drawMask',
  ])
    assert.ok(source.includes(assertion), assertion);
  assert.doesNotMatch(source, /app-legacy\.html|newLegacyUi(?:Context|Page)/);
});
