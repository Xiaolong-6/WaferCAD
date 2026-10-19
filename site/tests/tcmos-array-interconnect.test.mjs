import assert from 'node:assert/strict';
import test from 'node:test';
import { readTcmosReferenceMask } from '../../scripts/tcmos-svg-mask.mjs';
import {
  ROUTED_4X4_SPEC,
  tcmosRoutingCells,
  buildTcmosRoutedOverlay,
  auditTcmosRoutedOverlay,
  renderTcmosRoutingOverlaySvg,
} from '../../scripts/build-tcmos-array-interconnect.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const geometry = await import('../vector-geometry.js');
const { geometryArea } = await import('../model.js');
const shape = (points) => [[points.concat([points[0]])]];
const rect = ([a, b, c, d]) =>
  shape([
    [a, b],
    [c, b],
    [c, d],
    [a, d],
  ]);

test('4x4 routed overlay preserves every approved source M1 polygon and CNT mapping', () => {
  const layout = buildTcmosRoutedOverlay();
  const approved = readTcmosReferenceMask();
  const m1 = approved.find((group) => group.name === 'METAL1').shapes;
  assert.equal(
    approved.reduce((n, group) => n + group.shapes.length, 0),
    232,
  );
  assert.equal(layout.sourceFileMaskElementCount, 3712);
  assert.equal(layout.sourceCntCount, 3488);
  assert.equal(layout.scientificStatus, 'illustrative-routing-topology-only');
  assert.equal(layout.physicalModelIntegrated, false);
  const names = ['VIN', 'VOUT', 'VDD', 'GND'];
  for (const [i, cell] of layout.cells.entries()) {
    assert.deepEqual(
      { x: cell.x, y: cell.y },
      { x: tcmosRoutingCells()[i].x, y: tcmosRoutingCells()[i].y },
    );
    for (const [j, name] of names.entries()) {
      const translated = m1[j].points.map(([x, y]) => [x + cell.x, y + cell.y]);
      assert.deepEqual(layout.m1[4 * i + j].points, translated);
      assert.equal(layout.m1[4 * i + j].net, name === 'VOUT' ? 'VOUT/' + cell.id : name);
    }
  }
});

test('4x4 translation preserves 64 mutually unshorted physical M1 source nets', () => {
  const layout = buildTcmosRoutedOverlay();
  assert.equal(layout.m1.length, 64);
  const assertIsolated = (metal) => {
    const polygons = metal.map((entry) => {
      const geom = shape(entry.points);
      return { ...entry, geom, bounds: geometry.multiBounds(geom) };
    });
    let checkedPairs = 0;
    for (let i = 0; i < polygons.length; i++) {
      for (let j = i + 1; j < polygons.length; j++) {
        const a = polygons[i];
        const b = polygons[j];
        checkedPairs++;
        // The 14 x 8 um demonstration pitch must keep distinct source
        // cells physically separated, even where their net names agree.
        // Bounding-box clearance is conservative and catches edge contact.
        if (a.cellId !== b.cellId) {
          const dx = Math.max(a.bounds.minX - b.bounds.maxX, b.bounds.minX - a.bounds.maxX, 0);
          const dy = Math.max(a.bounds.minY - b.bounds.maxY, b.bounds.minY - a.bounds.maxY, 0);
          assert.ok(Math.hypot(dx, dy) > 1e-9, a.id + ' / ' + b.id + ': M1 inter-cell contact');
        }
        if (
          a.bounds.maxX < b.bounds.minX ||
          b.bounds.maxX < a.bounds.minX ||
          a.bounds.maxY < b.bounds.minY ||
          b.bounds.maxY < a.bounds.minY
        ) {
          continue;
        }
        assert.ok(
          geometryArea(geometry.intersection(a.geom, b.geom)) < 1e-12,
          a.id + ' / ' + b.id + ': M1 cross-net short',
        );
      }
    }
    return checkedPairs;
  };
  assert.equal(assertIsolated(layout.m1), 2016);
  // This must be a falsifiable geometry contract, not just a polygon count.
  const shorted = structuredClone(layout.m1);
  shorted[1].points = structuredClone(shorted[0].points);
  assert.throws(() => assertIsolated(shorted), /M1 cross-net short/);
});

test('all M1-to-M2 vias are FULLY inside exactly one approved M1 polygon', () => {
  const layout = buildTcmosRoutedOverlay();
  const original = readTcmosReferenceMask().find((group) => group.name === 'METAL1').shapes;
  let verified = 0;
  for (const via of layout.vias.filter((v) => v.from === 'M1')) {
    const site = layout.cells.find((c) => c.id === via.cellId);
    assert.ok(site);
    const pad = rect(via.rect);
    const owners = original.filter(({ points }) => {
      const moved = points.map(([x, y]) => [x + site.x, y + site.y]);
      // Preserve the existing 1e-12 um² geometry-science threshold.
      return geometryArea(geometry.difference(pad, shape(moved))) < 1e-12;
    });
    assert.equal(owners.length, 1, via.id + ' has incomplete or ambiguous M1 landing');
    const netName = ['VIN', 'VOUT', 'VDD', 'GND'][original.indexOf(owners[0])];
    assert.equal(via.net, netName === 'VOUT' ? 'VOUT/' + site.id : netName);
    verified++;
  }
  assert.equal(verified, 64);
});

test('all 312 Via faces have full real polygon-Boolean metal coverage and no foreign-net overlap', () => {
  const layout = buildTcmosRoutedOverlay();
  const candidates = (layer) =>
    layer === 'M1'
      ? layout.m1.map((m) => ({ ...m, geom: shape(m.points) }))
      : layout.metal.filter((m) => m.layer === layer).map((m) => ({ ...m, geom: rect(m.rect) }));
  const byLayer = new Map(['M1', 'M2', 'M3', 'M4'].map((name) => [name, candidates(name)]));
  let checked = 0;
  for (const via of layout.vias) {
    const aperture = rect(via.rect);
    for (const layer of [via.from, via.to]) {
      const intersected = byLayer
        .get(layer)
        .map((candidate) => ({
          ...candidate,
          hit: geometry.intersection(aperture, candidate.geom),
        }))
        .filter((candidate) => geometryArea(candidate.hit) > 1e-12);
      const foreign = intersected.filter((candidate) => candidate.net !== via.net);
      assert.deepEqual(
        foreign.map((candidate) => candidate.id),
        [],
        via.id + ': Via face intersects another net on ' + layer,
      );
      const owned = intersected.filter((candidate) => candidate.net === via.net);
      assert.ok(owned.length > 0, via.id + ': missing ' + layer + ' conductor');
      const coverage = geometry.unionGeometries(owned.map((candidate) => candidate.hit));
      // This is the approved geometry-science precision, not a weakened DRC tolerance.
      assert.ok(
        geometryArea(geometry.difference(aperture, coverage)) < 1e-12,
        via.id + ': part of the Via face is uncovered by ' + layer,
      );
      checked++;
    }
  }
  assert.equal(checked, 312);
});

test('19 independent net components: 3 buses + 16 accessible and unshorted outputs', () => {
  const routed = buildTcmosRoutedOverlay();
  const report = auditTcmosRoutedOverlay(routed);
  assert.equal(report.pass, true);
  assert.equal(report.continuousNets, 19);
  assert.deepEqual(report.sharedNets, ['VDD', 'GND', 'VIN']);
  assert.equal(report.isolatedOutputs, 16);
  assert.deepEqual([report.via12, report.via23, report.via34], [64, 64, 28]);
  assert.deepEqual([report.m2Shapes, report.m3Shapes, report.m4Shapes], [64, 44, 51]);
  assert.equal(report.minimumSameLayerNetSpacing, ROUTED_4X4_SPEC.minimumSameLayerNetSpacing);
  assert.equal(report.calibratedElectricalResistance, false);
  assert.equal(report.physicalModelIntegrated, false);
  assert.equal(routed.ports.filter((p) => p.role === 'individual-output-test-port').length, 16);
  assert.ok(
    routed.ports
      .filter((port) => port.role === 'individual-output-test-port')
      .every((port) => port.layer === 'M4' && port.point[0] === 27),
  );
  assert.equal(routed.ports.filter((p) => p.role === 'shared-bus-test-port').length, 3);
  const svg = renderTcmosRoutingOverlaySvg(routed);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('<polygon'));
  assert.ok(svg.includes('<rect'));
  assert.doesNotMatch(svg, /height="[^"]+""/, 'Via SVG has doubled attribute quotes');
});

test('DRC rejects same-layer VOUT short, wrong via ownership and missing trunk continuity', () => {
  const shorted = buildTcmosRoutedOverlay();
  shorted.metal.find((m) => m.id === 'm3-output-trace/site-0').rect[2] += 3;
  assert.throws(() => auditTcmosRoutedOverlay(shorted), /SHORT\/spacing/);

  const swapped = buildTcmosRoutedOverlay();
  swapped.vias.find((via) => via.from === 'M1').net = 'GND';
  assert.throws(() => auditTcmosRoutedOverlay(swapped), /crossing to wrong net/);

  const unconnected = buildTcmosRoutedOverlay();
  unconnected.metal.find((m) => m.id === 'm3-trunk/VIN/0').rect[0] += 0.6;
  unconnected.metal.find((m) => m.id === 'm3-trunk/VIN/0').rect[2] += 0.6;
  assert.throws(
    () => auditTcmosRoutedOverlay(unconnected),
    /expected exactly one complete M3 landing/,
  );
});

test('the 16 independent M4 fanouts reject physical opens and output bridges', () => {
  const wired = buildTcmosRoutedOverlay();
  const outputs = wired.ports.filter((port) => port.role === 'individual-output-test-port');
  assert.equal(outputs.length, 16);
  assert.ok(outputs.every((port) => port.layer === 'M4' && port.point[0] === 27));
  assert.equal(new Set(outputs.map((port) => port.point[1])).size, 16);
  assert.equal(wired.vias.filter((via) => via.from === 'M3').length, 28);

  const opened = buildTcmosRoutedOverlay();
  const missing = opened.metal.find((metal) => metal.id === 'm4-output-fanout/site-0');
  assert.ok(missing);
  missing.rect[0] = missing.rect[2] - 1;
  assert.throws(() => auditTcmosRoutedOverlay(opened), /OPEN CIRCUIT/);

  const bridged = buildTcmosRoutedOverlay();
  const output = bridged.metal.find((metal) => metal.id === 'm4-output-pad/site-0');
  const neighbor = bridged.metal.find((metal) => metal.id === 'm4-output-pad/site-1');
  assert.ok(output && neighbor);
  output.rect[3] = neighbor.rect[1] + 0.05;
  assert.throws(() => auditTcmosRoutedOverlay(bridged), /SHORT\/spacing/);
});

test('approved 4x4 stored geometry and original Recipe remain unchanged by routing generation', () => {
  const route = buildTcmosRoutedOverlay();
  assert.equal(route.kind, 'tcmos-4x4-illustrative-multimetal-fanout-v2');
  assert.ok(!('model' in route));
  assert.ok(!('processRecipe' in route));
  assert.ok(!('snapshotBranches' in route));
  assert.ok(!('layout' in route));
  assert.equal(route.sourceFileMaskElementCount, 3712);
});
