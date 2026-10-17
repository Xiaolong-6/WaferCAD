import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const [beforePath, afterPath, outputPath] = process.argv.slice(2);
if (!beforePath || !afterPath || !outputPath)
  throw new Error('Usage: node scripts/pr250-audit-compare.mjs BEFORE AFTER OUTPUT');
const beforeDirectory = resolve(beforePath),
  afterDirectory = resolve(afterPath),
  output = resolve(outputPath);
await mkdir(output, { recursive: true });
const load = async (directory, name) =>
  JSON.parse(await readFile(resolve(directory, name), 'utf8'));
const before = await load(beforeDirectory, 'report.json'),
  after = await load(afterDirectory, 'report.json');
const beforeFixtures = await load(beforeDirectory, 'fixtures.json'),
  afterFixtures = await load(afterDirectory, 'fixtures.json');
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const results = [];
for (const previous of before.cases) {
  const current = after.cases.find((entry) => entry.name === previous.name);
  assert.ok(current, `Missing after capture ${previous.name}`);
  assert.equal(
    current.renderer,
    previous.renderer,
    'Performance comparison needs the same graphics backend',
  );
  for (const field of ['position', 'target'])
    for (let i = 0; i < 3; i++)
      assert.ok(
        Math.abs(current.camera[field][i] - previous.camera[field][i]) < 1e-9,
        `Different camera ${previous.name}`,
      );
  const fixtureName = previous.name.replace(
    /-(opaque|opaque-borders|transparent|transparent-back|quality-zoom)$/,
    '',
  );
  assert.deepEqual(
    afterFixtures.find((entry) => entry.name === fixtureName).project.model,
    beforeFixtures.find((entry) => entry.name === fixtureName).project.model,
    'Before/after must use identical canonical material geometry',
  );
  const summarize = (entry) => ({
    readyMs: entry.readyMs,
    medianSubmissionMs: median(entry.steadyFrames.map((sample) => sample.submissionMs)),
    medianTwoRafWallMs: median(entry.steadyFrames.map((sample) => sample.wallMs)),
    drawCalls: median(entry.steadyFrames.map((sample) => sample.calls)),
    submittedTriangles: median(entry.steadyFrames.map((sample) => sample.triangles)),
    retainedGeometries: Number(entry.host.sceneRetainedGeometryCount),
    retainedMaterials: Number(entry.host.sceneRetainedMaterialCount),
  });
  results.push({ name: current.name, before: summarize(previous), after: summarize(current) });
}
await writeFile(
  resolve(output, 'comparison.json'),
  JSON.stringify(
    { before: before.site, after: after.site, renderer: after.cases[0].renderer, cases: results },
    null,
    2,
  ),
);
const imagePath = (directory, name) =>
  relative(output, resolve(directory, `${name}.png`)).replaceAll('\\', '/');
await writeFile(
  resolve(output, 'index.html'),
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>PR 250 fixed-camera review</title><style>body{font:16px system-ui;margin:24px;background:#e8edf2;color:#17212b}section{margin-bottom:32px}figure{display:inline-block;width:48%;margin:0 1% 0 0}img{width:100%}h2{font-size:18px}table{border-collapse:collapse}td,th{text-align:left;padding:4px 12px;border:1px solid #bac5cd}</style><h1>PR 250 fixed-camera review</h1><p>Before: frozen f76c8e02. After: audited working tree. Same canonical geometry, graphics backend, viewport and camera asserted. These captures require human acceptance.</p>${results
    .map(
      (entry) =>
        `<section><h2>${entry.name}</h2><figure><figcaption>Before</figcaption><img src="${imagePath(beforeDirectory, entry.name)}"></figure><figure><figcaption>After</figcaption><img src="${imagePath(afterDirectory, entry.name)}"></figure><table><tr><th>Measurement</th><th>Before</th><th>After</th></tr>${Object.keys(
          entry.before,
        )
          .map(
            (key) =>
              `<tr><td>${key}</td><td>${entry.before[key].toFixed(2)}</td><td>${entry.after[key].toFixed(2)}</td></tr>`,
          )
          .join('')}</table></section>`,
    )
    .join('')}</html>`,
);
console.log(
  `Compared ${results.length} views with identical material geometry/camera/backend; gallery ${resolve(output, 'index.html')}`,
);
