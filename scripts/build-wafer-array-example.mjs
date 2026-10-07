import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { assertNativeFig3Contract } from './test-helpers/example-contracts.mjs';
await loadGeometryKernel();
const { pointInMulti } = await import('../site/vector-geometry.js');
const { readProjectFile, serializeProject } = await import('../site/project-io.js');
const { createWaferArrayProject } = await import('../site/model-array-construction.js');
const { validateProjectFile } = await import('../site/project-schema.js');
const sourcePath = new URL('../site/examples/three-tier-silicon-jlfets.wafercad', import.meta.url);
const bytes = await readFile(sourcePath);
const source = await readProjectFile({
  size: bytes.length,
  text: async () => bytes.toString('utf8'),
});
assertNativeFig3Contract(source, pointInMulti);
const project = createWaferArrayProject(source);
validateProjectFile(project);
const text = serializeProject(project);
const reopened = await readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
function assertExact(a, b, path = '$', seen = new WeakMap()) {
  if (Object.is(a, b)) return;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object')
    throw new Error(
      `Round-trip difference at ${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
    );
  let pairs = seen.get(a);
  if (!pairs) seen.set(a, (pairs = new WeakSet()));
  if (pairs.has(b)) return;
  pairs.add(b);
  const keys = Object.keys(a);
  assert.equal(keys.length, Object.keys(b).length, `Key count at ${path}`);
  for (const key of keys) {
    assert.ok(Object.hasOwn(b, key), `Missing ${path}.${key}`);
    assertExact(a[key], b[key], `${path}.${key}`, seen);
  }
}
assertExact(reopened, project);
assert.equal(project.model.array.instances.filter((i) => i.role === 'device').length, 625);
assert.equal(project.snapshotBranches.nodes.length, 40);
const target = new URL(
  '../site/examples/three-tier-silicon-jlfets-full-wafer.wafercad',
  import.meta.url,
);
if (process.argv.includes('--write')) await writeFile(target, text);
else assert.equal(await readFile(target, 'utf8'), text, 'Rebuild full-wafer example');
assert.deepEqual(await readFile(sourcePath), bytes, 'Preserve the single-site source');
console.log(
  JSON.stringify({
    sites: 625,
    instances: project.model.array.instances.length,
    templates: project.model.array.templates.length,
    steps: 40,
    bookmarks: project.snapshots.length,
    bytes: Buffer.byteLength(text),
    encoding: JSON.parse(text).storage.encoding,
  }),
);
