import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createCollapsedZDisplayTransform,
  resolveSectionCollapse,
} from '../section-z-collapse.js';

test('collapsed Z display preserves the visible top and bottom spans', () => {
  const transform = createCollapsedZDisplayTransform({
    zMin: -140,
    zMax: 140,
    collapse: { top: 130, bottom: -130 },
  });

  assert.equal(transform.top, 130);
  assert.equal(transform.bottom, -130);
  assert.ok(transform.gap > 0);
  assert.ok(transform.gap < transform.top - transform.bottom);

  assert.ok(Math.abs((transform.mapZ(140) - transform.mapZ(130)) - 10) < 1e-12);
  assert.ok(Math.abs((transform.mapZ(-130) - transform.mapZ(-140)) - 10) < 1e-12);
  assert.ok(Math.abs((transform.mapZ(130) - transform.mapZ(-130)) - transform.gap) < 1e-12);
  assert.ok(transform.displaySpan < 280);
});

test('collapsed Z display is monotonic through the compressed interval', () => {
  const transform = createCollapsedZDisplayTransform({
    zMin: -50,
    zMax: 50,
    collapse: { top: 35, bottom: -25 },
  });
  const samples = [-50, -25, -10, 0, 20, 35, 50].map(transform.mapZ);
  for (let index = 1; index < samples.length; index++) {
    assert.ok(samples[index] >= samples[index - 1]);
  }
});

test('3D is wired to the same Section collapse state and keeps GLB canonical', async () => {
  const root = new URL('../', import.meta.url);
  const [app, threeView, collapseController] = await Promise.all([
    readFile(new URL('app.js', root), 'utf8'),
    readFile(new URL('three-view.js', root), 'utf8'),
    readFile(new URL('controllers/section-collapse-controller.js', root), 'utf8'),
  ]);

  assert.match(app, /getZCollapse:\s*\(\) => sectionCollapse/);
  assert.match(app, /threeView\?\.updateZCollapse\(\)/);
  assert.match(app, /onSettled:\s*renderThree/);
  assert.match(collapseController, /onSettled\(\)/);
  assert.match(threeView, /zCollapseFollow = 'section'/);
  assert.match(threeView, /displaySidewallParts/);
  assert.match(threeView, /displayBorderPositions/);
  assert.match(threeView, /for \(const item of materialSolids\(model, clip\)\)/);

  const model = {
    regions: [
      {
        stack: [{ layerId: 'base', z0: -50, z1: 50 }],
      },
    ],
  };
  assert.deepEqual(resolveSectionCollapse({ top: 30, bottom: -20 }, model, [-50, 50]), {
    top: 30,
    bottom: -20,
    enabled: true,
  });
});

test('disabled Z collapse becomes an identity full-Z display transform', () => {
  const transform = createCollapsedZDisplayTransform({
    zMin: -50,
    zMax: 50,
    collapse: { top: 30, bottom: -20, enabled: false },
  });

  assert.equal(transform.enabled, false);
  assert.equal(transform.gap, 0);
  assert.equal(transform.displaySpan, 100);
  for (const z of [-50, -20, 0, 30, 50]) assert.equal(transform.mapZ(z), z);
});
