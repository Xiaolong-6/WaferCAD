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
import { normalizeSectionZScales } from '../section-z-collapse.js';
import { XY_UNITS } from '../units.js';
import { STRUCTURE_PALETTES } from './layer-legend-controller.js';

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

// Exact comparison with a private copy, including non-finite values and missing
// keys. JSON fingerprints would conflate NaN/null and undefined/missing values.
function unchangedState(left, right) {
  const pending = [[left, right]];
  while (pending.length) {
    const [a, b] = pending.pop();
    if (Object.is(a, b)) continue;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && a.length !== b.length) return false;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (const key of keys) {
      if (!Object.hasOwn(b, key)) return false;
      pending.push([a[key], b[key]]);
    }
  }
  return true;
}

export function createProjectStateController({
  ensureHierarchy,
  getState,
  applyState,
  getSnapshotRecords = () => [],
  getSnapshotBranchState = () => null,
  syncDisplayControls = () => {},
  setSectionEditEnabled,
  // This reader must validate the entire migrated project before returning it.
  // The app supplies the strict import worker; non-worker callers use project IO.
  readValidatedFile = readProjectFile,
}) {
  let importedStates = new WeakMap();

  async function readProjectSnapshot(file) {
    importedStates = new WeakMap();
    const project = await readValidatedFile(file);
    if (!project) return project;
    const states = [
      ...(project.snapshots || []).map((record) => record.state),
      ...(project.snapshotBranches?.nodes || []).map((node) => node.state),
      ...(project.snapshotBranches?.branches || []).map((branch) => branch.headState),
    ].filter((state) => state && typeof state === 'object');
    const copies = structuredClone(states);
    for (let index = 0; index < states.length; index++) {
      importedStates.set(states[index], copies[index]);
    }
    return project;
  }

  function buildProjectSnapshot(includeSnapshots = false) {
    ensureHierarchy();
    const state = getState();
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
        sectionShowBorders: state.sectionShowBorders,
        sectionCollapse: state.sectionCollapse,
        sectionDetailRoi: state.sectionDetailRoi,
      },
    };

    if (includeSnapshots) {
      project.name = state.projectName;
      project.snapshots = getSnapshotRecords();
      const snapshotBranches = getSnapshotBranchState();
      if (snapshotBranches) project.snapshotBranches = snapshotBranches;
    }
    return project;
  }

  function loadProjectSnapshot(project) {
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
      roi: null,
      roiAnchor: 'center',
      section: { a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] },
      projectName: 'Untitled',
      sectionScaleMode: 'auto',
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
    try {
      validateProjectFile(state);
      return state.snapshots == null;
    } catch {
      return false;
    }
  }

  function isValidSnapshotStates(states) {
    try {
      const remaining = [...new Set(states)].filter((state) => {
        const validatedCopy = importedStates.get(state);
        importedStates.delete(state);
        return !validatedCopy || !unchangedState(state, validatedCopy);
      });
      validateProjectFiles(remaining);
      return states.every((state) => state.snapshots == null);
    } catch {
      return false;
    }
  }

  return {
    readProjectSnapshot,
    buildProjectSnapshot,
    loadProjectSnapshot,
    resetProjectState,
    isValidSnapshotState,
    isValidSnapshotStates,
  };
}
