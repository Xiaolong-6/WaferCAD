import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGeometryKernel } from './process-benchmarks.mjs';
import { parseLayoutFile } from '../site/layout-io.js';
import { createModel, applyOperation } from '../site/model.js';
import {
  intersection,
  pointInMulti,
  rectMulti,
  transformMulti,
  unionGeometries,
} from '../site/vector-geometry.js';
import { serializeProject } from '../site/project-io.js';
import { validateProjectFile } from '../site/project-schema.js';

const EXPECTED_Q2_SOURCE_SHA256 =
  '12e40565bab2f6c0841b5c3d051fcf38cc1e3c9deda5eaa53ab06cd70782f5e5';
const Q2_CENTER = [1400, 2513];
const ROI_SIZE_UM = 1000;
const STARTING_SI_UM = 675;
const NB_FILM_UM = 0.2;
const DRY_ETCH_UM = 0.25;
const sha = (b) => createHash('sha256').update(b).digest('hex');

function regionStackAt(model, point) {
  return model.regions.find((r) => pointInMulti(point, r.geom))?.stack || null;
}
function assertOrThrow(ok, label) {
  if (!ok) throw new Error(label);
}
function assertNear(actual, expected, label, tolerance = 1e-8) {
  assertOrThrow(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    label + ': ' + actual + ' != ' + expected,
  );
}

/** The cropped Q2 GDS coordinates are author-local; translate them to centered model XY. */
export function replayQ2Nb(layout, options = {}) {
  const sizeUm = options.roiSizeUm ?? ROI_SIZE_UM;
  assertOrThrow(
    sizeUm === ROI_SIZE_UM,
    'This reference reconstruction uses the documented 1000 µm window.',
  );
  const sample = layout.elements.filter(
    (e) => e.kind === 'polygon' && e.layer === 2 && e.datatype === 0,
  );
  assertOrThrow(sample.length > 0, 'Author Nb opening layer 2/0 not found.');
  const domain = rectMulti(sizeUm, sizeUm);
  const pieces = sample
    .map((e) => transformMulti([[e.points]], ([x, y]) => [x - Q2_CENTER[0], y - Q2_CENTER[1]]))
    .map((e) => intersection(e, domain))
    .filter((e) => e.length > 0);
  const mask = unionGeometries(pieces);
  assertOrThrow(mask.length > 0, 'No Nb mask geometry intersects the chosen ROI.');

  const model = createModel({
    shape: 'rect',
    width: sizeUm,
    height: sizeUm,
    thickness: STARTING_SI_UM,
  });
  model.layers[0].name = 'Si (100), intrinsic';
  const blanket = applyOperation(model, {
    type: 'add',
    name: 'Nb sputtered (200 nm)',
    color: '#869CB8',
    thickness: NB_FILM_UM,
    face: 'front',
    growth: 'direct',
    area: domain,
  });
  assertOrThrow(blanket.changed, 'Nb deposit rejected: ' + (blanket.error || 'unknown'));
  const etch = applyOperation(model, {
    type: 'etch',
    etchProfile: 'directional',
    thickness: DRY_ETCH_UM,
    face: 'front',
    area: mask,
  });
  assertOrThrow(etch.changed, 'Nb/Si dry etch rejected: ' + (etch.error || 'unknown'));

  // A line across the original Q2 Nb capacitor opening is a deliberate, documented
  // science probe. These points must fall on opposing sides of the real 2/0 mask.
  const opening = [0, 0];
  const covered = [0, 20];
  assertOrThrow(pointInMulti(opening, mask), 'Opening science probe misses author 2/0 mask.');
  assertOrThrow(
    !pointInMulti(covered, mask),
    'Retained Nb science probe falls in author 2/0 mask.',
  );
  const openingStack = regionStackAt(model, opening);
  const coveredStack = regionStackAt(model, covered);
  assertOrThrow(
    openingStack?.length === 1 && openingStack[0].layerId === 'base',
    'Unexpected material in etched opening.',
  );
  assertOrThrow(
    coveredStack?.length === 2 && coveredStack[1].layerId === blanket.layerId,
    'Nb film missing from masked-protected region.',
  );
  const siTop = STARTING_SI_UM / 2;
  assertNear(openingStack[0].z1, siTop - 0.05, 'Silicon recess (50 nm)');
  assertNear(coveredStack[1].z1 - coveredStack[1].z0, 0.2, 'Remaining Nb film (200 nm)');
  assertNear(coveredStack[1].z0, siTop, 'Nb/Si material interface');

  return {
    model,
    mask,
    report: {
      classification:
        'Native WaferCAD Process Kernel geometry; visual and full Workstation acceptance separate',
      sourceGdsLayer: '2/0',
      sourceJunctionLayers: ['8/0', '8/1'],
      sourceQ2CenterUm: Q2_CENTER,
      modelOriginAtSourceXY: Q2_CENTER,
      roiSizeUm: sizeUm,
      sourcePolygons: sample.length,
      clippedNonemptyPolygonParts: pieces.length,
      maskParts: mask.length,
      modelRegions: model.regions.length,
      startingSiThicknessUm: STARTING_SI_UM,
      initialNbThicknessUm: NB_FILM_UM,
      totalDirectionalEtchDepthUm: DRY_ETCH_UM,
      measuredSiRecessUm: 0.05,
      openingSourceXYUm: [Q2_CENTER[0], Q2_CENTER[1]],
      openingTopUm: openingStack[0].z1,
      retainedNbSourceXYUm: [Q2_CENTER[0], Q2_CENTER[1] + 20],
      retainedNbThicknessUm: coveredStack[1].z1 - coveredStack[1].z0,
      junctionShadowEvaporation: 'not simulated',
    },
  };
}

export function makeQ2NbProject(replay, layout) {
  const project = {
    format: 'WaferCAD-vector',
    version: 14,
    name: 'Transmon Q2 · author GDS · Nb deposition and CF4 etch (Nature Communications 2025)',
    model: replay.model,
    layout: { ...layout, hierarchy: {} },
    selectedLayerKeys: layout.combos
      .filter((c) => c.layer === 2 && c.datatype === 0)
      .map((c) => c.key),
    activeCell: layout.root,
    maskTransform: { x: -Q2_CENTER[0], y: -Q2_CENTER[1], scale: 1, rotation: 0 },
    maskSourceMode: 'file',
    drawMask: { nextShapeId: 1, shapes: [] },
    activeFace: 'front',
    roi: null,
    maskRoi: null,
    roiAnchor: 'center',
    maskRoiAnchor: 'center',
    section: { a: [-100, 0], b: [100, 0] },
    planViews: { main: { zoom: 1, panX: 0, panY: 0 }, mask: { zoom: 1, panX: 0, panY: 0 } },
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
  validateProjectFile(project);
  return project;
}

async function main(args) {
  const value = (opt) => {
    const i = args.indexOf(opt);
    return i >= 0 ? args[i + 1] : null;
  };
  const input = value('--input');
  const output = value('--output');
  const reportPath = value('--report');
  if (!input || !output || resolve(input) === resolve(output))
    throw new Error(
      'Usage: --input transmon-Q2-ROI.gds --output transmon-Q2-Nb.wafercad [--report report.json]',
    );
  const bytes = await readFile(input);
  if (sha(bytes) !== EXPECTED_Q2_SOURCE_SHA256) throw new Error('Pinned Q2 GDS SHA-256 mismatch.');
  await loadGeometryKernel();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
  const imported = await parseLayoutFile(buffer, input);
  const replay = replayQ2Nb(imported.layout);
  const project = makeQ2NbProject(replay, imported.layout);
  const text = serializeProject(project);
  await writeFile(output, text);
  const report = {
    ...replay.report,
    sourceGdsSha256: sha(bytes),
    wafercadProjectSha256: sha(Buffer.from(text)),
  };
  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
