// Packaging source-derived presentation fixtures, not running any scientific core.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { format } from 'prettier';
const target = 'site/ui-v2/mock-data.js';
const fixture = JSON.parse(
  await readFile('site/ui-v2/prototypes/a-full/source/prototype-data.json', 'utf8'),
);
for (const example of fixture.fixtures) {
  example.thumbnail = example.thumbnail.replace('../../../examples/', 'examples/');
  const bytes = await readFile(example.source);
  if (createHash('sha256').update(bytes).digest('hex') !== example.sha256)
    throw new Error(`Source changed: ${example.source}; rebuild presentation fixtures first.`);
  const project = JSON.parse(bytes);
  for (const node of example.history) {
    const source = project.snapshotBranches.nodes.find((entry) => entry.id === node.id);
    node.edit = source.operation.replay
      ? { ...source.operation.replay.params, area: source.operation.replay.areaMode }
      : { type: source.operation.kind, name: source.operation.name || source.operation.label };
  }
  for (const [ref, model] of Object.entries(example.models)) {
    const source = ref === 'project' ? project.model : project.sharedModels[ref];
    model.annotations = ['implants', 'electricalRegions'].flatMap((collection) =>
      (source[collection] || []).map(({ id, name, color, visible, depthProfile }) => ({
        id,
        name,
        color,
        visible,
        depthProfile,
        kind: collection === 'implants' ? 'Implant' : 'Electrical',
      })),
    );
  }
}
const config = JSON.parse(await readFile('.prettierrc.json', 'utf8'));
const text = await format(
  `// Source-derived frozen M2 presentation fixtures; generated offline.\nwindow.WaferCadV2MockData = ${JSON.stringify(fixture)};\n`,
  { ...config, parser: 'babel' },
);
if (process.argv.includes('--write')) await writeFile(target, text);
else if ((await readFile(target, 'utf8')) !== text) throw new Error('Stale M2 mock fixture.');
console.log('M2 mock data: M3D + Photodetector source-derived fixtures, no core import.');
