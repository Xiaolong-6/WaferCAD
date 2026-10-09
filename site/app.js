import { prewarmModelBoundaryIndexes } from './process-boundary-index.js';
import { isArrayModel } from './model-array.js';
import { prepareMaskInstanceIndex } from './mask-instance-index.js';
import { parseLayoutFile } from './layout-io.js';
import { MAX_PROJECT_FILE_BYTES, readProjectFile } from './project-io.js';
import { cloneModel, createModel, hasMaterial, surfaceSegment, surfaceZ } from './model.js';
import { transformMulti } from './vector-geometry.js';
import { createThreeView } from './three-view.js';
import {
  formatLengthInput,
  formatXY as formatXYValue,
  fromMicron,
  roundMicronToTenthNanometre,
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
import { createViewToolbarController } from './controllers/view-toolbar-controller.js';
import { createMaskBrowserController } from './controllers/mask-browser-controller.js';
import { createExportController } from './controllers/export-controller.js';
import { createRoiController } from './controllers/roi-controller.js';
import { createMaskRoiController } from './controllers/mask-roi-controller.js';
import { createProcessTaskController } from './controllers/process-task-controller.js';
import { createProcessPanelController } from './controllers/process-panel-controller.js';
import { createProcessDiagnosticsController } from './controllers/process-diagnostics-controller.js';
import { createProcessRecipeController } from './controllers/process-recipe-controller.js';
import { createLayerLegendController } from './controllers/layer-legend-controller.js';
import { createProjectController } from './controllers/project-controller.js';
import { createHistoryMutationController } from './controllers/history-mutation-controller.js';
import { createSectionControlsController } from './controllers/section-controls-controller.js';
import { createSectionCollapseController } from './controllers/section-collapse-controller.js';
import { createSectionDetailRoiController } from './controllers/section-detail-roi-controller.js';
import { createBaseControlsController } from './controllers/base-controls-controller.js';
import { createMaskImportController } from './controllers/mask-import-controller.js';
import { createMainCanvasController } from './controllers/main-canvas-controller.js';
import {
  createWorkspaceActionsController,
  syncThreeRenderModeButton,
} from './controllers/workspace-actions-controller.js';
import { createWorkspaceSessionController } from './controllers/workspace-session-controller.js';
import { createWorkspacePersistenceController } from './controllers/workspace-persistence-controller.js';
import { createWorkspaceViewController } from './controllers/workspace-view-controller.js';
import { createDrawMaskController } from './controllers/draw-mask-controller.js';
import { createEmptyDrawMask, drawShapeContainsPoint } from './draw-mask-geometry.js';
import {
  createEmptyLayout,
  createProjectStateController,
} from './controllers/project-state-controller.js';
import { createPlanViewController } from './controllers/plan-view-controller.js';
import { createPlanRenderers } from './plan-renderers.js';
import { createSelectionGeometry } from './selection-geometry.js';

const $ = (id) => document.getElementById(id);
const APP_PARAMS = new URLSearchParams(globalThis.location?.search || '');
const EMBEDDED_PREVIEW = APP_PARAMS.get('preview') === '1';
let embeddedPreviewView = ['main', 'mask', 'three', 'section'].includes(APP_PARAMS.get('view'))
  ? APP_PARAMS.get('view')
  : 'main';

if (EMBEDDED_PREVIEW) {
  document.documentElement.classList.add('welcome-project-preview');
  document.documentElement.dataset.previewView = embeddedPreviewView;
}
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
  processRecipe = null,
  section = { a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] },
  sectionScaleMode = 'auto',
  sectionShowBorders = false,
  sectionCollapse = null,
  sectionDetailRoi = null,
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
const viewToolbars = createViewToolbarController({ root: document });

function status(message, level = 'auto') {
  feedback.show(message, level);
}

function normalizedProjectName(value = projectName) {
  return (
    String(value ?? '')
      .trim()
      .slice(0, 256) || 'Untitled'
  );
}

function syncProjectNameInput() {
  const value = normalizedProjectName();
  const input = $('projectNameInput');
  if (input && document.activeElement !== input) input.value = value;
  document.dispatchEvent(
    new CustomEvent('wafercad:project-name-sync', { detail: { name: value } }),
  );
}

let workspacePersistenceController = null,
  workspaceSession = null,
  snapshotManager = null;

function persistWorkspaceNow() {
  return workspacePersistenceController?.persistNow({ force: true }) ?? Promise.resolve(false);
}

function scheduleWorkspacePersistence() {
  workspacePersistenceController?.scheduleStructural();
}

function markProjectDirty() {
  if (EMBEDDED_PREVIEW) return;
  scheduleWorkspacePersistence();
}

function markViewDirty() {
  if (EMBEDDED_PREVIEW) return;
  workspacePersistenceController?.scheduleView();
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
    markViewDirty();
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
  onChanged: () => {
    markViewDirty();
    threeView?.updateZCollapse();
  },
  onSettled: renderThree,
  formatXY,
  xyUnitLabel: () => xyUnit().label,
  parseZInput: (value) => manualMicron(Number(value)),
  claimPopover: (owner) => viewPopovers.claim(owner),
});

const sectionDetailRoiController = createSectionDetailRoiController({
  root: document,
  getRoi: () => sectionDetailRoi,
  setRoi: (value) => {
    sectionDetailRoi = value;
  },
  renderDetail: (canvas, roi) => planRenderers?.renderSectionDetail(canvas, roi),
  onChanged: markViewDirty,
  status,
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
  return roundMicronToTenthNanometre(xyFromDisplay(Number(value)));
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
  getViewportMargin: () => (EMBEDDED_PREVIEW ? 14 : 34),
  getCompactAxes: () => EMBEDDED_PREVIEW,
  onChanged: markViewDirty,
});
const {
  setupCanvas,
  viewport,
  worldToCanvas,
  canvasToWorld,
  resetPlanView,
  panPlanView,
  zoomPlanView,
  drawPlanAxes,
} = planView;

const maskBrowser = createMaskBrowserController({
  getLayout: () => layout,
  getActiveCell: () => activeCell,
  setActiveCellValue: (value) => {
    activeCell = value;
    markViewDirty();
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
  onChanged: markViewDirty,
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
  const task = await processTaskController.runWorker('../layout-export-worker.js', request, {
    label: `Exporting Mask as ${formatLabel}…`,
    abortMessage: 'Mask export aborted. No file was written.',
    failurePrefix: `Mask ${formatLabel} export failed`,
  });
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
    markViewDirty();
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
    markViewDirty();
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
    markViewDirty();
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
    markViewDirty();
  },
  getTransform: () =>
    maskSourceMode === 'file' ? { ...maskTransform } : { x: 0, y: 0, scale: 1, rotation: 0 },
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
  onNameChanged: ({ kind, id, name }) => {
    snapshotManager?.renameHistoryEntity(kind, id, name);
    markProjectDirty();
    renderSnapshots();
  },
  status,
  confirmAction: (options) => confirmationDialog.confirm(options),
});
const { renderLayerLegend, colorNewLayer, colorNewImplant, colorNewElectricalRegion } =
  layerLegendController;

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

function stateSnapshot({ includeHistoryGraph = false } = {}) {
  const state = { model: cloneModel(model), section: structuredClone(section) };
  if (includeHistoryGraph && snapshotManager) {
    snapshotManager.syncActiveHeadState();
    state.snapshotGraph = {
      records: snapshotManager.exportRecords(),
      branchState: snapshotManager.exportBranchState(),
    };
    state.workspaceState = structuredClone(buildProjectSnapshot(false));
  }
  return state;
}
function restoreSnapshot(snapshot) {
  model = cloneModel(snapshot.model);
  section = structuredClone(snapshot.section || section);
  if (snapshot.snapshotGraph && snapshotManager) {
    snapshotManager.importRecords(
      snapshot.snapshotGraph.records,
      snapshot.snapshotGraph.branchState,
    );
  }
  markProjectDirty();
}
function saveHistory(snapshot = stateSnapshot()) {
  history.push(snapshot);
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
  processTaskController?.dispose();
  parsedLayout = imported.parsed;
  layout = imported.layout;
  prepareMaskInstanceIndex(layout);
  const preparedModel = model;
  const prepare = () =>
    prewarmModelBoundaryIndexes(
      preparedModel,
      () => model === preparedModel,
      () =>
        new Promise((resolve) => {
          if (globalThis.requestIdleCallback) requestIdleCallback(resolve);
          else setTimeout(resolve, 16);
        }),
    ).catch(() => {});
  if (globalThis.requestIdleCallback) requestIdleCallback(prepare);
  else setTimeout(prepare, 250);
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

async function importLayoutBuffer(
  arrayBuffer,
  filename,
  displayName = filename,
  { startupProtected = false } = {},
) {
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
  // Welcome startup already protects the previous autosave before importing.
  // All other Mask imports must abort on a failed/unavailable checkpoint.
  if (!startupProtected && !(await checkpointWorkspace('pre-import-layout'))) {
    throw new Error('Recovery checkpoint was not created. The current mask was left unchanged.');
  }
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
  sectionDetailRoiController?.sync();
}

let maskOpacity = 0.65,
  threeView = null,
  pendingThreeCamera = null,
  threeOpacity = 1,
  threeShowBorders = false,
  threeFastMode = true;

function initThree() {
  if (threeView) return threeView;
  threeView = createThreeView({
    host: $('threeHost'),
    stats: $('threeStats'),
    getModel: () => model,
    getClipGeometry: roiGeometry,
    getInspection: () => ({
      opacity: threeOpacity,
      borders: threeShowBorders,
      fast: threeFastMode,
    }),
    getZCollapse: () => sectionCollapse,
    onViewChanged: (viewState) => {
      pendingThreeCamera = viewState ? structuredClone(viewState) : null;
      markViewDirty();
    },
  });
  threeView.init();
  if (pendingThreeCamera) threeView.setViewState?.(pendingThreeCamera);
  return threeView;
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
  processDiagnosticsController?.onModelRendered();
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

let processPanelController = null,
  processDiagnosticsController = null,
  processRecipeController = null,
  projectController = null;

function updateOperationUI() {
  processPanelController?.updateUi();
}

function applyOp() {
  return processPanelController?.applyOperation();
}

const projectStateController = createProjectStateController({
  ensureHierarchy,
  readValidatedFile: readProjectFileTask,
  getState: () => ({
    model,
    layout,
    projectName: normalizedProjectName(),
    processRecipe: processRecipe ? structuredClone(processRecipe) : null,
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
    sectionDetailRoi,
    planViews,
    xyDisplayUnit,
    activeStructurePalette,
    customStructurePalette,
    maskOpacity,
    threeOpacity,
    threeShowBorders,
    threeFastMode,
    threeCamera: threeView?.getViewState?.() || pendingThreeCamera || null,
  }),
  applyState: (next) => {
    processTaskController?.dispose();
    model = next.model;
    layout = next.layout;
    prepareMaskInstanceIndex(layout);
    const preparedModel = model;
    const prepare = () =>
      prewarmModelBoundaryIndexes(
        preparedModel,
        () => model === preparedModel,
        () =>
          new Promise((resolve) => {
            if (globalThis.requestIdleCallback) requestIdleCallback(resolve);
            else setTimeout(resolve, 16);
          }),
      ).catch(() => {});
    if (globalThis.requestIdleCallback) requestIdleCallback(prepare);
    else setTimeout(prepare, 250);
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
    processRecipe = next.processRecipe ? structuredClone(next.processRecipe) : null;
    processRecipeController?.refresh();
    if (next.sectionScaleMode) sectionScaleMode = next.sectionScaleMode;
    sectionShowBorders = Boolean(next.sectionShowBorders);
    sectionCollapse = next.sectionCollapse || null;
    sectionDetailRoi = next.sectionDetailRoi || null;
    if (next.xyDisplayUnit) xyDisplayUnit = next.xyDisplayUnit;
    if (next.activeStructurePalette) activeStructurePalette = next.activeStructurePalette;
    customStructurePalette = next.customStructurePalette;
    maskOpacity = next.maskOpacity;
    threeOpacity = next.threeOpacity;
    threeShowBorders = next.threeShowBorders;
    threeFastMode = next.threeFastMode !== false;
    pendingThreeCamera = next.threeCamera ? structuredClone(next.threeCamera) : null;
    if (pendingThreeCamera) threeView?.setViewState?.(pendingThreeCamera);
    else threeView?.fit?.({ notify: false });
    Object.assign(planViews.mask, next.planViews.mask);
    Object.assign(planViews.main, next.planViews.main);
    parsedLayout = null;
    history = [];
    future = [];
    baseRevertSnapshot = null;
    syncUndo();
    drawMaskController?.resetInteraction();
    maskRoiController?.clearDrawingMode();
    sectionCollapseController.close();
    sectionDetailRoiController.cancelDrawing();
    markProjectDirty();
  },
  getSnapshotRecords: () => snapshotManager.exportRecords(),
  getSnapshotBranchState: () => {
    snapshotManager?.syncActiveHeadState?.();
    return snapshotManager?.exportBranchState?.() || null;
  },
  syncDisplayControls: () => {
    syncBaseControls();
    syncSectionInputs();
    maskImportController?.syncTransformInputs();
    $('maskOpacityRange').value = String(maskOpacity);
    $('maskOpacityValue').value = `${Math.round(maskOpacity * 100)}%`;
    $('threeOpacityRange').value = String(threeOpacity);
    $('threeOpacityValue').value = `${Math.round(threeOpacity * 100)}%`;
    $('threeBorders').checked = threeShowBorders;
    syncThreeRenderModeButton($('threeFastBtn'), threeFastMode);
    sectionDetailRoiController.sync();
  },
  setSectionEditEnabled,
});
const {
  readProjectSnapshot,
  buildProjectSnapshot,
  loadProjectSnapshot,
  resetProjectState,
  isValidSnapshotState,
  isValidSnapshotStates,
} = projectStateController;

snapshotManager = createSnapshotManager({
  capture: () => buildProjectSnapshot(false),
  restore: (state) => loadProjectSnapshot(state),
  validateState: isValidSnapshotState,
  validateStates: isValidSnapshotStates,
});

function refreshAfterHistoricalEditLoad() {
  syncBaseControls();
  maskImportController?.syncTransformInputs();
  renderAll();
  fit3d();
}

function captureHistoryReplayTransaction() {
  snapshotManager?.syncActiveHeadState?.();
  return {
    project: structuredClone(buildProjectSnapshot(true)),
    history: structuredClone(history),
    future: structuredClone(future),
    baseRevertSnapshot: baseRevertSnapshot ? structuredClone(baseRevertSnapshot) : null,
  };
}

function restoreHistoryReplayTransaction(transaction) {
  if (!transaction?.project) return false;
  const project = structuredClone(transaction.project);
  loadProjectSnapshot(project);
  snapshotManager.importRecords(project.snapshots || [], project.snapshotBranches);
  history = structuredClone(transaction.history || []);
  future = structuredClone(transaction.future || []);
  baseRevertSnapshot = transaction.baseRevertSnapshot
    ? structuredClone(transaction.baseRevertSnapshot)
    : null;
  syncBaseControls();
  maskImportController?.syncTransformInputs();
  syncUndo();
  renderAll();
  projectController?.renderSnapshots?.();
  fit3d();
  updateOperationUI();
  markProjectDirty();
  return true;
}

const historyMutationController = createHistoryMutationController({
  snapshotManager,
  getProcessPanelController: () => processPanelController,
  confirmationDialog,
  checkpointWorkspace,
  refreshAfterHistoricalLoad: refreshAfterHistoricalEditLoad,
  markProjectDirty,
  renderSnapshots: () => projectController?.renderSnapshots?.(),
  openProcessPanel: () =>
    document.querySelector('.workstation-rail-button[data-tool="process"]')?.click(),
  updateOperationUI,
  captureReplayTransaction: captureHistoryReplayTransaction,
  restoreReplayTransaction: restoreHistoryReplayTransaction,
  beginReplayInteraction: () => workspacePersistenceController?.beginInteraction?.(),
  endReplayInteraction: () => workspacePersistenceController?.endInteraction?.(),
  status,
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

projectController = createProjectController({
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
  allowVolatileNewProject: () => !workspaceSession?.hasWriteLease?.(),
  readProjectFileTask: readProjectSnapshot,
  exampleBuildVersion: loadedBuildVersion,
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
  beginHistoricalStepEdit: historyMutationController.beginEdit,
  getHistoricalStepEdit: historyMutationController.currentEdit,
  cancelHistoricalStepEdit: historyMutationController.cancelEdit,
  beginHistoricalStepInsert: historyMutationController.beginInsert,
  getHistoricalStepInsert: historyMutationController.currentInsert,
  cancelHistoricalStepInsert: historyMutationController.cancelInsert,
});
const { renderSnapshots, openLayoutFile, openProjectFile, openBundledExample } = projectController;

function recordProcessOperation(operation) {
  processRecipeController?.recordManualOperation?.(operation);
  const recorded = snapshotManager.recordOperation(operation);
  markProjectDirty();
  // Recording each Step must remain lossless. Repainting the full 625-site
  // History tree on each commit is redundant during a Recipe batch; refresh
  // it once when the batch finishes or is stopped.
  if (!(processRecipeController?.isRunning?.() && isArrayModel(model))) {
    renderSnapshots();
  }
  return recorded;
}

const maskImportController = createMaskImportController({
  getMaskTransform: () => maskTransform,
  setMaskTransform: (value) => {
    maskTransform = value;
    markViewDirty();
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
    markViewDirty();
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
  setActiveFace: (value) => {
    activeFace = value === 'back' ? 'back' : 'front';
    markViewDirty();
  },
  getMaskState: () => ({
    maskSourceMode,
    maskRoi,
    drawMask,
    maskTransform,
    layout,
    activeCell,
    selectedLayerKeys: [...selectedLayerKeys],
  }),
  operationAreaGeometry,
  selectedElement,
  manualMicron,
  formatLengthField,
  processTaskController,
  saveHistory,
  beforeApply: historyMutationController.beforeApply,
  commitApplyBranch: historyMutationController.commitApplyBranch,
  recordProcessOperation,
  afterApply: historyMutationController.afterApply,
  getHistoricalStepEdit: historyMutationController.currentEdit,
  getHistoricalStepInsert: historyMutationController.currentInsert,
  clearBaseRevertSnapshot: () => {
    baseRevertSnapshot = null;
  },
  colorNewLayer,
  colorNewImplant,
  colorNewElectricalRegion,
  // Array Steps are still fully committed through the native Kernel/History.
  // Only skip heavy 625-site geometry/3D repaint between batch Steps.
  // The Recipe controller does a complete render on success, Stop or failure.
  renderAll: () => {
    if (processRecipeController?.isRunning?.() && isArrayModel(model)) return;
    renderAll();
  },
  status,
});

processRecipeController = createProcessRecipeController({
  root: document,
  getRecipe: () => processRecipe,
  setRecipe: (value) => {
    processRecipe = value ? structuredClone(value) : null;
  },
  getModel: () => model,
  getMaskState: () => ({
    maskSourceMode,
    maskRoi,
    drawMask,
    maskTransform,
    layout,
    activeCell,
    selectedLayerKeys: [...selectedLayerKeys],
  }),
  setMaskState: (next = {}) => {
    maskSourceMode = next.maskSourceMode === 'draw' ? 'draw' : 'file';
    if (
      next.activeCell &&
      (next.activeCell === layout.root || layout.hierarchy?.[next.activeCell])
    ) {
      activeCell = next.activeCell;
    }
    if (Array.isArray(next.selectedLayerKeys)) {
      selectedLayerKeys = new Set(next.selectedLayerKeys);
    }
    if (next.maskTransform) maskTransform = { ...next.maskTransform };
    maskRoi = next.maskRoi ? structuredClone(next.maskRoi) : null;
    if (maskSourceMode === 'draw' && next.drawMask) drawMask = structuredClone(next.drawMask);
    markProjectDirty();
    renderCellTree();
    renderMaskList();
    syncMaskCellLabel();
    renderMask();
    updateOperationUI();
  },
  setActiveFace: (value) => {
    activeFace = value === 'back' ? 'back' : 'front';
    markViewDirty();
  },
  processPanelController,
  processTaskController,
  snapshotManager,
  // Recipe values are physical inputs, including lossless sub-grid films.
  // The Step UI formatter may round presentation, but must not round replay.
  formatCanonicalLengthInput: (valueUm) => String(fromMicron(valueUm, xyDisplayUnit)),
  updateOperationUI,
  renderAll,
  renderSnapshots,
  resetToBase: (recipeBase) => baseControls.applyBase({ recipeBase }),
  checkpointWorkspace,
  confirmContinue: () =>
    confirmationDialog.confirm({
      title: 'Continue Recipe on current model?',
      message: 'This workspace already contains Process Steps.',
      detail:
        'Continuing applies the Recipe again to the existing geometry and may repeat ' +
        'depositions or etches. To reconstruct from a fresh Base, choose ' +
        '"Rebuild Base first (new Main)" in the Recipe Start selector instead.',
      confirmLabel: 'Continue and apply',
      cancelLabel: 'Cancel',
    }),
  status,
  onChanged: markProjectDirty,
});

processDiagnosticsController = createProcessDiagnosticsController({
  root: document,
  getModel: () => model,
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
  chooseHistoryAction: () =>
    confirmationDialog.ask({
      title: 'Rebuild Base',
      message: 'Changing Base starts a new independent process lineage.',
      detail:
        'Keep archives the previous Main and its Steps as a restorable Variant. ' +
        'Clear discards all existing history and Variants. Cancel leaves everything unchanged.',
      actions: [
        { value: 'cancel', label: 'Cancel' },
        { value: 'clear', label: 'Clear history', kind: 'danger' },
        { value: 'keep', label: 'Keep previous history', kind: 'primary', default: true },
      ],
    }),
  getHistoryDetails: () => {
    const graph = snapshotManager.exportBranchState();
    return {
      hasHistory:
        graph.nodes.length > 0 || graph.branches.length > 1 || snapshotManager.list().length > 0,
    };
  },
  captureBaseSnapshot: () => stateSnapshot({ includeHistoryGraph: true }),
  rebuildMainHistory: (options) => snapshotManager.rebuildMainBase(options),
  refreshHistory: () => {
    projectController?.renderSnapshots?.();
    markProjectDirty();
  },
});

const workspaceActions = createWorkspaceActionsController({
  getXyUnit: xyUnit,
  setXyDisplayUnit: (value) => {
    xyDisplayUnit = value;
    markViewDirty();
  },
  formatLengthField,
  manualMicron,
  syncTransformInputs: () => maskImportController.syncTransformInputs(),
  renderAll,
  status,
  getActiveFace: () => activeFace,
  setActiveFace: (value) => {
    activeFace = value;
    markViewDirty();
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
    markViewDirty();
  },
  getSectionShowBorders: () => sectionShowBorders,
  setSectionShowBorders: (value) => {
    sectionShowBorders = Boolean(value);
    markViewDirty();
  },
  renderSection,
  getMaskOpacity: () => maskOpacity,
  setMaskOpacity: (value) => {
    maskOpacity = value;
    markViewDirty();
  },
  renderMask,
  getThreeOpacity: () => threeOpacity,
  setThreeOpacity: (value) => {
    threeOpacity = value;
    markViewDirty();
  },
  getThreeFastMode: () => threeFastMode,
  setThreeFastMode: (value) => {
    threeFastMode = Boolean(value);
    markViewDirty();
  },
  getThreeShowBorders: () => threeShowBorders,
  setThreeShowBorders: (value) => {
    threeShowBorders = value;
    markViewDirty();
  },
  renderThree,
  zoomPlanView,
  resetPlanView,
  updateSectionEditor: () => sectionEditor?.update(),
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
  taskController: processTaskController,
});

const mainCanvasController = createMainCanvasController({
  getSection: () => section,
  setSection: (value) => {
    section = value;
    markViewDirty();
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
  panPlanView,
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
  openBundledExample: (id, options = {}) =>
    openBundledExample(id, { ...options, preview: EMBEDDED_PREVIEW }),
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
  taskController: processTaskController,
  confirmAction: (options) => confirmationDialog.confirm(options),
  chooseAction: (options) => confirmationDialog.ask(options),
});

const workstationUiController = createWorkstationUiController({ root: document, win: window });

function resetEmbeddedPreviewPlanFraming() {
  if (!EMBEDDED_PREVIEW) return;
  Object.assign(planViews.main, { zoom: 1, panX: 0, panY: 0 });
  Object.assign(planViews.mask, { zoom: 1, panX: 0, panY: 0 });
  document.documentElement.dataset.previewPlanFraming = 'fit';
}

function renderEmbeddedPreviewView(view = embeddedPreviewView) {
  if (!EMBEDDED_PREVIEW) return;
  if (view === 'three') {
    initThree();
    renderThree();
    if (pendingThreeCamera) {
      threeView?.setViewState?.(pendingThreeCamera);
      threeView?.fit?.({ notify: false, preserveOrientation: true });
    } else fit3d();
    return;
  }
  if (view === 'mask') {
    renderMask();
    return;
  }
  if (view === 'section') {
    renderSection();
    return;
  }
  renderMain();
}

function applyEmbeddedPreviewView(view) {
  if (!EMBEDDED_PREVIEW) return;
  const next = ['main', 'mask', 'three', 'section'].includes(view) ? view : 'main';
  embeddedPreviewView = next;
  document.documentElement.dataset.previewView = next;

  $('mainPanel').hidden = next !== 'main';
  $('maskPanel').hidden = next !== 'mask';
  $('threePanel').hidden = next !== 'three';
  $('sectionPanel').hidden = next !== 'section';

  // Embedded Welcome previews bypass workstation layout state so one external
  // tab always maps to exactly one visible inspection renderer.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      globalThis.dispatchEvent(new Event('resize'));
      renderEmbeddedPreviewView(next);
    });
  });
}

function bindEmbeddedPreviewBridge() {
  if (!EMBEDDED_PREVIEW) return;
  globalThis.addEventListener('message', (event) => {
    if (event.source !== globalThis.parent) return;
    const message = event.data;
    if (message?.type !== 'wafercad-preview-view') return;
    applyEmbeddedPreviewView(message.view);
  });
}

function bindEmbeddedPreviewInteractions() {
  if (!EMBEDDED_PREVIEW) return;

  const bindPlanCanvas = (kind, canvas, back = () => false) => {
    let drag = null;

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        zoomPlanView(
          kind,
          canvas,
          event.deltaY < 0 ? 1.35 : 1 / 1.35,
          event.clientX,
          event.clientY,
          back(),
        );
      },
      { passive: false },
    );

    canvas.addEventListener('dblclick', (event) => {
      event.preventDefault();
      resetPlanView(kind);
    });

    canvas.addEventListener('pointerdown', (event) => {
      if (event.isPrimary === false) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add('preview-panning');
      event.preventDefault();
    });

    canvas.addEventListener('pointermove', (event) => {
      if (drag?.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (dx || dy) panPlanView(kind, dx, dy);
      event.preventDefault();
    });

    for (const type of ['pointerup', 'pointercancel']) {
      canvas.addEventListener(type, (event) => {
        if (drag?.pointerId !== event.pointerId) return;
        canvas.releasePointerCapture?.(event.pointerId);
        drag = null;
        canvas.classList.remove('preview-panning');
        event.preventDefault();
      });
    }
  };

  bindPlanCanvas('main', $('mainCanvas'), () => activeFace === 'back');
  bindPlanCanvas('mask', $('maskCanvas'));

  const observer = new ResizeObserver(() => renderEmbeddedPreviewView());
  observer.observe($('mainCanvas'));
  observer.observe($('maskCanvas'));
  observer.observe($('sectionCanvas'));
  observer.observe($('threeHost'));
}

function bindUi() {
  workstationUiController.bind();

  if (EMBEDDED_PREVIEW) {
    bindEmbeddedPreviewInteractions();
    return;
  }

  viewPopovers.bind();
  viewToolbars.bind();
  viewMaximizeController.bind();
  roiController.bind();
  processTaskController.bind();
  processRecipeController.bind();
  processDiagnosticsController.bind();
  sectionControls.bind();
  sectionCollapseController.bind();
  sectionDetailRoiController.bind();
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
    readOnlyPreview: EMBEDDED_PREVIEW,
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

if (!EMBEDDED_PREVIEW) workspaceSession.start();
bindUi();
bindEmbeddedPreviewBridge();
loadBuildCommit();
if (!EMBEDDED_PREVIEW) {
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
}
renderSnapshots();
if (!EMBEDDED_PREVIEW || embeddedPreviewView === 'three') initThree();
syncBaseControls();
updateOperationUI();
maskImportController.syncTransformInputs();
renderAll();
if (threeView) fit3d();
if (EMBEDDED_PREVIEW) applyEmbeddedPreviewView(embeddedPreviewView);

if (
  !document.documentElement.classList.contains('workstation-ui-v2') ||
  !document.querySelector('.workstation-rail') ||
  !document.querySelector('.workstation-view-stage')
) {
  throw new Error('Workstation UI failed to initialize.');
}

document.documentElement.dataset.appReady = 'true';
document.documentElement.classList.remove('workstation-boot');
document.getElementById('workstationBootScreen')?.setAttribute('aria-hidden', 'true');

if (EMBEDDED_PREVIEW) {
  void initializeWorkspaceStart()
    .then((started) => {
      if (!started) throw new Error('Example preview could not be opened.');
      resetEmbeddedPreviewPlanFraming();
      applyEmbeddedPreviewView(embeddedPreviewView);
      globalThis.parent?.postMessage(
        { type: 'wafercad-preview-ready', view: embeddedPreviewView },
        globalThis.location.origin,
      );
    })
    .catch((error) => {
      console.error(error);
      globalThis.parent?.postMessage(
        { type: 'wafercad-preview-error', message: error.message },
        globalThis.location.origin,
      );
    });
} else {
  status('Ready. Create a base or import a layout.');
  void workspacePersistenceController.initializePersistedWorkspace();
}
