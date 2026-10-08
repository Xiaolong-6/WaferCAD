// Keep Welcome preview models small while preserving the production project's
// complete editable Recipe, including the reproducible initial Base contract.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const pairs = [
  ['photodetector-literature-examples', 'photodetector-literature'],
  ['perc-solar-cells-point-contacts', 'perc-point-contact-solar-cell'],
  ['fully-textured-perovskite-silicon-tandem', 'fully-textured-perovskite-silicon-tandem'],
  ['suspended-silica-microdisks', 'suspended-silica-microdisk'],
  ['three-tier-silicon-jlfets', 'three-tier-silicon-jlfets'],
];
const write = process.argv.includes('--write');

for (const [sourceId, previewId] of pairs) {
  const sourcePath = new URL(`../../site/examples/${sourceId}.wafercad`, import.meta.url);
  const previewPath = new URL(
    `../../site/examples/previews/${previewId}.wafercad`,
    import.meta.url,
  );
  const source = JSON.parse(await readFile(sourcePath, 'utf8'));
  const raw = await readFile(previewPath, 'utf8');
  const preview = JSON.parse(raw);
  assert.ok(source.processRecipe?.steps?.length,
    `${sourceId}: the production Recipe must be populated before syncing previews`);
  if (write) {
    preview.processRecipe = structuredClone(source.processRecipe);
    const serialized = JSON.stringify(preview);
    if (serialized !== raw) await writeFile(previewPath, serialized);
  } else {
    assert.deepEqual(preview.processRecipe, source.processRecipe,
      `${previewId}: preview Recipe differs from the production example`);
  }
}
console.log(`Verified ${pairs.length} Welcome preview Recipe contracts.`);
