import assert from 'node:assert/strict';
import test from 'node:test';
import { buildM3DLime } from '../../scripts/build-m3d-lime-example.mjs';

// All tests inspect the same deterministic, immutable-by-convention Kernel result.
// Replaying the entire 47-step process for every assertion adds minutes to CI.
let resultPromise;
function verifiedFixture() {
  return (resultPromise ??= buildM3DLime());
}

test('M3D-LIME source-derived 3-tier process is materialized by the real kernel', async () => {
  const { project, validation } = await verifiedFixture();

  assert.equal(validation.doi, '10.1038/s41467-023-42981-1');
  assert.deepEqual(validation.demonstratedArraySizes, { cim: 1024, buffer: 512, tcamCells: 5 });
  assert.deepEqual(validation.representedCellCounts, { cim: 8, buffer: 4, tcamCells: 5 });
  assert.deepEqual(validation.representedCntfets, {
    tcamAccess: 10,
    bufferAccess: 4,
    mlPrecharge: 1,
  });
  assert.equal(validation.representedDigitalRramSites, 14);
  assert.equal(validation.transistorChannelWUm, 20);
  assert.equal(validation.transistorChannelLUm, 2);
  assert.ok(validation.declaredAssumptions.some((v) => v.includes('surrogate')));

  const steps = project.processRecipe.steps;
  const nodes = project.snapshotBranches.nodes;
  assert.ok(steps.length >= 40, 'source process stages must not be collapsed to a static stack');
  assert.equal(nodes.length, steps.length + 1, 'Base and each Recipe Step require History');
  assert.equal(project.snapshots.length, 9, 'all nine milestone checkpoints must survive');
  assert.equal(project.layout.combos.length, 12, 'inferred ML contact mask must remain exportable');
  assert.equal(project.snapshotBranches.branches.length, 1);
  assert.equal(project.snapshotBranches.branches[0].headNodeId, nodes.at(-1).id);
  assert.equal(
    project.snapshotBranches.branches[0].headState.model.processRevision,
    project.model.processRevision,
  );

  const conformalIds = new Set(
    project.model.layers
      .filter((layer) =>
        [
          'CNT gate HfO2 10nm',
          'CNT Al2O3 passivation 35nm',
          'CNT HfO2 passivation 10nm',
          'Digital Al2O3 passivation 45nm',
        ].includes(layer.name),
      )
      .map((layer) => layer.id),
  );
  const physicalSidewalls = project.model.regions
    .flatMap((region) => region.stack)
    .filter(
      (segment) => segment.role === 'conformal-sidewall' && conformalIds.has(segment.layerId),
    );
  assert.ok(
    physicalSidewalls.length > 0,
    'Kernel must create actual ALD-coated sidewalls, not merely conformal Recipe labels',
  );

  const names = project.model.layers.map((l) => l.name);
  for (const item of [
    'CIM TiN BE 30nm',
    'CIM HfAlOx RSL 8nm',
    'CIM TaOx TEL 45nm',
    'CIM TiN TE 30nm',
    'CIM Al bit lines 500nm',
    'CIM-to-TCAM Si3N4 ILD 900nm',
    'CNT gate Pd 15nm',
    'CNT gate HfO2 10nm',
    'CNT channel 1nm SURROGATE',
    'CNT drain Pd 45nm',
    'Digital TaOx ORL 20nm',
    'Digital Ta2O5 RSL 10nm',
    'Digital Pt TE 10nm',
    'Digital Al2O3 passivation 45nm',
    'Top Pd interconnect 120nm',
  ]) {
    assert.ok(names.includes(item), 'Missing sourced physical material: ' + item);
  }

  const stepsText = steps.map((s) => s.params.label || s.params.material || '').join(' ');
  assert.match(stepsText, /130nm Si CMOS/);
  assert.match(stepsText, /Y2O3/);
  assert.ok(nodes.some((node) => /Open top Pt/i.test(node.operation?.label || '')));
  assert.ok(
    steps.some((s) => s.command === 'record'),
    'non-geometric paper steps must be recorded',
  );
  assert.ok(
    steps.every((s) => s.command !== 'implant'),
    'CNT conduction and resistive switching are not silicon implantation',
  );
});

test('ALD passivations retain supported conformal coverage with explicit 45nm limits', async () => {
  const { project, validation } = await verifiedFixture();
  const steps = project.processRecipe.steps;
  for (const name of [
    'CNT gate HfO2 10nm',
    'CNT Al2O3 passivation 35nm',
    'CNT HfO2 passivation 10nm',
    'Digital Al2O3 passivation 45nm',
  ]) {
    const operation = steps.find((step) => step.params?.material === name);
    assert.ok(operation, name + ' is absent from source Recipe');
    assert.equal(
      operation.params.coverage,
      'conformal',
      name + ' ALD is erroneously rendered as vertical-only deposition',
    );
  }
  const topAl2O3 = steps.find((step) => step.params?.material === 'Digital Al2O3 passivation 45nm');
  assert.ok(topAl2O3, 'source reports 45nm ALD protection');
  assert.equal(
    topAl2O3.params.coverage,
    'conformal',
    'the source requires real sidewall coating at the 45nm top ALD stage',
  );
  const coating = project.model.layers.find(
    (layer) => layer.name === 'Digital Al2O3 passivation 45nm',
  );
  assert.ok(
    project.model.regions.some((region) =>
      region.stack.some(
        (part) => part.layerId === coating.id && part.role === 'conformal-sidewall',
      ),
    ),
    'final project must retain native 45nm ALD sidewall material',
  );
  assert.ok(
    validation.declaredAssumptions.some((item) => item.includes('persistence grid')),
    'scientific geometry precision limitation must remain disclosed',
  );
  assert.deepEqual(
    project.roi,
    { type: 'rect', a: [-45, -35], b: [-35, -11] },
    '3D inspection must frame one local CNTFET-RRAM half-cell, not an entire array',
  );
  assert.deepEqual(
    project.section,
    { a: [-44, -24], b: [-35, -24] },
    'published device cross-section must be preserved',
  );
});

test('foundry M4 state precedes analog RRAM without a second invented 400nm oxide', async () => {
  const { project } = await verifiedFixture();
  const steps = project.processRecipe.steps;
  const labels = steps.map((step) => String(step.params.material || step.params.label || ''));
  const index = (pattern) => labels.findIndex((label) => pattern.test(label));
  const foundry = index(/130nm Si CMOS foundry/);
  const m4 = index(/M4 W via fill/);
  const analog = index(/CIM TiN BE 30nm/);
  const passivation = index(/CIM SiO2 passivation 400nm/);
  const topContact = index(/CIM W top vias/);
  const ilDielectric = index(/CIM-to-TCAM Si3N4 ILD 900nm/);
  assert.ok(
    foundry >= 0 &&
      foundry < m4 &&
      m4 < analog &&
      analog < passivation &&
      passivation < topContact &&
      topContact < ilDielectric,
    'Li et al. Methods requires exposed CMOS M4, TiN/HfAlOx RRAM, then SiO2 passivation',
  );
  assert.ok(
    steps.slice(0, analog).every((step) => !/400nm|First level SiO2/i.test(JSON.stringify(step))),
    'a 400nm oxide deposition before analog RRAM has no support in the paper',
  );
  assert.ok(
    steps.slice(0, analog).some((step) => /SURROGATE/i.test(JSON.stringify(step))),
    'unpublished CMOS M4 backend construction must be flagged as a geometric surrogate',
  );
  const names = project.model.layers.map((layer) => layer.name);
  assert.ok(!names.includes('First level SiO2 400nm'), 'remove fabricated pre-CIM oxide');
  assert.equal(
    names.filter((name) => name === 'CIM SiO2 passivation 400nm').length,
    1,
    'the 400nm oxide in Methods is the post-RRAM passivation',
  );
});

test('CNTFET drawn islands preserve reported 20um width and 2um metal-to-metal active gap', async () => {
  const { project } = await verifiedFixture();
  const byMask = (id) =>
    project.layout.elements
      .filter((element) => element.layer === id)
      .map((element) => {
        const xs = element.points.map((p) => p[0]);
        const ys = element.points.map((p) => p[1]);
        return {
          left: Math.min(...xs),
          right: Math.max(...xs),
          bottom: Math.min(...ys),
          top: Math.max(...ys),
        };
      });
  const channels = byMask(16);
  const gates = byMask(15);
  const sources = byMask(17);
  const drains = byMask(18);
  const digitalRrams = byMask(19);
  assert.equal(channels.length, 15, '4 buffer + 10 TCAM + 1 ML pre-charge CNTFET');
  assert.equal(gates.length, 15);
  assert.equal(sources.length, 15);
  assert.equal(drains.length, 15);
  assert.equal(digitalRrams.length, 14, 'pre-charge CNTFET must not become an RRAM cell');
  for (let i = 0; i < digitalRrams.length; i++) {
    const channel = channels[i],
      source = sources[i],
      drain = drains[i],
      gate = gates[i],
      rram = digitalRrams[i];
    const close = (actual, expected, label) =>
      assert.ok(Math.abs(actual - expected) < 1e-9, label + ': ' + actual + ' vs ' + expected);
    close(channel.top - channel.bottom, 20, 'reported channel width');
    close(channel.right - channel.left, 2.6, 'inferred CNT island including contact overlap');
    close(source.right - channel.left, 0.3, 'source overlap');
    close(channel.right - drain.left, 0.3, 'drain overlap');
    close(drain.left - source.right, 2, 'reported active channel L');
    close(drain.right - drain.left, 1.8, 'inferred common Pd landing');
    assert.ok(
      rram.left - channel.right >= 0.45 - 1e-9,
      'Supplementary Fig. 6 requires a laterally distinct digital RRAM outside the CNT island',
    );
    assert.ok(
      rram.left >= drain.left && rram.right <= drain.right,
      'digital RRAM must land entirely on common Pd drain/BE',
    );
    assert.ok(
      gate.left <= source.right && gate.right >= drain.left,
      'gate must cover entire active length',
    );
  }
});

test('TCAM pre-charge CNTFET is physical but has no invented fifteenth RRAM', async () => {
  const { project } = await verifiedFixture();
  const { pointInMulti } = await import('../vector-geometry.js');
  const rects = (maskId) =>
    project.layout.elements
      .filter((e) => e.layer === maskId)
      .map((e) => {
        const xs = e.points.map((p) => p[0]);
        const ys = e.points.map((p) => p[1]);
        return {
          left: Math.min(...xs),
          right: Math.max(...xs),
          bottom: Math.min(...ys),
          top: Math.max(...ys),
        };
      });
  const channel = rects(16).at(-1);
  const gate = rects(15).at(-1);
  const source = rects(17).at(-1);
  const drain = rects(18).at(-1);
  const rram = rects(19);
  assert.deepEqual(channel, { left: 44, right: 46.6, bottom: -25, top: -5 });
  assert.equal(rram.length, 14);
  assert.ok(
    rram.every((r) => r.right < channel.left),
    'pre-charge device must be isolated from the 14 inferred binary-RRAM footprints',
  );
  assert.ok(gate.left < source.right && gate.right > drain.left);
  assert.ok(Math.abs(drain.left - source.right - 2) < 1e-9);
  const materialAt = (x, y, name) => {
    const region = project.model.regions.find((r) => pointInMulti([x, y], r.geom));
    assert.ok(region, 'pre-charge occupancy is missing at ' + x + ',' + y);
    const id = project.model.layers.find((layer) => layer.name === name)?.id;
    assert.ok(id, 'missing layer ' + name);
    assert.ok(
      region.stack.some((segment) => segment.layerId === id),
      'missing ' + name + ' at ' + x + ',' + y,
    );
  };
  materialAt(45, -15, 'CNT channel 1nm SURROGATE');
  materialAt(43.3, -15, 'CNT source Pd 45nm');
  materialAt(47.4, -15, 'CNT drain Pd 45nm');
  materialAt(45, -15, 'CNT gate Pd 15nm');
  const pvd = project.model.layers.find((l) => l.name === 'CNT drain Pd 45nm');
  const seam = [gate.right - 0.005, gate.right + 0.005, gate.right + 0.015].map((x) => {
    const segment = project.model.regions
      .find((r) => pointInMulti([x, -15], r.geom))
      ?.stack.find((part) => part.layerId === pvd.id);
    assert.ok(segment, 'pre-charge Pd is missing at gate edge X=' + x);
    return segment;
  });
  assert.ok(
    Math.abs(seam[1].z1 - seam[1].z0 - 0.01125) < 1e-9,
    'pre-charge Pd step must follow the explicitly inferred 25% sidewall hypothesis',
  );
  for (let i = 0; i < 2; i++) {
    const overlap = Math.min(seam[i].z1, seam[i + 1].z1) - Math.max(seam[i].z0, seam[i + 1].z0);
    assert.ok(overlap > 0.01, 'pre-charge gate-edge Pd overlap must exceed 10nm');
  }
});

test('all 14 CNTFET-to-RRAM Pd paths stay physically connected over oxide steps', async () => {
  const { project } = await verifiedFixture();
  const { pointInMulti } = await import('../vector-geometry.js');
  const pd = project.model.layers.find((layer) => layer.name === 'CNT drain Pd 45nm');
  assert.ok(pd, 'The drain Pd film must exist');
  const rects = (maskId) =>
    project.layout.elements
      .filter((element) => element.layer === maskId)
      .map((element) => ({
        x0: Math.min(...element.points.map((point) => point[0])),
        x1: Math.max(...element.points.map((point) => point[0])),
        y0: Math.min(...element.points.map((point) => point[1])),
        y1: Math.max(...element.points.map((point) => point[1])),
      }));
  const gates = rects(15);
  const channels = rects(16);
  const rram = rects(19);
  assert.equal(gates.length, 15, 'pre-charge gate must be present');
  assert.equal(channels.length, 15, 'pre-charge CNT island must be present');
  assert.equal(rram.length, 14, 'only access FET drains receive digital RRAM');
  const samples = 72;
  for (let cell = 0; cell < rram.length; cell++) {
    const y = (channels[cell].y0 + channels[cell].y1) / 2;
    const gateEdgeX = gates[cell].x1;
    // Uniform 72-point sampling can jump over the 10 nm oxide wall and
    // falsely pass an open contact. Probe inside and across the wall for
    // *every* cell, including all buffer/TCAM instances with shared owners.
    const seamX = [gateEdgeX - 0.005, gateEdgeX + 0.005, gateEdgeX + 0.015];
    const seamPd = seamX.map((x) => {
      const region = project.model.regions.find((item) => pointInMulti([x, y], item.geom));
      const segment = region?.stack.find((part) => part.layerId === pd.id);
      assert.ok(segment, 'Pd missing at physical gate edge cell ' + cell + ', X=' + x);
      return segment;
    });
    assert.ok(
      Math.abs(seamPd[1].z1 - seamPd[1].z0 - 0.01125) < 1e-9,
      'The explicitly inferred 11.25nm PVD wall bridge is absent at cell ' + cell,
    );
    for (let edge = 0; edge < 2; edge++) {
      const overlap =
        Math.min(seamPd[edge].z1, seamPd[edge + 1].z1) -
        Math.max(seamPd[edge].z0, seamPd[edge + 1].z0);
      assert.ok(
        overlap > 0.01,
        'Physical gate-edge Pd bridge overlap must exceed 10nm: cell ' +
          cell +
          ', edge ' +
          edge +
          ', observed ' +
          (overlap * 1000).toFixed(3) +
          'nm',
      );
    }
    const startX = channels[cell].x1 - 0.07;
    const endX = (rram[cell].x0 + rram[cell].x1) / 2;
    let previous = null;
    for (let sample = 0; sample < samples; sample++) {
      const x = startX + ((endX - startX) * (sample + 0.5)) / samples;
      const region = project.model.regions.find((item) => pointInMulti([x, y], item.geom));
      const segment = region?.stack.find((part) => part.layerId === pd.id);
      assert.ok(segment, 'Pd open circuit at CNTFET cell ' + cell + ', X=' + x);
      if (previous) {
        const connectedZ = Math.min(previous.z1, segment.z1) - Math.max(previous.z0, segment.z0);
        assert.ok(
          connectedZ > 0.01,
          'Pd has no 3D-overlapping conductive bridge at CNTFET cell ' + cell + ', X=' + x,
        );
      }
      previous = segment;
    }
  }
});

test('inferred Match Line has ten TCAM Pt endpoints, one pre-charge DRAIN via and no buffer/source short', async () => {
  const { project } = await verifiedFixture();
  const { pointInMulti } = await import('../vector-geometry.js');
  const boxes = (layer) =>
    project.layout.elements
      .filter((element) => element.layer === layer)
      .map((element) => ({
        x0: Math.min(...element.points.map((p) => p[0])),
        x1: Math.max(...element.points.map((p) => p[0])),
        y0: Math.min(...element.points.map((p) => p[1])),
        y1: Math.max(...element.points.map((p) => p[1])),
      }));
  const metal = boxes(21);
  const via = boxes(22);
  const rram = boxes(19);
  const drains = boxes(18);
  assert.equal(metal.length, 21, '14 original contacts plus 5 trunks, bus and pre-charge spur');
  assert.equal(via.length, 1, 'only the pre-charge drain receives its own via');
  assert.deepEqual(via[0], { x0: 47, x1: 47.4, y0: -14.5, y1: -13.5 });
  assert.equal(rram.length, 14);
  assert.equal(drains.length, 15);
  assert.ok(
    via[0].x0 > drains[14].x0 &&
      via[0].x1 < drains[14].x1 &&
      via[0].y0 > drains[14].y0 &&
      via[0].y1 < drains[14].y1,
    'ML via must land fully inside the fifteenth CNTFET DRAIN',
  );
  const touches = (a, b) =>
    a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
  const connected = new Set([4]);
  const queue = [4];
  while (queue.length) {
    const current = queue.pop();
    for (let i = 0; i < metal.length; i++) {
      if (connected.has(i) || !touches(metal[current], metal[i])) continue;
      connected.add(i);
      queue.push(i);
    }
  }
  assert.equal(connected.size, 17, 'ML requires all ten TCAM contacts plus seven trace segments');
  for (let i = 4; i < 14; i++)
    assert.ok(connected.has(i), 'TCAM RRAM top contact is absent from common ML: ' + i);
  for (let i = 0; i < 4; i++)
    assert.ok(!connected.has(i), 'Buffer RRAM shorted into TCAM Match Line: ' + i);
  assert.ok(metal.some((r) => touches(r, via[0])), 'the ML must reach the drain via');
  assert.ok(
    !metal.some((r) => touches(r, { x0: 43.1, x1: 44.3, y0: -25, y1: -5 })),
    'ML must not touch the pre-charge SOURCE (the reported external 1 V supply)',
  );

  const names = new Map(project.model.layers.map((layer) => [layer.name, layer.id]));
  const regionAt = (x, y) => {
    const region = project.model.regions.find((r) => pointInMulti([x, y], r.geom));
    assert.ok(region, 'material-free XY position ' + x + ',' + y);
    return region;
  };
  const segmentAt = (x, y, name) => {
    const stack = regionAt(x, y).stack;
    const segment = stack.find((s) => s.layerId === names.get(name));
    assert.ok(
      segment,
      name + ' missing at ' + x + ',' + y + ': ' +
        JSON.stringify(stack.map((s) => ({
          layer: project.model.layers.find((layer) => layer.id === s.layerId)?.name || s.layerId,
          z0: s.z0,
          z1: s.z1,
          role: s.role,
        }))),
    );
    return segment;
  };
  const contactAt = (x, y, lower, upper) => {
    const stack = regionAt(x, y).stack;
    const i = stack.findIndex((s) => s.layerId === names.get(lower));
    assert.ok(i >= 0, lower + ' missing at ' + x + ',' + y);
    assert.equal(
      stack[i + 1]?.layerId,
      names.get(upper),
      'Insulating layer or void between ' + lower + ' and ' + upper,
    );
    assert.ok(
      Math.abs(stack[i].z1 - stack[i + 1].z0) < 1e-9,
      'Nonzero Z gap between ' + lower + ' and ' + upper,
    );
  };
  for (let i = 4; i < 14; i++) {
    const r = rram[i];
    const x = (r.x0 + r.x1) / 2;
    const y = (r.y0 + r.y1) / 2;
    contactAt(x, y, 'Digital Pt TE 10nm', 'Top Ti interconnect 20nm');
    contactAt(x, y, 'Top Ti interconnect 20nm', 'Top Pd interconnect 120nm');
  }
  contactAt(47.2, -14, 'CNT drain Pd 45nm', 'Top Ti interconnect 20nm');
  contactAt(47.2, -14, 'Top Ti interconnect 20nm', 'Top Pd interconnect 120nm');
  assert.ok(
    !regionAt(43.5, -14).stack.some((s) => s.layerId === names.get('Top Pd interconnect 120nm')),
    'pre-charge source must not accidentally acquire ML top Pd',
  );
  for (const x of [-38.5, -19.5, -0.5, 18.5, 37.5]) {
    assert.ok(
      !regionAt(x, 24).stack.some((s) => s.layerId === names.get('Top Pd interconnect 120nm')),
      'ML spur must not reach buffer channel at x=' + x,
    );
  }
  const topMetalStep = project.processRecipe.steps.find(
    (step) => step.params?.material === 'Top Pd interconnect 120nm',
  );
  assert.equal(topMetalStep?.params?.coverage, 'pvd-step');
  assert.equal(
    topMetalStep?.params?.stepCoverageFraction,
    0.5,
    '50% top Pd sidewall coverage is a declared inference, not measured process data',
  );
  const assertContinuousPd = (points, label) => {
    let previous = null;
    for (const [x, y] of points) {
      const film = segmentAt(x, y, 'Top Pd interconnect 120nm');
      if (previous) {
        const sharedZ = Math.min(film.z1, previous.z1) - Math.max(film.z0, previous.z0);
        assert.ok(
          sharedZ > 0.01,
          label + ': less than 10nm common Pd Z interval at ' + x + ',' + y,
        );
      }
      previous = film;
    }
  };
  for (const x of [-38.5, -19.5, -0.5, 18.5, 37.5]) {
    assertContinuousPd(
      Array.from({ length: 169 }, (_, i) => [x, -23 + (33 * i) / 168]),
      'TCAM top-electrode ML trunk X=' + x,
    );
  }
  assertContinuousPd(
    Array.from({ length: 229 }, (_, i) => [-38.5 + (85.7 * i) / 228, -1.5]),
    'horizontal common Match Line',
  );
  // Sparse uniform sampling can jump over 10nm oxide-wall bands. Enumerate
  // actual process-region polygon vertices and test a midpoint between *each*
  // consecutive boundary along the physical metal trace. This probes every
  // resolved XY material owner, including sub-micrometre junction strips,
  // rather than relying on arbitrary 72/168-point sampling.
  const allGeometryCoordinates = (axis, lower, upper) => {
    const values = new Set([lower, upper]);
    for (const region of project.model.regions) {
      for (const polygon of region.geom || []) {
        for (const ring of polygon || []) {
          for (const point of ring || []) {
            const v = point[axis];
            if (v > lower && v < upper) values.add(v);
          }
        }
      }
    }
    const ordered = [...values].sort((a, b) => a - b);
    return ordered.slice(1).flatMap((upperEdge, i) => {
      const lowerEdge = ordered[i];
      return upperEdge - lowerEdge >= 1e-8 ? [(lowerEdge + upperEdge) / 2] : [];
    });
  };
  for (const x of [-38.5, -19.5, -0.5, 18.5, 37.5]) {
    assertContinuousPd(
      allGeometryCoordinates(1, -23, 10).map((y) => [x, y]),
      'every actual material-owner edge on ML trunk X=' + x,
    );
  }
  assertContinuousPd(
    allGeometryCoordinates(0, -38.5, 47.2).map((x) => [x, -1.5]),
    'every actual material-owner edge on horizontal ML bus',
  );
  assertContinuousPd(
    allGeometryCoordinates(1, -14, -1.5).map((y) => [47.2, y]),
    'every actual material-owner edge on pre-charge spur',
  );
  const overEnd = [-5.12, -5.1, -5.065, -5.035, -5.015, -5.005, -4.995,
    -4.985, -4.965, -4.935, -4.9, -4.88];
  const denseDrainSpur = [
    ...Array.from({ length: 81 }, (_, i) => -14 + (12.5 * i) / 80),
    ...overEnd,
  ].sort((a, b) => a - b).map((y) => [47.2, y]);
  assertContinuousPd(denseDrainSpur, 'pre-charge drain-to-ML spur including 5nm-end seams');
});

test('sampled 3-tier cut is physically ordered through both analog CIM and digital RRAM', async () => {
  const { project, validation } = await verifiedFixture();
  const { pointInMulti } = await import('../vector-geometry.js');
  const layerNames = new Map(project.model.layers.map((l) => [l.id, l.name]));
  const regionAt = (point) => {
    const region = project.model.regions.find((r) => pointInMulti(point, r.geom));
    assert.ok(region, 'no geometry region at ' + point);
    return region;
  };
  const stackAt = (point) => regionAt(point).stack.map((s) => layerNames.get(s.layerId));
  const channelPoint = [-40.7, -23];
  const digitalPoint = [-38.5, -23];
  const channel = stackAt(channelPoint),
    device = stackAt(digitalPoint);
  const ordered = (stack, names) => {
    let previous = -1;
    for (const name of names) {
      const index = stack.indexOf(name);
      assert.ok(index > previous, name + ' missing/out of stack order: ' + stack);
      previous = index;
    }
  };
  ordered(channel, [
    'CNT gate Ti bottom 10nm',
    'CNT gate Pd 15nm',
    'CNT gate Ti cap 1nm',
    'CNT gate HfO2 10nm',
    'CNT channel 1nm SURROGATE',
  ]);
  assert.ok(
    !channel.includes('CNT source Pd 45nm') && !channel.includes('CNT drain Pd 45nm'),
    'active channel is shorted by contact metal',
  );
  ordered(device, [
    'CIM TiN BE 30nm',
    'CIM HfAlOx RSL 8nm',
    'CIM TaOx TEL 45nm',
    'CIM TiN TE 30nm',
    'CNT drain Pd 45nm',
    'Digital TaOx ORL 20nm',
    'Digital Ta2O5 RSL 10nm',
    'Digital Pt TE 10nm',
    'Top Ti interconnect 20nm',
    'Top Pd interconnect 120nm',
  ]);
  // Actual physical Z, rather than a material-name inventory or displayed
  // vertical exaggeration. Values originate in the Methods film-thickness ledger.
  const assertFilm = (point, name, thicknessNm) => {
    const segments = regionAt(point).stack.filter((s) => layerNames.get(s.layerId) === name);
    assert.equal(segments.length, 1, name + ': missing or duplicated at ' + point);
    assert.ok(
      Math.abs((segments[0].z1 - segments[0].z0) * 1000 - thicknessNm) < 1e-4,
      name + ': fabricated film thickness changed at ' + point,
    );
  };
  for (const [name, nm] of [
    ['CNT gate Ti bottom 10nm', 10],
    ['CNT gate Pd 15nm', 15],
    ['CNT gate Ti cap 1nm', 1],
    ['CNT gate HfO2 10nm', 10],
    ['CNT channel 1nm SURROGATE', 1],
  ])
    assertFilm(channelPoint, name, nm);
  for (const [name, nm] of [
    ['CIM TiN BE 30nm', 30],
    ['CIM HfAlOx RSL 8nm', 8],
    ['CIM TaOx TEL 45nm', 45],
    ['CIM TiN TE 30nm', 30],
    ['CNT drain Pd 45nm', 45],
    ['Digital TaOx ORL 20nm', 20],
    ['Digital Ta2O5 RSL 10nm', 10],
    ['Digital Pt TE 10nm', 10],
    ['Top Ti interconnect 20nm', 20],
    ['Top Pd interconnect 120nm', 120],
  ])
    assertFilm(digitalPoint, name, nm);
  const heights = project.model.regions.map((region) => region.stack.at(-1).z1);
  const physicalReliefUm = Math.max(...heights) - Math.min(...heights);
  assert.ok(
    physicalReliefUm < 0.25,
    'unexpected tall pillar in canonical geometry: ' + physicalReliefUm + ' um',
  );
  assert.ok(
    project.section.b[0] - project.section.a[0] <= 10,
    'default section must resolve the device, not exaggerate the entire chip',
  );
  assert.equal(project.section.a[1], -24);
  assert.equal(project.section.b[1], -24);
  assert.equal(validation.representedCellCounts.tcamCells, 5);
});

test('CNTFET paper Methods source-to-drain isolation order', async () => {
  const { project } = await verifiedFixture();
  const steps = project.processRecipe.steps;
  const labels = steps.map((step) => String(step.params.label || step.params.material || ''));
  const index = (label) => labels.findIndex((item) => item.includes(label));
  const stages = [
    'Remove residual PCz',
    'CNT source Ti 1nm',
    'CNT source Pd 45nm',
    'CNT drain Ti 1nm',
    'CNT drain Pd 45nm',
    'O2 plasma-pattern CNT channel',
    'Y2O3 interface SURROGATE 10nm',
  ];
  const positions = stages.map(index);
  assert.deepEqual(
    positions,
    [25, 26, 27, 28, 29, 30, 31],
    'Li et al. Methods requires O2 CNT patterning after Ti/Pd source/drain and before Y oxidation',
  );
  assert.equal(steps[25].command, 'record');
  assert.equal(steps[30].command, 'record');
  assert.equal(steps.length, 50);
  assert.equal(project.snapshotBranches.nodes.length, 51);
  assert.ok(
    project.snapshotBranches.nodes.some(
      (node) =>
        node.operation?.kind === 'record' &&
        node.operation.label.includes('O2 plasma-pattern CNT channel'),
    ),
    'History must record post-contact CNT channel isolation',
  );
});
