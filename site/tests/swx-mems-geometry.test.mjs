import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSwxGeometry,
  SWX_ASSUMPTIONS,
  SWX_DOI,
  SWX_REPORTED,
} from '../../scripts/swx-mems-geometry.mjs';

const approx = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    'Expected ' + actual + ' to be within ' + tolerance + ' of ' + expected);
};

test('SWX source parameters preserve reported SOI, SWT and MEMS dimensions', () => {
  assert.equal(SWX_DOI, '10.1038/s41467-024-55528-9');
  assert.equal(SWX_REPORTED.siliconUm, 0.22);
  assert.equal(SWX_REPORTED.boxUm, 2);
  assert.equal(SWX_REPORTED.ridgeEtchUm, 0.15);
  assert.equal(SWX_REPORTED.crUm, 0.05);
  assert.equal(SWX_REPORTED.auUm, 0.3);
  assert.equal(SWX_REPORTED.swtPeriodUm, 0.29);
  assert.equal(SWX_REPORTED.swtDepthUm, 0.3);
  assert.equal(SWX_REPORTED.combFingerUnits, 40);
  assert.equal(SWX_ASSUMPTIONS.releaseUndercutUm, 2);
  assert.match(SWX_ASSUMPTIONS.maskSource, /not measured\/author layout/);
});

test('SWX poses enforce 900nm OFF and 15nm ON gaps with 885nm translation', () => {
  const off = createSwxGeometry('off');
  const on = createSwxGeometry('on');
  approx(off.gapUm, 0.9);
  approx(on.gapUm, 0.015);
  approx(off.travelUm, 0);
  approx(on.travelUm, 0.885);
  assert.equal(off.layout.units.xy, 'µm');
  assert.equal(on.layout.units.xy, 'µm');
  assert.equal(off.layout.root, on.layout.root);
  assert.deepEqual(off.maskNames, on.maskNames);
  assert.notDeepEqual(off.maskPolygons.get(1), on.maskPolygons.get(1));
  assert.deepEqual(createSwxGeometry('off').layout, off.layout, 'Layout must be deterministic');
});

test('Each pose yields named, bounded and exportable polygon mask layers', () => {
  for (const pose of ['off', 'on']) {
    const generated = createSwxGeometry(pose);
    const [w, h] = SWX_ASSUMPTIONS.fieldUm;
    assert.deepEqual(generated.layout.bounds,
      { minX: -w / 2, minY: -h / 2, maxX: w / 2, maxY: h / 2, width: w, height: h });
    assert.deepEqual([...generated.maskPolygons.keys()], [1, 2, 3]);
    assert.ok(generated.maskPolygons.get(1).length > 100);
    assert.equal(generated.maskPolygons.get(2).length, 4);
    assert.equal(generated.maskPolygons.get(3).length, 4);
    assert.equal(generated.layout.combos.length, 3);
    assert.equal(generated.layout.elements.length,
      [...generated.maskPolygons.values()].reduce((total, array) => total + array.length, 0));
    for (const element of generated.layout.elements) {
      assert.equal(element.kind, 'polygon');
      assert.equal(element.sourceCell, generated.layout.root);
      assert.ok(element.points.length >= 4, 'Polygon has insufficient points');
      for (const [x, y] of element.points) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y), 'Nonfinite coordinates');
        assert.ok(Math.abs(x) < w / 2 && Math.abs(y) < h / 2,
          'Mask geometry lies outside illustrative field');
      }
    }
  }
});

test('Invalid poses fail explicitly rather than producing an implied device state', () => {
  assert.throws(() => createSwxGeometry('actuated'), /off or on/);
});
