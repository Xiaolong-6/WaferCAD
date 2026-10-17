// 4x4 POST-RECIPE physical verification variant. Not an extension of the
// approved 23-step Recipe or a foundry/TCAD reconstruction.
// Converts the verified instanced final material into one global 2.5D
// partition so continuous upper-metal buses can cross instance boundaries.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTcmosInverter } from './build-tcmos-inverter-example.mjs';
import { createTcmosArrayPatch } from './build-tcmos-array-patch.mjs';
import { buildTcmosRoutedOverlay, auditTcmosRoutedOverlay } from './build-tcmos-array-interconnect.mjs';
import { loadGeometryKernel } from './process-benchmarks.mjs';

export const TCMOS_PHYSICAL_ROUTE_SPEC = Object.freeze({
  intermetalClearanceUm: 0.3,
  metalThicknessUm: 0.2,
  dielectricMaterials: ['ILD2 SiO2 (illustrative)', 'ILD3 SiO2 (illustrative)', 'ILD4 SiO2 (illustrative)'],
  viaMaterials: ['VIA12 W (illustrative)', 'VIA23 W (illustrative)', 'VIA34 W (illustrative)'],
  metalMaterials: ['METAL2 Al (illustrative)', 'METAL3 Al (illustrative)', 'METAL4 Al (illustrative)'],
});

const rectPoints = ([x0, y0, x1, y1]) => [
  [x0, y0], [x1, y0], [x1, y1], [x0, y1],
];
const rectGeom = (rect) => [[rectPoints(rect).concat([rectPoints(rect)[0]])]];
const closeEnough = (a, b) => Math.abs(a - b) <= 1e-9;

// Physical materials are constructed in WORLD space. They cannot be stored
// inside the repeated 1x1 template without losing true cross-cell conductors.
export async function buildTcmosPhysicalRoutedVariant(source = null) {
  await loadGeometryKernel();
  const vector = await import('../site/vector-geometry.js');
  const { resolveArrayModel } = await import('../site/model-array.js');
  const { createLayer, modelBoundsZ, geometryArea } = await import('../site/model.js');
  const { validateProcessModel, validateProjectFile } = await import('../site/project-schema.js');
  const { prepareProjectForWorkspaceStorage, readProjectFile } = await import('../site/project-io.js');
  const { project: original } = source
    ? { project: source }
    : await buildTcmosInverter({ includeComparison: false });
  const { project: unconnected } = await createTcmosArrayPatch(original);
  assert.equal(unconnected.layout.elements.length, 3712);
  assert.equal(unconnected.model.array.instances.length, 16);
  const routed = buildTcmosRoutedOverlay();
  const graph = auditTcmosRoutedOverlay(routed);

  // Keep the untouched array project independently restorable. Flatten only
  // this separate visual + scientific verification project.
  const project = structuredClone(unconnected);
  const exactSourceMasks = structuredClone(unconnected.layout.elements);
  project.model = resolveArrayModel(unconnected.model);
  const model = project.model;
  assert.equal(model.kernel, 'vector-2.5d-v1');
  assert.ok(!model.array);
  const beforeLayers = new Map(model.layers.map((layer) => [layer.name, layer.id]));
  const originalMetalId = beforeLayers.get('METAL1 Al');
  assert.ok(originalMetalId, 'The original Recipe M1 material is missing');
  const originalTopZ = modelBoundsZ(model)[1];
  const baselineRegionCount = model.regions.length;

  const newLayer = (name, color) => {
    const layer = createLayer(model, name);
    layer.color = color;
    return layer;
  };
  const names = TCMOS_PHYSICAL_ROUTE_SPEC;
  const dielectric = names.dielectricMaterials.map((n) => newLayer(n, '#B8CDD8'));
  const vias = names.viaMaterials.map((n) => newLayer(n, '#8F979E'));
  const metals = [
    newLayer(names.metalMaterials[0], '#D59B55'),
    newLayer(names.metalMaterials[1], '#5FB4B5'),
    newLayer(names.metalMaterials[2], '#B986C6'),
  ];

  const splitBy = (geometry, transform, label) => {
    const next = [];
    let changed = 0;
    for (const region of model.regions) {
      const hit = vector.intersection(region.geom, geometry);
      const rest = vector.difference(region.geom, geometry);
      if (!vector.isEmpty(rest)) next.push({ ...region, geom: rest });
      if (vector.isEmpty(hit)) continue;
      const stack = transform(region.stack);
      next.push({
        id: 'route-region-' + model.nextRegionId++,
        geom: hit,
        stack,
      });
      changed++;
    }
    assert.ok(changed > 0, label + ' did not intersect actual material');
    model.regions = next;
    return changed;
  };
  const unionRects = (rectangles) =>
    vector.unionGeometries(rectangles.map((rectangle) => rectGeom(rectangle)));
  const ensurePositive = (a, b, message) =>
    assert.ok(b - a > 1e-9, message + ': no physical Z interval');
  const layDielectric = (layer, zTop, label) => {
    let filled = 0;
    for (const region of model.regions) {
      const last = region.stack.at(-1);
      assert.ok(last, label + ': empty original stack');
      ensurePositive(last.z1, zTop, label);
      region.stack = [...region.stack, { layerId: layer.id, z0: last.z1, z1: zTop }];
      filled++;
    }
    assert.ok(filled, label + ': no substrate');
    return filled;
  };
  const addVia = (viaGroup, nextPlane, fromLayerId, viaLayer, oxideLayer, label) => {
    const footprints = unionRects(viaGroup.map((v) => v.rect));
    let verifiedColumns = 0;
    const touched = splitBy(footprints, (stack) => {
      const cap = stack.at(-1);
      assert.equal(cap.layerId, oxideLayer.id, label + ': wrong ILD owner');
      assert.ok(closeEnough(cap.z1, nextPlane), label + ': ILD top shifted');
      const conductor = stack.at(-2);
      assert.equal(conductor?.layerId, fromLayerId,
        label + ': open; Via has no directly underlying conductor');
      assert.ok(closeEnough(cap.z0, conductor.z1),
        label + ': oxide/Via did not reach underlying metal');
      ensurePositive(conductor.z1, nextPlane, label);
      verifiedColumns++;
      return [
        ...stack.slice(0, -1),
        { layerId: viaLayer.id, z0: conductor.z1, z1: nextPlane },
      ];
    }, label);
    assert.ok(touched && verifiedColumns === touched);
    return touched;
  };
  const addMetal = (metalGroup, plane, metalLayer, label) => {
    const mask = unionRects(metalGroup.map((m) => m.rect));
    return splitBy(mask, (stack) => {
      const below = stack.at(-1);
      assert.ok(closeEnough(below.z1, plane), label + ': unexpected vertical void');
      return [...stack, {
        layerId: metalLayer.id,
        z0: plane,
        z1: plane + names.metalThicknessUm,
      }];
    }, label);
  };

  const planes = [];
  const counts = [];
  let lowerId = originalMetalId;
  let top = originalTopZ;
  for (let index = 0; index < 3; index++) {
    const lower = index === 0 ? 'M1' : 'M' + (index + 1);
    const upper = 'M' + (index + 2);
    const plane = Number((top + names.intermetalClearanceUm).toFixed(6));
    planes.push(plane);
    const filmRegions = layDielectric(dielectric[index], plane, upper + ' dielectric');
    const viaGroup = routed.vias.filter((v) => v.from === lower && v.to === upper);
    const viaCount = addVia(viaGroup, plane, lowerId, vias[index],
      dielectric[index], 'VIA' + (index + 1) + (index + 2));
    const metalGroup = routed.metal.filter((m) => m.layer === upper);
    const metalCount = addMetal(metalGroup, plane, metals[index], upper);
    counts.push({ layer: upper, filmRegions, viaCount, metalCount });
    lowerId = metals[index].id;
    top = plane + names.metalThicknessUm;
  }
  // Prove complete 2.5D VIA VOLUMES, not just pin centres. This runs
  // against the actually split world-space material partition, and rejects
  // both unfilled aperture area and extra conductor outside the designed
  // footprint. The 1e-12 µm² is the existing scientific XY area contract.
  const viaFootprintChecks = vias.map((layer, index) => {
    const from = 'M' + (index + 1);
    const footprints = routed.vias.filter((via) => via.from === from);
    const expected = unionRects(footprints.map((via) => via.rect));
    const physicalParts = model.regions
      .filter((region) => region.stack.some((segment) => segment.layerId === layer.id))
      .map((region) => region.geom);
    assert.ok(physicalParts.length > 0, layer.name + ': no final 2.5D material');
    const actual = vector.unionGeometries(physicalParts);
    const missingAreaUm2 = geometryArea(vector.difference(expected, actual));
    const extraAreaUm2 = geometryArea(vector.difference(actual, expected));
    assert.ok(missingAreaUm2 < 1e-12,
      layer.name + ': missing physical Via area = ' + missingAreaUm2 + ' µm²');
    assert.ok(extraAreaUm2 < 1e-12,
      layer.name + ': extraneous Via conductor area = ' + extraAreaUm2 + ' µm²');
    return {
      name: layer.name,
      viaSites: footprints.length,
      designedAreaUm2: geometryArea(expected),
      actualAreaUm2: geometryArea(actual),
      missingAreaUm2,
      extraAreaUm2,
    };
  });
  assert.equal(viaFootprintChecks.reduce((sum, entry) => sum + entry.viaSites, 0),
    140, 'One or more Via physical volumes are missing');
  // A correct Via without exact horizontal metal geometry could still
  // leave a physically opened or shorted bus. Check *every upper-metal film*
  // against its intended world-space footprint, not just the landing squares.
  const metalFootprintChecks = metals.map((layer, index) => {
    const metalName = 'M' + (index + 2);
    const shapes = routed.metal.filter((shape) => shape.layer === metalName);
    const expected = unionRects(shapes.map((shape) => shape.rect));
    const actualParts = model.regions
      .filter((region) => region.stack.some((segment) => segment.layerId === layer.id))
      .map((region) => region.geom);
    assert.ok(actualParts.length, layer.name + ': no final metal material');
    const actual = vector.unionGeometries(actualParts);
    const missingAreaUm2 = geometryArea(vector.difference(expected, actual));
    const extraAreaUm2 = geometryArea(vector.difference(actual, expected));
    assert.ok(missingAreaUm2 < 1e-12,
      layer.name + ': missing continuous metal footprint area = ' +
        missingAreaUm2 + ' µm²');
    assert.ok(extraAreaUm2 < 1e-12,
      layer.name + ': extra metal footprint area = ' + extraAreaUm2 + ' µm²');
    return {
      name: layer.name,
      shapeCount: shapes.length,
      designedAreaUm2: geometryArea(expected),
      actualAreaUm2: geometryArea(actual),
      missingAreaUm2,
      extraAreaUm2,
    };
  });
  assert.deepEqual(metalFootprintChecks.map((check) => check.shapeCount),
    [64, 44, 3], 'An upper-metal film changed its intended shape count');
  // A full source File Mask remains a strict prefix, including exact vertex
  // coordinates. Supplemental layout layers are exclusively this new variant.
  assert.deepEqual(project.layout.elements, exactSourceMasks,
    'Physical route must not mutate any approved source Mask vertex');
  const supplementary = [
    { key: 'VIA12', layer: 21, rectangles: routed.vias.filter((v) => v.from === 'M1') },
    { key: 'METAL2', layer: 22, rectangles: routed.metal.filter((m) => m.layer === 'M2') },
    { key: 'VIA23', layer: 23, rectangles: routed.vias.filter((v) => v.from === 'M2') },
    { key: 'METAL3', layer: 24, rectangles: routed.metal.filter((m) => m.layer === 'M3') },
    { key: 'VIA34', layer: 25, rectangles: routed.vias.filter((v) => v.from === 'M3') },
    { key: 'METAL4', layer: 26, rectangles: routed.metal.filter((m) => m.layer === 'M4') },
  ];
  for (const group of supplementary) {
    project.layout.elements.push(...group.rectangles.map((entry) => ({
      kind: 'polygon',
      // All geometries belong to the active root cell; a fictitious disconnected
      // sourceCell would silently drop these supplemental polygons on GDS/OAS.
      sourceCell: project.layout.root,
      layer: group.layer, datatype: 0,
      points: rectPoints(entry.rect),
    })));
    project.layout.combos.push({
      key: project.layout.root + '|' + group.layer + '|0',
      cell: project.layout.root,
      layer: group.layer, datatype: 0, count: group.rectangles.length,
    });
  }
  const palette = ['#8F979E', '#D59B55', '#8F979E', '#5FB4B5', '#8F979E', '#B986C6'];
  project.layout.maskPresentation.layers.push(...supplementary.map((g, index) => ({
    layer: g.layer, datatype: 0,
    color: palette[index], mode: 'fill', opacity: 0.72,
  })));
  project.selectedLayerKeys = [
    ...new Set([...project.selectedLayerKeys, ...supplementary.map((g) => g.layer + '|0')]),
  ];
  project.layout.name = 'T-CMOS 4x4 — illustrative routed stack (original SVG preserved)';
  project.name = 'T-CMOS inverter · 4×4 POST-RECIPE ROUTED PHYSICAL PROTOTYPE';
  project.section = { a: [-21, -16], b: [-21, 16] };
  project.roi = null;
  project.display.threeCamera = null;
  project.display.threeOpacity = 0.55;
  project.display.threeFastMode = true;
  // This variant has no independently executed post-Recipe History. Never
  // reuse the 23 nodes of the unconnected original as if routing were replayed.
  delete project.processRecipe;
  delete project.snapshots;
  delete project.snapshotBranches;
  assert.deepEqual(project.layout.elements.slice(0, exactSourceMasks.length), exactSourceMasks,
    'Supplementary mask layers must preserve exact original source elements');
  model.revision++;
  model.processRevision++;
  validateProcessModel(model);
  validateProjectFile(project);
  const json = JSON.stringify(prepareProjectForWorkspaceStorage(project));
  const readBack = await readProjectFile({
    size: Buffer.byteLength(json), text: async () => json,
  });
  validateProjectFile(readBack);
  assert.equal(readBack.layout.elements.length, 3712 + 251);
  assert.deepEqual(readBack.layout.elements.slice(0, exactSourceMasks.length), exactSourceMasks,
    'Storage roundtrip changed one or more approved source File Mask vertices');
  assert.equal(readBack.layout.combos.length, 14);
  assert.ok(!readBack.processRecipe && !readBack.snapshotBranches);
  return {
    project, json, routed,
    report: {
      graph,
      originalMaskPolygons: 3712,
      extraMaskPolygons: 251,
      originalModelKernel: unconnected.model.kernel,
      routedModelKernel: model.kernel,
      originalSurfaceMaxZ: originalTopZ,
      routedSurfaceMaxZ: top,
      materialLayersAdded: 9,
      dielectricAndViaStages: counts,
      viaFootprintChecks,
      metalFootprintChecks,
      routedPlanes: planes,
      baselineRegionCount,
      finalRegionCount: model.regions.length,
      physicalModelIntegrated: true,
      calibratedOhmicContact: false,
      documentedFoundryRouting: false,
      actualPostRecipeHistoryVerified: false,
    },
  };
}

async function main() {
  const result = await buildTcmosPhysicalRoutedVariant();
  const out = resolve('test-results/tcmos');
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'tcmos-inverter-4x4-ROUTED-PHYSICAL-PROTOTYPE.wafercad'),
    result.json);
  await writeFile(resolve(out, 'tcmos-inverter-4x4-ROUTED-PHYSICAL-REPORT.json'),
    JSON.stringify(result.report, null, 2));
  console.log(JSON.stringify(result.report));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
