/** Distinguish real M1 fanout trenches from unowned row-instance seams.
 * Run: node examples/projects/tfln-10x8-recovery/verify-clean-fanout.mjs
 * Defaults to the exact clean, compressed, native project in this directory.
 * An explicit uncompressed .wafercad argument remains supported.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadGeometryKernel } from '../../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../../../site/project-io.js');
const { pointInMulti } = await import('../../../site/vector-geometry.js');
const { buildRenderSurfacePlan } = await import('../../../site/renderer-geometry.js');

const bytes = process.argv[2]
  ? readFileSync(resolve(process.argv[2]))
  : gunzipSync(
      readFileSync(
        fileURLToPath(new URL('./TFLN_10x8_REBUILT_editable.wafercad.gz', import.meta.url)),
      ),
    );
const { model, layout } = await readProjectFile({
  size: bytes.length,
  text: async () => bytes.toString('utf8'),
});
assert.equal(model.array.instances.length, 10);
assert.equal(model.array.templates.length, 1);
const m1 = layout.elements.filter((e) => e.layer === 11 && e.datatype === 0);
assert.equal(m1.length, 640);

const insideM1 = (x, y) => m1.some((p) => pointInMulti([x, y], [[p.points]]));
for (const x of [-500, -300, 0, 300]) {
  for (const [y, expected] of [
    [-1765.6, false],
    [-1765.1, true],
    [-1764.9, true],
    [-1764.4, false],
  ]) {
    assert.equal(insideM1(x, y), expected, `M1 physical stripe at ${x},${y}`);
  }
}

const plan = buildRenderSurfacePlan(model);
const horizontal = (y, z) =>
  plan.borderLines.filter(
    ([a, b]) =>
      Math.abs(a[1] - y) < 1e-6 &&
      Math.abs(b[1] - y) < 1e-6 &&
      Math.abs(a[2] - z) < 1e-6 &&
      Math.abs(b[2] - z) < 1e-6 &&
      Math.abs(a[0] - b[0]) > 1000,
  );
let representativeLengthUm = 0;
for (let row = 0; row < 10; row++) {
  const dy = row * 360;
  for (const y of [-1765.5, -1764.5]) {
    for (const z of [7.08, 7.3]) {
      const lines = horizontal(y + dy, z);
      assert.equal(lines.length, 1, `Physical LN boundary y=${y + dy}, z=${z}`);
      if (!representativeLengthUm)
        representativeLengthUm = Math.abs(lines[0][0][0] - lines[0][1][0]);
    }
  }
}
for (let row = 1; row < 10; row++) {
  const tileJoin = -1800 + row * 360;
  for (const z of [7.08, 7.3])
    assert.equal(horizontal(tileJoin, z).length, 0, `Unowned row seam y=${tileJoin}`);
}
console.log(
  JSON.stringify(
    {
      pass: true,
      sites: 80,
      m1MaskPolygons: 640,
      physicalFanoutStrips: 20,
      verifiedPhysicalBorderLines: 40,
      rejectedRowSeamsAtTwoHeights: 18,
      m1EtchDepthUm: 0.22,
      representativeLengthUm,
      caveat: 'Does not replace actual native-browser Inspector or paper-design acceptance.',
    },
    null,
    2,
  ),
);
