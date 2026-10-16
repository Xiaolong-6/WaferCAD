import { createModel } from '../model.js';
import { readProjectFile } from '../project-io.js';
import {
  CURRENT_PROJECT_VERSION,
  validateProjectFile,
  validateProjectFiles,
} from '../project-schema.js';
import { normalizeMaskRoi } from '../mask-roi-geometry.js';
import { normalizeRoi } from '../roi-editor.js';
import { normalizeSectionDetailRoi } from '../section-detail-roi.js';
import { normalizeSectionViewport } from '../section-view-viewport.js';
import { normalizeSectionZScales } from '../section-z-collapse.js';
import { XY_UNITS } from '../units.js';
import { STRUCTURE_PALETTES } from './layer-legend-controller.js';
import { equalStatePairs } from '../state-equality.js';
import { validateBondedAssemblyProject } from '../wafer-assembly.js';

export function createEmptyLayout() {
  return {
    name: 'No mask',
    root: '',
    elements: [],
    linework: [],
    bounds: { minX: -50, minY: -50, maxX: 50, maxY: 50, width: 100, height: 100 },
    combos: [],
    hierarchy: {},
    units: { xy: 'µm', dbuToMicron: 1, hasPhysicalUnits: true },
  };
}

export function createProjectStateController({
  ensureHierarchy,
  getState,
  applyState,
  getSnapshotRecords = () => [],
  getSnapshotBranchState = () => null,
  getWorkerSnapshotHistory = () => null,
  syncDisplayControls = () => {},
  setSectionEditEnabled,
  // This reader must validate the entire migrated project before returning it.
  // The app supplies the strict import worker; non-worker callers use project IO.
  readValidatedFile = readProjectFile,
  yieldHistoryAttestation = () => new Promise((resolve) => globalThis.setTimeout(resolve, 0)),
  enableAssemblyWorkspace = false,
}) {
  let importedStates = new WeakMap();
  let attestationGeneration = 0;

  // Assembly products must not be passed to the generic single-wafer editor.
  function assertEditableProject(project, { completeProject = false } = {}) {
    if (project?.waferAssembly == null) return;
    if (!enableAssemblyWorkspace) {
      throw new Error(
        'This bonded Assembly requires the multi-wafer editor. The source file was not modified.',
      );
    }
    if (completeProject) validateBondedAssemblyProject(project);
  }

  function importedSnapshotStateRefs(project) {
    if (!project) return [];
    return [
      ...(project.snapshots || []).map((record) => record.state),
      ...(project.snapshotBranches?.nodes || []).map((node) => node.state),
      ...(project.snapshotBranches?.branches || []).map((branch) => branch.headState),
    ].filter((state) => state && typeof state === 'object');
  }

  function cacheImportedSnapshotStates(project) {
    attestationGeneration++;
    importedStates = new WeakMap();
    if (!project) return project;
    const states = importedSnapshotStateRefs(project);
    // The synchronous API preserves its old single graph clone, including
    // sharing between states. Async startup imports use the bounded path below.
    const cloneStart = performance.now();
    const copies = structuredClone(states);
    performance.measure('wafercad:history:attestation-clone', {
      start: cloneStart,
      end: performance.now(),
      detail: { states: states.length },
    });
    for (let index = 0; index < states.length; index++) {
      importedStates.set(states[index], copies[index]);
    }
    return project;
  }

  async function cacheImportedSnapshotStatesAsync(project) {
    const generation = ++attestationGeneration;
    const staged = new WeakMap();
    if (!project) {
      importedStates = staged;
      return project;
    }
    const states = importedSnapshotStateRefs(project);
    // A snapshot can also be the HEAD of one or more branches or a process
    // node. Attesting it repeatedly wastes deep clones and GC, especially
    // when an identity recurs on opposite sides of a batch boundary.
    // Deduplicate by object identity only; distinct but equal states remain
    // independently copied and checked for later mutation.
    const uniqueStates = [...new Set(states)];
    const started = performance.now();
    let activeCloneMs = 0;
    // Clone adjacent unique states as one graph to preserve aliasing within
    // each batch. No staged attestation is published until every batch succeeds.
    const batchSize = 4;
    for (let start = 0; start < uniqueStates.length; start += batchSize) {
      if (generation !== attestationGeneration) {
        throw new DOMException('Superseded History attestation', 'AbortError');
      }
      const began = performance.now();
      const batch = structuredClone(uniqueStates.slice(start, start + batchSize));
      activeCloneMs += performance.now() - began;
      for (let index = 0; index < batch.length; index++) {
        staged.set(uniqueStates[start + index], batch[index]);
      }
      if (start + batchSize < uniqueStates.length) await yieldHistoryAttestation();
    }
    if (generation !== attestationGeneration) {
      throw new DOMException('Superseded History attestation', 'AbortError');
    }
    performance.measure('wafercad:history:attestation-clone', {
      start: started,
      end: performance.now(),
      detail: {
        states: states.length,
        uniqueStates: uniqueStates.length,
        reusedReferences: states.length - uniqueStates.length,
        batches: Math.ceil(uniqueStates.length / batchSize),
        activeCloneMs,
      },
    });
    importedStates = staged;
    return project;
  }

  async function readProjectSnapshot(file) {
    const project = await readValidatedFile(file);
    assertEditableProject(project, { completeProject: true });
    return cacheImportedSnapshotStatesAsync(project);
  }

  // Only call with project-worker.js output: that Worker already expanded,
  // migrated and strictly validated the project before posting its result.
  function readWorkerValidatedProjectSnapshot(project) {
    assertEditableProject(project, { completeProject: true });
    return cacheImportedSnapshotStates(project);
  }

  // Preferred in progressive startup: yield between private attestation
  // batches while retaining strict before/after snapshot equality checks.
  function readWorkerValidatedProjectSnapshotAsync(project) {
    assertEditableProject(project, { completeProject: true });
    return cacheImportedSnapshotStatesAsync(project);
  }

  function buildProjectSnapshot(
    includeSnapshots = false,
    { skipHistoryHeadSync = false, workerStorage = false } = {},
  ) {
    // Fail closed even if future workspace wiring exposes Assembly state before
    // this controller owns its source lineage and History transactions.
    const initialState = getState();
    assertEditableProject(initialState);
    // Assembly source layouts are immutable. Rebuilding their hierarchy before
    // verifying replay parity could mutate a corrupt bonded workspace on Save.
    if (initialState?.waferAssembly == null) ensureHierarchy();
    const state = getState();
    assertEditableProject(state);
    const project = {
      format: 'WaferCAD-vector',
      version: CURRENT_PROJECT_VERSION,
      model: state.model,
      layout: {
        name: state.layout.name,
        root: state.layout.root,
        elements: state.layout.elements,
        linework: state.layout.linework,
        bounds: state.layout.bounds,
        combos: state.layout.combos,
        hierarchy: state.layout.hierarchy,
        units: state.layout.units,
      },
      selectedLayerKeys: [...state.selectedLayerKeys],
      activeCell: state.activeCell,
      maskTransform: state.maskTransform,
      maskSourceMode: state.maskSourceMode,
      drawMask: state.drawMask,
      maskRoi: state.maskRoi,
      maskRoiAnchor: state.maskRoiAnchor,
      activeFace: state.activeFace,
      ...(state.processRecipe ? { processRecipe: structuredClone(state.processRecipe) } : {}),
      ...(state.waferAssembly != null
        ? { waferAssembly: structuredClone(state.waferAssembly) }
        : {}),
      roi: state.roi,
      roiAnchor: state.roiAnchor,
      section: state.section,
      planViews: state.planViews,
      display: {
        xyUnit: state.xyDisplayUnit,
        structurePalette: state.activeStructurePalette,
        customStructurePalette: state.customStructurePalette,
        maskOpacity: state.maskOpacity,
        threeOpacity: state.threeOpacity,
        threeShowBorders: state.threeShowBorders,
        threeFastMode: state.threeFastMode !== false,
        threeCamera: state.threeCamera,
        sectionScaleMode: state.sectionScaleMode,
        sectionViewport: normalizeSectionViewport(state.sectionViewport),
        sectionShowBorders: state.sectionShowBorders,
        sectionCollapse: state.sectionCollapse,
        sectionDetailRoi: state.sectionDetailRoi,
      },
    };

    if (includeSnapshots) {
      project.name = state.projectName;
      // Only the async autosave path can request borrowed History references.
      // It immediately posts this object to a Worker (a synchronous clone);
      // regular exports always remain independently cloned.
      const workerHistory =
        workerStorage && skipHistoryHeadSync ? getWorkerSnapshotHistory() : null;
      if (state.waferAssembly != null) {
        // Product History cannot contain generic full model snapshots. Preserve
        // the single Assembly/Variant History owner until the formal adapter exists.
        const records = workerHistory?.snapshots || getSnapshotRecords();
        const branches =
          workerHistory?.snapshotBranches ||
          getSnapshotBranchState({ skipSync: skipHistoryHeadSync });
        if (records.length || branches) {
          throw new Error('Bonded Assembly product History is not yet supported.');
        }
      } else if (workerHistory) {
        project.snapshots = workerHistory.snapshots;
        if (workerHistory.snapshotBranches) {
          project.snapshotBranches = workerHistory.snapshotBranches;
        }
      } else {
        project.snapshots = getSnapshotRecords();
        const snapshotBranches = getSnapshotBranchState({ skipSync: skipHistoryHeadSync });
        if (snapshotBranches) project.snapshotBranches = snapshotBranches;
      }
    }
    if (state.waferAssembly != null) validateBondedAssemblyProject(project);
    return project;
  }

  function loadProjectSnapshot(project) {
    assertEditableProject(project, { completeProject: true });
    setSectionEditEnabled(false);

    const model = project.model;
    if (model.processRevision == null) {
      model.processRevision = Math.max(0, (model.revision || 1) - 1);
    }

    const xyDisplayUnit = project.display?.xyUnit in XY_UNITS ? project.display.xyUnit : undefined,
      activeStructurePalette =
        project.display?.structurePalette && STRUCTURE_PALETTES[project.display.structurePalette]
          ? project.display.structurePalette
          : undefined,
      maskOpacity = Math.max(
        0,
        Math.min(
          1,
          project.display?.maskOpacity == null ? 0.65 : Number(project.display.maskOpacity),
        ),
      ),
      threeOpacity = Math.max(0.1, Math.min(1, Number(project.display?.threeOpacity) || 1)),
      threeShowBorders = Boolean(project.display?.threeShowBorders),
      threeCamera =
        project.display?.threeCamera && typeof project.display.threeCamera === 'object'
          ? structuredClone(project.display.threeCamera)
          : null,
      sectionScaleMode = ['auto', 'physical'].includes(project.display?.sectionScaleMode)
        ? project.display.sectionScaleMode
        : 'auto',
      sectionViewport = normalizeSectionViewport(project.display?.sectionViewport),
      sectionShowBorders = Boolean(project.display?.sectionShowBorders),
      sectionDetailRoi = normalizeSectionDetailRoi(project.display?.sectionDetailRoi),
      sectionCollapse =
        project.display?.sectionCollapse &&
        Number.isFinite(Number(project.display.sectionCollapse.top)) &&
        Number.isFinite(Number(project.display.sectionCollapse.bottom))
          ? {
              top: Number(project.display.sectionCollapse.top),
              bottom: Number(project.display.sectionCollapse.bottom),
              enabled: project.display.sectionCollapse.enabled !== false,
              ...normalizeSectionZScales(project.display.sectionCollapse),
            }
          : null;

    applyState({
      model,
      layout: project.layout,
      selectedLayerKeys: new Set(project.selectedLayerKeys),
      activeCell: project.activeCell || project.layout.root || null,
      expandedCells: new Set(
        project.activeCell || project.layout.root
          ? [project.layout.root || project.activeCell]
          : [],
      ),
      hoveredLayerKey: null,
      maskTransform: project.maskTransform,
      maskSourceMode: project.maskSourceMode || 'file',
      drawMask: structuredClone(project.drawMask || { nextShapeId: 1, shapes: [] }),
      maskRoi: project.maskRoi ? normalizeMaskRoi(project.maskRoi) : null,
      maskRoiAnchor: project.maskRoiAnchor || 'center',
      activeFace: project.activeFace,
      processRecipe:
        project.processRecipe && typeof project.processRecipe === 'object'
          ? structuredClone(project.processRecipe)
          : null,
      waferAssembly: project.waferAssembly ? structuredClone(project.waferAssembly) : null,
      roi: project.roi ? normalizeRoi(project.roi) : null,
      roiAnchor: project.roiAnchor || 'center',
      section: project.section,
      xyDisplayUnit,
      activeStructurePalette,
      customStructurePalette: Array.isArray(project.display?.customStructurePalette)
        ? project.display.customStructurePalette
        : null,
      maskOpacity,
      threeOpacity,
      threeShowBorders,
      threeFastMode: project.display?.threeFastMode !== false,
      threeCamera,
      sectionScaleMode,
      sectionViewport,
      sectionShowBorders,
      sectionDetailRoi,
      sectionCollapse,
      ...(project.name ? { projectName: project.name } : {}),
      planViews: project.planViews,
    });

    ensureHierarchy();
    syncDisplayControls();
  }

  function resetProjectState() {
    setSectionEditEnabled(false);
    const previous = getState(),
      model = createModel();
    applyState({
      model,
      layout: createEmptyLayout(),
      selectedLayerKeys: new Set(),
      activeCell: null,
      expandedCells: new Set(),
      hoveredLayerKey: null,
      maskTransform: previous.maskTransform,
      maskSourceMode: 'file',
      drawMask: { nextShapeId: 1, shapes: [] },
      maskRoi: null,
      maskRoiAnchor: 'center',
      activeFace: 'front',
      processRecipe: null,
      waferAssembly: null,
      roi: null,
      roiAnchor: 'center',
      section: { a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] },
      projectName: 'Untitled',
      sectionScaleMode: 'auto',
      sectionViewport: normalizeSectionViewport(),
      sectionShowBorders: previous.sectionShowBorders,
      sectionDetailRoi: null,
      sectionCollapse: null,
      xyDisplayUnit: previous.xyDisplayUnit,
      activeStructurePalette: previous.activeStructurePalette,
      customStructurePalette: previous.customStructurePalette,
      maskOpacity: previous.maskOpacity,
      threeOpacity: previous.threeOpacity,
      threeShowBorders: previous.threeShowBorders,
      threeFastMode: previous.threeFastMode !== false,
      threeCamera: null,
      planViews: {
        mask: { zoom: 1, panX: 0, panY: 0 },
        main: { zoom: 1, panX: 0, panY: 0 },
      },
    });
  }

  function isValidSnapshotState(state) {
    if (state?.waferAssembly != null) return false;
    try {
      validateProjectFile(state);
      return state.snapshots == null;
    } catch {
      return false;
    }
  }

  function isValidSnapshotStates(states) {
    if (states.some((state) => state?.waferAssembly != null)) return false;
    try {
      const uniqueStates = [...new Set(states)];
      const copies = uniqueStates.map((state) => {
        const copy = importedStates.get(state);
        importedStates.delete(state);
        return copy;
      });
      const matches = equalStatePairs(uniqueStates.map((state, index) => [state, copies[index]]));
      const remaining = uniqueStates.filter((state, index) => !copies[index] || !matches[index]);
      validateProjectFiles(remaining);
      return states.every((state) => state.snapshots == null);
    } catch {
      return false;
    }
  }

  return {
    readProjectSnapshot,
    readWorkerValidatedProjectSnapshot,
    readWorkerValidatedProjectSnapshotAsync,
    buildProjectSnapshot,
    loadProjectSnapshot,
    resetProjectState,
    isValidSnapshotState,
    isValidSnapshotStates,
  };
}
