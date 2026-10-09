// Temporary read-only formatting diagnostic for the linked CI toolchain.
// This file must be deleted in the next formatting commit.
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import prettier from 'prettier';

const paths = [
  "site/advanced-process-operations.js",
  "site/app.html",
  "site/controllers/process-panel-controller.js",
  "site/controllers/process-recipe-controller.js",
  "site/process-guide-svg.js",
  "site/project-schema.js",
  "site/tests/advanced-process.test.mjs",
  "site/tests/model-array.test.mjs",
  "site/tests/process-panel-controller.test.mjs",
  "site/tests/process-recipe.test.mjs",
  "site/tests/project-file.test.mjs",
  "scripts/process-geometry-regression.mjs",
  "docs/LIFTOFF_V1_2026-10-09.md",
  "docs/wiki/Recipe-Code-Tutorial-zh-CN.md",
  "docs/wiki/Recipe-Code-Tutorial.md"
];

test('emit canonical Prettier output for Lift-off changed files', async () => {
  for (const path of paths) {
    const original = await readFile(path, 'utf8');
    const config = (await prettier.resolveConfig(path)) || {};
    const formatted = await prettier.format(original, { ...config, filepath: path });
    if (original === formatted) continue;
    const payload = Buffer.from(formatted, 'utf8').toString('base64');
    const chunks = payload.match(/.{1,2400}/g) || [];
    for (let index = 0; index < chunks.length; index++) {
      console.log('WAFERFMT|' + encodeURIComponent(path) +
        '|' + index + '|' + chunks.length + '|' + chunks[index]);
    }
  }
});
