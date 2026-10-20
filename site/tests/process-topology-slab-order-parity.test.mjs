// These cases have stable byte-exact slab output in the current full-union
// implementation. Naively merging an earlier slab with only newly started
// extrusions changes polygon component ordering without changing their area.
// Retain ordering, not merely geometry/area, for Renderer/History determinism.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const [{ materialSolidsFromTopology }, { rectMulti }] = await Promise.all([
  import('../process-topology.js'),
  import('../vector-geometry.js'),
]);

const referenceShas = new Map([
  [13, 'd96cb8455efe2c0ffa37c3cb30d80c1ba6e1053c8010956f45ff4a46eb106acd'],
  [49, '978155a2168f131546ac19b06cc09200e9f321d8d87035e4d4e5f354461cf51d'],
  [67, '836165c3ee17d425889b82d7998a76bfca3a22aedd705351bbbafef15fd84d67'],
  [91, '761ca41e978d892a475ad014f15bc37dbaa319a00e7fc78b42a3f464939348d7'],
  [93, 'cbef684bb11d109acd1f21a7b98db6d550aa4b4a454256ddd757266f0bb1b62d'],
  [96, 'f2b5580dba439f75ab9d691ded614dc5333fdb58552d6fd31fb3b722265597f5'],
]);

test('mixed-height slabs preserve exact polygon ordering under staggered XY footprints', () => {
  let seed = 0xb0c4;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let trial = 0; trial <= 96; trial++) {
    const items = [{ geom: rectMulti(9, 9), z0: 0, z1: 12 }];
    for (let index = 0; index < 7; index++) {
      const z0 = 1 + Math.floor(rand() * 10);
      const z1 = z0 + 1 + Math.floor(rand() * (12 - z0));
      items.push({
        geom: rectMulti(1 + rand() * 4, 1 + rand() * 4, -7 + rand() * 14, -7 + rand() * 14),
        z0,
        z1,
      });
    }
    if (!referenceShas.has(trial)) continue;
    const model = {
      regions: items.map(({ geom, z0, z1 }, index) => ({
        id: `area-${index}`,
        geom,
        stack: [{ layerId: 'base', z0, z1 }],
      })),
    };
    const source = JSON.stringify(model);
    const plan = materialSolidsFromTopology(model);
    const actual = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
    assert.equal(actual, referenceShas.get(trial), `Slab output changed at fixture ${trial}`);
    assert.equal(JSON.stringify(model), source, `Source mutated at fixture ${trial}`);
  }
});
