// Read-only, deterministic presentation fixtures; never imports the scientific core.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sources = [
  ['m3d', 'm3d-selfpowered-full-replay', 'm3d-selfpowered-heterogeneous-ic-three.webp'],
  ['photodetector', 'photodetector-literature-examples', 'photodetector-literature-three.webp'],
];
function geometry(project, ref) {
  const value = project.sharedGeometries[ref];
  if (!project.sharedPolygonTemplates) return value;
  return value.map(([id, x, y]) => {
    const template = project.sharedPolygonTemplates[id];
    if (template.raw) return template.raw;
    return template.rings.map((deltas) => {
      let px = x,
        py = y;
      const ring = [];
      for (let i = 0; i < deltas.length; i += 2) {
        px += deltas[i];
        py += deltas[i + 1];
        ring.push([Number((px / 10000).toFixed(4)), Number((py / 10000).toFixed(4))]);
      }
      return [...ring, [...ring[0]]];
    });
  });
}
function summarizeModel(project, model, dictionary, byPath) {
  const layers = model.layers.map(({ id, name, color }) => ({ id, name, color }));
  const paths = model.regions.map((region) => {
    const geom = region.geom || geometry(project, region.geomRef);
    const layer = layers.find((l) => l.id === region.stack.at(-1)?.layerId);
    const record = {
      color: layer?.color || layers[0].color,
      d: geom
        .map((polygon) =>
          polygon.map((ring) => `M${ring.map((p) => p.join(',')).join('L')}Z`).join(''),
        )
        .join(''),
    };
    const key = JSON.stringify(record);
    if (!byPath.has(key)) {
      byPath.set(key, dictionary.length);
      dictionary.push(record);
    }
    return byPath.get(key);
  });
  const stack = [...model.regions].sort((a, b) => b.stack.length - a.stack.length)[0]?.stack || [];
  return {
    width: model.width,
    height: model.height,
    thickness: model.thickness,
    layers,
    regionCount: model.regions.length,
    revision: model.revision,
    paths,
    stack,
  };
}
const fixtures = [];
for (const [id, file, thumbnail] of sources) {
  const source = `site/examples/${file}.wafercad`;
  const bytes = await readFile(source),
    project = JSON.parse(bytes);
  const pathDictionary = [],
    byPath = new Map();
  const models = { project: summarizeModel(project, project.model, pathDictionary, byPath) };
  for (const node of project.snapshotBranches.nodes) {
    const ref = node.state.modelRef;
    if (!models[ref])
      models[ref] = summarizeModel(project, project.sharedModels[ref], pathDictionary, byPath);
  }
  fixtures.push({
    id,
    source,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    name: project.name,
    thumbnail: `../../../examples/thumbnails/${thumbnail}`,
    models,
    pathDictionary,
    recipe: project.processRecipe,
    drawMask: project.drawMask,
    section: project.section,
    layout: {
      elements: project.layout.elements.length,
      cells: Object.keys(project.layout.hierarchy || {}).length,
    },
    history: project.snapshotBranches.nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      branchId: n.branchId,
      label: n.operation.label,
      kind: n.operation.kind,
      modelRef: n.state.modelRef,
    })),
    branches: project.snapshotBranches.branches.map(
      ({ id: branchId, name, parentBranchId, headNodeId, headState }) => ({
        id: branchId,
        name,
        parentBranchId,
        headNodeId,
        recipe: headState.processRecipe,
        drawMask: headState.drawMask,
      }),
    ),
    cursor: project.snapshotBranches.cursorNodeId,
    activeBranch: project.snapshotBranches.activeBranchId,
    bookmarks: project.snapshots.map(({ id: bookmarkId, name, historyNodeId }) => ({
      id: bookmarkId,
      name,
      historyNodeId,
    })),
  });
}
const target = 'site/ui-v2/prototypes/a-full/source/prototype-data.json';
// Supplemental real GDS inventory only: no geometry parser or project import.
const fileSource = 'site/samples/klayout/gds-basic-instances.gds';
const fileBytes = await readFile(fileSource),
  cells = [],
  layers = new Set();
let cell,
  layer = null,
  datatype = 0;
for (let offset = 0; offset < fileBytes.length;) {
  const length = fileBytes.readUInt16BE(offset),
    kind = fileBytes[offset + 2];
  if (length < 4 || offset + length > fileBytes.length)
    throw new Error('Invalid source GDS inventory');
  const body = fileBytes.subarray(offset + 4, offset + length);
  const text = () => body.toString('ascii').replace(/\0+$/, '');
  if (kind === 6) {
    cell = { name: text(), references: [], shapeCount: 0, layers: [] };
    cells.push(cell);
  }
  if ([8, 9, 10, 11, 12, 21, 45].includes(kind)) {
    layer = null;
    datatype = 0;
    if ([8, 9, 12, 21, 45].includes(kind)) cell.shapeCount++;
  }
  if (kind === 18) cell.references.push(text());
  if (kind === 13) layer = body.readInt16BE(0);
  if ([14, 22, 46].includes(kind)) datatype = body.readInt16BE(0);
  if (kind === 17 && layer != null) {
    const key = `${layer}/${datatype}`;
    layers.add(key);
    if (!cell.layers.includes(key)) cell.layers.push(key);
  }
  offset += length;
}
const fileMask = {
  source: fileSource,
  sha256: createHash('sha256').update(fileBytes).digest('hex'),
  bytes: fileBytes.length,
  cells,
  layers: [...layers],
};
const result = `${JSON.stringify({ schema: 'wafercad-m15-presentation-only-v1', fixtures, fileMask })}\n`;
if (process.argv.includes('--write')) await writeFile(target, result);
else if ((await readFile(target, 'utf8')) !== result)
  throw new Error('M1.5 fixtures differ; regenerate explicitly with --write.');
console.log(
  JSON.stringify(
    fixtures.map((f) => ({
      id: f.id,
      layers: f.models.project.layers.length,
      regions: f.models.project.regionCount,
      recipe: f.recipe.steps.length,
      history: f.history.length,
      variants: f.branches.length,
      sourceHash: f.sha256,
    })),
    null,
    2,
  ),
);
