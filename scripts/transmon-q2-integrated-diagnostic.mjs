import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { loadGeometryKernel } from './process-benchmarks.mjs';

await loadGeometryKernel();
const { parseGDS, flattenGDS } = await import('../site/gds.js');
const { createModel, applyOperation, geometryArea } = await import('../site/model.js');
const { intersection, unionGeometries, transformMulti, rectMulti, pointInMulti } =
  await import('../site/vector-geometry.js');
const { validateProcessModel, validateProjectFile } = await import('../site/project-schema.js');
const { prepareProjectForExport, expandProjectStorage } = await import('../site/project-io.js');

const EXPECTED = '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02';
const center = [1400, 2513];
const sha = (b) => createHash('sha256').update(b).digest('hex');
const args = process.argv.slice(2);
function arg(flag) {
  const i = args.indexOf(flag);
  return i < 0 ? null : args[i + 1];
}
const points = (e) => [[e.points]];

/**
 * Source-backed integrated geometry diagnostic. It deliberately computes
 * static horizontal shadow footprints; it does NOT claim dynamic 3D Direct
 * material self-shadow, real sidewall coating, oxidation or lift-off.
 */
export function replayQ2ChipPose(source, { oxide = null } = {}) {
  if (sha(source) !== EXPECTED) throw new Error('Author Zenodo GDS SHA-256 mismatch.');
  const parsed = parseGDS(
    source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
  );
  const chip = parsed.cells.get('chip2');
  const placed = chip?.elements.find((e) =>
    e.kind === 'sref' &&
    e.name === 'jj_width0p18' &&
    e.xy?.[0] === center[0] &&
    e.xy?.[1] === center[1],
  );
  if (!placed || placed.angle !== 90 || placed.reflect)
    throw new Error('Q2 author chip2 placement must have the source GDS 90° rotation.');
  const junction = flattenGDS(parsed, 'jj_width0p18');
  if (junction.elements.length !== 17) throw new Error('Unexpected source junction polygons.');
  const chipFlat = flattenGDS(parsed, 'chip2');
  const domain = rectMulti(40, 30);
  const nbMask = unionGeometries(
    chipFlat.elements
      .filter((e) => e.kind === 'polygon' && e.layer === 2 && e.datatype === 0)
      .map((e) =>
        intersection(
          transformMulti(points(e), ([x, y]) => [x - center[0], y - center[1]]),
          domain,
        ),
      )
      .filter((g) => g.length),
  );
  if (!nbMask.length || !pointInMulti([0, 0], nbMask))
    throw new Error('Q2 center is not on the etched Si opening.');

  const model = createModel({ shape: 'rect', width: 40, height: 30, thickness: 675 });
  model.layers[0].name = 'Si (100)';
  const add = (name, thickness, area, type = 'add') => {
    const outcome = applyOperation(model, {
      type,
      name,
      growth: 'direct',
      ...(type === 'etch' ? { etchProfile: 'directional' } : {}),
      thickness,
      area,
      face: 'front',
    });
    if (!outcome.changed) throw new Error(name + ': ' + (outcome.error ?? 'unchanged'));
    return outcome;
  };
  add('Nb blanket 200 nm', 0.2, domain);
  add('Nb/Si directional etch 250 nm', 0.25, nbMask, 'etch');
  const si = model.regions.find((r) => pointInMulti([0, 0], r.geom))?.stack.at(-1);
  if (si?.layerId !== 'base' || Math.abs(si.z1 - 337.45) > 1e-8)
    throw new Error('Q2 etched Si must be 50 nm below unprocessed Si.');
  const siTopZ = si.z1;

  const rotateCell = (geometry) => transformMulti(geometry, ([x, y]) => [-y, x]);
  const layerMask = (datatype) =>
    unionGeometries(
      junction.elements
        .filter((e) => e.layer === 8 && e.datatype === datatype)
        .map((e) => rotateCell(points(e))),
    );
  const upper = layerMask(1);
  const lower = unionGeometries([upper, layerMask(0)]);
  const apertures = [
    { bottom: siTopZ, top: siTopZ + 0.5, opening: lower },
    { bottom: siTopZ + 0.5, top: siTopZ + 0.9, opening: upper },
  ];
  const beams = [
    { azimuth: -45, thickness: 0.04 },
    { azimuth: 45, thickness: 0.03 },
    { azimuth: -135, thickness: 0.03 },
  ];
  const footprints = [];
  const operations = [];
  for (const [index, beam] of beams.entries()) {
    const theta = Math.PI / 4;
    const az = (beam.azimuth * Math.PI) / 180;
    const vx = Math.tan(theta) * Math.cos(az);
    const vy = Math.tan(theta) * Math.sin(az);
    let visible = domain;
    for (const resist of apertures) {
      const n = Math.ceil((resist.top - resist.bottom) / 0.0375);
      for (let i = 0; i <= n; i++) {
        const z = resist.bottom + ((resist.top - resist.bottom) * i) / n;
        const translated = transformMulti(resist.opening, ([x, y]) => [
          x - (z - siTopZ) * vx,
          y - (z - siTopZ) * vy,
        ]);
        visible = intersection(visible, translated);
        if (!visible.length) break;
      }
      if (!visible.length) break;
    }
    // Purposeful diagnostic restriction: Al lands on the etched Si mask only.
    // This is not the branch's dynamic native Direct shadow solver.
    const footprint = intersection(visible, nbMask);
    if (!footprint.length) throw new Error('No Al exposure in the author Q2 etched area.');
    footprints.push(footprint);
    const outcome = add('Al ' + (index + 1) + ' (static shadow)', beam.thickness, footprint);
    operations.push({
      index,
      polarTiltDeg: 45,
      waferFrameAzimuthDeg: beam.azimuth,
      thicknessUm: beam.thickness,
      footprintAreaUm2: geometryArea(footprint),
      layerId: outcome.layerId,
    });
    if (index === 0 && oxide) {
      if (
        !(Number.isFinite(oxide.thicknessUm) && oxide.thicknessUm > 0) ||
        !oxide.source?.trim()
      )
        throw new Error('Hypothetical AlOx requires explicit thickness and source.');
      add('AlOx hypothesis: ' + oxide.source, oxide.thicknessUm, footprint);
    }
  }
  validateProcessModel(model);
  const overlap = intersection(footprints[0], footprints[1]);
  const ring = overlap[0]?.[0] || [];
  if (!ring.length) throw new Error('Author Q2 first two deposited layers do not overlap.');
  const cross = [
    ring.reduce((v, p) => v + p[0], 0) / ring.length,
    ring.reduce((v, p) => v + p[1], 0) / ring.length,
  ];
  const layoutElements = junction.elements.map((e) => ({
    ...e,
    points: e.points?.map(([x, y]) => [-y, x]),
  }));
  const all = layoutElements.flatMap((e) => e.points || []);
  const xs = all.map(([x]) => x),
    ys = all.map(([, y]) => y);
  const project = {
    format: 'WaferCAD-vector',
    version: 14,
    name: 'Transmon Q2 integrated STATIC shadow diagnostic (not a verified Josephson junction)',
    model,
    layout: {
      ...junction,
      elements: layoutElements,
      hierarchy: {},
      units: parsed.units,
      name: 'Author jj_width0p18 in actual chip2 90° placement',
      bounds: {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      },
    },
    selectedLayerKeys: junction.combos.map((c) => c.key),
    activeCell: 'jj_width0p18',
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    maskSourceMode: 'file',
    drawMask: { nextShapeId: 1, shapes: [] },
    activeFace: 'front',
    roi: null,
    maskRoi: null,
    roiAnchor: 'center',
    maskRoiAnchor: 'center',
    section: { a: [cross[0] - 0.5, cross[1]], b: [cross[0] + 0.5, cross[1]] },
    planViews: {
      main: { zoom: 1, panX: 0, panY: 0 },
      mask: { zoom: 1, panX: 0, panY: 0 },
    },
    display: {
      xyUnit: 'um', structurePalette: 'balanced',
      sectionScaleMode: 'auto', sectionShowBorders: true,
      threeShowBorders: true, threeOpacity: 1, maskOpacity: 0.8,
    },
    snapshots: [],
  };
  validateProjectFile(project);
  const exportResult = prepareProjectForExport(project);
  const json = JSON.stringify(exportResult.stored);
  const restored = JSON.parse(json);
  expandProjectStorage(restored);
  validateProjectFile(restored);
  return {
    project: json,
    report: {
      sourceSha256: sha(source),
      physicalPlacement: { cell: 'chip2 / jj_width0p18', xUm: 1400, yUm: 2513, rotationDeg: 90 },
      etchedSiTopZUm: siTopZ,
      resistAssumption: '0.5 um MMA + 0.4 um PMMA relative to etched silicon',
      waferFrameAzimuthAssumption: 'not independently established by the paper',
      q2NbOpeningAreaIn40x30RoiUm2: geometryArea(nbMask),
      operations,
      firstTwoAlOverlapAreaUm2: geometryArea(overlap),
      crossSectionCenterUm: cross,
      modelRegions: model.regions.length,
      modelLayers: model.layers.length,
      processRevisions: model.processRevision,
      oxideHypothesis: oxide,
      strictProjectRoundTrip: true,
      method: 'STATIC horizontal shadow footprint; not dynamic Direct deposition or lift-off',
      tunnelJunctionValidated: false,
    },
  };
}

if (process.argv[1]?.endsWith('transmon-q2-integrated-diagnostic.mjs')) {
  const input = arg('--gds');
  const output = arg('--output');
  if (!input || !output)
    throw new Error('Usage: --gds sample.gds --output candidate.wafercad [--report evidence.json]');
  const source = await readFile(input);
  const t = arg('--oxide-thickness-um'),
    evidence = arg('--oxide-source');
  if ((t === null) !== (evidence === null))
    throw new Error('AlOx hypothesis requires both thickness and provenance.');
  const oxide = t === null ? null : { thicknessUm: Number(t), source: evidence };
  const { project, report } = replayQ2ChipPose(source, { oxide });
  await writeFile(output, project);
  if (arg('--report')) await writeFile(arg('--report'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
