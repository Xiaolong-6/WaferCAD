import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { flattenGDS, parseGDS } from '../site/gds.js';
import { loadGeometryKernel } from './process-benchmarks.mjs';

const ORIGINAL_SHA = '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02';
const ROOT = '2024-04-07_EITR2_1';
const DIE_NAMES = ['chip0', 'chip1', 'chip2', 'chip3'];
function inputArg(key) {
  const i = process.argv.indexOf(key);
  return i < 0 ? null : process.argv[i + 1];
}
function boundsOf(elements) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const e of elements)
    for (const [x, y] of e.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) throw Error('Invalid source coordinates.');
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
/** Use the actual four reticle SREFs, not synthesized or redrawn device masks. */
export function fullSourceLayout(parsed, choice = ROOT) {
  if (choice !== ROOT && !DIE_NAMES.includes(choice))
    throw Error('Specify an original root or chip0..chip3.');
  if (choice !== ROOT)
    return {
      ...flattenGDS(parsed, choice),
      name: `Original author sample.gds / ${choice}`,
      hierarchy: {},
    };
  const top = parsed.cells.get(ROOT);
  assert.ok(top, 'Missing original reticle top cell');
  const expected = top.elements.filter((e) => e.kind === 'sref' && DIE_NAMES.includes(e.name));
  assert.equal(expected.length, 4, 'Reticle must contain exactly four chip refs');
  const elements = [],
    linework = [];
  for (const e of top.elements.filter((e) => e.kind === 'sref')) {
    if (e.angle !== 0 || e.reflect || e.mag !== 1 || !e.xy?.every(Number.isFinite))
      throw Error('Reticle has unsupported non-translational SREF');
    const child = flattenGDS(parsed, e.name);
    const stamp = (a) =>
      a.map((x) => ({
        ...x,
        sourceCell: e.name + '/' + x.sourceCell,
        points: x.points.map(([px, py]) => [px + e.xy[0], py + e.xy[1]]),
      }));
    elements.push(...stamp(child.elements));
    linework.push(...stamp(child.linework));
  }
  const comboMap = new Map();
  for (const e of elements) {
    const key = `${e.sourceCell}|${e.layer}|${e.datatype}`;
    let c = comboMap.get(key);
    if (!c) {
      c = { key, cell: e.sourceCell, layer: e.layer, datatype: e.datatype, count: 0 };
      comboMap.set(key, c);
    }
    c.count++;
  }
  return {
    root: ROOT,
    name: 'Original author sample.gds / four-die reticle',
    elements,
    linework,
    bounds: boundsOf([...elements, ...linework]),
    combos: [...comboMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
    units: parsed.units,
    warnings: [],
    hierarchy: {},
  };
}

export async function constructSourceProject(bytes, { root = ROOT, maskOnly = false } = {}) {
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== ORIGINAL_SHA) throw Error('Original author GDS hash mismatch');
  const parsed = parseGDS(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const layout = fullSourceLayout(parsed, root);
  const { createModel, applyOperation } = await import('../site/model.js');
  const { validateProjectFile } = await import('../site/project-schema.js');
  const { prepareProjectForExport, expandProjectStorage } = await import('../site/project-io.js');
  const { width, height, minX, minY, maxX, maxY } = layout.bounds;
  if (!(width > 0 && height > 0)) throw Error('Source layout has no physical extent');
  const model = createModel({ shape: 'rect', width, height, thickness: 675 });
  model.layers[0].name = 'Si (100) — original source footprint';
  const stages = [
    { model: structuredClone(model), label: 'Original source GDS: starting Si wafer' },
  ];
  const maskPolygonCount = layout.elements.filter((e) => e.layer === 2 && e.datatype === 0).length;
  if (!maskOnly) {
    const nb = applyOperation(model, {
      type: 'add',
      name: 'Nb blanket',
      thickness: 0.2,
      face: 'front',
      growth: 'direct',
      area: model.boundary,
    });
    assert.ok(nb.changed, 'Nb deposition failed');
    stages.push({ model: structuredClone(model), label: '200 nm Nb blanket on Si' });
    if (root !== ROOT) {
      // Known source GDS 2/0 etch-mask interpretation remains explicitly provisional.
      // Use every author polygon; no shape is replaced with a hand-drawn substitute.
      const { unionGeometries } = await import('../site/vector-geometry.js');
      const polygons = layout.elements.filter((e) => e.layer === 2 && e.datatype === 0);
      const mask = unionGeometries(polygons.map((e) => [[[...e.points, e.points[0]]]]));
      const etch = applyOperation(model, {
        type: 'etch',
        name: '2/0 GDS Nb/Si etch — provisional polarity',
        etchProfile: 'directional',
        thickness: 0.25,
        face: 'front',
        area: mask,
      });
      assert.ok(etch.changed, etch.error || 'Nb/Si etch failed');
      stages.push({
        model: structuredClone(model),
        label: '250 nm directional etch — GDS 2/0 (provisional mask interpretation)',
      });
    }
  }
  const stageLabel = root === ROOT ? 'four-die reticle' : 'entire ' + root;
  const name = `Tuokkola 2025 — ${stageLabel} original-GDS ${maskOnly ? 'source Mask audit only' : root === ROOT ? 'mask + Nb baseline' : 'Nb/Si etched baseline'} (not Josephson-complete)`;
  const section =
    root === ROOT
      ? { a: [minX + width * 0.1, 0], b: [maxX - width * 0.1, 0] }
      : { a: [1200, 2513], b: [1600, 2513] };
  const state = {
    format: 'WaferCAD-vector',
    version: 14,
    name,
    // File Mask selection is GLOBAL layer|datatype, not sourceCell|layer|datatype.
    // Only the large-area 2/0 source mask is initially emphasized; other
    // independent EBL and alignment masks stay available for user selection.
    selectedLayerKeys: ['2|0'],
    activeCell: root,
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    maskSourceMode: 'file',
    drawMask: { nextShapeId: 1, shapes: [] },
    activeFace: 'front',
    roi: null,
    maskRoi: null,
    roiAnchor: 'center',
    maskRoiAnchor: 'center',
    section,
    planViews: { main: { zoom: 1, panX: 0, panY: 0 }, mask: { zoom: 1, panX: 0, panY: 0 } },
    display: {
      xyUnit: 'um',
      structurePalette: 'balanced',
      sectionScaleMode: 'auto',
      sectionShowBorders: true,
      threeShowBorders: true,
      threeOpacity: 1,
      maskOpacity: 0.8,
      sectionCollapse: { enabled: true, top: 337.45, bottom: -337.45 },
    },
  };
  const createdAt = '2026-10-30T00:00:00.000Z';
  const nodes = stages.map((step, i) => ({
    id: `original-${root}-step-${i}`,
    branchId: 'main',
    parentId: i ? `original-${root}-step-${i - 1}` : null,
    createdAt,
    processRevision: step.model.processRevision,
    operation: {
      kind: 'record',
      label: step.label + ' (source-backed geometry checkpoint)',
      geometryChanged: false,
      geometryCheckpoint: true,
    },
    state: { ...structuredClone(state), model: step.model, layout },
  }));
  const first = nodes[0].id,
    last = nodes.at(-1).id;
  const project = {
    ...state,
    model,
    layout,
    snapshots: [],
    snapshotBranches: {
      version: 3,
      activeBranchId: 'main',
      cursorNodeId: last,
      cursorSnapshotId: null,
      nodes,
      branches: [
        {
          id: 'main',
          name: 'Main',
          parentBranchId: null,
          rootNodeId: first,
          headNodeId: last,
          rootSnapshotId: null,
          headSnapshotId: null,
          createdAt,
          headState: { ...structuredClone(state), model, layout },
        },
      ],
    },
  };
  validateProjectFile(project);
  const packed = prepareProjectForExport(project).stored;
  expandProjectStorage(structuredClone(packed));
  const content = JSON.stringify(packed);
  const counts = new Map();
  for (const e of layout.elements) {
    const k = `${e.layer}/${e.datatype}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return {
    content,
    report: {
      sourceSha256: sha,
      sourceTopCell: ROOT,
      originalCells: parsed.cells.size,
      root,
      sourceRefs: parsed.cells.get(ROOT)?.elements.map((e) => ({ name: e.name, xy: e.xy })),
      polygons: layout.elements.length,
      paths: layout.linework.length,
      layerCounts: Object.fromEntries(counts),
      bounds: layout.bounds,
      modelRegionCount: model.regions.length,
      processRevision: model.processRevision,
      processCheckpoints: stages.map((x) => ({
        label: x.label,
        regions: x.model.regions.length,
        revision: x.model.processRevision,
      })),
      processedLayers: model.layers.map((l) => l.name),
      sourceMaskPolygonCount: maskPolygonCount,
      materialPatterned: !maskOnly && root !== ROOT,
      maskOnly,
      initiallySelectedMaskLayer: '2/0',
      scientificLimitations:
        'GDS 2/0 etch-mask polarity inferred; MMA/PMMA resist, Al shadow, lift-off, AlOx and Josephson electrical physics not modeled.',
      bytes: Buffer.byteLength(content),
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = inputArg('--input'),
    output = inputArg('--output'),
    root = inputArg('--root') || ROOT,
    report = inputArg('--report'),
    maskOnly = process.argv.includes('--mask-only');
  if (!input || !output)
    throw Error(
      'Use --input original sample.gds --output project.wafercad [--root chip2|2024-04-07_EITR2_1] [--report report.json]',
    );
  await loadGeometryKernel();
  const result = await constructSourceProject(await readFile(input), { root, maskOnly });
  await writeFile(
    output,
    output.endsWith('.gz')
      ? gzipSync(Buffer.from(result.content), { level: 9, mtime: 0 })
      : result.content,
  );
  if (report) await writeFile(report, JSON.stringify(result.report, null, 2) + '\n');
  console.log(JSON.stringify(result.report, null, 2));
}
