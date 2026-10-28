/** Promote the verified TFLN engineering reconstruction to restorable Welcome fixtures.
 * The canonical saved native model is the parity oracle; stage geometry is independently
 * reproduced by the actual process kernel, not synthesized from 3D triangles.
 * Source: Yu et al., Light: Science & Applications 15, 389 (2026),
 * DOI 10.1038/s41377-026-02506-z. Undisclosed fanout/BOX details are assumed.
 * Run: node scripts/maintenance/promote-tfln-welcome.mjs [--write]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { loadGeometryKernel } from '../process-benchmarks.mjs';
await loadGeometryKernel();
const { createModel, applyOperation } = await import('../../site/model.js');
const { difference, intersection, rectMulti } = await import('../../site/vector-geometry.js');
const { resolveArrayModel, translateGeometry } = await import('../../site/model-array.js');
const { validateProjectFile } = await import('../../site/project-schema.js');
const { normalizeProcessRecipe } = await import('../../site/process-recipe.js');
const { readProjectFile, prepareProjectForWorkspaceStorage } =
  await import('../../site/project-io.js');
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const source = join(root, 'examples/projects/tfln-10x8-recovery');
const path = (name) => join(root, 'site/examples', name);
const raw = gunzipSync(readFileSync(join(source, 'TFLN_10x8_REBUILT_editable.wafercad.gz')));
assert.equal(
  createHash('sha256').update(raw).digest('hex'),
  '43b758303c226c00ab9b4909ef6cb93223cfc607edd888a6f58d4ac8d62481f9',
);
const reference = JSON.parse(raw);
const input = JSON.parse(gunzipSync(readFileSync(join(source, 'mask_input.json.gz')))).arrays;
const rowCenter = -1620;
const toLocal = (polygons) =>
  polygons
    .filter((poly) => {
      const ys = poly.flatMap((ring) => ring.map((p) => p[1]));
      return (
        (Math.min(...ys) + Math.max(...ys)) / 2 < rowCenter + 180 &&
        (Math.min(...ys) + Math.max(...ys)) / 2 >= rowCenter - 180
      );
    })
    .map((poly) =>
      poly.map((ring) => ring.map(([x, y]) => [x, Number((y - rowCenter).toFixed(4))])),
    );
const masks = Object.fromEntries(
  Object.entries(input).map(([key, polygons]) => [key, toLocal(polygons)]),
);
assert.deepEqual([masks.m1.length, masks.m2.length, masks.boxVoid.length], [24, 48, 8]);
const row = createModel({ shape: 'rect', width: 1160, height: 360, thickness: 10 });
const states = [structuredClone(row)];
const box = applyOperation(row, {
  type: 'add',
  growth: 'direct',
  face: 'front',
  name: 'SiO2 BOX',
  area: row.boundary,
  thickness: 2,
});
assert.ok(box.changed);
states.push(structuredClone(row));
const ln = applyOperation(row, {
  type: 'add',
  growth: 'direct',
  face: 'front',
  name: 'LiNbO3 (X-cut)',
  area: row.boundary,
  thickness: 0.3,
});
assert.ok(ln.changed);
states.push(structuredClone(row));
for (const [key, depth] of [
  ['m1', 0.22],
  ['m2', 0.08],
]) {
  const result = applyOperation(row, {
    type: 'etch',
    etchProfile: 'directional',
    face: 'front',
    etchTargetLayerIds: [ln.layerId],
    thickness: depth,
    area: masks[key],
  });
  assert.ok(result.changed, key + ' etch');
  states.push(structuredClone(row));
}
const round = (n) => Number((Math.round(n * 1e4) / 1e4).toFixed(4));
const clipped = (geom) => geom.map((poly) => poly.map((ring) => ring.map((p) => p.map(round))));
const regions = [];
for (const region of row.regions) {
  const keep = difference(region.geom, masks.boxVoid),
    voided = intersection(region.geom, masks.boxVoid);
  if (keep.length) regions.push({ ...structuredClone(region), geom: clipped(keep) });
  if (voided.length)
    regions.push({
      ...structuredClone(region),
      id: region.id + '-released',
      stack: region.stack.filter((layer) => layer.layerId !== 'layer-1'),
      geom: clipped(voided),
    });
}
row.regions = regions;
row.nextRegionId = Math.max(row.nextRegionId, 100);
states.push(structuredClone(row));
const finalTemplate = reference.model.array.templates[0].model;
assert.equal(states.at(-1).regions.length, finalTemplate.regions.length, 'expected region count');
assert.deepEqual(states.at(-1).layers, finalTemplate.layers, 'expected layers');
const arrayModel = (leaf) => ({
  ...structuredClone(reference.model),
  layers: structuredClone(leaf.layers),
  array: {
    ...structuredClone(reference.model.array),
    templates: [{ ...reference.model.array.templates[0], model: leaf }],
  },
});
const createdAt = '2026-10-27T12:00:00Z';
const stages = [
  'Starting silicon wafer · 10 µm engineering substrate',
  'Deposit SiO₂ BOX · 2 µm',
  'Add X-cut LiNbO₃ · 300 nm',
  'M1 etch · 220 nm · waveguide and rim',
  'M2 etch · 80 nm · membrane and anchors',
  'Engineering BOX void · suspended microring array',
];
const project = structuredClone(reference);
project.name = 'Suspended TFLN optomechanical microring array · 10×8 (engineering reconstruction)';
project.display = {
  ...project.display,
  threeShowBorders: true,
  threeOpacity: 1,
  sectionShowBorders: true,
  sectionScaleMode: 'auto',
};
project.section = { a: [-550, -1620], b: [-290, -1620] };
// The Recipe describes the reproducible layer/mask stages; the final BOX void
// is intentionally a documented engineering checkpoint, NOT HF-kinetics replay.
const recipe = normalizeProcessRecipe({
  version: 1,
  name: 'Yu 2026 · TFLN 10×8 geometry, M1/M2 and inferred BOX release',
  base: {
    shape: 'rect',
    width: 1160,
    height: 3600,
    thickness: 10,
    material: 'Silicon substrate',
    array: { kind: 'rect-grid', rows: 10, columns: 1, pitchX: 1160, pitchY: 360, activeSites: 10 },
  },
  steps: [
    {
      id: 'tfln-r1',
      command: 'deposit',
      params: {
        material: 'SiO2 BOX',
        area: 'full',
        face: 'front',
        coverage: 'direct',
        thicknessUm: 2,
      },
    },
    {
      id: 'tfln-r2',
      command: 'deposit',
      params: {
        material: 'LiNbO3 (X-cut)',
        area: 'full',
        face: 'front',
        coverage: 'direct',
        thicknessUm: 0.3,
      },
    },
    {
      id: 'tfln-r3',
      command: 'etch',
      params: {
        target: 'LiNbO3 (X-cut)',
        profile: 'directional',
        area: 'mask',
        face: 'front',
        thicknessUm: 0.22,
        mask: { sourceMode: 'file', cell: reference.layout.root, layerKeys: ['11|0'] },
      },
    },
    {
      id: 'tfln-r4',
      command: 'etch',
      params: {
        target: 'LiNbO3 (X-cut)',
        profile: 'directional',
        area: 'mask',
        face: 'front',
        thicknessUm: 0.08,
        mask: { sourceMode: 'file', cell: reference.layout.root, layerKeys: ['12|0'] },
      },
    },
    {
      id: 'tfln-r5',
      command: 'record',
      params: {
        process: 'custom',
        label: 'Engineering BOX void, snapshot only',
        note: 'Assumed geometric BOX removal is retained as restorable History geometry. This record does not reproduce HF kinetics.',
      },
    },
  ],
  activeStepId: 'tfln-r5',
});
project.processRecipe = recipe;
const core = (model) => {
  const { snapshots, snapshotBranches, ...base } = project;
  return { ...base, model };
};
const ids = stages.map((_, i) => `tfln-stage-${String(i).padStart(2, '0')}`);
// Workstation owns Starting Wafer as synthetic Step 0; persist operations only.
const nodes = states.slice(1).map((leaf, offset) => {
  const i = offset + 1;
  return {
    id: ids[i],
    branchId: 'main',
    parentId: offset ? ids[i - 1] : null,
    createdAt: new Date(Date.parse(createdAt) + i * 60000).toISOString(),
    processRevision: i,
    operation: {
      kind: ['base', 'add', 'add', 'etch', 'etch', 'record'][i],
      label: stages[i],
      geometryChanged: true,
      note: 'Restorable engineering geometry checkpoint; not a replayable fabrication recipe.',
    },
    state: core(i === states.length - 1 ? reference.model : arrayModel(leaf)),
  };
});
project.snapshots = [];
project.snapshotBranches = {
  version: 3,
  activeBranchId: 'main',
  cursorNodeId: ids.at(-1),
  cursorSnapshotId: null,
  nodes,
  branches: [
    {
      id: 'main',
      name: 'Yu et al. · TFLN engineering model',
      parentBranchId: null,
      rootNodeId: ids[1],
      headNodeId: ids.at(-1),
      rootSnapshotId: null,
      headSnapshotId: null,
      createdAt,
      headState: core(reference.model),
    },
  ],
};
validateProjectFile(project);
const packed = prepareProjectForWorkspaceStorage(project, { geometryTemplates: true });
const fullText = JSON.stringify(packed);
const fullRead = await readProjectFile({
  size: Buffer.byteLength(fullText),
  text: async () => fullText,
});
assert.deepEqual(fullRead.model, project.model, 'full native model preservation');
assert.deepEqual(fullRead.layout, project.layout, 'full native masks');
assert.equal(fullRead.snapshotBranches.nodes.length, states.length - 1);
assert.deepEqual(
  fullRead.snapshotBranches.nodes[0].state.model.array.templates[0].model.regions.length,
  1,
);
// The Welcome preview uses just two adjacent first-row sites, not an expensive
// 80-site 3D overview. It still derives its geometry from the saved full model.
const roi = { minX: -565, maxX: -292, minY: -1692, maxY: -1540 };
const previewModel = resolveArrayModel(reference.model, roi, { crop: true });
const dx = -(roi.minX + roi.maxX) / 2,
  dy = -(roi.minY + roi.maxY) / 2;
previewModel.boundary = translateGeometry(previewModel.boundary, dx, dy);
for (const region of previewModel.regions) region.geom = translateGeometry(region.geom, dx, dy);
const previewClip = rectMulti(
  roi.maxX - roi.minX,
  roi.maxY - roi.minY,
  (roi.minX + roi.maxX) / 2,
  (roi.minY + roi.maxY) / 2,
);
const previewElements = [];
for (const el of reference.layout.elements) {
  const p = el.points;
  const xs = p.map((v) => v[0]),
    ys = p.map((v) => v[1]);
  if (
    Math.max(...xs) < roi.minX ||
    Math.min(...xs) > roi.maxX ||
    Math.max(...ys) < roi.minY ||
    Math.min(...ys) > roi.maxY
  )
    continue;
  for (const poly of intersection([[p]], previewClip)) {
    if (poly.length !== 1) continue;
    const points = poly[0];
    if (points.length >= 3)
      previewElements.push({
        ...el,
        points: points.map(([x, y]) => [Number((x + dx).toFixed(4)), Number((y + dy).toFixed(4))]),
      });
  }
}
const preview = structuredClone(project);
preview.model = previewModel;
preview.layout = {
  ...structuredClone(reference.layout),
  elements: previewElements,
  bounds: { minX: -136.5, maxX: 136.5, minY: -76, maxY: 76, width: 273, height: 152 },
  combos: [],
};
preview.section = { a: [-116, 0], b: [114, 0] };
preview.name = 'Two representative suspended TFLN microrings · engineering preview';
const previewCore = structuredClone(preview);
delete previewCore.snapshots;
delete previewCore.snapshotBranches;
const initialPreview = {
  ...structuredClone(previewCore),
  model: createModel({ shape: 'rect', width: 273, height: 152, thickness: 10 }),
};
preview.snapshotBranches = {
  version: 3,
  activeBranchId: 'main',
  cursorNodeId: 'tfln-preview-final',
  cursorSnapshotId: null,
  nodes: [
    {
      id: 'tfln-preview-base',
      branchId: 'main',
      parentId: null,
      createdAt,
      processRevision: 0,
      operation: {
        kind: 'base',
        label: 'Representative preview starting substrate',
        replay: { kind: 'base' },
      },
      state: initialPreview,
    },
    {
      id: 'tfln-preview-final',
      branchId: 'main',
      parentId: 'tfln-preview-base',
      createdAt: new Date(Date.parse(createdAt) + 60000).toISOString(),
      processRevision: 1,
      operation: {
        kind: 'record',
        label: 'Two-device engineering geometry snapshot (not a fabrication replay)',
        geometryChanged: true,
      },
      state: structuredClone(previewCore),
    },
  ],
  branches: [
    {
      id: 'main',
      name: 'Representative two-site preview',
      parentBranchId: null,
      rootNodeId: 'tfln-preview-base',
      headNodeId: 'tfln-preview-final',
      rootSnapshotId: null,
      headSnapshotId: null,
      createdAt,
      headState: structuredClone(previewCore),
    },
  ],
};
validateProjectFile(preview);
const previewText = JSON.stringify(
  prepareProjectForWorkspaceStorage(preview, { geometryTemplates: true }),
);
const previewRead = await readProjectFile({
  size: Buffer.byteLength(previewText),
  text: async () => previewText,
});
assert.equal(previewRead.snapshotBranches.nodes.length, 2);
assert.ok(previewRead.layout.elements.length > 0, 'representative mask is not empty');
assert.ok(previewRead.model.regions.length > 0, 'real physical geometry');
const outputs = [
  ['suspended-tfln-microrings-10x8.wafercad', fullText],
  ['suspended-tfln-microrings-preview-source.wafercad', previewText],
];
if (process.argv.includes('--write'))
  for (const [f, t] of outputs) {
    mkdirSync(dirname(path(f)), { recursive: true });
    writeFileSync(path(f), t);
  }
console.log(
  JSON.stringify(
    {
      status: 'pass',
      fullBytes: fullText.length,
      previewBytes: previewText.length,
      previewRegions: previewRead.model.regions.length,
      previewMaskPolygons: previewRead.layout.elements.length,
      historySteps: nodes.length,
      modelParity: true,
      maskParity: true,
      outputs: outputs.map((o) => o[0]),
    },
    null,
    2,
  ),
);
