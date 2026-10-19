import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGDS, flattenGDS } from '../site/gds.js';
import { buildSwxS8SiliconMask, SWX_S8_PROVENANCE } from './swx-s8-primary-silicon.mjs';

function overlap(A, B) {
  for (const poly of [A, B])
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        dx = a[1] - b[1],
        dy = b[0] - a[0],
        p = A.map((v) => v[0] * dx + v[1] * dy),
        q = B.map((v) => v[0] * dx + v[1] * dy);
      if (Math.max(...p) <= Math.min(...q) + 1e-8 || Math.max(...q) <= Math.min(...p) + 1e-8)
        return false;
    }
  return true;
}
function connectedComponents(elements) {
  elements = elements.filter((e) => e.layer === 1);
  const parent = elements.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < elements.length; i++)
    for (let j = i + 1; j < elements.length; j++)
      if (overlap(elements[i].points, elements[j].points)) parent[find(i)] = find(j);
  const roots = new Set(elements.map((_, i) => find(i)));
  const byName = (name) => {
    const index = elements.findIndex((e) => e.name === name);
    assert.ok(index >= 0, 'missing polygon ' + name);
    return find(index);
  };
  return { count: roots.size, byName };
}
test('S8: scale, axis and source provenance', () => {
  const m = buildSwxS8SiliconMask(),
    p = SWX_S8_PROVENANCE.dimensionsFromPaperUm;
  assert.equal(p.shuttleWidth, 6);
  assert.equal(p.springLong, 30);
  assert.equal(p.springShort, 22);
  assert.equal(p.combFingerLength, 3.2);
  assert.equal(p.combFingerWidth, 0.5);
  assert.equal(p.combLateralGap, 0.3);
  assert.equal(p.meanderR2, 3);
  assert.equal(m.expectedTopology.shuttleOrientation, 'longitudinal_Y');
  assert.deepEqual(m.expectedTopology.combBanks, ['LEFT', 'RIGHT']);
  assert.deepEqual(m.expectedTopology.springStations, [2, -41]);
  assert.equal(m.expectedTopology.combStations, 1);
  assert.ok(m.bounds.width > 100);
  // No author CAD is supplied: do not force an invented 95x100um envelope.
  assert.ok(m.bounds.height > 100 && m.bounds.height < 150);
  assert.ok(m.provenance.inferred.includes('all global XY coordinates'));
  assert.ok(m.elements.every((e) => [1, 2].includes(e.layer)));
  assert.equal(m.ioAssumptions.validated, false);
  assert.equal(m.ioAssumptions.etchDepth, null);
  assert.equal(m.contours.outerYellowMetal, null);
});
test('S8: left-right mirrored combs flank shuttle and stay electrically isolated', () => {
  const m = buildSwxS8SiliconMask(),
    e = m.elements,
    components = connectedComponents(e);
  const n = (prefix) => e.filter((t) => t.name.startsWith(prefix)).length;
  for (const side of ['L', 'R']) {
    assert.equal(n('FIXED_FINGER_' + side + '_'), 20);
    assert.equal(n('MOVING_FINGER_' + side + '_'), 20);
    const first = e.find((z) => z.name === 'FIXED_FINGER_' + side + '_0'),
      other = e.find((z) => z.name === 'MOVING_FINGER_' + side + '_0');
    assert.ok(!overlap(first.points, other.points), 'fixed/moving interdigitation short');
  }
  assert.equal(
    components.count,
    3,
    'expect one grounded optomechanical network and two fixed signal comb banks',
  );
  const ground = components.byName('SHUTTLE_LEFT_RAIL');
  assert.equal(
    components.byName('SWX_FIXED_HALF'),
    ground,
    'S7 aligner must join fixed and movable optics mechanically',
  );
  assert.equal(components.byName('SWX_MOVABLE_HALF'), ground);
  assert.equal(components.byName('MOVING_COMB_HANDLE_L'), ground);
  assert.equal(components.byName('MOVING_COMB_HANDLE_R'), ground);
  for (const side of ['L', 'R']) {
    assert.notEqual(components.byName('FIXED_COMB_HANDLE_' + side), ground);
    assert.equal(
      components.byName('FIXED_FINGER_' + side + '_0'),
      components.byName('FIXED_COMB_HANDLE_' + side),
    );
  }
  assert.notEqual(
    components.byName('FIXED_COMB_HANDLE_L'),
    components.byName('FIXED_COMB_HANDLE_R'),
    'Do not fabricate unproven inter-bank signal metal',
  );
});
test('S8: two folded spring stations, both lateral ends supported', () => {
  const m = buildSwxS8SiliconMask(),
    es = m.elements,
    c = connectedComponents(es),
    g = c.byName('SHUTTLE_LEFT_RAIL');
  for (const y of [2, -41])
    for (const side of ['L', 'R']) {
      const prefix = 'FOLDED_' + y + '_' + side + '_';
      assert.equal(es.filter((e) => e.name.startsWith(prefix)).length, 4);
      for (const tag of ['UP', 'DOWN']) {
        assert.equal(
          c.byName('SPRING_ANCHOR_' + y + '_' + side + '_' + tag),
          g,
          'The compliant spring must join shuttle and anchor',
        );
        for (const [kind, length] of [
          ['LONG', 30],
          ['SHORT', 22],
        ]) {
          const e = es.find((e) => e.name === prefix + kind + '_' + tag);
          const xs = e.points.map((p) => p[0]),
            ys = e.points.map((p) => p[1]);
          assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - length) < 1e-8);
          assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - 0.2) < 1e-8);
        }
      }
    }
});
test('SWT: true tip clearance (0.9um), fabricated OFF only', () => {
  const m = buildSwxS8SiliconMask(),
    e = m.elements;
  assert.equal(e.filter((z) => z.name.startsWith('SWT_FIXED_')).length, 11);
  assert.equal(e.filter((z) => z.name.startsWith('SWT_MOVING_')).length, 11);
  const fixed = e.filter((z) => z.name.startsWith('SWT_FIXED_')),
    mobile = e.filter((z) => z.name.startsWith('SWT_MOVING_'));
  const tipFixed = Math.min(...fixed.flatMap((z) => z.points.map((p) => p[1]))),
    tipMobile = Math.max(...mobile.flatMap((z) => z.points.map((p) => p[1])));
  assert.ok(Math.abs(tipFixed - tipMobile - 0.9) < 1e-8);
  assert.equal(m.expectedTopology.opticalFront, 'positive_Y');
  assert.equal(m.provenance.dimensionsFromPaperUm.onAirGap, 0.015);
});

test('checked-in S8 primary Si GDS roundtrips every polygon at native 0.1nm DBU', () => {
  const bytes = readFileSync(
    new URL('../examples/projects/swx-s8-primary-silicon-DRAFT.gds', import.meta.url),
  );
  const raw = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const parsed = parseGDS(raw),
    reopened = flattenGDS(parsed, parsed.root),
    source = buildSwxS8SiliconMask().elements;
  assert.equal(reopened.units.hasPhysicalUnits, true);
  assert.equal(reopened.units.dbuToMicron, 0.0001);
  assert.equal(reopened.elements.length, source.length);
  for (let i = 0; i < source.length; i++) {
    const a = source[i],
      b = reopened.elements[i];
    assert.equal(a.layer, b.layer, 'polygon ' + i + ' layer');
    assert.equal(a.datatype, b.datatype, 'polygon ' + i + ' datatype');
    assert.equal(a.points.length, b.points.length, 'polygon ' + i + ' vertices');
    for (let j = 0; j < a.points.length; j++) {
      for (let k = 0; k < 2; k++) {
        const unit = reopened.units.dbuToMicron,
          value = Math.round(a.points[j][k] / unit) * unit;
        assert.ok(
          Math.abs(value - b.points[j][k]) < 1e-8,
          'stale/incorrect GDS polygon ' + i + ' point ' + j + ' coordinate ' + k,
        );
      }
    }
  }
});

test('S8 nominal +Y actuation increases BOTH left/right comb overlaps', () => {
  const m = buildSwxS8SiliconMask(),
    es = m.elements,
    span = (name, axis) => es.find((e) => e.name === name).points.map((p) => p[axis]),
    intersect = (a, b) =>
      Math.max(
        0,
        Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b)),
      );
  for (const side of ['L', 'R']) {
    const fixed = span('FIXED_FINGER_' + side + '_0', 1),
      moving = span('MOVING_FINGER_' + side + '_0', 1);
    const off = intersect(fixed, moving),
      on = intersect(
        fixed,
        moving.map((y) => y + 0.885),
      );
    assert.ok(Math.abs(off - 0.2) < 1e-8, side + ' OFF overlap');
    assert.ok(Math.abs(on - 1.085) < 1e-8, side + ' ON overlap');
    const fx = span('FIXED_FINGER_' + side + '_0', 0),
      mx = span('MOVING_FINGER_' + side + '_0', 0),
      lateral =
        side === 'R' ? Math.min(...mx) - Math.max(...fx) : Math.min(...fx) - Math.max(...mx);
    assert.ok(Math.abs(lateral - 0.3) < 1e-8, side + ' lateral gap');
  }
  const p = m.provenance.dimensionsFromPaperUm;
  assert.ok(Math.abs(p.offAirGap - 0.885 - p.onAirGap) < 1e-8);
  // Kinematic dimension check only: elastic deformation and FEM NOT tested.
});

test('S9 all adjacent fingers have 300nm clearance and banks are true mirrors', () => {
  const es = buildSwxS8SiliconMask().elements;
  const span = (e, axis) => [
    Math.min(...e.points.map((p) => p[axis])),
    Math.max(...e.points.map((p) => p[axis])),
  ];
  for (const side of ['L', 'R']) {
    const fingers = es.filter(
      (e) =>
        e.name.startsWith('FIXED_FINGER_' + side + '_') ||
        e.name.startsWith('MOVING_FINGER_' + side + '_'),
    );
    const xs = fingers.map((e) => span(e, 0)).sort((a, b) => a[0] - b[0]);
    for (const e of fingers) {
      const y = span(e, 1);
      assert.ok(Math.abs(y[1] - y[0] - 3.2) < 1e-8);
    }
    for (let i = 1; i < xs.length; i++)
      assert.ok(
        Math.abs(xs[i][0] - xs[i - 1][1] - 0.3) < 1e-8,
        side + ' secondary inter-finger gap (old 1.55um pitch left only 250nm)',
      );
  }
  for (const e of es.filter((e) => e.name.endsWith('_R') || /_R_\d+$/.test(e.name))) {
    if (!['fixedComb', 'movableComb'].includes(e.part)) continue;
    const left = es.find((a) => a.name === e.name.replace(/_R(?=_|$)/, '_L'));
    assert.ok(left, 'missing reflected partner ' + e.name);
    const pointSet = (pts) => pts.map((p) => p.map((v) => Math.round(v * 1e6)).join(',')).sort();
    assert.deepEqual(pointSet(left.points), pointSet(e.points.map(([x, y]) => [-x, y])));
  }
});

test('S2 stops meet at 885nm travel while optical tips retain 15nm clearance', () => {
  const es = buildSwxS8SiliconMask().elements;
  for (const side of ['L', 'R']) {
    const fixed = es.find((e) => e.name === 'STOP_FIXED_' + side),
      moving = es.find((e) => e.name === 'STOP_MOVING_' + side);
    const gap =
      Math.min(...fixed.points.map((p) => p[1])) - Math.max(...moving.points.map((p) => p[1]));
    assert.ok(Math.abs(gap - 0.885) < 1e-8);
    const shifted = (dy) => moving.points.map(([x, y]) => [x, y + dy]);
    assert.equal(overlap(fixed.points, shifted(0.884)), false);
    assert.equal(overlap(fixed.points, shifted(0.885)), false);
    assert.equal(overlap(fixed.points, shifted(0.886)), true);
  }
  assert.equal(
    es.some((e) => e.name.startsWith('REFLECTOR_TO_SHUTTLE_')),
    false,
    'No extra solid post inside the tapered shuttle nose',
  );
  for (const side of ['L', 'R']) {
    const roof = es.find((e) => e.name === 'SHUTTLE_NOSE_' + side + '_1');
    assert.ok(roof, 'missing triangular nose side');
    assert.ok(Math.max(...roof.points.map((p) => p[1])) < 36.8, 'Nose must not fill SWT valleys');
  }
});

test('S8 optical halves connect only through deliberate aligners', () => {
  const es = buildSwxS8SiliconMask().elements.filter((e) => e.part !== 'aligner');
  const c = connectedComponents(es);
  assert.equal(c.count, 4);
  assert.notEqual(c.byName('SWX_FIXED_HALF'), c.byName('SWX_MOVABLE_HALF'));
  assert.equal(c.byName('SWX_MOVABLE_HALF'), c.byName('SHUTTLE_LEFT_RAIL'));
  for (const side of ['L', 'R'])
    assert.equal(c.byName('GRATING_SUPPORT_MOVING_' + side), c.byName('SWX_MOVABLE_HALF'));
});

test('S1 actual MMI projection, taper length and S6 middle straight match source dimensions', () => {
  const es = buildSwxS8SiliconMask().elements;
  const near = (a, b, tolerance = 2e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
  for (const [name, y, sign] of [
    ['FIXED_MM_R', 38.3, 1],
    ['MOVING_MM_R', 36.8, -1],
  ]) {
    const e = es.find((e) => e.name === name);
    const axial = e.points.map(([x, py]) => (x + sign * (py - y)) / Math.sqrt(2));
    const transverse = e.points.map(([x, py]) => (-sign * x + py - y) / Math.sqrt(2));
    near(Math.max(...axial), 19.54 / 2);
    near(Math.max(...transverse) - Math.min(...transverse), 2.68);
  }
  const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (const name of ['FIXED_TAPER_L', 'FIXED_TAPER_R', 'MOVING_TAPER_L', 'MOVING_TAPER_R']) {
    const p = es.find((e) => e.name === name).points;
    const a = midpoint(p[0], p[3]),
      b = midpoint(p[1], p[2]);
    near(Math.hypot(b[0] - a[0], b[1] - a[1]), 6.0004); // 0.2nm tile overlap at both ends
    near(Math.hypot(p[0][0] - p[3][0], p[0][1] - p[3][1]), 2.68);
    near(Math.hypot(p[1][0] - p[2][0], p[1][1] - p[2][1]), 0.4);
  }
  for (const side of ['L', 'R']) {
    const p = es.find((e) => e.name === 'S6_MEANDER_' + side + '_50').points;
    const a = midpoint(p[0], p[3]),
      b = midpoint(p[1], p[2]);
    near(Math.hypot(b[0] - a[0], b[1] - a[1]), 15.0002); // internal tile overlap only
  }
});

test('anchor lands clear the folded-beam channels through nominal travel', () => {
  const es = buildSwxS8SiliconMask().elements;
  const anchors = es.filter((e) => e.name.startsWith('SPRING_ANCHOR_'));
  const beams = es.filter((e) => e.name.startsWith('FOLDED_') && e.name.includes('_LONG_'));
  assert.equal(anchors.length, 8);
  for (const a of anchors) {
    const xs = a.points.map((p) => p[0]),
      ys = a.points.map((p) => p[1]);
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 6);
    assert.ok(Math.max(...ys) - Math.min(...ys) >= 6 - 1e-8);
    for (const b of beams)
      for (const dy of [0, 0.885])
        assert.equal(
          overlap(
            a.points,
            b.points.map(([x, y]) => [x, y + dy]),
          ),
          false,
          a.name + ' blocks flexible beam ' + b.name,
        );
  }
  for (const side of ['L', 'R'])
    for (const [name, width] of [
      ['FIXED_COMB_HANDLE_', 6],
      ['MOVING_COMB_HANDLE_', 3],
    ]) {
      const e = es.find((e) => e.name === name + side),
        ys = e.points.map((p) => p[1]);
      assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - width) < 1e-8);
    }
});

test('four fan grating couplers retain separate unvalidated trench geometry', () => {
  const m = buildSwxS8SiliconMask(),
    es = m.elements;
  assert.equal(es.filter((e) => e.part === 'gratingSupport').length, 4);
  assert.equal(es.filter((e) => e.part === 'gratingGroove').length, 48);
  assert.ok(es.filter((e) => e.part === 'gratingSupport').every((e) => e.layer === 1));
  assert.ok(es.filter((e) => e.part === 'gratingGroove').every((e) => e.layer === 2));
  assert.equal(m.ioAssumptions.validated, false);
  assert.equal(m.ioAssumptions.etchDepth, null);
  assert.equal(
    es.some(
      (e) => e.name.startsWith('OPTICAL_ANCHOR_') || e.name.startsWith('FIXED_OPTICAL_ANCHOR_'),
    ),
    false,
    'A rectangle must not masquerade as a grating coupler',
  );
});

test('paper topology has no isolated comb terminal blocks or narrow link stubs', () => {
  const es = buildSwxS8SiliconMask().elements;
  for (const prefix of [
    'FIXED_COMB_PAD_',
    'FIXED_COMB_TO_PAD_',
    'COMB_TO_SHUTTLE_',
    'REFLECTOR_TO_SHUTTLE_',
    'COMB_SHUTTLE_BRIDGE',
  ])
    assert.equal(
      es.some((e) => e.name.startsWith(prefix)),
      false,
      prefix + ' is an unsupported appendage',
    );
  const ymin = (e) => Math.min(...e.points.map((p) => p[1])),
    ymax = (e) => Math.max(...e.points.map((p) => p[1]));
  const rail = es.find((e) => e.name === 'SHUTTLE_LEFT_RAIL');
  const bottom = es.find((e) => e.name === 'SHUTTLE_BRIDGE_BODY_0');
  const top = es.find((e) => e.name === 'SHUTTLE_BRIDGE_BODY_16');
  assert.ok(Math.abs(ymin(rail) - ymin(bottom)) < 1e-8, 'rail tails below rear closure');
  assert.ok(Math.abs(ymax(rail) - ymax(top)) < 1e-8, 'rail tails above nose closure');
  const c = connectedComponents(es),
    ground = c.byName('SHUTTLE_LEFT_RAIL');
  for (const side of ['L', 'R']) assert.equal(c.byName('MOVING_COMB_HANDLE_' + side), ground);
  // The moving handle must not replace the perforated shuttle with a solid pad.
  const aperture = [
    [-0.01, -22.71],
    [0.01, -22.71],
    [0.01, -22.69],
    [-0.01, -22.69],
  ];
  assert.ok(es.filter((e) => e.layer === 1).every((e) => !overlap(e.points, aperture)));
});
