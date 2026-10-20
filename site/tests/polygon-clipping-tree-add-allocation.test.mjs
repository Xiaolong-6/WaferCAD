import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Receipt generated with the original vendor Tree.add allocation behavior.
// Repeated and EPS-adjacent coordinates exercise CoordRounder's Splay Tree.
const BASELINE_SHA256 = 'c081a72212ceaa4fed57ec40e1fa82d06d5f3ceb104f2754eff49fe4e144bd7f';

function rectangle(x, y, w = 0.5, h = 0.5) {
  return [
    [
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x, y],
      ],
    ],
  ];
}

test('vendored Splay Tree lazy allocation retains exact repeated-coordinate Booleans', () => {
  const source = readFileSync(
    new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
    'utf8',
  );
  const module = { exports: {} };
  new Function('module', 'exports', source)(module, module.exports);
  const boolean = module.exports;
  const hash = createHash('sha256');
  const near = [0, 1e-12, 1e-9, 1e-8, 1e-7, 1e-5];
  for (let i = 0; i < 420; i++) {
    const x = (i % 18) * 0.25;
    const y = ((i * 7) % 23) * 0.125;
    const delta = near[i % near.length];
    const a = rectangle(x, y);
    const b = rectangle(x + 0.25 + delta, y + delta);
    const c = rectangle(x + delta, y + 0.25);
    for (const method of ['union', 'intersection', 'difference']) {
      const args = method === 'union' ? [a, b, c] : [a, b];
      hash.update(JSON.stringify(boolean[method](...structuredClone(args))));
    }
  }
  assert.equal(hash.digest('hex'), BASELINE_SHA256);
});
