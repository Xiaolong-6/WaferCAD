/**
 * Experimental, array-compatible 4725-site Metalens scale probe.
 * Uses 80x80 complete physical cell coverage, including 1675 background
 * cells; per-family/quantized-size template is replayed through the Kernel.
 * This is NOT an interactive full-array Recipe Run All or original author GDS.
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadGeometryKernel, projectForBenchmark } from './process-benchmarks.mjs';
import { metaAtomPolygons } from './build-tio2-metalens-example.mjs';

const pitch = 0.375;
const families = ['circle', 'square', 'ring', 'bipolar-concentric-ring'];

export async function probeMetalensGrid(grid = 25) {
  if (![8, 25, 80].includes(grid)) throw new Error('Supported probe sizes: 8, 25, 80');
  await loadGeometryKernel();
  const m = await import('../site/model.js');
  const v = await import('../site/vector-geometry.js');
  const { applyAdvancedProcessOperation } = await import('../site/advanced-process-operations.js');
  const { ARRAY_MODEL_KERNEL } = await import('../site/model-array.js');
  const { validateProcessModel, validateProjectFile } = await import('../site/project-schema.js');
  const { serializeProject, readProjectFile } = await import('../site/project-io.js');

  const elapsed = (start) => Math.round(performance.now() - start);
  const beginning = performance.now();
  const total = grid * grid;
  const count = grid === 80 ? 4725 : Math.round(total * 4725 / 6400);
  const extent = grid * pitch;
  const gridCells = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const x = Number(((col + 0.5) * pitch - extent / 2).toFixed(4));
      const y = Number(((row + 0.5) * pitch - extent / 2).toFixed(4));
      gridCells.push({ row, col, x, y, d: Math.hypot(x, y) });
    }
  }
  const active = new Set([...gridCells]
    .sort((a, b) => a.d - b.d || a.row - b.row || a.col - b.col)
    .slice(0, count).map((x) => x.row * grid + x.col));
  const stamp = [];
  const apply = (leaf, op, area) => {
    const result = applyAdvancedProcessOperation(leaf, op, area, m, v) ??
      m.applyOperation(leaf, { ...op, area });
    assert.equal(result?.changed, true, result?.error || 'Kernel operation made no change');
    return result;
  };
  const makeLeaf = (family, scale) => {
    const leaf = m.createModel({ shape: 'rect', width: pitch, height: pitch, thickness: 2 });
    leaf.layers[0].name = 'Glass (2um illustration)';
    const baseArea = leaf.boundary;
    apply(leaf, { type: 'add', name: 'ITO', face: 'front', growth: 'direct', thickness: 0.013 }, baseArea);
    if (!family) return leaf;
    apply(leaf, { type: 'add', name: 'TiO2', face: 'front', growth: 'direct', thickness: 1.5 }, baseArea);
    const resist = apply(leaf, { type: 'add', name: 'PMMA', face: 'front', growth: 'direct', thickness: 0.2 }, baseArea);
    const polygons = metaAtomPolygons(family, 0, 0, scale);
    const keep = v.unionGeometries(polygons.map((points) => [[[...points, points[0]]]]));
    const remove = v.difference(baseArea, keep);
    apply(leaf, { type: 'etch', face: 'front', thickness: 0.2, etchProfile: 'directional',
      etchTargetLayerIds: [resist.layerId] }, keep);
    const cr = apply(leaf, { type: 'add', name: 'Cr', face: 'front', thickness: 0.03, growth: 'direct' }, baseArea);
    apply(leaf, { type: 'liftoff', sacrificialLayerId: resist.layerId, face: 'front',
      thickness: 0 }, baseArea);
    apply(leaf, { type: 'etch', etchProfile: 'directional', face: 'front', thickness: 1.5,
      etchTargetLayerIds: ['layer-2'] }, remove);
    apply(leaf, { type: 'etch', etchProfile: 'directional', face: 'front', thickness: 0.03,
      etchTargetLayerIds: [cr.layerId] }, baseArea);
    validateProcessModel(leaf);
    const top = (x, y) => leaf.regions.find((r) => v.pointInMulti([x, y], r.geom))?.stack
      .map((segment) => segment.layerId);
    assert.ok(top(0, 0)?.includes('layer-2') ===
      (family !== 'ring'), family + ': center topology inconsistent');
    return leaf;
  };
  const definitions = new Map(), instances = [];
  let siteIndex = 0;
  for (const cell of gridCells) {
    const id = cell.row * grid + cell.col;
    if (!active.has(id)) {
      instances.push({ id: 'site-' + id, templateId: 'background', x: cell.x, y: cell.y,
        role: 'background' });
      continue;
    }
    const family = families[siteIndex % families.length];
    const scale = Number((0.76 + Math.floor(siteIndex / 4) % 12 * 0.01).toFixed(2));
    const templateId = family + '-' + scale.toFixed(2);
    if (!definitions.has(templateId)) definitions.set(templateId, makeLeaf(family, scale));
    instances.push({ id: 'site-' + id, templateId, x: cell.x, y: cell.y, role: 'device' });
    siteIndex++;
  }
  const background = makeLeaf(null, 1);
  const first = definitions.values().next().value;
  assert.ok(first, 'no active site');
  definitions.set('background', background);
  const templateMs = elapsed(beginning);
  const root = {
    ...structuredClone(first),
    kernel: ARRAY_MODEL_KERNEL,
    shape: 'rect',
    width: extent,
    height: extent,
    boundary: v.rectMulti(extent, extent),
    regions: [],
    array: {
      version: 1,
      templates: [...definitions].map(([id, model]) => ({ id, model })),
      instances,
    },
  };
  const validateStart = performance.now();
  validateProcessModel(root);
  const validateMs = elapsed(validateStart);
  const project = projectForBenchmark({ model: root,
    section: { a: [-extent / 2 + pitch / 2, pitch / 2],
      b: [extent / 2 - pitch / 2, pitch / 2] } });
  project.name = 'TiO2 Metalens 4725-site GRID - ILLUSTRATIVE compiled Kernel templates';
  project.display.threeShowBorders = false;
  validateProjectFile(project);
  const serializeStart = performance.now();
  const saved = serializeProject(project);
  const reopened = await readProjectFile({
    size: Buffer.byteLength(saved),
    text: async () => saved,
  });
  assert.equal(reopened.model.array.instances.length, total);
  assert.equal(reopened.model.array.instances.filter((x) => x.role === 'device').length, count);
  const report = {
    status: 'PASS',
    provenance: 'GRID surrogate; distinct from golden-angle illustrative GDS and author optics',
    recipeReplay: 'Kernel compiled per unique local template; NOT full-array Run All',
    grid, pitchUm: pitch, activeSites: count, backgroundSites: total - count,
    templateCount: definitions.size, localKernelProcesses: definitions.size - 1,
    templateMs, validateMs, saveMs: elapsed(serializeStart),
    savedBytes: Buffer.byteLength(saved),
  };
  if (grid === 80) {
    const out = new URL('../test-results/metalens/', import.meta.url);
    await mkdir(out, { recursive: true });
    await writeFile(new URL('tio2-4725-grid-kernel-compiled-ILLUSTRATIVE.wafercad', out), saved);
    await writeFile(new URL('grid-scale-report.json', out), JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

const selected = Number(process.argv.find((arg) => arg.startsWith('--grid='))?.slice(7) || 25);
probeMetalensGrid(selected).then((result) => {
  console.log('METALENS_ARRAY_SCALE|' + JSON.stringify(result));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
