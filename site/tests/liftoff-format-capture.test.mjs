import test from 'node:test';
import { readFile } from 'node:fs/promises';
import prettier from 'prettier';
const paths = ["site/advanced-process-operations.js","site/tests/advanced-process.test.mjs","site/tests/liftoff-scale.test.mjs","scripts/process-geometry-regression.mjs"];
test('temporary capture of lift-off acceptance formatting', async () => {
  for (const path of paths) {
    const original = await readFile(path, 'utf8');
    const config = (await prettier.resolveConfig(path)) || {};
    const formatted = await prettier.format(original, { ...config, filepath: path });
    if (formatted === original) continue;
    const encoded = Buffer.from(formatted, 'utf8').toString('base64');
    const chunks = encoded.match(/.{1,2400}/g) || [];
    for (let i = 0; i < chunks.length; i++)
      console.log('WAFERFMT|' + encodeURIComponent(path) + '|' + i + '|' + chunks.length + '|' + chunks[i]);
  }
});