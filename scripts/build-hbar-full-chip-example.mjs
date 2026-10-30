/**
 * Full 5 x 5 mm Chip2 reconstruction from the unmodified author GDS.
 * Retains every original layer, datatype and polygon in the Mask.
 * Physical roles of layers 8/9/11 remain hypotheses, not author metadata.
 * Usage: node scripts/build-hbar-full-chip-example.mjs --source original.gds --output full.wafercad
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_SHA256 } from './build-hbar-transducer-example.mjs';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';

const CHIP = 5000;
const ORIGINAL_COUNT = 9646;
const LAYERS = [8, 9, 11];
const thickness = { silicon: 525, lowerOxide: 2.8, nitride: 0.85, oxide: 5.9 };

function close(element) {
  const points = element.points;
  const first = points[0];
  const last = points.at(-1);
  return [[first[0] === last[0] && first[1] === last[1] ? points : [...points, first]]];
}

export async function buildFullHbarChip(sourceBytes) {
  const digest = createHash('sha256').update(sourceBytes).digest('hex');
  assert.equal(digest, SOURCE_SHA256, 'Unrecognized original Chip2 source GDS');
  await loadGeometryKernel();
  const { parseLayoutFile } = await import('../site/layout-io.js');
  const { createModel } = await import('../site/model.js');
  const v = await import('../site/vector-geometry.js');
  const { validateProjectFile } = await import('../site/project-schema.js');
  const { serializeProject, readProjectFile } = await import('../site/project-io.js');
  const source = await parseLayoutFile(
    sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength),
    'D76_33_F2_Chip2.gds',
  );
  const original = source.layout;
  assert.equal(original.root, 'Chip2');
  assert.equal(original.elements.length, ORIGINAL_COUNT);
  assert.deepEqual([original.bounds.width, original.bounds.height], [CHIP, CHIP]);
  assert.equal(original.linework.length, 0);

  // Only shift the coordinate origin to the die center. Do not clip, simplify
  // or draw any source polygons; the exact inverse shift is recorded below.
  const cx = (original.bounds.minX + original.bounds.maxX) / 2;
  const cy = (original.bounds.minY + original.bounds.maxY) / 2;
  const elements = original.elements.map((element) => ({
    ...element,
    points: element.points.map(([x, y]) => [Number((x - cx).toFixed(6)), Number((y - cy).toFixed(6))]),
  }));
  const layout = {
    ...original,
    name: 'Blésin 2024 | complete original Chip2 author GDS',
    elements,
    bounds: { minX: -CHIP / 2, maxX: CHIP / 2, minY: -CHIP / 2, maxY: CHIP / 2, width: CHIP, height: CHIP },
    // View-only: suppress polygon fracture seams for the overlapping L12
    // geometry. Every original GDS element remains available for export.
    // Unstyled checked layers, including the real 1 um L2 traces, are drawn
    // by the ordinary Mask renderer.
    maskPresentation: {
      version: 1,
      background: '#f9fbfd',
      showStructure: false,
      showUnselected: false,
      layers: [{ layer: 12, datatype: 0, color: '#65a9cf', mode: 'fill', opacity: 0.62 }],
    },
  };
  const model = createModel({ shape: 'rect', width: CHIP, height: CHIP, thickness: thickness.silicon });
  const layer = (id, name, color) => ({ id, name, color, visible: true });
  model.layers = [
    layer('base', 'Si handle 525 um starting wafer', '#a1adb7'),
    layer('layer-1', 'SiO2 lower 2.8 um', '#c4cbd3'),
    layer('layer-2', 'Si3N4 850 nm | inferred GDS 8', '#416db7'),
    layer('layer-3', 'SiO2 upper 5.9 um total', '#d5dae0'),
    layer('layer-4', 'Mo lower 95 nm | inferred GDS 11', '#bc9650'),
    layer('layer-5', 'AlN 1 um | assumed GDS 11 footprint', '#80b870'),
    layer('layer-6', 'Mo upper 95 nm | assumed GDS 11 footprint', '#e7b456'),
  ];
  model.nextLayerId = 7;
  const masks = new Map();
  for (const gdsLayer of LAYERS) {
    const shapes = elements.filter((item) => item.layer === gdsLayer).map(close);
    assert.ok(shapes.length > 0, 'Missing original GDS layer ' + gdsLayer);
    masks.set(gdsLayer, v.unionGeometries(shapes));
  }

  // Disjoint Boolean partition of the entire uncut wafer.
  let parts = [{ geom: model.boundary, roles: [] }];
  for (const gdsLayer of LAYERS) {
    const next = [];
    for (const part of parts) {
      const inside = v.intersection(part.geom, masks.get(gdsLayer));
      const outside = v.difference(part.geom, masks.get(gdsLayer));
      if (!v.isEmpty(inside)) next.push({ geom: inside, roles: [...part.roles, gdsLayer] });
      if (!v.isEmpty(outside)) next.push({ geom: outside, roles: part.roles });
    }
    parts = next;
  }
  const top = thickness.silicon / 2;
  model.regions = parts.map((part, index) => {
    const roles = new Set(part.roles);
    const stack = [{ layerId: 'base', z0: -top, z1: top }];
    // GDS 9 is only an inferred oxide-opening mask. Do not invent a
    // full-wafer XeF2 lateral etch or a through-wafer cavity.
    if (!roles.has(9)) {
      stack.push({ layerId: 'layer-1', z0: top, z1: top + 2.8 });
      if (roles.has(8)) stack.push({ layerId: 'layer-2', z0: top + 2.8, z1: top + 3.65 });
      stack.push({ layerId: 'layer-3', z0: top + (roles.has(8) ? 3.65 : 2.8), z1: top + 5.9 });
      if (roles.has(11)) {
        stack.push({ layerId: 'layer-4', z0: top + 5.9, z1: top + 5.995 });
        stack.push({ layerId: 'layer-5', z0: top + 5.995, z1: top + 6.995 });
        stack.push({ layerId: 'layer-6', z0: top + 6.995, z1: top + 7.09 });
      }
    }
    return { id: 'region-' + (index + 1), geom: part.geom, stack };
  });
  model.nextRegionId = model.regions.length + 1;

  const project = projectForBenchmark({
    model,
    section: { a: [-CHIP / 2 + 200, 0], b: [CHIP / 2 - 200, 0] },
  });
  project.name = 'HBAR | full original Chip2 mask | provisional 3D stack';
  project.layout = layout;
  project.activeCell = 'Chip2';
  project.maskSourceMode = 'file';
  project.maskTransform = { x: 0, y: 0, scale: 1, rotation: 0 };
  project.selectedLayerKeys = ['2|0', '12|0']; // Focus on real L2 traces and seamless L12; all layers remain selectable.
  project.drawMask = { nextShapeId: 1, shapes: [] };
  project.maskRoi = null;
  project.roi = null;
  project.snapshots = [];
  project.snapshotBranches = null;
  project.processRecipe = null;
  project.display.threeOpacity = 0.75;
  project.display.threeShowBorders = false;
  project.display.threeCamera = { position: [7000, -7000, 6800], target: [0, 0, 250], fov: 32 };
  project.sourceProvenance = {
    source: 'D76_33_F2_Chip2.gds',
    sha256: digest,
    absoluteGdsCenterUm: [cx, cy],
    localTranslationUm: [-cx, -cy],
    layerPurposes: 'Provisional: 8/9/11. All other layers retained as Mask only.',
    limitations: 'No calibrated XeF2 cavity, facet, lithography, or replayable Process Recipe.',
  };
  validateProjectFile(project);
  const json = serializeProject(project);
  const reopened = await readProjectFile({ size: Buffer.byteLength(json), text: async () => json });
  assert.equal(reopened.layout.elements.length, ORIGINAL_COUNT);
  assert.equal(reopened.layout.bounds.width, CHIP);
  const report = {
    sourceSha256: digest,
    originalBoundsUm: original.bounds,
    sourcePolygonCount: original.elements.length,
    fullChipModelRegions: model.regions.length,
    countByLayer: Object.fromEntries(
      [...new Set(elements.map((element) => element.layer))].sort((a, b) => a - b)
        .map((gdsLayer) => [gdsLayer, elements.filter((element) => element.layer === gdsLayer).length]),
    ),
    disclaimer: 'Full original author GDS, with non-author-verified final-state material hypotheses.',
  };
  return { json, report };
}

async function main() {
  const sourceIndex = process.argv.indexOf('--source');
  const outIndex = process.argv.indexOf('--output');
  assert.ok(sourceIndex > 0 && process.argv[sourceIndex + 1], 'Provide --source original.gds');
  const output = resolve(outIndex > 0 && process.argv[outIndex + 1]
    ? process.argv[outIndex + 1]
    : 'test-results/hbar/hbar-chip2-full-author-mask.wafercad');
  const sourceBytes = await readFile(resolve(process.argv[sourceIndex + 1]));
  const { json, report } = await buildFullHbarChip(sourceBytes);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, json);
  await writeFile(output + '.report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, bytes: Buffer.byteLength(json), ...report }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 1;
  });
}
