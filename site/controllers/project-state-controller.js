import { CURRENT_PROJECT_VERSION, validateProjectFile } from '../project-schema.js';
import { normalizeRoi } from '../roi-editor.js';
import { XY_UNITS } from '../units.js';
import { STRUCTURE_PALETTES } from './layer-legend-controller.js';

export function createProjectStateController({
  ensureHierarchy,
  getState,
  applyState,
  getSnapshotRecords = () => [],
  syncThreeControls,
  setSectionEditEnabled,
}) {
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
      activeFace: state.activeFace,
      roi: state.roi,
      roiAnchor: state.roiAnchor,
      section: state.section,
      planViews: state.planViews,
      display: {
        xyUnit: state.xyDisplayUnit,
        structurePalette: state.activeStructurePalette,
        customStructurePalette: state.customStructurePalette,
        threeOpacity: state.threeOpacity,
        threeShowBorders: state.threeShowBorders,
      },
    };

    if (includeSnapshots) project.snapshots = getSnapshotRecords();
    return project;
  }

  function loadProjectSnapshot(project) {
    setSectionEditEnabled(false);

    const model = project.model;
    if (model.processRevision == null) {
      model.processRevision = Math.max(0, (model.revision || 1) - 1);
    }

    const xyDisplayUnit =
        project.display?.xyUnit in XY_UNITS ? project.display.xyUnit : undefined,
      activeStructurePalette =
        project.display?.structurePalette &&
        STRUCTURE_PALETTES[project.display.structurePalette]
          ? project.display.structurePalette
          : undefined,
      threeOpacity = Math.max(0.1, Math.min(1, Number(project.display?.threeOpacity) || 1)),
      threeShowBorders = Boolean(project.display?.threeShowBorders);

    applyState({
      model,
      layout: project.layout,
      selectedLayerKeys: new Set(project.selectedLayerKeys),
      activeCell: project.activeCell || project.layout.root || null,
      expandedCells: new Set(
        project.activeCell || project.layout.root ? [project.layout.root || project.activeCell] : [],
      ),
      hoveredLayerKey: null,
      maskTransform: project.maskTransform,
      activeFace: project.activeFace,
      roi: project.roi ? normalizeRoi(project.roi) : null,
      roiAnchor: project.roiAnchor || 'center',
      section: project.section,
      xyDisplayUnit,
      activeStructurePalette,
      customStructurePalette: Array.isArray(project.display?.customStructurePalette)
        ? project.display.customStructurePalette
        : null,
      threeOpacity,
      threeShowBorders,
      planViews: project.planViews,
    });

    ensureHierarchy();
    syncThreeControls({ threeOpacity, threeShowBorders });
  }

  function isValidSnapshotState(state) {
    try {
      validateProjectFile(state);
      return state.snapshots == null;
    } catch {
      return false;
    }
  }

  return { buildProjectSnapshot, loadProjectSnapshot, isValidSnapshotState };
}
