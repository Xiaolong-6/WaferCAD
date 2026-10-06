import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createCollapsedZDisplayTransform,
  normalizeSectionCollapse,
  resolveSectionCollapse,
  translateSectionCollapse,
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

  assert.ok(Math.abs(transform.mapZ(140) - transform.mapZ(130) - 10) < 1e-12);
  assert.ok(Math.abs(transform.mapZ(-130) - transform.mapZ(-140) - 10) < 1e-12);
  assert.ok(Math.abs(transform.mapZ(130) - transform.mapZ(-130) - transform.gap) < 1e-12);
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

test('3D collapse keeps linked front/back relief 1:1 and honors an unlocked ratio', () => {
  const linked = createCollapsedZDisplayTransform({
    zMin: -140,
    zMax: 140,
    collapse: { top: 130, bottom: -130 },
    breakFraction: 0,
  });
  assert.ok(Math.abs(linked.mapZ(140) - linked.mapZ(130) - 10) < 1e-12);
  assert.ok(Math.abs(linked.mapZ(-130) - linked.mapZ(-140) - 10) < 1e-12);

  const unlocked = createCollapsedZDisplayTransform({
    zMin: -140,
    zMax: 140,
    collapse: {
      top: 130,
      bottom: -130,
      scaleLinked: false,
      frontScale: 2,
      backScale: 0.5,
    },
    breakFraction: 0,
  });
  const frontRelief = unlocked.mapZ(140) - unlocked.mapZ(130),
    backRelief = unlocked.mapZ(-130) - unlocked.mapZ(-140);
  assert.ok(Math.abs(frontRelief - 20) < 1e-12);
  assert.ok(Math.abs(backRelief - 5) < 1e-12);
  assert.ok(Math.abs(frontRelief / backRelief - 4) < 1e-12);
});

test('3D can join the retained Z spans without inventing a substrate air gap', () => {
  const transform = createCollapsedZDisplayTransform({
    zMin: -176,
    zMax: 175.7,
    collapse: { top: 172.4305, bottom: -172.4805 },
    breakFraction: 0,
  });
  assert.equal(transform.gap, 0);
  assert.equal(transform.mapZ(transform.top), transform.mapZ(transform.bottom));
  assert.ok(
    Math.abs(transform.displaySpan - (175.7 - transform.top + transform.bottom + 176)) < 1e-10,
  );
  // A physical cavity outside the hidden interval retains its own thickness.
  assert.ok(Math.abs(transform.mapZ(175) - transform.mapZ(174) - 1) < 1e-10);
});

test('thick substrates let the collapse handle approach the physical Z surface', () => {
  const bounds = [-151, 151.35],
    normalized = normalizeSectionCollapse({ top: bounds[1], bottom: -130 }, bounds);

  assert.ok(bounds[1] - normalized.top > 0);
  assert.ok(
    bounds[1] - normalized.top < 0.001,
    '302 um-class substrate must not reserve a multi-micrometre top margin',
  );

  const translated = translateSectionCollapse({ top: 200, bottom: -200 }, 100, [-250, 250]);
  assert.ok(250 - translated.top > 0);
  assert.ok(
    250 - translated.top < 0.001,
    'translated 500 um-class collapse window must reach the top surface within 1 nm',
  );
});

test('3D follows Section collapse while GLB keeps canonical Z and exported morphology', async () => {
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
  assert.match(threeView, /buildRenderSurfacePlan\(model, clip\)/);
  assert.match(threeView, /prepareMorphologyExportTasks\(THREE, roughCaps\)/);
  assert.match(threeView, /geometryFromRoughCap\(THREE,/);
  assert.match(threeView, /exportGroup\.scale\.setScalar\(1e-6\)/);

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
    scaleLinked: true,
    frontScale: 1,
    backScale: 1,
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
