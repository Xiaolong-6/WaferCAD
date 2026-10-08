// Keep Welcome preview models small while preserving the production project's
// complete editable Recipe, including the reproducible initial Base contract.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const pairs = [
  ['photodetector-literature-examples', 'photodetector-literature', 'photodetector-literature'],
  [
    'perc-solar-cells-point-contacts',
    'perc-point-contact-solar-cell',
    'perc-point-contact-solar-cell',
  ],
  [
    'fully-textured-perovskite-silicon-tandem',
    'fully-textured-perovskite-silicon-tandem',
    'fully-textured-perovskite-silicon-tandem',
  ],
  ['suspended-silica-microdisks', 'suspended-silica-microdisk', 'suspended-silica-microdisk'],
  ['three-tier-silicon-jlfets', 'three-tier-silicon-jlfets', 'three-tier-silicon-jlfets'],
];
const write = process.argv.includes('--write');
const manifestPath = new URL(
  '../../tests/fixtures/project-io/example-thumbnails.json',
  import.meta.url,
);
const manifestRaw = await readFile(manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw);
const sha256 = (source) => createHash('sha256').update(source).digest('hex');

for (const [sourceId, previewId, exampleId] of pairs) {
  const sourcePath = new URL(`../../site/examples/${sourceId}.wafercad`, import.meta.url);
  const previewPath = new URL(
    `../../site/examples/previews/${previewId}.wafercad`,
    import.meta.url,
  );
  const source = JSON.parse(await readFile(sourcePath, 'utf8'));
  const raw = await readFile(previewPath, 'utf8');
  const preview = JSON.parse(raw);
  assert.ok(
    source.processRecipe?.steps?.length,
    `${sourceId}: the production Recipe must be populated before syncing previews`,
  );
  let nextRaw = raw;
  if (write) {
    preview.processRecipe = structuredClone(source.processRecipe);
    nextRaw = JSON.stringify(preview);
    if (nextRaw !== raw) await writeFile(previewPath, nextRaw);
  } else {
    assert.deepEqual(
      preview.processRecipe,
      source.processRecipe,
      `${previewId}: preview Recipe differs from the production example`,
    );
  }
  const entry = manifest.examples.find((item) => item.id === exampleId);
  assert.ok(entry, `${exampleId}: missing thumbnail provenance entry`);
  const digest = sha256(nextRaw);
  if (write) entry.sourceSha256 = digest;
  else
    assert.equal(entry.sourceSha256, digest, `${exampleId}: thumbnail source checksum has drifted`);
}
if (write) {
  const nextManifest = JSON.stringify(manifest, null, 2) + '\n';
  if (nextManifest !== manifestRaw) await writeFile(manifestPath, nextManifest);
}
console.log(`Verified ${pairs.length} Welcome preview Recipe and thumbnail checksum contracts.`);
