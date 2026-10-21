/**
 * Author-layout, geometry-first reconstruction of Blésin et al., Nat. Commun.
 * 15, 6096 (2024), DOI 10.1038/s41467-024-49467-8.
 *
 * Source GDS: Zenodo 10965620 / 12823961, ChipLayout/D76_33_F2_Chip2.gds.
 * The author GDS contains no layer-purpose legend. Assignment of GDS layers
 * to fabrication roles is explicitly provisional; do not treat inferred mask
 * names or local silicon handle thickness as published measured results.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';

export const PAPER_DOI = '10.1038/s41467-024-49467-8';
export const SOURCE_SHA256 = 'f76cc5217b1024dcd0f68b168f2fb67d6c57560bba3a604652d84257d10e3423';
// A measured pair of author-GDS ring centres; not an inferred mask placement.
export const ROI = Object.freeze({ cx: -4367.57, cy: 5393.4, width: 130, height: 150 });
const FIXED_DATE = '2026-10-20T12:00:00.000Z';
const LOCAL_SI_HANDLE_UM = 36; // visualization surrogate, NOT the ~525 um starting wafer
const DIMS = Object.freeze({
  buriedOxide: 2.8,
  siNCore: 0.85,
  oxideTotal: 5.9,
  bottomMo: 0.095,
  alN: 1.0,
  topMo: 0.095,
});
const SOURCE_LAYERS = Object.freeze([2, 3, 8, 9, 11, 12, 13, 14]);
const FACE = 'front';
const dateAt = (i) => new Date(Date.parse(FIXED_DATE) + i * 1000).toISOString();
const clone = (value) => structuredClone(value);

export async function extractAuthorLayout(sourceBytes) {
  const digest = createHash('sha256').update(sourceBytes).digest('hex');
  assert.equal(digest, SOURCE_SHA256, 'Not the archived author Chip2 GDS');
  const { parseLayoutFile } = await import('../site/layout-io.js');
  const raw = await parseLayoutFile(
    sourceBytes.buffer.slice(
      sourceBytes.byteOffset,
      sourceBytes.byteOffset + sourceBytes.byteLength,
    ),
    'D76_33_F2_Chip2.gds',
  );
  assert.equal(raw.layout.root, 'Chip2');
  assert.equal(raw.layout.elements.length, 9646);
  assert.deepEqual([raw.layout.bounds.width, raw.layout.bounds.height], [5000, 5000]);
  const left = ROI.cx - ROI.width / 2;
  const bottom = ROI.cy - ROI.height / 2;
  const right = left + ROI.width;
  const top = bottom + ROI.height;
  // A local device GDS must contain ONLY physically cropped ROI polygons.
  // Merely selecting by bbox previously leaked 4-mm interconnect polygons into
  // a nominal 130-um cell, corrupting GDS extents and zoom/fit behavior.
  // Use the production boolean kernel and fail closed if a clipped polygon
  // acquires holes (GDS BOUNDARY cannot encode holes in a single element).
  await loadGeometryKernel();
  const geometry = await import('../site/vector-geometry.js');
  const roiArea = geometry.rectMulti(ROI.width, ROI.height);
  let crossingPolygons = 0;
  const translated = raw.layout.elements.flatMap((source) => {
    if (!SOURCE_LAYERS.includes(source.layer)) return [];
    const bb = {
      x0: Math.min(...source.points.map((xy) => xy[0])),
      x1: Math.max(...source.points.map((xy) => xy[0])),
      y0: Math.min(...source.points.map((xy) => xy[1])),
      y1: Math.max(...source.points.map((xy) => xy[1])),
    };
    if (bb.x1 < left || bb.x0 > right || bb.y1 < bottom || bb.y0 > top) return [];
    const local = source.points.map(([x, y]) => [
      Number((x - ROI.cx).toFixed(6)),
      Number((y - ROI.cy).toFixed(6)),
    ]);
    const outside = local.some(
      ([x, y]) =>
        x < -ROI.width / 2 || x > ROI.width / 2 || y < -ROI.height / 2 || y > ROI.height / 2,
    );
    const clipped = outside ? geometry.intersection([[local]], roiArea) : [[local]];
    if (outside) crossingPolygons++;
    return clipped.map((polygon) => {
      if (polygon.length !== 1)
        throw new Error(`ROI clipping yielded a GDS hole on layer ${source.layer}`);
      const ring = polygon[0];
      const points =
        ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
          ? ring.slice(0, -1)
          : ring;
      assert.ok(points.length >= 3, 'ROI clip produced a degenerate GDS polygon');
      assert.ok(
        points.every(
          ([x, y]) =>
            x >= -ROI.width / 2 - 1e-8 &&
            x <= ROI.width / 2 + 1e-8 &&
            y >= -ROI.height / 2 - 1e-8 &&
            y <= ROI.height / 2 + 1e-8,
        ),
        'Derived GDS polygon escapes physical ROI',
      );
      return {
        kind: 'polygon',
        sourceCell: 'CHIP2_AUTHOR_ROI',
        layer: source.layer,
        datatype: source.datatype ?? 0,
        points,
      };
    });
  });
  const counts = new Map();
  for (const e of translated) counts.set(e.layer, (counts.get(e.layer) || 0) + 1);
  assert.ok((counts.get(8) || 0) >= 18, 'Missing the original dual SiN resonators');
  assert.ok((counts.get(9) || 0) >= 2, 'Missing the two original hole outlines');
  const layout = {
    name: 'Blésin 2024 · original Chip2 GDS single transducer ROI',
    root: 'CHIP2_AUTHOR_ROI',
    elements: translated,
    linework: [],
    hierarchy: {},
    combos: [...counts]
      .sort((a, b) => a[0] - b[0])
      .map(([layer, count]) => ({
        key: `CHIP2_AUTHOR_ROI|${layer}|0`,
        cell: 'CHIP2_AUTHOR_ROI',
        layer,
        datatype: 0,
        count,
      })),
    bounds: {
      minX: -ROI.width / 2,
      maxX: ROI.width / 2,
      minY: -ROI.height / 2,
      maxY: ROI.height / 2,
      width: ROI.width,
      height: ROI.height,
    },
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
  return {
    layout,
    counts: Object.fromEntries(counts),
    sourceSha256: digest,
    originalGdsBBoxUm: [left, bottom, right, top],
    croppedSourcePolygons: crossingPolygons,
  };
}

export async function buildHbarTransducer(sourceBytes) {
  await loadGeometryKernel();
  const modelApi = await import('../site/model.js');
  const v = await import('../site/vector-geometry.js');
  const { applyAdvancedProcessOperation } = await import('../site/advanced-process-operations.js');
  const { applyContinuousRelease } = await import('../site/continuous-etch-process.js');
  const { validateProjectFile, validateProcessModel } = await import('../site/project-schema.js');
  const { normalizeProcessRecipe } = await import('../site/process-recipe.js');
  const { serializeProject, readProjectFile } = await import('../site/project-io.js');
  const { serializeGDS } = await import('../site/layout-export.js');

  const source = await extractAuthorLayout(sourceBytes);
  let model = modelApi.createModel({
    shape: 'rect',
    width: ROI.width,
    height: ROI.height,
    thickness: LOCAL_SI_HANDLE_UM,
  });
  model.layers[0].name = 'Si substrate (36 um local visualization slice)';
  model.layers[0].color = '#a1adb7';
  const base = {
    shape: 'rect',
    width: ROI.width,
    height: ROI.height,
    thickness: LOCAL_SI_HANDLE_UM,
    material: model.layers[0].name,
  };
  const project = projectForBenchmark({ model, section: { a: [-55, 0], b: [55, 0] } });
  project.name = 'Blésin 2024 · SiN HBAR microwave–optical transducer · author GDS ROI';
  project.layout = source.layout;
  project.maskSourceMode = 'file';
  project.activeCell = project.layout.root;
  project.selectedLayerKeys = ['8|0'];
  project.drawMask = { nextShapeId: 1, shapes: [] };
  project.maskRoi = null;
  project.display.threeOpacity = 0.45;
  project.display.threeShowBorders = true;
  project.display.threeCamera = { position: [175, -195, 105], target: [0, 0, 16], fov: 32 };

  const byLayer = new Map();
  for (const e of source.layout.elements) {
    if (!byLayer.has(e.layer)) byLayer.set(e.layer, []);
    byLayer.get(e.layer).push(e);
  }
  const maskAreas = new Map();
  function areaFor(layer) {
    if (maskAreas.has(layer)) return maskAreas.get(layer);
    const area = v.unionGeometries(
      (byLayer.get(layer) || []).map((e) => [[[...e.points, e.points[0]]]]),
    );
    const limited = v.intersection(area, model.boundary);
    maskAreas.set(layer, limited);
    return limited;
  }
  const layers = {};
  const steps = [];
  const nodes = [];
  const bookmarks = [];
  const validations = [];
  let parentId = null;
  const branch = {
    id: 'main',
    name: 'HBAR · source GDS focused process',
    parentBranchId: null,
    rootNodeId: null,
    headNodeId: null,
    rootSnapshotId: null,
    headSnapshotId: null,
    createdAt: FIXED_DATE,
    headState: null,
  };
  function capture() {
    const state = clone(project);
    delete state.snapshots;
    delete state.snapshotBranches;
    state.model = clone(model);
    state.processRecipe = normalizeProcessRecipe({
      name: 'Blésin 2024 HBAR · measured film stack / provisional mask roles',
      base,
      steps,
    });
    return state;
  }
  function append(operation) {
    const id = `hbar-stage-${String(nodes.length).padStart(2, '0')}`;
    const state = capture();
    const node = {
      id,
      branchId: 'main',
      parentId,
      createdAt: dateAt(nodes.length),
      processRevision: model.processRevision,
      operation,
      state,
    };
    nodes.push(node);
    parentId = id;
    if (!branch.rootNodeId) branch.rootNodeId = id;
    branch.headNodeId = id;
    branch.headState = clone(state);
    return node;
  }
  function bookmark(name) {
    const node = nodes.at(-1);
    const bookmark = {
      id: `hbar-bookmark-${bookmarks.length + 1}`,
      name,
      createdAt: dateAt(100 + bookmarks.length),
      branchId: 'main',
      parentId: branch.headSnapshotId,
      historyNodeId: node.id,
      state: clone(node.state),
    };
    bookmarks.unshift(bookmark);
    if (!branch.rootSnapshotId) branch.rootSnapshotId = bookmark.id;
    branch.headSnapshotId = bookmark.id;
  }
  function fileMask(layer) {
    return {
      sourceMode: 'file',
      cell: 'CHIP2_AUTHOR_ROI',
      layerKeys: [`${layer}|0`],
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      roi: null,
    };
  }
  function record(label, note) {
    model.revision++;
    model.processRevision++;
    steps.push({ command: 'record', params: { process: 'custom', label, note } });
    append({
      kind: 'record',
      label,
      note,
      geometryChanged: false,
      replay: { version: 1, kind: 'record' },
    });
  }
  function operation(command, label, options, layer = null) {
    const selected = layer == null ? model.boundary : areaFor(layer);
    assert.ok(selected.length, `No GDS geometry for layer ${layer}`);
    const params = {
      type: command === 'deposit' ? 'add' : 'etch',
      face: FACE,
      ...(command === 'deposit'
        ? { name: options.name, thickness: options.thickness, growth: options.growth || 'direct' }
        : {
            thickness: options.thickness,
            etchTargetLayerIds: options.targets,
            etchProfile: options.profile || 'directional',
            ...(options.targetZ != null ? { targetZ: options.targetZ } : {}),
          }),
    };
    const result =
      applyAdvancedProcessOperation(model, params, selected, modelApi, v) ||
      modelApi.applyOperation(model, { ...params, area: selected });
    assert.equal(result?.changed, true, `${label}: ${result?.error || 'no geometry'}`);
    if (command === 'deposit') {
      layers[options.name] = result.layerId;
      if (options.color)
        model.layers.find((item) => item.id === result.layerId).color = options.color;
    }
    steps.push({
      command,
      params: {
        area: layer == null ? 'full' : 'mask',
        face: FACE,
        ...(layer == null ? {} : { mask: fileMask(layer) }),
        ...(command === 'deposit'
          ? { material: options.name, thicknessUm: options.thickness, coverage: params.growth }
          : {
              depth: options.thickness,
              thicknessUm: options.thickness,
              profile: params.etchProfile,
              targetLayerIds: params.etchTargetLayerIds,
              ...(options.targetZ != null ? { targetZ: options.targetZ } : {}),
            }),
      },
    });
    append({
      kind: params.type,
      label,
      face: FACE,
      areaMode: layer == null ? 'full' : 'mask',
      geometryChanged: true,
      ...(command === 'deposit'
        ? {
            name: params.name,
            thickness: params.thickness,
            growth: params.growth,
            resultLayerId: result.layerId,
          }
        : {
            thickness: params.thickness,
            etchProfile: params.etchProfile,
            etchTargetLayerIds: params.etchTargetLayerIds,
            ...(params.targetZ != null ? { targetZ: params.targetZ } : {}),
          }),
      replay: {
        version: 1,
        params: clone(params),
        areaMode: layer == null ? 'full' : 'mask',
        maskContext: layer == null ? null : fileMask(layer),
      },
    });
    validateProcessModel(model);
    validations.push({
      label,
      processRevision: model.processRevision,
      regions: model.regions.length,
      layers: model.layers.length,
    });
    return result;
  }

  append({
    kind: 'base',
    label: 'Silicon handle (36 um local slice; original wafer ~525 um)',
    geometryChanged: true,
    replay: { kind: 'base' },
  });
  record(
    'Damascene preform / reflow',
    'The trench/HTM/reflow process is documented in the authors’ run card; 3D process uses a geometric equivalent core cross-section.',
  );
  operation('deposit', 'Thermal oxide undercladding 2.8 um', {
    name: 'SiO2 lower',
    thickness: DIMS.buriedOxide,
    color: '#c4cbd3',
  });
  bookmark('S01 · Thermal oxide undercladding');
  operation(
    'deposit',
    'LPCVD Si3N4 850 nm (GDS layer 8, provisional purpose)',
    { name: 'Si3N4 waveguide', thickness: DIMS.siNCore, color: '#416db7' },
    8,
  );
  bookmark('S02 · Author GDS dual Si3N4 micro-rings');
  operation('deposit', 'TEOS/LTO top oxide: cover SiN and fill cladding', {
    name: 'SiO2 upper',
    thickness: DIMS.oxideTotal - DIMS.buriedOxide,
    color: '#d5dae0',
  });
  operation('etch', 'CMP to reported total oxide 5.9 um', {
    targets: [layers['SiO2 upper']],
    profile: 'planarize',
    targetZ: LOCAL_SI_HANDLE_UM / 2 + DIMS.oxideTotal,
    thickness: 1,
  });
  bookmark('S03 · Planarized 5.9 um silica acoustic cladding');
  operation(
    'deposit',
    'Sputter Mo lower electrode 95 nm (GDS layer 11, provisional)',
    { name: 'Mo bottom electrode', thickness: DIMS.bottomMo, color: '#bc9650' },
    11,
  );
  operation(
    'deposit',
    'Sputter piezoelectric AlN 1 um (provisional electrode footprint)',
    { name: 'AlN piezoelectric', thickness: DIMS.alN, color: '#80b870' },
    11,
  );
  operation(
    'deposit',
    'Sputter Mo top electrode 95 nm (provisional electrode footprint)',
    { name: 'Mo top electrode', thickness: DIMS.topMo, color: '#e7b456' },
    11,
  );
  bookmark('S04 · Mo / AlN / Mo on cladding');
  record(
    'XeF2 Mo isolation and Al feedline lift-off',
    'This etchback and Al connection are documented but mask-purpose correspondence cannot yet be verified. Their shape is intentionally not invented.',
  );
  operation(
    'etch',
    'DRIE holes through oxide (GDS layer 9, provisional)',
    { targets: [layers['SiO2 upper'], layers['SiO2 lower']], thickness: DIMS.oxideTotal + 0.02 },
    9,
  );
  bookmark('S05 · Opened cladding release holes');
  const continuousParams = {
    type: 'etch',
    face: 'front',
    etchProfile: 'continuous',
    continuousShape: 'elliptical',
    continuousLateralUm: 24,
    thickness: 19,
    etchTargetLayerIds: ['base'],
  };
  const released = applyContinuousRelease(model, continuousParams, areaFor(9));
  assert.equal(released.result.changed, true);
  model = released.model;
  // PR #352 supports exact analytic continuous-release Recipe replay. Keep
  // the original GDS opening, target material and independent physical XY/Z
  // reaches identical to the History operation. Never substitute isotropic
  // stepped bands or silently omit this material-changing Recipe step.
  steps.push({
    command: 'etch',
    params: {
      area: 'mask',
      face: 'front',
      mask: fileMask(9),
      target: base.material,
      depth: 19,
      thicknessUm: 19,
      profile: 'continuous',
      continuousShape: 'elliptical',
      continuousLateralUm: 24,
    },
  });
  append({
    kind: 'etch',
    label: 'Si continuous isotropic release from author hole openings (geometry demonstration)',
    geometryChanged: true,
    face: 'front',
    areaMode: 'mask',
    thickness: 19,
    etchProfile: 'continuous',
    continuousShape: 'elliptical',
    continuousLateralUm: 24,
    etchTargetLayerIds: ['base'],
    replay: {
      version: 1,
      params: clone(continuousParams),
      areaMode: 'mask',
      maskContext: fileMask(9),
    },
  });
  bookmark('S06 · Continuous silicon undercut, suspended silica');

  Object.assign(project, capture());
  project.snapshots = bookmarks;
  project.snapshotBranches = {
    version: 3,
    activeBranchId: 'main',
    cursorNodeId: branch.headNodeId,
    cursorSnapshotId: branch.headSnapshotId,
    nodes,
    branches: [branch],
  };
  validateProjectFile(project);
  const json = serializeProject(project);
  const reopened = await readProjectFile({ size: Buffer.byteLength(json), text: async () => json });
  validateProjectFile(reopened);
  assert.equal(reopened.model.kernel, 'vector-continuous-etch-v1');
  assert.equal(reopened.model.layers.length, project.model.layers.length);
  const gds = serializeGDS(source.layout.elements, {
    cellName: 'CHIP2_AUTHOR_ROI',
    timestamp: new Date(FIXED_DATE),
  });
  const parsed = await (
    await import('../site/layout-io.js')
  ).parseLayoutFile(
    gds.buffer.slice(gds.byteOffset, gds.byteOffset + gds.byteLength),
    'author-roi.gds',
  );
  assert.equal(parsed.layout.elements.length, source.layout.elements.length);
  const report = {
    doi: PAPER_DOI,
    originalGdsSha256: SOURCE_SHA256,
    sourceGdsLayout: 'Chip2',
    sourceGdsPolygons: 9646,
    sourceGdsUnits: '1 nm database units',
    sourceRoi: ROI,
    sourceCrossingPolygonsClipped: source.croppedSourcePolygons,
    originalGdsBBoxUm: source.originalGdsBBoxUm,
    roiSourcePolygonCount: source.layout.elements.length,
    roiPolygonsByLayer: source.counts,
    maskPurposeProvenance: 'INFERRED by Fig. 2/FIB and GDS shape; no author purpose legend',
    dimensionsUm: DIMS,
    siHandleVisualSurrogateUm: LOCAL_SI_HANDLE_UM,
    stages: nodes.length,
    recipeSteps: steps.length,
    bookmarks: bookmarks.length,
    finalMaterialKernel: reopened.model.kernel,
    materialLayerCount: reopened.model.layers.length,
    postSaveGdsPolygons: parsed.layout.elements.length,
    exactContinuousEtch: {
      shape: 'elliptical',
      verticalUm: 19,
      lateralUm: 24,
      notes: 'Illustrative local release geometry; not a measured lateral etch distance.',
    },
    validations,
    limitations: [
      'Published wafer was 525 um; local visual slice is 36 um. Actual 250 um DRIE is not modeled.',
      'Author GDS does not contain a verified layer-purpose table; all layer roles are provisional.',
      'The full Damascene preform, Mo XeF2 isolation, Al lift-off and facets are process records pending verified mask mapping.',
      'The exact continuous-release geometry is a 2D/3D material reconstruction; no optical/acoustic FEM or transduction efficiency claims.',
      'Recipe Run All is supported on PR352 and must be independently validated against History in the full Workstation.',
    ],
  };
  return { project, json, gds, report };
}

async function main() {
  const sourceFlag = process.argv.indexOf('--source');
  const outFlag = process.argv.indexOf('--output');
  assert.ok(
    sourceFlag > 0 && process.argv[sourceFlag + 1],
    'Usage: node scripts/build-hbar-transducer-example.mjs --source /path/Chip2.gds [--output outdir]',
  );
  const out = resolve(outFlag > 0 ? process.argv[outFlag + 1] : 'test-results/hbar');
  const bytes = await readFile(resolve(process.argv[sourceFlag + 1]));
  const { json, gds, report } = await buildHbarTransducer(bytes);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'hbar-blesin-2024-author-roi.wafercad'), json);
  await writeFile(join(out, 'hbar-blesin-2024-author-roi.gds'), gds);
  await writeFile(join(out, 'reconstruction-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output: out, ...report }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.stack || String(error));
    process.exitCode = 1;
  });
