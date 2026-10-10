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
import { buildMetalensLocal, metaAtomPolygons } from './build-tio2-metalens-example.mjs';

const pitch = 0.375;
const families = ['circle', 'square', 'ring', 'bipolar-concentric-ring'];

export async function probeMetalensGrid(grid = 25, { publish = false } = {}) {
  if (publish && grid !== 80) throw new Error('Only the complete 80x80 example can be published.');
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
  const count = grid === 80 ? 4725 : Math.round((total * 4725) / 6400);
  const extent = grid * pitch;
  const gridCells = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const x = Number(((col + 0.5) * pitch - extent / 2).toFixed(4));
      const y = Number(((row + 0.5) * pitch - extent / 2).toFixed(4));
      gridCells.push({ row, col, x, y, d: Math.hypot(x, y) });
    }
  }
  const active = new Set(
    [...gridCells]
      .sort((a, b) => a.d - b.d || a.row - b.row || a.col - b.col)
      .slice(0, count)
      .map((x) => x.row * grid + x.col),
  );
  const histories = new Map();
  const apply = (leaf, op, area, allowUnchanged = false) => {
    // A blank background cell has no lithography opening and no Cr after
    // lift-off. Retain its unchanged stage while device templates do change.
    if (
      allowUnchanged &&
      (!area.length ||
        (op.type === 'etch' &&
          !leaf.regions.some((region) =>
            region.stack.some((segment) => op.etchTargetLayerIds.includes(segment.layerId)),
          )))
    ) {
      histories.get(leaf).push(structuredClone(leaf));
      return { changed: false };
    }
    const result =
      applyAdvancedProcessOperation(leaf, op, area, m, v) ??
      m.applyOperation(leaf, { ...op, area });
    assert.ok(!result?.error, result?.error);
    assert.equal(result?.changed, true, 'Kernel operation made no change');
    if (publish) histories.get(leaf).push(structuredClone(leaf));
    return result;
  };
  const makeLeaf = (family, scale) => {
    const leaf = m.createModel({ shape: 'rect', width: pitch, height: pitch, thickness: 2 });
    leaf.layers[0].name = 'Glass (2um illustration)';
    if (publish) {
      histories.set(leaf, [structuredClone(leaf)]);
      // Cleaning is metadata, just as in the four-unit source Recipe.
      leaf.revision++;
      leaf.processRevision++;
      histories.get(leaf).push(structuredClone(leaf));
    }
    const baseArea = leaf.boundary;
    apply(
      leaf,
      { type: 'add', name: 'ITO', face: 'front', growth: 'direct', thickness: 0.013 },
      baseArea,
    );
    if (!family && !publish) return leaf;
    apply(
      leaf,
      { type: 'add', name: 'TiO2', face: 'front', growth: 'direct', thickness: 1.5 },
      baseArea,
    );
    const resist = apply(
      leaf,
      { type: 'add', name: 'PMMA', face: 'front', growth: 'direct', thickness: 0.2 },
      baseArea,
    );
    const polygons = family ? metaAtomPolygons(family, 0, 0, scale) : [];
    const keep = v.unionGeometries(polygons.map((points) => [[[...points, points[0]]]]));
    const remove = v.difference(baseArea, keep);
    apply(
      leaf,
      {
        type: 'etch',
        face: 'front',
        thickness: 0.2,
        etchProfile: 'directional',
        etchTargetLayerIds: [resist.layerId],
      },
      keep,
      !family,
    );
    const cr = apply(
      leaf,
      { type: 'add', name: 'Cr', face: 'front', thickness: 0.03, growth: 'direct' },
      baseArea,
    );
    apply(
      leaf,
      { type: 'liftoff', sacrificialLayerId: resist.layerId, face: 'front', thickness: 0 },
      baseArea,
    );
    apply(
      leaf,
      {
        type: 'etch',
        etchProfile: 'directional',
        face: 'front',
        thickness: 1.5,
        etchTargetLayerIds: ['layer-2'],
      },
      remove,
    );
    apply(
      leaf,
      {
        type: 'etch',
        etchProfile: 'directional',
        face: 'front',
        thickness: 0.03,
        etchTargetLayerIds: [cr.layerId],
      },
      baseArea,
      !family,
    );
    validateProcessModel(leaf);
    const top = (x, y) =>
      leaf.regions
        .find((r) => v.pointInMulti([x, y], r.geom))
        ?.stack.map((segment) => segment.layerId);
    assert.ok(
      top(0, 0)?.includes('layer-2') === Boolean(family && family !== 'ring'),
      family + ': center topology inconsistent',
    );
    return leaf;
  };
  const definitions = new Map(),
    instances = [],
    maskSites = [];
  let siteIndex = 0;
  for (const cell of gridCells) {
    const id = cell.row * grid + cell.col;
    if (!active.has(id)) {
      instances.push({
        id: 'site-' + id,
        templateId: 'background',
        x: cell.x,
        y: cell.y,
        role: 'background',
      });
      continue;
    }
    const family = families[siteIndex % families.length];
    const scale = Number((0.76 + (Math.floor(siteIndex / 4) % 12) * 0.01).toFixed(2));
    const templateId = family + '-' + scale.toFixed(2);
    if (!definitions.has(templateId)) definitions.set(templateId, makeLeaf(family, scale));
    maskSites.push({ type: family, scale, x: cell.x, y: cell.y });
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
  const project = projectForBenchmark({
    model: root,
    section: { a: [-extent / 2 + pitch / 2, pitch / 2], b: [extent / 2 - pitch / 2, pitch / 2] },
  });
  project.name = 'TiO2 Metalens 4725-site GRID - ILLUSTRATIVE compiled Kernel templates';
  project.display.threeShowBorders = false;
  let gridGds = null;
  if (grid === 80) {
    const elements = maskSites.flatMap(({ type, scale, x, y }) =>
      metaAtomPolygons(type, x, y, scale).map((points) => ({
        kind: 'polygon',
        sourceCell: 'TIO2_GRID',
        layer: 1,
        datatype: 0,
        points,
      })),
    );
    project.layout = {
      ...project.layout,
      name: '80x80 GRID - ILLUSTRATIVE, not author GDS',
      root: 'TIO2_GRID',
      hierarchy: { TIO2_GRID: [] },
      elements,
      combos: [
        {
          key: 'TIO2_GRID|1|0',
          cell: 'TIO2_GRID',
          layer: 1,
          datatype: 0,
          count: elements.length,
        },
      ],
    };
    project.activeCell = 'TIO2_GRID';
    project.selectedLayerKeys = ['1|0'];
    project.maskSourceMode = 'file';
    const { serializeGDS } = await import('../site/layout-export.js');
    const { parseLayoutFile } = await import('../site/layout-io.js');
    gridGds = serializeGDS(elements, { cellName: 'TIO2_GRID' });
    const checked = await parseLayoutFile(
      gridGds.buffer.slice(gridGds.byteOffset, gridGds.byteOffset + gridGds.byteLength),
      'tio2-4725-compiled-grid-ILLUSTRATIVE.gds',
    );
    assert.equal(checked.layout.elements.length, elements.length, 'GRID mask GDS round-trip');
  }
  if (publish) {
    const { project: local } = await buildMetalensLocal();
    const stages = local.snapshotBranches.nodes.map((node, index) => ({
      ...root,
      nextRegionId: histories.get(first)[index].nextRegionId,
      nextLayerId: histories.get(first)[index].nextLayerId,
      nextImplantId: histories.get(first)[index].nextImplantId,
      nextElectricalRegionId: histories.get(first)[index].nextElectricalRegionId,
      revision: node.state.model.revision,
      processRevision: node.state.model.processRevision,
      layers: node.state.model.layers,
      array: {
        version: 1,
        templates: [...definitions].map(([id, leaf]) => ({
          id,
          model: histories.get(leaf)[index],
        })),
        instances,
      },
    }));
    for (const stage of stages) validateProcessModel(stage);
    const mapState = (state) => ({
      ...state,
      name: 'TiO2 metalens - 4725-site full array / source-derived process',
      model: stages[state.model.processRevision],
      layout: project.layout,
      section: project.section,
      display: project.display,
      activeCell: 'TIO2_GRID',
      processRecipe: {
        ...state.processRecipe,
        name: 'TiO2 full-array PMMA/Cr process (compiled template History)',
        base: {
          ...state.processRecipe.base,
          width: extent,
          height: extent,
          array: {
            kind: 'rect-grid',
            rows: grid,
            columns: grid,
            pitchX: pitch,
            pitchY: pitch,
            activeSites: count,
          },
        },
        steps: state.processRecipe.steps.map((step) => ({
          ...step,
          params: {
            ...step.params,
            ...(step.params.mask ? { mask: { ...step.params.mask, cell: 'TIO2_GRID' } } : {}),
          },
        })),
      },
    });
    Object.assign(project, mapState(local));
    project.snapshots = local.snapshots.map((bookmark) => ({
      ...bookmark,
      state: mapState(bookmark.state),
    }));
    project.snapshotBranches = {
      ...local.snapshotBranches,
      nodes: local.snapshotBranches.nodes.map((node) => ({
        ...node,
        state: mapState(node.state),
        operation: {
          ...node.operation,
          ...(node.operation.replay?.maskContext
            ? {
                replay: {
                  ...node.operation.replay,
                  maskContext: {
                    ...node.operation.replay.maskContext,
                    cell: 'TIO2_GRID',
                  },
                },
              }
            : {}),
        },
      })),
      branches: local.snapshotBranches.branches.map((branch) => ({
        ...branch,
        name: 'TiO2 metalens - full array',
        headState: mapState(branch.headState),
      })),
    };
  }
  validateProjectFile(project);
  const serializeStart = performance.now();
  const saved = serializeProject(project);
  const reopened = await readProjectFile({
    size: Buffer.byteLength(saved),
    text: async () => saved,
  });
  assert.equal(reopened.model.array.instances.length, total);
  assert.equal(reopened.model.array.instances.filter((x) => x.role === 'device').length, count);
  if (gridGds) {
    assert.equal(reopened.layout.elements.length, project.layout.elements.length);
    assert.deepEqual(reopened.selectedLayerKeys, ['1|0']);
  }
  const report = {
    status: 'PASS',
    provenance: 'GRID surrogate; distinct from golden-angle illustrative GDS and author optics',
    recipeReplay: 'Kernel compiled per unique local template; NOT full-array Run All',
    grid,
    pitchUm: pitch,
    activeSites: count,
    backgroundSites: total - count,
    templateCount: definitions.size,
    localKernelProcesses: definitions.size - 1,
    templateMs,
    validateMs,
    saveMs: elapsed(serializeStart),
    savedBytes: Buffer.byteLength(saved),
    ...(gridGds
      ? { maskGdsBytes: gridGds.byteLength, maskPolygons: project.layout.elements.length }
      : {}),
  };
  if (publish) {
    assert.equal(reopened.snapshotBranches.nodes.length, 10);
    assert.equal(reopened.snapshots.length, 6);
    assert.equal(reopened.processRecipe.steps.length, 9);
    await writeFile(
      new URL('../site/examples/tio2-metalens-full-array.wafercad', import.meta.url),
      saved,
    );
  }
  if (grid === 80) {
    const out = new URL('../test-results/metalens/', import.meta.url);
    await mkdir(out, { recursive: true });
    await writeFile(new URL('tio2-4725-grid-kernel-compiled-ILLUSTRATIVE.wafercad', out), saved);
    await writeFile(new URL('tio2-4725-grid-mask-ILLUSTRATIVE.gds', out), gridGds);
    await writeFile(new URL('grid-scale-report.json', out), JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

const selected = Number(process.argv.find((arg) => arg.startsWith('--grid='))?.slice(7) || 25);
probeMetalensGrid(selected, { publish: process.argv.includes('--write-example') })
  .then((result) => {
    console.log('METALENS_ARRAY_SCALE|' + JSON.stringify(result));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
