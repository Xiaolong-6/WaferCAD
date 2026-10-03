import { parseLayoutFile } from './layout-io.js';
import { MAX_PROJECT_FILE_BYTES, readProjectFile } from './project-io.js';
import {
  cloneModel,
  createModel,
  hasMaterial,
  surfaceSegment,
  surfaceZ,
} from './model.js';
import {
  transformMulti,
} from './vector-geometry.js';
import { createThreeView } from './three-view.js';
import {
  formatLengthInput,
  formatXY as formatXYValue,
  fromMicron,
  roundMicronToNanometre,
  toMicron,
  unitMeta,
} from './units.js';
import { createSnapshotManager } from './workspace-snapshots.js';
import { takeStartupFile } from './startup-file.js';
import { createBuildController } from './controllers/build-controller.js';
import { createFeedbackController } from './controllers/feedback-controller.js';
import { createConfirmationDialogController } from './controllers/confirmation-dialog-controller.js';
import { createStartupController } from './controllers/startup-controller.js';
import { createWorkstationUiController } from './workstation-ui.js';
import { createViewMaximizeController } from './controllers/view-maximize-controller.js';
import { createViewPopoverController } from './controllers/view-popover-controller.js';
import { createMaskBrowserController } from './controllers/mask-browser-controller.js';
import { createExportController } from './controllers/export-controller.js';
import { createRoiController } from './controllers/roi-controller.js';
import { createMaskRoiController } from './controllers/mask-roi-controller.js';
import { createProcessTaskController } from './controllers/process-task-controller.js';
import { createProcessPanelController } from './controllers/process-panel-controller.js';
import { createLayerLegendController } from './controllers/layer-legend-controller.js';
import { createProjectController } from './controllers/project-controller.js';
import { createSectionControlsController } from './controllers/section-controls-controller.js';
import { createSectionCollapseController } from './controllers/section-collapse-controller.js';
import { createBaseControlsController } from './controllers/base-controls-controller.js';
import { createMaskImportController } from './controllers/mask-import-controller.js';
import { createMainCanvasController } from './controllers/main-canvas-controller.js';
import { createWorkspaceActionsController } from './controllers/workspace-actions-controller.js';
import { createWorkspaceSessionController } from './controllers/workspace-session-controller.js';
import { createWorkspacePersistenceController } from './controllers/workspace-persistence-controller.js';
import { createWorkspaceViewController } from './controllers/workspace-view-controller.js';
import { createDrawMaskController } from './controllers/draw-mask-controller.js';
import {
  createEmptyDrawMask,
  drawShapeContainsPoint,
} from './draw-mask-geometry.js';
import {
  createEmptyLayout,
  createProjectStateController,
} from './controllers/project-state-controller.js';
import { createPlanViewController } from './controllers/plan-view-controller.js';
import { createPlanRenderers } from './plan-renderers.js';
import { createSelectionGeometry } from './selection-geometry.js';

const $ = (id) => document.getElementById(id);
const MASK_PALETTE = [
  '#4F86C6',
  '#4FAF9F',
  '#E6A23C',
  '#D96C5F',
  '#8A72BE',
  '#57A6C7',
  '#6C8E5E',
  '#C5678B',
];
let model = createModel(),
  layout = createEmptyLayout(),
  parsedLayout = null,
  selectedLayerKeys = new Set();
let xyDisplayUnit = 'um',
  activeStructurePalette = 'balanced',
  customStructurePalette = null,
  openLayerPaletteId = null;
let activeCell = null,
  expandedCells = new Set(),
  hoveredLayerKey = null;
let maskTransform = { x: 0, y: 0, scale: 1, rotation: 0 },
  maskSourceMode = 'file',
  drawMask = createEmptyDrawMask(),
  maskRoi = null,
  maskRoiTool = null,
  maskRoiDraft = null,
  maskRoiAnchor = 'center',
  activeFace = 'front',
  roi = null,
  roiTool = null,
  roiDraft = null,
  roiAnchor = 'center';
let projectName = 'Untitled',
  section = { a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] },
  sectionScaleMode = 'auto',
  sectionShowBorders = false,
  sectionCollapse = null,
  sectionEditEnabled = false,
  sectionEditor = null,
  history = [],
  future = [],
  baseRevertSnapshot = null,
  drawMaskController = null,
  maskRoiController = null,
  processTaskController = null;
const planViews = { mask: { zoom: 1, panX: 0, panY: 0 }, main: { zoom: 1, panX: 0, panY: 0 } };
const feedback = createFeedbackController();
const confirmationDialog = createConfirmationDialogController({ root: document });
const viewPopovers = createViewPopoverController({ root: document });

function status(message, level = 'auto') {
  feedback.show(message, level);
}

function normalizedProjectName(value = projectName) {
  return String(value ?? '').trim().slice(0, 256) || 'Untitled';
}

function syncProjectNameInput() {
  const value = normalizedProjectName();
  const input = $('projectNameInput');
  if (input && document.activeElement !== input) input.value = value;
  document.dispatchEvent(new CustomEvent('wafercad:project-name-sync', { detail: { name: value } }));
}

let workspacePersistenceController = null,
  workspaceSession = null;

function persistWorkspaceNow() {
  return workspacePersistenceController?.persistNow() ?? Promise.resolve(false);
}

function scheduleWorkspacePersistence() {
  workspacePersistenceController?.schedule();
}

function markProjectDirty() {
  scheduleWorkspacePersistence();
}

function refreshRecoveryOptions() {
  return workspacePersistenceController?.refreshRecoveryOptions() ?? Promise.resolve();
}

function checkpointWorkspace(reason) {
  return workspacePersistenceController?.checkpointCurrent(reason) ?? Promise.resolve(false);
}

function syncWorkspaceSessionState(state) {
  workspacePersistenceController?.syncSessionState(state);
}

const loadedBuildVersion = new URL(import.meta.url).searchParams.get('v') || '';
workspaceSession = createWorkspaceSessionController({
  onStateChange: syncWorkspaceSessionState,
});

const { checkForBuildUpdate, loadBuildCommit } = createBuildController({
  buildVersion: loadedBuildVersion,
  status,
  onUpdateAvailable: (commit) => {
    workspacePersistenceController?.setUpdateCommit(commit);
    const button = $('safeReloadBtn');
    const separator = $('safeReloadSeparator');
    if (button) button.hidden = false;
    if (separator) separator.hidden = false;
  },
});

const sectionControls = createSectionControlsController({
  getSection: () => section,
  setSection: (value) => {
    section = value;
    markProjectDirty();
  },
  getSectionEditor: () => sectionEditor,
  getSectionEditEnabled: () => sectionEditEnabled,
  setSectionEditEnabledValue: (value) => {
    sectionEditEnabled = value;
  },
  closeRoiControls: () => {
    const editor = $('focusEditor');
    if (editor) editor.open = false;
    clearRoiDrawingMode();
  },
  claimPopover: (panel) => viewPopovers.claim(panel),
  getModel: () => model,
  xyUnitLabel: () => xyUnit().label,
  formatLengthField,
  manualMicron,
  renderMain,
  renderSection,
  status,
});
const {
  syncInputs: syncSectionInputs,
  setEditEnabled: setSectionEditEnabled,
  setPanelVisible: setSectionPanelVisible,
  completeCreate: completeSectionCreate,
  cancelCreate: cancelSectionCreate,
} = sectionControls;

const sectionCollapseController = createSectionCollapseController({
  root: document,
  getModel: () => model,
  getSectionCollapse: () => sectionCollapse,
  setSectionCollapse: (value) => {
    sectionCollapse = value;
  },
  renderSection,
  onChanged: markProjectDirty,
  formatXY,
  xyUnitLabel: () => xyUnit().label,
});

function xyUnit() {
  return unitMeta(xyDisplayUnit);
}
function xyToDisplay(value) {
  return fromMicron(value, xyDisplayUnit);
}
function xyFromDisplay(value) {
  return toMicron(value, xyDisplayUnit);
}
function formatXY(value, digits = 3) {
  return formatXYValue(value, xyDisplayUnit, digits);
}
function xyText(value) {
  return `${formatXY(value)} ${xyUnit().label}`;
}
function manualMicron(value) {
  return roundMicronToNanometre(xyFromDisplay(Number(value)));
}
function formatLengthField(valueMicron) {
  return formatLengthInput(valueMicron, xyDisplayUnit);
}
function formatNumericField(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const rounded = Number(number.toFixed(digits));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}
function invMaskPoint([x, y]) {
  const a = (-maskTransform.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    dx = x - maskTransform.x,
    dy = y - maskTransform.y;
  return [(dx * c - dy * s) / maskTransform.scale, (dx * s + dy * c) / maskTransform.scale];
}
function maskPoint([x, y]) {
  const a = (maskTransform.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    sx = x * maskTransform.scale,
    sy = y * maskTransform.scale;
  return [sx * c - sy * s + maskTransform.x, sx * s + sy * c + maskTransform.y];
}
function layerKey(layer, datatype) {
  return `${layer}|${datatype}`;
}
function layerColor(key, alpha = 1) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hex = MASK_PALETTE[h % MASK_PALETTE.length];
  if (alpha >= 0.999) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const planView = createPlanViewController({
  getModel: () => model,
  getLayout: () => layout,
  getMaskTransform: () => maskTransform,
  getMaskSourceMode: () => maskSourceMode,
  getDrawMask: () => drawMask,
  getPlanViews: () => planViews,
  maskPoint,
  formatXY,
  xyToDisplay,
  xyFromDisplay,
  xyUnitLabel: () => xyUnit().label,
  renderMask,
  renderMain,
  onChanged: markProjectDirty,
});
const {
  setupCanvas,
  viewport,
  worldToCanvas,
  canvasToWorld,
  resetPlanView,
  zoomPlanView,
  drawPlanAxes,
} = planView;

const maskBrowser = createMaskBrowserController({
  getLayout: () => layout,
  getActiveCell: () => activeCell,
  setActiveCellValue: (value) => {
    activeCell = value;
    markProjectDirty();
  },
  getExpandedCells: () => expandedCells,
  getSelectedLayerKeys: () => selectedLayerKeys,
  getHoveredLayerKey: () => hoveredLayerKey,
  setHoveredLayerKey: (value) => {
    hoveredLayerKey = value;
  },
  layerKey,
  layerColor,
  renderMask,
  renderAll,
  onChanged: markProjectDirty,
});
const {
  hierarchyFromParsed,
  ensureHierarchy,
  activeScopeCells,
  selectedElement,
  globalLayers,
  syncMaskCellLabel,
  setActiveCell,
  renderCellTree,
  renderMaskList,
} = maskBrowser;

async function runMaskLayoutExport(request) {
  if (!processTaskController) return null;
  const formatLabel = request?.format === 'oas' ? 'OASIS' : 'GDSII';
  const task = await processTaskController.runWorker(
    '../layout-export-worker.js',
    request,
    {
      label: `Exporting Mask as ${formatLabel}…`,
      abortMessage: 'Mask export aborted. No file was written.',
      failurePrefix: `Mask ${formatLabel} export failed`,
    },
  );
  if (task?.aborted) return null;
  if (task?.busy) {
    status('Another background task is already running.', 'warning');
    return null;
  }
  if (task?.error) throw new Error(task.error);
  return task;
}

const exportController = createExportController({
  getState: () => ({
    model,
    layout,
    activeCell,
    selectedLayerKeys,
    activeFace,
    section,
    maskTransform,
    maskSourceMode,
    drawMask,
    maskRoi,
    roi,
    sectionScaleMode,
    sectionCollapse,
  }),
  viewport,
  worldToCanvas,
  maskPoint,
  selectedElement,
  layerKey,
  layerColor,
  formatXY,
  runMaskLayoutExport,
  status,
});
const {
  downloadBlob,
  exportMainSvg,
  exportMaskSvg,
  exportMaskGds,
  exportMaskOas,
  exportSectionSvg,
  syncMaskExportOptions,
} = exportController;

const roiController = createRoiController({
  getRoi: () => roi,
  setRoi: (value) => {
    roi = value;
    markProjectDirty();
  },
  getRoiTool: () => roiTool,
  setRoiTool: (value) => {
    roiTool = value;
  },
  getRoiDraft: () => roiDraft,
  setRoiDraft: (value) => {
    roiDraft = value;
  },
  getRoiAnchor: () => roiAnchor,
  setRoiAnchor: (value) => {
    roiAnchor = value;
    markProjectDirty();
  },
  getActiveFace: () => activeFace,
  isInteractionBlocked: () => sectionEditEnabled,
  xyUnitLabel: () => xyUnit().label,
  formatLengthField,
  formatNumericField,
  manualMicron,
  xyText,
  setupCanvas,
  viewport,
  canvasToWorld,
  worldToCanvas,
  zoomPlanView,
  resetPlanView,
  closeSliceControls: () => setSectionPanelVisible(false, { create: false }),
  renderMain,
  renderAll,
  status,
});
const { clearDrawingMode: clearRoiDrawingMode, syncEditor: syncRoiEditor } = roiController;

maskRoiController = createMaskRoiController({
  getRoi: () => maskRoi,
  setRoi: (value) => {
    maskRoi = value;
    markProjectDirty();
  },
  getTool: () => maskRoiTool,
  setTool: (value) => {
    maskRoiTool = value;
  },
  getDraft: () => maskRoiDraft,
  setDraft: (value) => {
    maskRoiDraft = value;
  },
  getAnchor: () => maskRoiAnchor,
  setAnchor: (value) => {
    maskRoiAnchor = value;
    markProjectDirty();
  },
  getTransform: () =>
    maskSourceMode === 'file'
      ? { ...maskTransform }
      : { x: 0, y: 0, scale: 1, rotation: 0 },
  xyUnitLabel: () => xyUnit().label,
  formatLengthField,
  formatNumericField,
  manualMicron,
  setupCanvas,
  viewport,
  canvasToWorld,
  worldToCanvas,
  renderMask,
  canMoveBody: (point) =>
    maskSourceMode !== 'draw' ||
    !drawMask.shapes.some((shape) => drawShapeContainsPoint(shape, point)),
  onChanged: updateOperationUI,
  status,
});

const layerLegendController = createLayerLegendController({
  getModel: () => model,
  getActiveStructurePalette: () => activeStructurePalette,
  setActiveStructurePalette: (value) => {
    activeStructurePalette = value;
    markProjectDirty();
  },
  getCustomStructurePalette: () => customStructurePalette,
  setCustomStructurePalette: (value) => {
    customStructurePalette = value;
    markProjectDirty();
  },
  getOpenLayerPaletteId: () => openLayerPaletteId,
  setOpenLayerPaletteId: (value) => {
    openLayerPaletteId = value;
  },
  saveHistory,
  discardLastHistory: () => {
    history.pop();
  },
  syncUndo,
  renderMain,
  renderSection,
  renderThree,
  renderAll,
  updateOperationUI,
  onChanged: markProjectDirty,
  status,
  confirmAction: (options) => confirmationDialog.confirm(options),
});
const { renderLayerLegend, colorNewLayer, colorNewImplant } = layerLegendController;

const selectionGeometry = createSelectionGeometry({
  getState: () => ({
    model,
    layout,
    maskSourceMode,
    drawMask,
    maskTransform,
    maskRoi,
    roi,
  }),
  selectedElement,
  maskPoint,
});
const { operationAreaGeometry, roiGeometry } = selectionGeometry;

function stateSnapshot() {
  return { model: cloneModel(model), section: structuredClone(section) };
}
function restoreSnapshot(snapshot) {
  model = cloneModel(snapshot.model);
  section = structuredClone(snapshot.section || section);
  markProjectDirty();
}
function saveHistory() {
  history.push(stateSnapshot());
  if (history.length > 40) history.shift();
  future = [];
  syncUndo();
}
function syncUndo() {
  $('undoBtn').disabled = !history.length;
  $('redoBtn').disabled = !future.length;
  $('revertBaseBtn').disabled = !baseRevertSnapshot;
}
function hasProcessEdits() {
  return (model.processRevision || 0) > 0;
}

function fitImportedLayout() {
  maskTransform = { scale: 1, rotation: 0, x: 0, y: 0 };
  Object.assign(planViews.mask, { zoom: 1, panX: 0, panY: 0 });
  maskImportController.syncTransformInputs();
}

function applyImportedLayout(imported, displayName) {
  parsedLayout = imported.parsed;
  layout = imported.layout;
  layout.name = displayName || layout.name;
  layout.hierarchy = hierarchyFromParsed(parsedLayout);
  activeCell = parsedLayout.root || null;
  expandedCells = new Set(activeCell ? [activeCell] : []);
  hoveredLayerKey = null;
  selectedLayerKeys = new Set(globalLayers().map((item) => item.key));
  maskSourceMode = 'file';
  fitImportedLayout();
  planViews.mask = { zoom: 1, panX: 0, panY: 0 };
  markProjectDirty();
  renderAll();

  const units = layout.units?.xy || 'µm';
  const emptyNote =
      layout.elements.length || layout.linework.length
        ? ''
        : ' This is a valid layout with no renderable mask geometry.',
    warningNote = layout.warnings?.length
      ? ` ${layout.warnings.length} unresolved cell reference${layout.warnings.length === 1 ? '' : 's'} skipped.`
      : '';
  status(
    `${displayName} (${imported.format}): XY imported in ${units} at native scale; ${layout.elements.length} area objects; ${layout.linework.length} zero-width line objects ignored for operations.${emptyNote}${warningNote}`,
  );
}

async function importLayoutBuffer(arrayBuffer, filename, displayName = filename) {
  let imported;
  if (processTaskController) {
    const task = await processTaskController.runWorker(
      '../layout-worker.js',
      { arrayBuffer, filename },
      {
        label: `Importing ${displayName || filename || 'layout'}…`,
        abortMessage: 'Layout import aborted. The current workspace was not changed.',
        failurePrefix: 'Layout import failed',
        transfer: [arrayBuffer],
      },
    );
    if (task?.aborted) return null;
    if (task?.busy) throw new Error('Another background task is already running.');
    if (task?.error) throw new Error(task.error);
    imported = task.imported;
  } else {
    imported = await parseLayoutFile(arrayBuffer, filename);
  }
  await checkpointWorkspace('pre-import-layout');
  applyImportedLayout(imported, displayName);
  return imported;
}

async function readProjectFileTask(file) {
  if (!file) throw new Error('No project file selected.');
  if (file.size > MAX_PROJECT_FILE_BYTES) {
    throw new Error(
      `Project file is larger than the ${Math.round(MAX_PROJECT_FILE_BYTES / (1024 * 1024))} MB safety limit.`,
    );
  }
  if (!processTaskController) return readProjectFile(file);

  const arrayBuffer = await file.arrayBuffer();
  const task = await processTaskController.runWorker(
    '../project-worker.js',
    { arrayBuffer },
    {
      label: `Opening ${file.name || 'project'}…`,
      abortMessage: 'Project open aborted. The current workspace was not changed.',
      failurePrefix: 'Project open failed',
      transfer: [arrayBuffer],
    },
  );
  if (task?.aborted) return null;
  if (task?.busy) {
    status('Another background task is already running.', 'warning');
    return null;
  }
  if (task?.error) throw new Error(task.error);
  return task.project;
}

let planRenderers = null;

function renderMask() {
  planRenderers?.renderMask();
}

function renderMain() {
  planRenderers?.renderMain();
}

function renderSection() {
  planRenderers?.renderSection();
}

let maskOpacity = 0.65,
  threeView = null,
  threeOpacity = 1,
  threeShowBorders = false;

function initThree() {
  threeView = createThreeView({
    host: $('threeHost'),
    stats: $('threeStats'),
    getModel: () => model,
    getClipGeometry: roiGeometry,
    getInspection: () => ({ opacity: threeOpacity, borders: threeShowBorders }),
  });
  threeView.init();
}

function renderThree() {
  try {
    threeView?.render();
    delete $('threeHost').dataset.renderError;
  } catch (error) {
    const message = error?.message || String(error || 'Unknown 3D render error');
    $('threeHost').dataset.renderError = message;
    $('threeStats').textContent = '3D render error';
    console.error('3D render failed.', error);
  }
}

function fit3d() {
  threeView?.fit();
}

let workspaceViewController = null;

function renderAll() {
  workspaceViewController?.renderAll();
}

function resetRoughDraftControls() {
  workspaceViewController?.resetRoughDraftControls();
}

function syncBaseControls() {
  workspaceViewController?.syncBaseControls();
}

function syncMaskSourceSummary() {
  workspaceViewController?.syncMaskSourceSummary();
}

let processPanelController = null;

function updateOperationUI() {
  processPanelController?.updateUi();
}

function applyOp() {
  return processPanelController?.applyOperation();
}

const projectStateController = createProjectStateController({
  ensureHierarchy,
  getState: () => ({
    model,
    layout,
    projectName: normalizedProjectName(),
    selectedLayerKeys,
    activeCell,
    maskTransform,
    maskSourceMode,
    drawMask,
    maskRoi,
    maskRoiAnchor,
    activeFace,
    roi,
    roiAnchor,
    section,
    sectionScaleMode,
    sectionShowBorders,
    sectionCollapse,
    planViews,
    xyDisplayUnit,
    activeStructurePalette,
    customStructurePalette,
    maskOpacity,
    threeOpacity,
    threeShowBorders,
  }),
  applyState: (next) => {
    model = next.model;
    layout = next.layout;
    selectedLayerKeys = next.selectedLayerKeys;
    activeCell = next.activeCell;
    expandedCells = next.expandedCells;
    hoveredLayerKey = next.hoveredLayerKey;
    maskTransform = next.maskTransform;
    maskSourceMode = next.maskSourceMode || 'file';
    drawMask = structuredClone(next.drawMask || createEmptyDrawMask());
    maskRoi = next.maskRoi || null;
    maskRoiAnchor = next.maskRoiAnchor || 'center';
    maskRoiTool = null;
    maskRoiDraft = null;
    activeFace = next.activeFace;
    roi = next.roi;
    roiAnchor = next.roiAnchor;
    section = next.section;
    if (next.projectName) projectName = next.projectName;
    if (next.sectionScaleMode) sectionScaleMode = next.sectionScaleMode;
    sectionShowBorders = Boolean(next.sectionShowBorders);
    sectionCollapse = next.sectionCollapse || null;
    if (next.xyDisplayUnit) xyDisplayUnit = next.xyDisplayUnit;
    if (next.activeStructurePalette) activeStructurePalette = next.activeStructurePalette;
    customStructurePalette = next.customStructurePalette;
    maskOpacity = next.maskOpacity;
    threeOpacity = next.threeOpacity;
    threeShowBorders = next.threeShowBorders;
    Object.assign(planViews.mask, next.planViews.mask);
    Object.assign(planViews.main, next.planViews.main);
    parsedLayout = null;
    history = [];
    future = [];
    baseRevertSnapshot = null;
    drawMaskController?.resetInteraction();
    maskRoiController?.clearDrawingMode();
    sectionCollapseController.close();
    markProjectDirty();
  },
  getSnapshotRecords: () => snapshotManager.exportRecords(),
  getSnapshotBranchState: () => snapshotManager.exportBranchState(),
  syncDisplayControls: () => {
    syncBaseControls();
    syncSectionInputs();
    maskImportController?.syncTransformInputs();
    $('maskOpacityRange').value = String(maskOpacity);
    $('maskOpacityValue').value = `${Math.round(maskOpacity * 100)}%`;
    $('threeOpacityRange').value = String(threeOpacity);
    $('threeOpacityValue').value = `${Math.round(threeOpacity * 100)}%`;
    $('threeBorders').checked = threeShowBorders;
  },
  setSectionEditEnabled,
});
const { buildProjectSnapshot, loadProjectSnapshot, resetProjectState, isValidSnapshotState } =
  projectStateController;

const snapshotManager = createSnapshotManager({
  capture: () => buildProjectSnapshot(false),
  restore: (state) => loadProjectSnapshot(state),
  validateState: isValidSnapshotState,
});

async function exportProjectFileTask(project, filename) {
  if (!processTaskController) return false;
  const task = await processTaskController.runWorker(
    '../project-export-worker.js',
    { project },
    {
      label: `Exporting ${filename || 'project'}…`,
      abortMessage: 'Project export aborted. No file was written.',
      failurePrefix: 'Project export failed',
    },
  );
  if (task?.aborted) return false;
  if (task?.busy) {
    status('Another background task is already running.', 'warning');
    return false;
  }
  if (task?.error) return false;
  downloadBlob(new Blob([task.arrayBuffer], { type: 'application/json' }), filename);
  return true;
}

const projectController = createProjectController({
  importLayoutBuffer,
  loadProjectSnapshot,
  snapshotManager,
  syncBaseControls,
  syncTransformInputs: () => maskImportController.syncTransformInputs(),
  renderAll,
  fit3d,
  status,
  onProjectChanged: markProjectDirty,
  checkpointBeforeReplace: checkpointWorkspace,
  readProjectFileTask,
  exportProjectFileTask,
  normalizedProjectName,
  getProjectName: () => projectName,
  setProjectName: (value) => {
    projectName = value;
  },
  syncProjectNameInput,
  scheduleWorkspacePersistence: markProjectDirty,
  resetProjectState,
  resetRoughDraftControls,
  clearRoiDrawingMode,
  clearMaskRoiDrawingMode: () => maskRoiController.clearDrawingMode(),
  buildProjectSnapshot,
  confirmAction: (options) => confirmationDialog.confirm(options),
});
const { renderSnapshots, openLayoutFile, openProjectFile, openVisualizationExample } =
  projectController;

const maskImportController = createMaskImportController({
  getMaskTransform: () => maskTransform,
  setMaskTransform: (value) => {
    maskTransform = value;
    markProjectDirty();
  },
  manualMicron,
  formatLengthField,
  formatNumericField,
  xyUnitLabel: () => xyUnit().label,
  importLayoutBuffer,
  openLayoutFile,
  renderMask,
  status,
});

drawMaskController = createDrawMaskController({
  getMode: () => maskSourceMode,
  setMode: (value) => {
    maskSourceMode = value;
    markProjectDirty();
  },
  getDrawMask: () => drawMask,
  setDrawMask: (value) => {
    drawMask = value;
    markProjectDirty();
  },
  setupCanvas,
  viewport,
  canvasToWorld,
  worldToCanvas,
  xyText,
  xyUnitLabel: () => xyUnit().label,
  formatLengthField,
  manualMicron,
  renderMask,
  isInteractionBlocked: () => Boolean(maskRoiTool),
  syncSourceSummary: syncMaskSourceSummary,
  onMaskChanged: updateOperationUI,
  claimPopover: (panel) => viewPopovers.claim(panel),
  status,
  confirmAction: (options) => confirmationDialog.confirm(options),
});

processTaskController = createProcessTaskController({
  status,
  setApplyDisabled: (disabled) => {
    const button = $('applyOperationBtn');
    button.disabled = disabled || !hasMaterial(model);
    button.classList.toggle('process-busy', disabled);
  },
});

processPanelController = createProcessPanelController({
  root: document,
  getModel: () => model,
  setModel: (value) => {
    model = value;
    markProjectDirty();
  },
  getActiveFace: () => activeFace,
  getMaskState: () => ({
    maskSourceMode,
    maskRoi,
    drawMask,
    maskTransform,
    layout,
  }),
  operationAreaGeometry,
  selectedElement,
  manualMicron,
  formatLengthField,
  processTaskController,
  saveHistory,
  clearBaseRevertSnapshot: () => {
    baseRevertSnapshot = null;
  },
  colorNewLayer,
  colorNewImplant,
  renderAll,
  status,
});

workspaceViewController = createWorkspaceViewController({
  root: document,
  getModel: () => model,
  getActiveFace: () => activeFace,
  getMaskState: () => ({ maskSourceMode, drawMask, layout }),
  getXyDisplayUnit: () => xyDisplayUnit,
  xyUnitLabel: () => xyUnit().label,
  formatXY,
  formatLengthField,
  renderCellTree,
  renderMaskList,
  renderLayerLegend,
  renderMask,
  renderMain,
  renderSection,
  renderThree,
  syncRoiEditor,
  syncMaskCellLabel,
  syncProjectNameInput,
  getDrawMaskController: () => drawMaskController,
  getMaskRoiController: () => maskRoiController,
  updateOperationUI,
  syncUndo,
});

const baseControls = createBaseControlsController({
  getModel: () => model,
  setModel: (value) => {
    model = value;
    markProjectDirty();
  },
  setSection: (value) => {
    section = value;
    markProjectDirty();
  },
  getBaseRevertSnapshot: () => baseRevertSnapshot,
  setBaseRevertSnapshot: (value) => {
    baseRevertSnapshot = value;
  },
  getHistory: () => history,
  getFuture: () => future,
  stateSnapshot,
  restoreSnapshot,
  saveHistory,
  hasProcessEdits,
  manualMicron,
  formatLengthField,
  syncBaseControls,
  renderAll,
  fit3d,
  status,
  confirmAction: (options) => confirmationDialog.confirm(options),
});

const workspaceActions = createWorkspaceActionsController({
  getXyUnit: xyUnit,
  setXyDisplayUnit: (value) => {
    xyDisplayUnit = value;
    markProjectDirty();
  },
  formatLengthField,
  manualMicron,
  syncTransformInputs: () => maskImportController.syncTransformInputs(),
  renderAll,
  status,
  getActiveFace: () => activeFace,
  setActiveFace: (value) => {
    activeFace = value;
    markProjectDirty();
  },
  updateOperationUI,
  applyOperation: applyOp,
  fit3d,
  exportMainSvg,
  exportMaskSvg,
  exportMaskGds,
  exportMaskOas,
  exportSectionSvg,
  syncMaskExportOptions,
  getThreeView: () => threeView,
  downloadBlob,
  getRoi: () => roi,
  getSectionScaleMode: () => sectionScaleMode,
  setSectionScaleMode: (value) => {
    sectionScaleMode = value;
    markProjectDirty();
  },
  getSectionShowBorders: () => sectionShowBorders,
  setSectionShowBorders: (value) => {
    sectionShowBorders = Boolean(value);
    markProjectDirty();
  },
  renderSection,
  getMaskOpacity: () => maskOpacity,
  setMaskOpacity: (value) => {
    maskOpacity = value;
    markProjectDirty();
  },
  renderMask,
  getThreeOpacity: () => threeOpacity,
  setThreeOpacity: (value) => {
    threeOpacity = value;
    markProjectDirty();
  },
  getThreeShowBorders: () => threeShowBorders,
  setThreeShowBorders: (value) => {
    threeShowBorders = value;
    markProjectDirty();
  },
  renderThree,
  zoomPlanView,
  resetPlanView,
  getHistory: () => history,
  getFuture: () => future,
  stateSnapshot,
  restoreSnapshot,
  setBaseRevertSnapshot: (value) => {
    baseRevertSnapshot = value;
  },
  syncBaseControls,
  snapshotManager,
  renderSnapshots,
  onProjectChanged: markProjectDirty,
  getModel: () => model,
});

const mainCanvasController = createMainCanvasController({
  getSection: () => section,
  setSection: (value) => {
    section = value;
    markProjectDirty();
  },
  getActiveFace: () => activeFace,
  getSectionCreateMode: () => sectionEditEnabled,
  isRoiDrawing: () => Boolean(roiTool),
  completeSectionCreate,
  cancelSectionCreate,
  setSectionEditor: (value) => {
    sectionEditor = value;
  },
  viewport,
  worldToCanvas,
  canvasToWorld,
  zoomPlanView,
  resetPlanView,
  xyText,
  renderMain,
  renderMask,
  renderSection,
  renderAll,
});

const { initializeWorkspaceStart } = createStartupController({
  takeStartupFile,
  openLayoutFile,
  openProjectFile,
  openVisualizationExample,
  status,
});

const viewMaximizeController = createViewMaximizeController({
  status,
  renderMain,
  renderMask,
  renderSection,
  renderThree,
  fit3d,
  updateSectionEditor: () => sectionEditor?.update(),
});
workspacePersistenceController = createWorkspacePersistenceController({
  root: document,
  workspaceSession,
  appCommit: loadedBuildVersion,
  status,
  buildProjectSnapshot,
  loadProjectSnapshot,
  snapshotManager,
  syncBaseControls,
  syncTransformInputs: () => maskImportController.syncTransformInputs(),
  renderAll,
  renderSnapshots,
  fit3d,
  initializeWorkspaceStart,
  normalizedProjectName,
  getProjectName: () => projectName,
  setProjectName: (value) => {
    projectName = value;
  },
  syncProjectNameInput,
  confirmAction: (options) => confirmationDialog.confirm(options),
  chooseAction: (options) => confirmationDialog.ask(options),
});


const workstationUiController = createWorkstationUiController({ root: document, win: window });

function bindUi() {
  workstationUiController.bind();
  viewPopovers.bind();
  viewMaximizeController.bind();
  roiController.bind();
  processTaskController.bind();
  sectionControls.bind();
  sectionCollapseController.bind();
  baseControls.bind();
  maskImportController.bind();
  maskRoiController.bind();
  drawMaskController.bind();
  workspaceActions.bind();
  mainCanvasController.bind();
  workspacePersistenceController.bind();

  projectController.bind();
}

planRenderers = createPlanRenderers({
  root: document,
  getState: () => ({
    model,
    activeFace,
    roi,
    roiDraft,
    sectionEditEnabled,
    roiTool,
    maskTransform,
    hoveredLayerKey,
    maskSourceMode,
    layout,
    section,
    sectionScaleMode,
    sectionShowBorders,
    sectionCollapse,
    maskOpacity,
  }),
  getDrawMaskController: () => drawMaskController,
  getMaskRoiController: () => maskRoiController,
  getSectionEditor: () => sectionEditor,
  getSectionCollapseController: () => sectionCollapseController,
  setupCanvas,
  viewport,
  worldToCanvas,
  selectedElement,
  maskPoint,
  layerKey,
  layerColor,
  drawPlanAxes,
  syncSectionInputs,
  formatXY,
  xyText,
  xyUnitLabel: () => xyUnit().label,
});

workspaceSession.start();
bindUi();
loadBuildCommit();
window.addEventListener('focus', checkForBuildUpdate);
window.addEventListener('pagehide', () => {
  void persistWorkspaceNow()
    .catch(() => false)
    .finally(() => workspaceSession.stop());
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) globalThis.location.reload();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForBuildUpdate();
  else void persistWorkspaceNow();
});
renderSnapshots();
initThree();
syncBaseControls();
updateOperationUI();
maskImportController.syncTransformInputs();
renderAll();
fit3d();
document.documentElement.dataset.appReady = 'true';
status('Ready. Create a base or import a layout.');
void workspacePersistenceController.initializePersistedWorkspace();
