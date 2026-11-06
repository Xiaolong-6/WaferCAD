import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import {
  createTransmonCheckpointStore,
  transmonProcessFingerprint,
  transmonValueHash,
} from './transmon-process-checkpoints.mjs';

await loadGeometryKernel();
const api = await import('../site/model.js');
const v = await import('../site/vector-geometry.js');
const { isArrayModel } = await import('../site/model-array.js');
const { shouldTileMaterialModel, tileMaterialModel } =
  await import('../site/material-model-tiling.js');
const { applyArrayOperation } = await import('../site/model-array-process.js');
const {
  unionMaterialSweeps,
  intersection: intersectMaterial,
  materialGeometryArea,
} = await import('../site/material-process-boolean.js');
const { applyAdvancedProcessOperation } = await import('../site/advanced-process-operations.js');
const { readProjectFile, prepareProjectForWorkspaceStorage } =
  await import('../site/project-io.js');
const { validateProcessModel } = await import('../site/project-schema.js');
const { normalizeProcessRecipe, serializeProcessRecipe } =
  await import('../site/process-recipe.js');
const PAPER = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12238396/#Sec7';
const SOURCE = new URL(
  '../examples/projects/transmon-nature-communications-2025-candidate/chip2-full-source-mask-only.wafercad.gz',
  import.meta.url,
);

export async function buildTransmonProcess({
  roi = null,
  oxideThicknessUm = 0.002,
  mmaUndercutUm = 0.3,
  planetaryZeroDeg = 90,
  heightStepUm = 0.025,
  sidewalls = true,
  onStage = () => {},
  onWorkingSet = () => {},
  checkpointDirectory = null,
  restoreStage = null,
} = {}) {
  if (!(oxideThicknessUm > 0 && oxideThicknessUm < 0.01))
    throw new RangeError('Supply an explicit illustrative AlOx thickness below 10 nm.');
  if (!Number.isFinite(mmaUndercutUm) || mmaUndercutUm < 0 || mmaUndercutUm > 1)
    throw new RangeError('Assumed MMA lateral development must be within 0–1 µm.');
  if (!Number.isFinite(planetaryZeroDeg))
    throw new RangeError('Supply a finite assumed planetary-zero direction in the GDS frame.');
  const sourceBytes = await readFile(SOURCE);
  const sourceProjectSha256 = createHash('sha256').update(sourceBytes).digest('hex');
  if (sourceProjectSha256 !== '6c7fdad7537dbafa9417515e60c1e9b8a145257fbd6bc5ef0274eeb4626e5205')
    throw Error('Committed author-GDS source project hash mismatch.');
  const source = await readProjectFile(new Blob([gunzipSync(sourceBytes)]));
  if (source.layout.root !== 'chip2' || source.layout.elements.length !== 39487)
    throw Error('Unexpected complete author chip2 layout.');
  const model = roi
    ? api.createModel({ shape: 'rect', width: roi.width, height: roi.height, thickness: 675 })
    : structuredClone(source.model);
  model.layers[0].name = 'Si (100)';
  const center = roi ? [roi.x, roi.y] : [0, 0];
  const layout = roi
    ? {
        ...source.layout,
        elements: source.layout.elements.map((e) => ({
          ...e,
          points: e.points.map(([x, y]) => [x - center[0], y - center[1]]),
        })),
      }
    : source.layout;
  const mask = (keys) =>
    intersectMaterial(
      unionMaterialSweeps(
        layout.elements
          .filter((e) => keys.includes(`${e.layer}|${e.datatype}`))
          .map((e) => [[e.points]]),
      ),
      model.boundary,
    );
  const masks = new Map();
  const areaFor = (keys) => {
    const k = keys.join(',');
    if (!masks.has(k)) masks.set(k, mask(keys));
    return masks.get(k);
  };
  const name = `${roi ? 'Transmon Q2' : 'Transmon chip2'} — six-dose ${sidewalls ? 'material process' : 'horizontal-only scaffold'} (assumed undercut / AlOx)`;
  const checkpointStore = checkpointDirectory
    ? createTransmonCheckpointStore({
        directory: checkpointDirectory,
        sourceProjectSha256,
        options: {
          roi,
          oxideThicknessUm,
          mmaUndercutUm,
          planetaryZeroDeg,
          heightStepUm,
          sidewalls,
        },
        codeFingerprint: transmonProcessFingerprint(),
      })
    : null;
  const createdAt = checkpointStore?.createdAt || new Date().toISOString();
  const recipeSteps = [],
    nodes = [],
    reports = [];
  const state = {
    format: 'WaferCAD-vector',
    version: 14,
    name,
    selectedLayerKeys: ['2|0', '8|0', '8|1'],
    activeCell: layout.root,
    maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
    maskSourceMode: 'file',
    drawMask: { nextShapeId: 1, shapes: [] },
    activeFace: 'front',
    roi: null,
    maskRoi: null,
    roiAnchor: 'center',
    maskRoiAnchor: 'center',
    section: roi
      ? { a: [-5.5, -0.0128], b: [-4.5, -0.0128] }
      : { a: [1394.5, 2512.9872], b: [1395.5, 2512.9872] },
    planViews: { main: { zoom: 1, panX: 0, panY: 0 }, mask: { zoom: 1, panX: 0, panY: 0 } },
    display: {
      xyUnit: 'um',
      structurePalette: 'balanced',
      sectionScaleMode: 'auto',
      sectionShowBorders: true,
      threeShowBorders: true,
      threeOpacity: 1,
      maskOpacity: 0.8,
      sectionCollapse: { enabled: true, top: 337.3, bottom: -337.3 },
    },
  };
  function checkpoint(label, operation, receipt = {}) {
    const id = `transmon-process-${nodes.length}`;
    nodes.push({
      id,
      branchId: 'main',
      parentId: nodes.at(-1)?.id ?? null,
      createdAt,
      processRevision: model.processRevision,
      operation,
      state: {
        ...structuredClone(state),
        model:
          operation.geometryChanged === false && nodes.length
            ? {
                ...nodes.at(-1).state.model,
                revision: model.revision,
                processRevision: model.processRevision,
              }
            : structuredClone(model),
        layout,
      },
    });
    const stored = model.array ? model.array.templates.map((t) => t.model) : [model];
    const sum = (values) => {
      let value = 0,
        correction = 0;
      for (const n of values) {
        const term = n - correction,
          next = value + term;
        correction = next - value - term;
        value = next;
      }
      return value;
    };
    const xy = (part) => sum(part.regions.map((r) => materialGeometryArea(r.geom)));
    const templateArea = model.array
      ? new Map(model.array.templates.map((t) => [t.id, xy(t.model)]))
      : null;
    const report = {
      step: nodes.length - 1,
      label,
      revision: model.processRevision,
      regions: stored.reduce((n, part) => n + part.regions.length, 0),
      xyAreaUm2: model.array
        ? sum(model.array.instances.map((i) => templateArea.get(i.templateId)))
        : xy(model),
      ...(model.array
        ? { templates: model.array.templates.length, instances: model.array.instances.length }
        : {}),
      execution: receipt.execution || 'computed',
      ...(receipt.provenance ? { provenance: receipt.provenance } : {}),
    };
    reports.push(report);
    checkpointStore?.save({ index: nodes.length - 1, label, model, ...receipt });
    onStage(report, model);
  }
  function useRestoredModel(candidate) {
    validateProcessModel(candidate);
    if (
      candidate.width !== model.width ||
      candidate.height !== model.height ||
      JSON.stringify(candidate.boundary) !== JSON.stringify(model.boundary) ||
      candidate.processRevision !== model.processRevision + 1
    )
      throw Error('Restored Transmon checkpoint does not match the physical domain or stage.');
    for (const key of Object.keys(model)) delete model[key];
    Object.assign(model, candidate);
  }
  try {
    checkpoint('Starting Si wafer', {
      kind: 'record',
      label: 'Starting Si wafer',
      geometryChanged: false,
      geometryCheckpoint: true,
    });
    const materialId = (name) => {
      const layers = model.layers.filter((l) => l.name === name);
      if (layers.length !== 1) throw Error(`Ambiguous or missing material ${name}`);
      return layers[0].id;
    };
    function record(label, { process = 'clean', durationMin = 0, ambient = '', note = '' } = {}) {
      const params = { process, label, durationMin, ambient, note };
      const receipt = {
        index: nodes.length,
        label,
        inputHash: transmonValueHash(model),
        parametersHash: transmonValueHash(params),
      };
      const saved = checkpointStore?.restore(receipt);
      model.revision++;
      model.processRevision++;
      // Records must preserve the whole physical state. Matching the exact
      // expected model is stronger than revalidating unchanged geometry.
      if (saved && transmonValueHash(saved.model) !== transmonValueHash(model))
        throw Error('A recorded Transmon checkpoint changed the physical model.');
      recipeSteps.push({ command: 'record', params });
      checkpoint(
        label,
        {
          kind: 'record',
          label,
          processType: process,
          durationMin,
          ambient,
          note,
          geometryChanged: false,
          replay: { version: 1, kind: 'record' },
        },
        {
          inputHash: receipt.inputHash,
          parametersHash: receipt.parametersHash,
          execution: saved ? 'checkpoint' : 'computed',
          provenance: saved?.provenance,
        },
      );
    }
    function execute(label, command, p, keys = null) {
      const captured = keys
        ? {
            sourceMode: 'file',
            cell: layout.root,
            layerKeys: keys,
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
            roi: null,
          }
        : null;
      const area = keys ? areaFor(keys) : model.boundary;
      const params = { face: 'front', area };
      if (command === 'deposit')
        Object.assign(params, {
          type: 'add',
          growth: p.coverage || 'direct',
          name: p.material,
          thickness: p.thicknessUm,
          ...(p.surfaceMaterial ? { surfaceLayerId: materialId(p.surfaceMaterial) } : {}),
          ...(p.materialGeometry
            ? {
                incidence: {
                  tiltDeg: p.tiltDeg ?? 0,
                  azimuthDeg: p.azimuthDeg ?? 0,
                  materialGeometry: true,
                  sidewalls,
                  heightStepUm,
                },
              }
            : {}),
        });
      else if (command === 'etch')
        Object.assign(params, {
          type: 'etch',
          etchProfile: p.profile || 'directional',
          thickness: p.thicknessUm,
          etchTargetLayerIds: p.target ? [materialId(p.target)] : [],
          ...(p.profile === 'develop' ? { developLateralUm: p.developLateralUm ?? 0 } : {}),
        });
      else if (command === 'liftoff')
        Object.assign(params, {
          type: 'liftoff',
          sacrificialLayerId: materialId(p.sacrificial),
          sacrificialLayerIds: [p.sacrificial, ...(p.additionalSacrificial || [])].map(materialId),
        });
      const apply = (candidate, p) =>
        applyAdvancedProcessOperation(candidate, p, p.area, api, v) ??
        api.applyOperation(candidate, p);
      const receipt = {
        index: nodes.length,
        label,
        inputHash: transmonValueHash(model),
        parametersHash: transmonValueHash(params),
      };
      let saved = checkpointStore?.restore(receipt),
        execution = saved ? 'checkpoint' : 'computed';
      if (!saved && restoreStage) {
        saved = restoreStage({ ...receipt, sourceProjectSha256, command, params });
        if (saved) {
          if (
            saved.inputHash !== receipt.inputHash ||
            saved.parametersHash !== receipt.parametersHash ||
            saved.sourceProjectSha256 !== sourceProjectSha256 ||
            !saved.provenance
          )
            throw Error('Imported Transmon stage lacks matching input/parameter provenance.');
          execution = 'restored-local-model';
        }
      }
      let outcome;
      if (saved) {
        useRestoredModel(saved.model);
        outcome = saved.outcome;
      } else {
        if (params.incidence?.materialGeometry && shouldTileMaterialModel(model))
          Object.assign(model, tileMaterialModel(model));
        outcome =
          isArrayModel(model) && !(params.type === 'liftoff' && params.sacrificialLayerIds)
            ? applyArrayOperation(model, params, apply, {
                onWorkingSet: (s) => onWorkingSet({ label, ...s }),
                validateWorkingSet: validateProcessModel,
                ...(checkpointStore
                  ? {
                      restoreWorkingSet: (entry) =>
                        checkpointStore.restoreWorkingSet({
                          stage: receipt.index,
                          key: transmonValueHash(entry),
                        }),
                      saveWorkingSet: (entry, value) =>
                        checkpointStore.saveWorkingSet({
                          stage: receipt.index,
                          key: transmonValueHash(entry),
                          value,
                        }),
                    }
                  : {}),
              })
            : apply(model, params);
      }
      if (!outcome.changed) throw Error(`${label}: ${outcome.error || 'No material changed.'}`);
      if (!saved) validateProcessModel(model);
      recipeSteps.push({
        command,
        params: {
          ...p,
          face: 'front',
          area: keys ? 'mask' : 'full',
          ...(captured ? { mask: captured } : {}),
          ...(p.materialGeometry ? { heightStepUm, sidewalls } : {}),
        },
      });
      const { area: _area, ...replayParams } = params;
      checkpoint(
        label,
        {
          kind: params.type,
          label,
          geometryChanged: true,
          resultLayerId: outcome.layerId || null,
          replay: {
            version: 1,
            params: replayParams,
            areaMode: keys ? 'mask' : 'full',
            maskContext: captured,
          },
        },
        {
          inputHash: receipt.inputHash,
          parametersHash: receipt.parametersHash,
          outcome,
          execution,
          provenance: saved?.provenance,
        },
      );
    }
    record('RCA / dilute-HF pre-clean and vacuum bake', {
      note: `Source: ${PAPER}; no calibrated chemical removal geometry.`,
    });
    execute('Sputter Nb 200 nm', 'deposit', { material: 'Nb', thicknessUm: 0.2 });
    execute('Coat AZ 5214E 1.4 µm', 'deposit', { material: 'AZ 5214E', thicknessUm: 1.4 });
    record('Expose AZ 5214E 130 mJ/cm²', {
      process: 'custom',
      note: '405 nm maskless lithography. GDS 2/0 etch-opening assignment remains an explicit hypothesis.',
    });
    execute(
      'Develop AZ 5214E through original GDS 2/0',
      'etch',
      { target: 'AZ 5214E', profile: 'develop', thicknessUm: 1.4 },
      ['2|0'],
    );
    execute('CF4 Nb/Si etch 250 nm', 'etch', { thicknessUm: 0.25 }, ['2|0']);
    execute('Strip AZ 5214E', 'etch', { target: 'AZ 5214E', profile: 'develop', thicknessUm: 1.4 });
    record('HF clean before electron-beam resist', {
      durationMin: 10,
      ambient: '0.5% HF; DIW rinse 5 min',
      note: 'Surface oxide removal is recorded without inventing an oxide thickness.',
    });
    execute('Coat MMA EL11 500 nm', 'deposit', { material: 'MMA', thicknessUm: 0.5 });
    execute('Coat PMMA 950 A4 400 nm', 'deposit', { material: 'PMMA', thicknessUm: 0.4 });
    record('100 kV EBL: main exposure and lower-dose undercut', {
      process: 'custom',
      note: `Paper doses: 1000 / 400 µC/cm². Assumed mapping: PMMA 8/1; MMA 8/0 union 8/1. Additional MMA lateral development ${mmaUndercutUm} µm is a configurable, unmeasured assumption. Planetary zero is assumed at GDS azimuth ${planetaryZeroDeg}°: phi=0/180 follows the original Y-directed connecting-lead openings. Surface-following coats; no spin/developer kinetics.`,
    });
    execute(
      'Develop upper PMMA opening',
      'etch',
      { target: 'PMMA', profile: 'develop', thicknessUm: 0.4 },
      ['8|1'],
    );
    execute(
      'Develop lower MMA opening / undercut',
      'etch',
      { target: 'MMA', profile: 'develop', thicknessUm: 0.5, developLateralUm: mmaUndercutUm },
      ['8|0', '8|1'],
    );
    record('Pump, ozone ash, Ti getter before Al', {
      durationMin: 1,
      ambient: 'Ozone 10 mbar; base pressure <5e-8 mbar',
      note: 'Pre-evaporation cleaning/gettering; no calibrated geometry change.',
    });
    execute('Al1 junction bottom: 40 nm, 45° / −45°', 'deposit', {
      material: 'Al1',
      thicknessUm: 0.04,
      materialGeometry: true,
      tiltDeg: 45,
      azimuthDeg: planetaryZeroDeg - 45,
    });
    record('Static junction oxidation: 1.2 mbar, 5 min', {
      process: 'oxidation',
      durationMin: 5,
      ambient: 'O2 1.2 mbar',
      note: `AlOx thickness ${oxideThicknessUm} µm is an illustrative geometric assumption, not measured in the paper; no oxidation kinetics or Josephson transport.`,
    });
    // The barrier is placed on ray-visible Al1 using the same canonical solids;
    // no oxide is added to buried Si/Nb or silently inferred from pressure/time.
    execute('AlOx geometric barrier — assumed thickness', 'deposit', {
      material: 'AlOx (illustrative thickness)',
      thicknessUm: oxideThicknessUm,
      surfaceMaterial: 'Al1',
    });
    for (const [material, nm, angle] of [
      ['Al2', 30, 45],
      ['Al3', 30, -135],
    ])
      execute(`${material} junction top: ${nm} nm, 45° / ${angle}°`, 'deposit', {
        material,
        thicknessUm: nm / 1000,
        materialGeometry: true,
        tiltDeg: 45,
        azimuthDeg: planetaryZeroDeg + angle,
      });
    record('Ar milling for Nb contact at 45° / ±90°', {
      durationMin: 4,
      ambient: 'Ar 10 sccm, 400 V beam, 60 mA, 80 V acceleration',
      note: 'Two 2 min exposures. Oxide-removal depth is not reported; no arbitrary Nb or Al removal is applied.',
    });
    for (const [material, nm, angle] of [
      ['Al4 contact', 30, 180],
      ['Al5 contact', 60, 0],
      ['Al6 contact', 60, 180],
    ])
      execute(`${material}: ${nm} nm, 45° / ${angle}°`, 'deposit', {
        material,
        thicknessUm: nm / 1000,
        materialGeometry: true,
        tiltDeg: 45,
        azimuthDeg: planetaryZeroDeg + angle,
      });
    record('Protective final oxidation: 20 mbar, 10 min', {
      process: 'oxidation',
      durationMin: 10,
      ambient: 'O2 20 mbar',
      note: 'Unreported oxide thickness remains a process record.',
    });
    record('Protective resist and pre-dicing', {
      process: 'custom',
      note: 'Source-paper two-thirds-depth pre-dicing; street coordinates/protective thickness are unspecified and are not invented.',
    });
    execute('Remover PG bilayer lift-off', 'liftoff', {
      sacrificial: 'MMA',
      additionalSacrificial: ['PMMA'],
    });
    record('HMDS / final anneal', {
      process: 'anneal',
      durationMin: 20,
      ambient: 'HMDS, vacuum / nitrogen',
      note: '150 °C. No calibrated monolayer or annealing geometry.',
    });
    const finalMaterialVolumeUm3 = Object.fromEntries(model.layers.map((l) => [l.name, 0]));
    const layerNames = new Map(model.layers.map((l) => [l.id, l.name]));
    const copies = new Map();
    if (model.array)
      for (const instance of model.array.instances)
        copies.set(instance.templateId, (copies.get(instance.templateId) || 0) + 1);
    const parts = model.array
      ? model.array.templates.map((t) => [t.model, copies.get(t.id) || 0])
      : [[model, 1]];
    const correction = new Map();
    for (const [part, count] of parts) {
      if (!count) continue;
      for (const region of part.regions) {
        const area = materialGeometryArea(region.geom);
        for (const segment of region.stack) {
          const name = layerNames.get(segment.layerId);
          const term = count * area * (segment.z1 - segment.z0) - (correction.get(name) || 0);
          const previous = finalMaterialVolumeUm3[name];
          const next = previous + term;
          correction.set(name, next - previous - term);
          finalMaterialVolumeUm3[name] = next;
        }
      }
    }
    for (const name of ['Al1', 'Al2', 'Al3', 'Al4 contact', 'Al5 contact', 'Al6 contact'])
      if (!(finalMaterialVolumeUm3[name] > 0))
        throw Error(`Incomplete device: ${name} has no retained material after lift-off.`);
    for (const name of ['AZ 5214E', 'MMA', 'PMMA'])
      if (finalMaterialVolumeUm3[name] !== 0)
        throw Error(`Incomplete device: sacrificial ${name} remains after lift-off.`);
    const recipe = normalizeProcessRecipe({
      version: 1,
      name: 'Full-chip Transmon fabrication',
      steps: recipeSteps,
    });
    for (const node of nodes) node.state.processRecipe = recipe;
    const project = {
      ...state,
      model,
      layout,
      processRecipe: recipe,
      snapshots: [],
      snapshotBranches: {
        version: 3,
        activeBranchId: 'main',
        cursorNodeId: nodes.at(-1).id,
        cursorSnapshotId: null,
        nodes,
        branches: [
          {
            id: 'main',
            name: 'Main',
            parentBranchId: null,
            rootNodeId: nodes[0].id,
            headNodeId: nodes.at(-1).id,
            rootSnapshotId: null,
            headSnapshotId: null,
            createdAt,
            headState: { ...structuredClone(state), model, layout, processRecipe: recipe },
          },
        ],
      },
    };
    // Validate the entire project and preserve the fine material coordinates
    // of every history state in native lossless storage.
    const content = JSON.stringify(prepareProjectForWorkspaceStorage(project));
    return {
      project,
      content,
      recipeSource: serializeProcessRecipe(recipe),
      report: {
        checkpointCodeFingerprint: checkpointStore?.codeFingerprint || null,
        paper: PAPER,
        sourceLayout: 'chip2 / 39487 original author polygons',
        sourceProjectSha256,
        originalAuthorGdsSha256: '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02',
        roi,
        oxideThicknessUm,
        oxideThicknessStatus: 'illustrative, not measured',
        mmaUndercutUm,
        mmaUndercutStatus: 'assumed lateral development, not measured',
        planetaryZeroDeg,
        planetaryZeroStatus: 'assumed GDS alignment from Y-directed connecting-lead openings',
        heightStepUm,
        sidewalls,
        finalMaterialVolumeUm3,
        status: sidewalls ? 'requires physical acceptance' : 'incomplete: sidewall growth omitted',
        stages: reports,
        limitations: [
          'GDS layer-to-process mapping is assumed',
          'Paper planetary angles are offset into the GDS frame by an explicit assumed zero direction',
          'Surface-following resist coating, no spin or developer kinetics',
          'MMA lateral development is an explicit adjustable hypothesis; circular fronts have at most 0.5 nm polygonal arc sag',
          'Sidewall visibility is conservative Z-sliced; no in-dose kinetics',
          ...(sidewalls
            ? []
            : ['Horizontal-only scaffold is not a complete physical device model']),
          'Oxide chemistry, ion-milling removal and Josephson transport are not calibrated',
          'Illustrative AlOx covers exposed horizontal Al1 only; wall and underside oxidation are not represented',
        ],
      },
    };
  } finally {
    checkpointStore?.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2),
    arg = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
  const output = resolve(arg('--output', 'output/transmon/chip2-full-process.wafercad'));
  const roi = args.includes('--q2') ? { x: 1400, y: 2513, width: 40, height: 40 } : null;
  const result = await buildTransmonProcess({
    roi,
    oxideThicknessUm: Number(arg('--oxide-thickness-nm', '2')) / 1000,
    mmaUndercutUm: Number(arg('--mma-undercut-nm', '300')) / 1000,
    planetaryZeroDeg: Number(arg('--planetary-zero-deg', '90')),
    heightStepUm: Number(arg('--height-step-um', '0.025')),
    sidewalls: !args.includes('--horizontal-only'),
    checkpointDirectory: args.includes('--no-checkpoints')
      ? null
      : arg('--checkpoint-dir', `${output}.checkpoints`),
    onStage: (s) => console.log(JSON.stringify(s)),
    onWorkingSet: (s) => {
      if (s.workingSet % 40 === 1) console.log(JSON.stringify(s));
    },
  });
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, output.endsWith('.gz') ? gzipSync(result.content) : result.content);
  await writeFile(`${output}.recipe.js`, result.recipeSource);
  await writeFile(`${output}.report.json`, JSON.stringify(result.report, null, 2));
  console.log(`Saved ${output}`);
}
