import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTcmosInverter,
  FIELD_UM,
  GATE_LENGTH_UM,
  TCMOS_DOI,
  TCMOS_MASKS,
  TCMOS_METAL_NETS,
  auditTcmosTerminalNetProvenance,
  tcmosLayout,
  tcmosProcessShapes,
} from '../../scripts/build-tcmos-inverter-example.mjs';
import { readTcmosReferenceMask } from '../../scripts/tcmos-svg-mask.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const v = await import('../vector-geometry.js');

test('Approved vector Mask imports four integral METAL1 paths and 218 exact CNT sites', () => {
  const groups = readTcmosReferenceMask();
  const metal = groups.find(({ name }) => name === 'METAL1');
  const active = groups.find(({ name }) => name === 'ACTIVE');
  const contacts = groups.find(({ name }) => name === 'CNT');
  assert.equal(metal.shapes.length, 4);
  assert.deepEqual(
    metal.shapes.map(({ points }) => points.length),
    [8, 12, 16, 16],
  );
  assert.equal(active.shapes.length, 4);
  assert.equal(contacts.shapes.length, 218);
  assert.deepEqual(metal.shapes[2].points[0], [-6.7625, 2.0875]);
  assert.deepEqual(metal.shapes[3].points[0], [3.98125, 2.0875]);
});

test('TCMOS Fig1b mask traces POLY ink without inferring foundry gate length', () => {
  const layout = tcmosLayout();
  assert.equal(layout.maskPresentation.version, 1);
  assert.equal(layout.maskPresentation.showUnselected, false);
  assert.deepEqual(
    layout.maskPresentation.layers.map((layer) => layer.layer),
    [1, 11, 6, 10, 12, 13, 4, 5],
  );
  assert.deepEqual(FIELD_UM, [14, 8]);
  assert.equal(GATE_LENGTH_UM, 0.48125);
  assert.equal(layout.root, 'TCMOS_130NM_LOCAL');
  assert.equal(layout.units.hasPhysicalUnits, true);
  assert.equal(layout.combos.length, 8, 'SVG alone owns all exported Mask layers');
  const vectorLayers = readTcmosReferenceMask();
  assert.equal(layout.elements.length, 232);
  assert.deepEqual(
    layout.combos.map(({ layer }) => layer),
    vectorLayers.map(({ layer }) => layer),
  );
  assert.deepEqual(
    [...new Set(layout.elements.map(({ layer }) => layer))].sort((a, b) => a - b),
    [1, 4, 5, 6, 10, 11, 12, 13],
    'no legacy process-only mask layers may leak into File Mask',
  );
  for (const group of vectorLayers) {
    assert.deepEqual(
      layout.elements.filter(({ layer }) => layer === group.layer).map(({ points }) => points),
      group.shapes.map(({ points }) => points),
      group.name + ' must preserve the exact SVG polygon coordinates',
    );
  }
  const gates = TCMOS_MASKS.find((m) => m.id === 6).rectangles;
  // Legacy pixel-rectangle metadata is retained only for negative-path
  // provenance tests; it no longer controls the SVG-derived process geometry.
  assert.equal(gates[0].w, 0.44);
  assert.equal(gates[1].w, 0.44);
  const sourcePoly = layout.elements.filter((element) => element.layer === 6);
  for (const gate of sourcePoly) {
    // Compare at the 0.001 nm source-coordinate grid rather than demand
    // bitwise equality from IEEE-754 subtraction of transformed SVG points.
    assert.equal(
      Math.round((gate.points[1][0] - gate.points[0][0]) * 1e6),
      Math.round(GATE_LENGTH_UM * 1e6),
    );
  }
  assert.equal(gates[0].h, gates[1].h);
  assert.equal(gates.length, 2, 'Fig.1b has two separate POLY gates connected at METAL1');
  assert.equal(TCMOS_MASKS.find((m) => m.id === 1).rectangles.length, 8);
  assert.equal(TCMOS_MASKS.find((m) => m.id === 10).rectangles.length, 218);
  assert.equal(TCMOS_MASKS.find((m) => m.id === 12).rectangles.length, 1);
  assert.equal(TCMOS_MASKS.find((m) => m.id === 13).rectangles.length, 1);
  assert.equal(TCMOS_DOI, '10.1038/s41928-019-0272-8');
});

test('Fig.1b schematic masks retain nested inverted-U upper nets and dense body-tie rows', () => {
  const byId = (id) => TCMOS_MASKS.find((mask) => mask.id === id).rectangles;
  const [p, n] = byId(1);
  assert.deepEqual(p, { x: -4.11, y: -0.61, w: 2.26, h: 0.78 });
  assert.deepEqual(n, { x: 1.87, y: -0.61, w: 2.26, h: 0.78 });
  const [pHvt] = byId(4);
  const [nHvt] = byId(5);
  assert.equal(pHvt.x + pHvt.w / 2, -2.955);
  assert.equal(nHvt.x + nHvt.w / 2, 3.01);
  assert.ok(pHvt.y + pHvt.h > 0.7, 'HVTN encloses left POLY top');
  assert.ok(nHvt.y + nHvt.h > 0.7, 'HVTP encloses right POLY top');
  const byNet = (name) => TCMOS_METAL_NETS.find((net) => net.name === name).rectangles;
  const vinCap = byNet('VIN')[0];
  const voutCap = byNet('VOUT')[0];
  assert.ok(vinCap.y > voutCap.y + voutCap.h, 'VIN top bridge above VOUT U');
  assert.ok(voutCap.w > 4.4, 'VOUT shares both drain contacts across cells');
  assert.equal(byNet('VDD').length, 7);
  assert.equal(byNet('GND').length, 7);
  assert.ok(byNet('VDD').at(-2).y < p.y, 'pMOS body U is below ACTIVE');
  assert.ok(byNet('GND').at(-2).y < n.y, 'nMOS body U is below ACTIVE');
  const cnt = byId(10);
  assert.equal(cnt.length, 218);
  const bodyU = cnt.slice(44, 131);
  assert.equal(bodyU.length, 87);
  assert.equal(
    new Set(bodyU.slice(0, 57).map((contact) => contact.y)).size,
    3,
    'Fig.1b body U contacts have three bottom rows',
  );
  for (const contact of cnt) {
    assert.ok(contact.w > 0 && contact.h > 0);
  }
  // A negative test for a disconnected terminal remains required.
  const disconnected = structuredClone(TCMOS_METAL_NETS);
  disconnected[3].rectangles.shift();
  assert.throws(
    () => auditTcmosTerminalNetProvenance(TCMOS_MASKS, disconnected),
    /disconnected routing/,
  );
});

test('T-CMOS inferred terminal nets reject shorts, breaks, swapped rails and bad body ties', () => {
  const evidence = auditTcmosTerminalNetProvenance(TCMOS_MASKS, TCMOS_METAL_NETS);
  assert.equal(evidence.kind, 'illustrative-layout-terminal-net-provenance');
  assert.equal(evidence.sourceDocumentedFoundryRouting, false);
  assert.equal(evidence.physicalElectricalConnectivityVerified, false);
  assert.equal(evidence.ohmicContactsValidated, false);
  assert.equal(evidence.physicalJunctionResolved, false);
  assert.equal(evidence.supplyBodyContinuityShownInSource, false);
  assert.deepEqual(evidence.schematicMetalIslands, { VDD: 2, VOUT: 1, GND: 2, VIN: 1 });
  // Source image contains a white gap at both lower outer rails.
  const [vdd, , gnd] = TCMOS_METAL_NETS;
  assert.ok(vdd.rectangles[4].x > vdd.rectangles[1].x + vdd.rectangles[1].w + 0.4);
  assert.ok(gnd.rectangles[1].x > gnd.rectangles[6].x + gnd.rectangles[6].w + 0.4);
  const fabricated = structuredClone(TCMOS_METAL_NETS);
  fabricated[0].rectangles.splice(4, 0, { x: -5.63, y: -1.83, w: 0.44, h: 0.72 });
  assert.throws(
    () => auditTcmosTerminalNetProvenance(TCMOS_MASKS, fabricated),
    /unexpected extra metal routing/,
  );
  assert.deepEqual(
    evidence.terminals.map(({ id, net }) => [id, net]),
    [
      ['pMOS-source', 'VDD'],
      ['pMOS-drain', 'VOUT'],
      ['nMOS-drain', 'VOUT'],
      ['nMOS-source', 'GND'],
      ['pMOS-gate', 'VIN'],
      ['nMOS-gate', 'VIN'],
      ['pMOS-well-tie', 'VDD'],
      ['nMOS-well-tie', 'GND'],
    ],
  );
  assert.ok(
    evidence.terminals.every(
      ({ provenance }) => provenance === 'inferred-from-reconstructed-CNT/METAL1-layout',
    ),
  );
  const swapped = structuredClone(TCMOS_METAL_NETS);
  swapped[0].name = 'GND';
  swapped[2].name = 'VDD';
  assert.throws(
    () => auditTcmosTerminalNetProvenance(TCMOS_MASKS, swapped),
    /wrong net/,
    'Source rail swaps cannot be silently accepted',
  );
  const disconnected = structuredClone(TCMOS_METAL_NETS);
  disconnected[3].rectangles.shift();
  assert.throws(
    () => auditTcmosTerminalNetProvenance(TCMOS_MASKS, disconnected),
    /disconnected routing/,
  );
  const shorted = structuredClone(TCMOS_METAL_NETS);
  shorted[1].rectangles[0].w = 7;
  assert.throws(() => auditTcmosTerminalNetProvenance(TCMOS_MASKS, shorted), /Metal1 short/);
  const shiftedContact = structuredClone(TCMOS_MASKS);
  shiftedContact.find(({ id }) => id === 10).rectangles[0].x += 1;
  assert.throws(
    () => auditTcmosTerminalNetProvenance(shiftedContact, TCMOS_METAL_NETS),
    /incorrect device footprint/,
  );
  const invalidWellTie = structuredClone(TCMOS_MASKS);
  invalidWellTie.find(({ id }) => id === 10).rectangles[47].y += 2;
  assert.throws(
    () => auditTcmosTerminalNetProvenance(invalidWellTie, TCMOS_METAL_NETS),
    /incorrect device footprint/,
  );
});

test('TCMOS full geometric reconstruction preserves STI, annotated CMOS and exportable History', async () => {
  const { project, validation } = await buildTcmosInverter();
  const model = project.model;
  assert.equal(validation.pass, true);
  assert.equal(validation.measuredGateLengthSourceReported, false);
  assert.equal(validation.terminalNetProvenance.terminals.length, 8);
  assert.equal(validation.terminalNetProvenance.physicalElectricalConnectivityVerified, false);
  assert.deepEqual(validation.availableVariants, ['main', 'conventional-cmos']);
  assert.equal(project.layout.elements.length > 0, true);
  assert.equal(project.processRecipe.steps.length, validation.recipeSteps);
  assert.equal(project.snapshotBranches.nodes.length, validation.processNodes);
  assert.equal(project.snapshots.length, 8);
  assert.equal(project.snapshotBranches.branches.length, 2);
  const conventional = project.snapshotBranches.branches.find(
    (item) => item.id === 'conventional-cmos',
  );
  assert.ok(conventional, 'Conventional CMOS must coexist in the same project');
  assert.equal(conventional.parentBranchId, 'main');
  const fork = project.snapshotBranches.nodes.find((item) => item.id === conventional.rootNodeId);
  assert.equal(fork?.operation.label, 'Well formation/drive in');
  const comparisonImplants = conventional.headState.model.implants.slice(0, 2);
  assert.match(comparisonImplants[0].name, /LVTN As\+/);
  assert.match(comparisonImplants[1].name, /LVTP BF2\+/);
  assert.equal(comparisonImplants[0].depthStart, undefined);
  assert.equal(conventional.headState.processRecipe.steps.length, 23);
  assert.equal(
    conventional.headState.model.dopantRegions.some((region) => region.role === 'body'),
    false,
    'The conventional LVT Variant must not retain the buried HVT body intent',
  );
  assert.equal(model.implants.length, 6);
  assert.ok(
    model.dopantRegions.length >= 6,
    'Each process Implant defines a separate qualitative region',
  );
  for (const implant of model.implants) {
    assert.ok(
      model.dopantRegions.some((region) => region.sourceImplantId === implant.id),
      'Each labelled Implant must map to a separate dopant-region intent',
    );
  }
  assert.equal(
    model.dopantRegions.every((region) => region.profile.kind === 'qualitative-interval'),
    true,
  );
  const {
    findDopantPolarityOverlaps,
    findTerminalQualifiedDopantOverlaps,
    auditSchematicWellBodyCoverage,
  } = await import('../dopant-regions.js');
  const { geometryArea } = await import('../model.js');
  const qualitativeOverlaps = findDopantPolarityOverlaps(model, v);
  assert.ok(
    qualitativeOverlaps.some((overlap) => v.pointInMulti([-2.5, -1.2], overlap.geom)),
    'pMOS body and drain doping masks must qualitatively overlap',
  );
  assert.ok(
    qualitativeOverlaps.some((overlap) => v.pointInMulti([2.5, -1.2], overlap.geom)),
    'nMOS body and drain doping masks must qualitatively overlap',
  );
  // The input source/drain masks are shared. Identifying the VOUT-side drain
  // requires the reconstructed transistor gate and METAL1 contact routing.
  const terminalRects = (id) =>
    tcmosProcessShapes(id).map(({ a, b }) => ({
      x: a[0],
      y: a[1],
      w: b[0] - a[0],
      h: b[1] - a[1],
    }));
  const pm = terminalRects(7);
  const nm = terminalRects(8);
  const terminals = [
    { id: 'pMOS-source', kind: 'source', rect: pm[0] },
    { id: 'pMOS-drain', kind: 'drain', rect: pm[1] },
    { id: 'nMOS-drain', kind: 'drain', rect: nm[0] },
    { id: 'nMOS-source', kind: 'source', rect: nm[1] },
  ].map(({ rect: r, ...terminal }) => ({
    ...terminal,
    geom: v.rectMulti(r.w, r.h, r.x + r.w / 2, r.y + r.h / 2),
  }));
  const qualified = findTerminalQualifiedDopantOverlaps(model, terminals, v);
  for (const terminal of terminals) {
    const overlaps = qualified.filter((overlap) => overlap.terminalId === terminal.id);
    assert.ok(overlaps.length, `${terminal.id} must intersect opposite-polarity body/HDD intents`);
    const union = v.unionGeometries(overlaps.map((overlap) => overlap.geom));
    const expectedArea = geometryArea(terminal.geom);
    assert.ok(
      Math.abs(geometryArea(union) - expectedArea) < 1e-6,
      `${terminal.id} remains an inferred co-occupancy volume, not a PN junction`,
    );
    for (const overlap of overlaps) {
      assert.ok(Math.abs(overlap.z0 - 0.82) < 1e-9);
      assert.ok(Math.abs(overlap.z1 - 0.92) < 1e-9);
    }
    const reportedArea = validation.qualitativeJunctionEvidence.overlapAreaUm2[terminal.id];
    assert.ok(
      Math.abs(reportedArea - geometryArea(union)) < 1e-12,
      'Validation must report the actual terminal-clipped qualitative overlap',
    );
  }
  assert.equal(
    model.dopantRegions.some((region) => region.role === 'well'),
    false,
    'Schematic electrical n-/p-well regions do not constitute calibrated well doping',
  );
  assert.equal(validation.qualitativeJunctionEvidence.physicalJunctionResolved, false);
  assert.equal(validation.qualitativeJunctionEvidence.btbtCurrentComputed, false);
  const wellCoverage = auditSchematicWellBodyCoverage(model, v, geometryArea);
  assert.equal(wellCoverage.length, 4, 'Well audit must inspect all HVT body intent fragments');
  for (const polarity of ['donor', 'acceptor']) {
    const audit = wellCoverage.filter((item) => item.polarity === polarity);
    assert.equal(audit.length, 2);
    assert.ok(audit.every((item) => item.hasMatchingSchematicWell));
    const matching = audit.reduce((sum, item) => sum + item.matchingWellVolumeUm3, 0);
    const outside = audit.reduce((sum, item) => sum + item.outsideMatchingWellVolumeUm3, 0);
    const opposite = audit.reduce((sum, item) => sum + item.oppositeWellVolumeUm3, 0);
    assert.ok(Math.abs(matching - 0.2914) < 1e-9);
    assert.ok(Math.abs(outside - 0.03144095) < 1e-9);
    assert.ok(Math.abs(opposite) < 1e-12);
    const reported = validation.qualitativeJunctionEvidence.schematicWellBodyCoverage[polarity];
    assert.equal(reported.schematicWellPresent, true);
    assert.ok(Math.abs(reported.matchingWellVolumeUm3 - matching) < 1e-12);
    assert.ok(Math.abs(reported.outsideMatchingWellVolumeUm3 - outside) < 1e-12);
  }
  assert.equal(validation.qualitativeJunctionEvidence.oxideStoppingPowerKnown, false);
  const bodyTies = validation.bodyTieContactEvidence.contacts;
  assert.equal(bodyTies.length, 2);
  for (const [index, contact] of bodyTies.entries()) {
    assert.equal(contact.net, index === 0 ? 'VDD' : 'GND');
    assert.equal(contact.schematicWellPresent, true);
    assert.equal(contact.matchingContactDopantIds.length, 0);
    assert.equal(contact.oppositeContactDopantIds.length, 0);
    assert.equal(contact.ohmicContactValidated, false);
  }
  assert.match(model.implants[0].name, /HVTN As\+ pMOS/);
  assert.match(model.implants[1].name, /HVTP BF2\+ nMOS/);
  for (const body of model.implants.slice(0, 2)) {
    assert.equal(body.depthStart, 0.08, 'HVT marker must leave the top 80nm unannotated');
    assert.equal(body.thickness, 0.24, 'HVT marker ends 240nm from the original surface');
  }
  const { implantSectionBands } = await import('../model-view-geometry.js');
  const bodyIds = new Set(model.implants.slice(0, 2).map((item) => item.id));
  const bodyBands = implantSectionBands(model, [-5.5, -1.2], [5.5, -1.2]).filter((b) =>
    bodyIds.has(b.implantId),
  );
  assert.ok(bodyBands.length >= 2, 'Both HVT buried regions intersect A-B');
  // Fig.1b HVT windows intentionally enclose and slightly overshoot ACTIVE.
  // Only semiconductor-hosted bands have the original silicon source Z=1;
  // over-STI display annotations are not a measured dopant profile.
  const activeBars = tcmosProcessShapes(1)
    .slice(2, 4)
    .map(({ points }) => {
      const xs = points.map(([x]) => x);
      return { x: Math.min(...xs), w: Math.max(...xs) - Math.min(...xs) };
    });
  const onActive = bodyBands.filter((band) => {
    const midX = -5.5 + ((band.t0 + band.t1) / 2) * 11;
    return activeBars.some((r) => midX > r.x && midX < r.x + r.w);
  });
  assert.ok(onActive.length >= 2, 'Both HVT body markers intersect active Si');
  for (const band of onActive) {
    assert.ok(Math.abs(band.outerZ - 0.92) < 1e-8, 'Si buried zone cannot touch the surface');
    assert.ok(Math.abs(band.innerZ - 0.76) < 1e-8, 'Si buried interval ends at the recorded depth');
  }
  assert.equal(
    project.processRecipe.steps.filter(
      (step) => step.command === 'implant' && step.params.startDepthUm === 0.08,
    ).length,
    2,
  );
  assert.equal(model.electricalRegions.length, 2);
  assert.ok(model.layers.some((l) => l.name === 'STI SiO2 fill'));
  assert.ok(model.layers.some((l) => l.name === 'POLY gate'));
  assert.ok(model.layers.some((l) => l.name === 'W contacts'));
  assert.ok(model.layers.some((l) => l.name === 'METAL1 Al'));
  const ild = model.layers.find((l) => l.name === 'Interlayer SiO2');
  assert.ok(ild, 'Physical ILD remains present in the process geometry');
  assert.equal(ild.visible, true, 'Interlayer oxide supports Metal1 in the default 3D view');
  assert.equal(project.display.threeOpacity, 0.55);
  assert.deepEqual(project.display.threeCamera, {
    position: [13.3, -14.3, 10.2],
    target: [0, -1.2, 0.95],
    fov: 34,
  });
  assert.equal(project.snapshotBranches.branches[0].headState.name, project.name);
  assert.equal(project.snapshotBranches.branches[0].headState.section.a[0], project.section.a[0]);
  assert.equal(project.snapshots[0].state.name, project.name);
  assert.equal(
    project.snapshotBranches.branches.find((b) => b.id === 'conventional-cmos').headState.name,
    'Conventional CMOS 130nm · LVT channel reference (illustrative)',
  );
  const head = project.snapshotBranches.nodes.find(
    (node) => node.id === project.snapshotBranches.branches[0].headNodeId,
  );
  assert.equal(head.state.model.layers.find((l) => l.id === ild.id)?.visible, true);
  assert.equal(
    project.snapshotBranches.branches[0].headState.model.layers.find((l) => l.id === ild.id)
      ?.visible,
    true,
  );
  assert.equal(
    project.snapshots[0].state.model.layers.find((l) => l.id === ild.id)?.visible,
    true,
  );
  assert.ok(
    project.snapshotBranches.nodes
      .slice(0, -1)
      .some((node) => node.state.model.layers.some((l) => l.id === ild.id && l.visible !== false)),
    'Earlier process History must retain visible ILD',
  );
  const at = (x, y) =>
    model.regions.find((r) => v.pointInMulti([x, y], r.geom))?.stack?.at(-1)?.layerId;
  assert.ok(at(-4, -1.2));
  assert.ok(at(0, 0));
  const gateOxide = model.layers.find((layer) => layer.name === 'Gate SiO2 (5nm surrogate)');
  assert.ok(gateOxide);
  const materialAt = (x, y, layerId) =>
    model.regions
      .find((region) => v.pointInMulti([x, y], region.geom))
      ?.stack.some((segment) => segment.layerId === layerId);
  assert.equal(
    materialAt(-3.2, -1.2, gateOxide.id),
    true,
    'Gate dielectric sits beneath pMOS POLY',
  );
  assert.equal(materialAt(3.2, -1.2, gateOxide.id), true, 'Gate dielectric sits beneath nMOS POLY');
  assert.equal(materialAt(0, 3, gateOxide.id), false, 'No blanket dielectric outside ACTIVE');
  assert.equal(materialAt(-4, -1.2, gateOxide.id), false, 'Source remains exposed silicon');
  const branch = project.snapshotBranches.branches[0];
  assert.equal(branch.headNodeId, project.snapshotBranches.cursorNodeId);
  assert.equal(project.processRecipe.base.thickness, 2);
  assert.ok(
    project.processRecipe.steps.some((s) => s.command === 'etch' && s.params.area === 'invert'),
  );
  assert.equal(project.processRecipe.steps.filter((s) => s.command === 'implant').length, 6);
  assert.equal(project.processRecipe.steps.at(-1).command, 'deposit');
  const metals = tcmosProcessShapes(11).map(({ points }) => [[points.concat([points[0]])]]);
  const contains = (metal, x, y) => v.pointInMulti([x, y], metal);
  const nets = [
    { name: 'VDD', point: [-4.0265, -1.2625] },
    { name: 'VOUT p-drain', point: [-2.4019, -1.265] },
    { name: 'VOUT n-drain', point: [2.4019, -1.265] },
    { name: 'GND', point: [4.0265, -1.2625] },
    { name: 'VIN pMOS gate', point: [-3.3291, -0.42] },
    { name: 'VIN nMOS gate', point: [3.3291, -0.42] },
    { name: 'VDD pMOS body tie', point: [-5.48, -1.14] },
    { name: 'GND nMOS body tie', point: [5.48, -1.14] },
  ];
  for (const {
    name,
    point: [x, y],
  } of nets) {
    assert.ok(
      metals.some((r) => contains(r, x, y)),
      name + ' must overlap Metal1',
    );
    const region = model.regions.find((r) => v.pointInMulti([x, y], r.geom));
    const present = new Set(
      region?.stack.map(
        (segment) => model.layers.find((layer) => layer.id === segment.layerId)?.name,
      ),
    );
    assert.ok(present.has('W contacts'), name + ' must have a W contact');
    assert.ok(present.has('METAL1 Al'), name + ' must touch real Metal1');
    if (name.includes('VIN'))
      assert.ok(present.has('POLY gate'), 'VIN gate contact must sit on POLY');
    const slab = (material) =>
      region?.stack.find(
        (segment) => model.layers.find((layer) => layer.id === segment.layerId)?.name === material,
      );
    const tungsten = slab('W contacts');
    const metal = slab('METAL1 Al');
    assert.ok(
      tungsten && metal && metal.z0 <= tungsten.z1 + 1e-9 && tungsten.z0 <= metal.z1 + 1e-9,
      name + ' must have a genuine W/Metal1 vertical interface',
    );
    const bottom = name.includes('VIN')
      ? slab('POLY gate')
      : name.includes('body tie')
        ? slab('Si (100) substrate; 2 µm display thickness')
        : slab('S/D silicide surrogate');
    assert.ok(
      bottom && Math.abs(bottom.z1 - tungsten.z0) <= 1e-9,
      name + ' must have a real lower-contact interface rather than floating W',
    );
  }
  assert.equal(TCMOS_METAL_NETS.length, 4, 'four independently routed Metal1 nets');
  assert.equal(metals.length, 4, 'the source SVG has four complete Metal1 paths');
  for (let i = 0; i < metals.length; i++) {
    for (let j = i + 1; j < metals.length; j++) {
      assert.ok(
        geometryArea(v.intersection(metals[i], metals[j])) < 1e-12,
        `SVG Metal1 short between paths ${i} and ${j}`,
      );
    }
  }
  assert.equal(
    model.implants.every((implant) => implant.tilt === 0),
    true,
    'Source does not report a nonzero beam incidence angle; no fabricated tilt allowed',
  );
  assert.ok(
    validation.keyAssumptions.some((a) => /not calibrated concentration/i.test(a)),
    'Source-vs-model disclosure must not be lost',
  );
});

test('assumed 0° HVT baseline and explicitly non-paper 18° tilt diagnostic remain isolated', async () => {
  const paper = await buildTcmosInverter();
  const demo = await buildTcmosInverter({ illustrativeTiltDeg: 18 });
  assert.deepEqual(
    paper.project.model.implants.map((item) => item.tilt),
    [0, 0, 0, 0, 0, 0],
  );
  assert.deepEqual(
    demo.project.model.implants.map((item) => item.tilt),
    [18, 18, 0, 0, 0, 0],
  );
  assert.deepEqual(
    demo.project.model.regions,
    paper.project.model.regions,
    'Changing display-only Implant angle must not affect simulated solid materials',
  );
  assert.equal(paper.validation.tiltSourceReported, false);
  assert.equal(demo.validation.tiltSourceReported, false);
  assert.equal(demo.validation.tiltDegrees, 18);
  assert.match(demo.project.name, /NOT REPORTED IN PAPER/);
  assert.deepEqual(demo.project.section, { a: [-4.45, -1.2], b: [-2.95, -1.2] });
  assert.equal(
    demo.project.processRecipe.steps.filter(
      (step) => step.command === 'implant' && step.params.tilt === 18,
    ).length,
    2,
  );
  const lateralWithinBuriedBand = Math.tan((18 * Math.PI) / 180) * (0.24 - 0.08);
  assert.ok(lateralWithinBuriedBand > 0.05 && lateralWithinBuriedBand < 0.055);
});
