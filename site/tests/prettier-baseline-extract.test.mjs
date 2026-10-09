import test from 'node:test';
import { readFile } from 'node:fs/promises';
import prettier from 'prettier';
const paths = ["site/controllers/project-controller.js","site/controllers/workspace-persistence-controller.js","site/tests/project-controller-recovery.test.mjs","scripts/persistence-regression.mjs","docs/RECOVERY_OPEN_STARTUP_SAFETY_AUDIT_2026-10-09.md","docs/TRANSPARENCY_RENDERER_V2_HANDOFF_2026-10-09.md"];
test('extract baseline Prettier formatting for six existing files', async () => {
  for (const path of paths) {
    const original = await readFile(path, 'utf8');
    const config = (await prettier.resolveConfig(path)) || {};
    const formatted = await prettier.format(original, { ...config, filepath: path });
    if (original === formatted) continue;
    const payload = Buffer.from(formatted, 'utf8').toString('base64');
    const chunks = payload.match(/.{1,2400}/g) || [];
    for (let index = 0; index < chunks.length; index++)
      console.log('WAFERFMT|' + encodeURIComponent(path) + '|' + index +
        '|' + chunks.length + '|' + chunks[index]);
  }
});
