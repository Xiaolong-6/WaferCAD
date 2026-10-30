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
const LAYERS = [2, 3, 8, 9, 11];
const MATERIAL_LAYERS = [8, 9, 11];
const L12_COUNT = 3017;
const thickness = { silicon: 525, lowerOxide: 2.8, nitride: 0.85, oxide: 5.9 };

function close(element) {
  const points = element.points;
  const first = points[0];
  const last = points.at(-1);
  return [[first[0] === last[0] && first[1] === last[1] ? points : [...points, first]]];
}

/**
 * Preserve each Boolean partition polygon and its original material stack,
 * but keep each region spatially local. A small number of die-wide
 * multi-polygons defeats exact geometry-validation sweep-line pruning:
 * their aggregate bounding boxes all intersect, even if the actual
 * polygons are disjoint. Splitting does not change a single source vertex
 * or the material assigned to any XY location.
 */
export function spatialMaterialRegions(partitions) {
  const regions = [];
  for (const part of partitions) {
    for (const polygon of part.geom) {
      regions.push({
        id: `region-${regions.length + 1}`,
        geom: [polygon],
        stack: part.stack,
      });
    }
  }
  return regions;
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
      layers: [
        // L2 traces are real ~1 um masks; fill them without a 1 px
        // artificial per-polygon stroke when the user enables that layer.
        { layer: 2, datatype: 0, color: '#6a8b5b', mode: 'fill', opacity: 0.78 },
        { layer: 12, datatype: 0, color: '#65a9cf', mode: 'fill', opacity: 0.62 },
      ],
    },
  };
  const layer12 = elements.filter((item) => item.layer === 12 && item.datatype === 0);
  assert.equal(layer12.length, L12_COUNT, 'Original GDS Layer 12 changed');
  // Compute only at project BUILD time. The stored display silhouette is
  // separate from the canonical GDS, whose 3,017 polygons remain untouched.
  // Boolean union repairs overlapping/fractured polygon display seams. Its
  // internal rings encode real author Mask openings; they must not be painted.
  const l12Silhouette = v.unionGeometries(layer12.map(close));
  assert.ok(l12Silhouette.length > 0, 'Missing merged Layer 12 silhouette');
  const layer12Style = layout.maskPresentation.layers.find((style) => style.layer === 12);
  layer12Style.silhouette = l12Silhouette;
  layer12Style.sourceElementCount = L12_COUNT;
  const model = createModel({ shape: 'rect', width: CHIP, height: CHIP, thickness: thickness.silicon });
  const layer = (id, name, color) => ({ id, name, color, visible: true });
  model.layers = [
    layer('base', 'Si handle 525 um starting wafer', '#a1adb7'),
    layer('layer-1', 'SiO2 lower 2.8 um', '#c4cbd3'),
    layer('layer-2', 'Si3N4 850 nm | inferred GDS 2+3+8 optics', '#416db7'),
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
  // Straight 1 um bus guides and tapers in L2/L3 are spatially aligned with
  // the L8 ring candidates. This is a provisional optical-layout inference,
  // NOT an author-confirmed process-purpose mapping.
  const opticalCircuit = v.unionGeometries([masks.get(2), masks.get(3), masks.get(8)]);

  // Disjoint Boolean partition of the entire uncut wafer.
  let parts = [{ geom: model.boundary, roles: [] }];
  for (const gdsLayer of MATERIAL_LAYERS) {
    const next = [];
    for (const part of parts) {
      const processMask = gdsLayer === 8 ? opticalCircuit : masks.get(gdsLayer);
      const inside = v.intersection(part.geom, processMask);
      const outside = v.difference(part.geom, processMask);
      if (!v.isEmpty(inside)) next.push({ geom: inside, roles: [...part.roles, gdsLayer] });
      if (!v.isEmpty(outside)) next.push({ geom: outside, roles: part.roles });
    }
    parts = next;
  }
  const top = thickness.silicon / 2;
  const materialPartitions = parts.map((part) => {
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
    return { geom: part.geom, stack };
  });
  model.regions = spatialMaterialRegions(materialPartitions);
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
  // Default to L12-only inspection: mixing in genuine 1 um L2 lines led to
  // misidentifying those real waveguides as residual L12 polygon seams.
  // L2 (and all remaining original layers) can still be enabled at any time.
  project.selectedLayerKeys = ['12|0'];
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
    layerPurposes:
      'Provisional: GDS 2+3 bus guides/tapers, 8 rings, 9 holes, 11 electrodes. Remaining layers Mask only.',
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
    materialPartitionGroups: materialPartitions.length,
    layer12SourcePolygons: layer12.length,
    layer12SilhouetteComponents: l12Silhouette.length,
    layer12SilhouetteHoles: l12Silhouette.reduce((sum, poly) => sum + Math.max(0, poly.length - 1), 0),
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
