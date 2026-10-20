import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Fixed output receipt from unpatched polygon-clipping 0.15.7. This protects
// Segment/SweepEvent/point identity fast paths against changed geometry,
// polygon ordering, ring ordering and near-contact Boolean behavior.
const BASELINE_SHA256 = 'd345db180bd4887f207712a0e4fa36f07aa4aedd8ac7937805b422f53da21205';

function kernel() {
  const source = readFileSync(
    new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
    'utf8',
  );
  const module = { exports: {} };
  new Function('module', 'exports', source)(module, module.exports);
  return module.exports;
}

function rectangle(x, y, w, h) {
  return [
    [
      [
        [x - w / 2, y - h / 2],
        [x + w / 2, y - h / 2],
        [x + w / 2, y + h / 2],
        [x - w / 2, y + h / 2],
        [x - w / 2, y - h / 2],
      ],
    ],
  ];
}

function diamond(x, y, radius) {
  return [
    [
      [
        [x - radius, y],
        [x, y - radius],
        [x + radius, y],
        [x, y + radius],
        [x - radius, y],
      ],
    ],
  ];
}

function annulus(x, y, radius) {
  return [
    [
      [
        [x - radius, y - radius],
        [x + radius, y - radius],
        [x + radius, y + radius],
        [x - radius, y + radius],
        [x - radius, y - radius],
      ],
      [
        [x - radius / 3, y - radius / 3],
        [x - radius / 3, y + radius / 3],
        [x + radius / 3, y + radius / 3],
        [x + radius / 3, y - radius / 3],
        [x - radius / 3, y - radius / 3],
      ],
    ],
  ];
}

test('vendored segment and sweep identity paths preserve 2100 exact upstream receipts', () => {
  const boolean = kernel();
  let seed = 0x6b5fcad2;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const near = [0, 1e-12, 1e-9, 1e-8, 1e-7, 1e-5];
  const hash = createHash('sha256');

  for (let i = 0; i < 700; i++) {
    const x = (random() - 0.5) * 24;
    const y = (random() - 0.5) * 24;
    const radius = 0.05 + random() * 3;
    const mode = i % 7;
    const a =
      mode === 0
        ? annulus(x, y, radius)
        : mode % 2
          ? diamond(x, y, radius)
          : rectangle(x, y, radius, radius);
    const delta = near[i % near.length];
    const b =
      mode === 2 || mode === 5
        ? a
        : mode === 3
          ? annulus(x + radius * 1.7 + delta, y, radius)
          : mode % 2
            ? rectangle(x + radius * (i % 3) + delta, y + delta, radius, radius)
            : diamond(x + radius + delta, y - radius * (i % 2) + delta, radius);
    const c = rectangle(
      x + (random() - 0.5) * 6,
      y + (random() - 0.5) * 6,
      0.1 + random(),
      0.1 + random(),
    );
    for (const method of ['union', 'intersection', 'difference']) {
      const inputs = method === 'union' ? [a, b, c] : [a, b];
      hash.update(JSON.stringify({ out: boolean[method](...structuredClone(inputs)) }));
    }
  }
  assert.equal(hash.digest('hex'), BASELINE_SHA256);
});
