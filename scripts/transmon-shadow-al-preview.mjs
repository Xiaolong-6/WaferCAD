import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import { loadGeometryKernel } from './process-benchmarks.mjs';
await loadGeometryKernel();
const { parseGDS, flattenGDS } = await import('../site/gds.js');
const { unionGeometries } = await import('../site/vector-geometry.js');
const { makeShadowAlPreview } = await import('../site/shadow-deposition-preview.js');
const { prepareProjectForExport, expandProjectStorage } = await import('../site/project-io.js');
const { validateProjectFile } = await import('../site/project-schema.js');

const SOURCE_SHA256 = '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const valueArg = (args, name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

function blankResearchProject() {
  return {
    format: 'WaferCAD-vector',
    version: 14,
    name: 'Transmon Q2 Al shadow geometry PREVIEW (no tunnel barrier)',
    model: null,
    layout: null,
    selectedLayerKeys: [],
    activeCell: '',
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    maskSourceMode: 'file',
    drawMask: { nextShapeId: 1, shapes: [] },
    activeFace: 'front',
    roi: null,
    maskRoi: null,
    roiAnchor: 'center',
    maskRoiAnchor: 'center',
    section: { a: [-2, 5], b: [2, 5] },
    planViews: {
      main: { zoom: 1, panX: 0, panY: 0 },
      mask: { zoom: 1, panX: 0, panY: 0 },
    },
    display: {
      xyUnit: 'um',
      structurePalette: 'balanced',
      sectionScaleMode: 'auto',
      sectionShowBorders: true,
      threeShowBorders: true,
      threeOpacity: 1,
      maskOpacity: 0.8,
    },
    snapshots: [],
  };
}

export async function produceAuthorShadowPreview(
  source,
  { barrier = null, transport = 'precomputed' } = {},
) {
  if (sha(source) !== SOURCE_SHA256) throw new Error('Author GDS SHA-256 mismatch.');
  const parsed = parseGDS(
    source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
  );
  const local = flattenGDS(parsed, 'jj_width0p18');
  if (local.elements.length !== 17) throw new Error('Q2 junction GDS polygon count changed.');
  const opening = (datatype) =>
    unionGeometries(
      local.elements
        .filter((e) => e.layer === 8 && e.datatype === datatype)
        .map((e) => [[e.points]]),
    );
  const main = opening(1);
  const bottom = unionGeometries([main, opening(0)]);
  const layers = [
    { bottomUm: 0, topUm: 0.5, opening: bottom },
    { bottomUm: 0.5, topUm: 0.9, opening: main },
  ];
  const beams = [
    {
      thetaDeg: 45,
      azimuthDeg: -45,
      nominalThicknessUm: 0.04,
      label: 'Al first evaporation (40 nm)',
    },
    { thetaDeg: 45, azimuthDeg: 45, nominalThicknessUm: 0.03, label: 'Al second +45° (30 nm)' },
    { thetaDeg: 45, azimuthDeg: -135, nominalThicknessUm: 0.03, label: 'Al second −135° (30 nm)' },
  ];
  const simulated = makeShadowAlPreview({
    layers,
    beams,
    barrier,
    transport,
    substrateWidthUm: 40,
    substrateHeightUm: 30,
    substrateThicknessUm: 675,
    sampleStepUm: 0.0375,
  });
  const project = blankResearchProject();
  project.name = barrier
    ? 'Transmon Q2 AlOx HYPOTHESIS preview (not a validated Josephson junction)'
    : 'Transmon Q2 Al shadow geometry PREVIEW (no tunnel barrier)';
  project.model = simulated.model;
  project.layout = {
    ...local,
    units: parsed.units,
    name: 'Author jj_width0p18 GDS',
    hierarchy: {},
  };
  project.activeCell = 'jj_width0p18';
  project.maskTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
  project.selectedLayerKeys = local.combos.map((c) => c.key);
  project.section = { a: [-2, 5], b: [2, 5] };
  project.roi = null;
  project.maskRoi = null;
  validateProjectFile(project);
  const exported = prepareProjectForExport(project);
  const json = JSON.stringify(exported.stored);
  const parsedProject = JSON.parse(json);
  expandProjectStorage(parsedProject);
  validateProjectFile(parsedProject);
  return {
    project: json,
    report: {
      sourceGdsSha256: sha(source),
      projectSha256: sha(json),
      storageMode: exported.mode,
      sourceCell: 'jj_width0p18',
      modelUnits: 'µm',
      actualModelThicknessUm: 675,
      ...simulated.summary,
      authorDoseMapping: 'PROVISIONAL: 8/1 main, 8/0 additional undercut',
      notSupported: [
        'True sidewall deposition',
        'MMA/PMMA actual relief',
        'Real oxide growth kinetics and verified tunnelling barrier thickness',
        'Argon milling',
        'Real lift-off and material redeposition',
        'Coupled electrothermal response',
      ],
    },
  };
}

if (process.argv[1]?.endsWith('transmon-shadow-al-preview.mjs')) {
  const args = process.argv.slice(2);
  const sourcePath = valueArg(args, '--gds');
  const outPath = valueArg(args, '--output');
  if (!sourcePath || !outPath)
    throw new Error('Usage: --gds sample.gds --output Al-preview.wafercad');
  const source = await readFile(sourcePath);
  const thickness = valueArg(args, '--oxide-thickness-um');
  const sourceNote = valueArg(args, '--oxide-source');
  if (args.includes('--oxide-thickness-um') !== args.includes('--oxide-source'))
    throw new Error('Oxide hypothesis requires both --oxide-thickness-um and --oxide-source.');
  const barrier =
    thickness === null && sourceNote === null
      ? null
      : {
          thicknessUm: Number(thickness),
          provenance: 'hypothesis',
          source: sourceNote || '',
        };
  const transport = args.includes('--native-direct') ? 'native-direct' : 'precomputed';
  const { project, report } = await produceAuthorShadowPreview(source, { barrier, transport });
  await writeFile(outPath, project);
  if (valueArg(args, '--report'))
    await writeFile(valueArg(args, '--report'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
