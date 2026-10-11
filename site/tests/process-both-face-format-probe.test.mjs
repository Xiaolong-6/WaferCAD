import { readFileSync } from 'node:fs';
import test from 'node:test';
import prettier from 'prettier';

test('temporary formatter probe for PR-owned files', async () => {
  const config = JSON.parse(readFileSync('.prettierrc.json', 'utf8'));
  for (const path of [
    'site/advanced-process-operations.js',
    'site/controllers/process-panel-controller.js',
    'site/controllers/process-recipe-controller.js',
    'site/model.js',
    'site/model-array-process.js',
    'site/process-face-execution.js',
    'site/process-worker.js',
    'site/process-recipe.js',
    'site/history-replay.js',
    'site/workspace-snapshots.js',
    'site/tests/process-both-face.test.mjs',
    'site/tests/history-replay.test.mjs',
    'docs/PROCESS_BOTH_FACE_2026-10-11.md',
    'docs/README.md',
  ]) {
    const source = readFileSync(path, 'utf8');
    const formatted = await prettier.format(source, { ...config, filepath: path });
    // Chunk JSON, so CI log transport cannot truncate individual long lines.
    console.log('FORMAT_BEGIN ' + path);
    for (let i = 0; i < formatted.length; i += 2500) {
      console.log('FORMAT_CHUNK ' + path + ' ' + JSON.stringify(formatted.slice(i, i + 2500)));
    }
    console.log('FORMAT_END ' + path);
  }
});
