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
import { createSectionDetailRoiController } from './controllers/section-detail-roi-controller.js';
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
  workspaceSession = null,
  snapshotManager = null;

function persistWorkspaceNow() {
  return workspacePersistenceController?.persistNow() ?? Promise.resolve(false);
}

function scheduleWorkspacePersistence() {
  workspacePersistenceController?.schedule();
}

function markProjectDirty() {
  if (EMBEDDED_PREVIEW) return;
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
  onChanged: () => {
    markProjectDirty();
    threeView?.updateZCollapse();
  },
  onSettled: renderThree,
  formatXY,
  xyUnitLabel: () => xyUnit().label,
});

const sectionDetailRoiController = createSectionDetailRoiController({
  root: document,
  getRoi: () => sectionDetailRoi,
  setRoi: (value) => {
    sectionDetailRoi = value;
  },
  renderDetail: (canvas, roi) => planRenderers?.renderSectionDetail(canvas, roi),
  onChanged: markProjectDirty,
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
  panPlanView,
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
const {
  renderLayerLegend,
  colorNewLayer,
  colorNewImplant,
  colorNewElectricalRegion,
} = layerLegendController;

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
  sectionDetailRoiController?.sync();
}

let maskOpacity = 0.65,
  threeView = null,
  pendingThreeCamera = null,
  threeOpacity = 1,
  threeShowBorders = false;

function initThree() {
  if (threeView) return threeView;
  threeView = createThreeView({
    host: $('threeHost'),
    stats: $('threeStats'),
    getModel: () => model,
    getClipGeometry: roiGeometry,
    getInspection: () => ({ opacity: threeOpacity, borders: threeShowBorders }),
    getZCollapse: () => sectionCollapse,
    onViewChanged: (viewState) => {
      pendingThreeCamera = viewState ? structuredClone(viewState) : null;
      markProjectDirty();
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
  pendingHistoryStepEdit = null;

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
    sectionDetailRoi,
    planViews,
    xyDisplayUnit,
    activeStructurePalette,
    customStructurePalette,
    maskOpacity,
    threeOpacity,
    threeShowBorders,
    threeCamera: threeView?.getViewState?.() || pendingThreeCamera || null,
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
    sectionDetailRoi = next.sectionDetailRoi || null;
    if (next.xyDisplayUnit) xyDisplayUnit = next.xyDisplayUnit;
    if (next.activeStructurePalette) activeStructurePalette = next.activeStructurePalette;
    customStructurePalette = next.customStructurePalette;
    maskOpacity = next.maskOpacity;
    threeOpacity = next.threeOpacity;
    threeShowBorders = next.threeShowBorders;
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
    sectionDetailRoiController.sync();
  },
  setSectionEditEnabled,
});
const { buildProjectSnapshot, loadProjectSnapshot, resetProjectState, isValidSnapshotState } =
  projectStateController;

snapshotManager = createSnapshotManager({
  capture: () => buildProjectSnapshot(false),
  restore: (state) => loadProjectSnapshot(state),
  validateState: isValidSnapshotState,
});

function cancelHistoricalStepEdit() {
  pendingHistoryStepEdit = null;
}

function currentHistoricalStepEdit() {
  if (!pendingHistoryStepEdit) return null;
  const {
    nodeId,
    branchId,
    branchName,
    parentNodeId,
    mode,
    originalLabel,
    downstreamCount,
  } = pendingHistoryStepEdit;
  return {
    nodeId,
    branchId,
    branchName,
    parentNodeId,
    mode,
    originalLabel,
    downstreamCount,
  };
}

function refreshAfterHistoricalEditLoad() {
  syncBaseControls();
  maskImportController?.syncTransformInputs();
  renderAll();
  fit3d();
}

async function beginHistoricalStepEdit(node) {
  const context = snapshotManager.stepEditContext(node?.id);
  if (!context?.editable) {
    status(context?.reason || 'This Step cannot be edited from History.', 'warning');
    return false;
  }
  if (!node?.replayable || !processPanelController?.canReplayOperation(node.operation)) {
    status(
      'This Step predates replay metadata. Restore it or create a Variant from here instead.',
      'warning',
    );
    return false;
  }

  const downstreamReplayable = context.downstreamReplayable;
  const detailParts = [
    `${context.downstreamCount} downstream Step${context.downstreamCount === 1 ? '' : 's'} follow this Step.`,
  ];
  if (!context.canReplaceCurrentVariant) {
    detailParts.push(
      `Update current Variant is unavailable because ${context.dependentVariants
        .map((item) => `"${item.name}"`)
        .join(', ')} depend on this history tail.`,
    );
  }
  if (!downstreamReplayable && context.downstreamCount) {
    detailParts.push(
      'Some downstream Steps predate replay metadata, so automatic downstream recompute is unavailable.',
    );
  }

  const actions = [{ value: 'cancel', label: 'Cancel' }];
  if (context.canReplaceCurrentVariant && downstreamReplayable) {
    actions.push({
      value: 'update-recompute',
      label: context.downstreamCount ? 'Update & recompute' : 'Update current Variant',
    });
  }

  const canCreateVariant = snapshotManager.canCreateVariant();
  const canBranchHere = canCreateVariant && snapshotManager.canRecordOperation(1);
  const canBranchRecompute =
    canCreateVariant &&
    downstreamReplayable &&
    snapshotManager.canRecordOperation(1 + context.downstreamCount);
  if (!canCreateVariant) {
    detailParts.push('The Variant limit has been reached, so branching is unavailable.');
  } else if (!canBranchHere) {
    detailParts.push('Process History has no capacity for another Variant Step.');
  }

  if (canBranchHere) {
    actions.push({ value: 'branch-here', label: 'Branch from here' });
  }
  if (canBranchRecompute) {
    actions.push({
      value: 'branch-recompute',
      label: context.downstreamCount ? 'Branch & recompute' : 'Branch & apply',
      kind: 'primary',
      default: true,
    });
  } else if (
    canBranchHere &&
    (!downstreamReplayable || !snapshotManager.canRecordOperation(1 + context.downstreamCount))
  ) {
    actions[actions.length - 1].kind = 'primary';
    actions[actions.length - 1].default = true;
  } else if (actions.length > 1 && !actions.some((action) => action.default)) {
    actions[actions.length - 1].kind = 'primary';
    actions[actions.length - 1].default = true;
  }

  if (actions.length === 1) {
    status('No safe edit strategy is available at the current History/Variant limits.', 'warning');
    return false;
  }

  const choice = await confirmationDialog.ask({
    title: 'Edit historical Step',
    message: `Edit "${node.operation?.label || node.operation?.kind || 'Process step'}"?`,
    detail: detailParts.join(' '),
    actions,
    cancelValue: 'cancel',
  });
  if (choice === 'cancel') return false;

  if (
    (choice === 'update-recompute' || choice === 'branch-recompute') &&
    !downstreamReplayable
  ) {
    status('Automatic downstream recompute is unavailable for this legacy history tail.', 'warning');
    return false;
  }

  const replayContext =
    choice === 'branch-here' || context.downstreamCount === 0
      ? context
      : snapshotManager.stepEditContext(node.id, { includeReplayStates: true });
  if (!replayContext?.editable) {
    status('Historical Step replay context could not be prepared.', 'error');
    return false;
  }

  await checkpointWorkspace('pre-history-step-edit');
  const restored = snapshotManager.restoreStepInput(node.id);
  if (!restored) {
    status('Could not restore the input state for this Step.', 'error');
    return false;
  }

  pendingHistoryStepEdit = {
    nodeId: node.id,
    branchId: context.branchId,
    branchName: context.branchName,
    parentNodeId: context.parentNodeId,
    mode: choice,
    originalLabel: node.operation?.label || node.operation?.kind || 'Process step',
    downstreamCount: context.downstreamCount,
    downstream:
      choice === 'branch-here'
        ? []
        : replayContext.downstream.map((item) => structuredClone(item)),
  };

  refreshAfterHistoricalEditLoad();
  if (!processPanelController.loadOperationForEdit(node.operation)) {
    pendingHistoryStepEdit = null;
    snapshotManager.restoreActiveBranchHead();
    refreshAfterHistoricalEditLoad();
    status('This Step cannot be loaded into the current Process editor.', 'error');
    return false;
  }

  markProjectDirty();
  renderSnapshots();
  document.querySelector('.workstation-rail-button[data-tool="process"]')?.click();
  const modeLabel =
    choice === 'update-recompute'
      ? 'update this Variant and recompute its downstream Steps'
      : choice === 'branch-recompute'
        ? 'create a Variant and recompute its downstream Steps'
        : 'create a Variant from this Step without downstream Steps';
  status(`Editing "${pendingHistoryStepEdit.originalLabel}". Apply to ${modeLabel}.`, 'success');
  return true;
}

async function finishHistoricalStepEdit({ applyGate, branchCommit } = {}) {
  if (!applyGate?.historyStepEdit) return false;
  const edit = pendingHistoryStepEdit;
  if (
    !edit ||
    edit.nodeId !== applyGate.nodeId ||
    edit.branchId !== applyGate.branchId ||
    edit.parentNodeId !== applyGate.parentNodeId
  ) {
    status('Historical Step edit context changed before completion.', 'error');
    pendingHistoryStepEdit = null;
    return true;
  }

  const downstream = edit.downstream.map((step) => structuredClone(step));
  const mode = edit.mode;
  const targetVariant = snapshotManager.activeBranch().name;
  pendingHistoryStepEdit = null;

  if (mode === 'branch-here' || downstream.length === 0) {
    markProjectDirty();
    renderSnapshots();
    status(
      mode === 'branch-here'
        ? `Created Variant "${branchCommit?.name || targetVariant}" from the edited Step.`
        : `Updated "${targetVariant}". No downstream Steps required recompute.`,
      'success',
    );
    return true;
  }

  const replay = await processPanelController.replayOperations(downstream);
  markProjectDirty();
  renderSnapshots();
  if (!replay.ok) {
    const failedLabel =
      replay.failedOperation?.label || replay.failedOperation?.kind || 'downstream Step';
    status(
      `Recompute stopped after ${replay.completed}/${downstream.length} downstream Steps at "${failedLabel}": ${replay.error} A Recovery checkpoint was saved before the edit.`,
      'warning',
    );
    return true;
  }

  status(
    `Recomputed ${replay.completed} downstream Step${replay.completed === 1 ? '' : 's'} in Variant "${snapshotManager.activeBranch().name}".`,
    'success',
  );
  return true;
}

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
  beginHistoricalStepEdit,
  getHistoricalStepEdit: currentHistoricalStepEdit,
  cancelHistoricalStepEdit,
});
const {
  renderSnapshots,
  openLayoutFile,
  openProjectFile,
  openBundledExample,
} = projectController;

async function ensureWritableProcessBranch() {
  const continuation = snapshotManager.continuationContext();
  if (pendingHistoryStepEdit) {
    const edit = pendingHistoryStepEdit;
    if (
      !continuation ||
      continuation.branchId !== edit.branchId ||
      continuation.cursorNodeId !== edit.parentNodeId
    ) {
      pendingHistoryStepEdit = null;
      status('Historical Step edit context changed. Start the edit again from History.', 'error');
      return false;
    }
    const requiredSteps =
      edit.mode === 'update-recompute'
        ? 0
        : edit.mode === 'branch-recompute'
          ? 1 + edit.downstreamCount
          : 1;
    if (requiredSteps && !snapshotManager.canRecordOperation(requiredSteps)) {
      status('Process history limit reached before this edit could be committed.', 'error');
      return false;
    }
    if (edit.mode !== 'update-recompute' && !snapshotManager.canCreateVariant()) {
      status('Variant limit reached before this edit could be committed.', 'error');
      return false;
    }
    return {
      historyStepEdit: true,
      nodeId: edit.nodeId,
      branchId: edit.branchId,
      parentNodeId: edit.parentNodeId,
      mode: edit.mode,
    };
  }

  if (!snapshotManager.canRecordOperation()) {
    status('Process history limit reached. Delete or export this project before adding more steps.', 'error');
    return false;
  }

  if (!continuation) return { createVariant: false };

  const confirmed = await confirmationDialog.confirm({
    title: 'Continue from historical state?',
    message: continuation.processLabel
      ? `Step "${continuation.processLabel}" is behind the current Variant HEAD.`
      : continuation.snapshotName
        ? `Legacy bookmark "${continuation.snapshotName}" is behind the current Variant HEAD.`
        : 'The workspace is behind the current Variant HEAD.',
    detail:
      'If this operation succeeds, WaferCAD will create a new Variant from this historical state. The existing Variant and its HEAD remain unchanged.',
    confirmLabel: 'Create Variant & apply',
  });
  if (!confirmed) return false;

  return {
    createVariant: true,
    branchId: continuation.branchId,
    snapshotId: continuation.snapshotId,
    cursorNodeId: continuation.cursorNodeId,
  };
}

function commitWritableProcessBranch(gate) {
  if (gate?.historyStepEdit) {
    const edit = pendingHistoryStepEdit;
    const continuation = snapshotManager.continuationContext();
    if (
      !edit ||
      edit.nodeId !== gate.nodeId ||
      edit.branchId !== gate.branchId ||
      edit.parentNodeId !== gate.parentNodeId ||
      !continuation ||
      continuation.branchId !== edit.branchId ||
      continuation.cursorNodeId !== edit.parentNodeId
    ) {
      throw new Error('Historical Step edit context changed before the operation completed.');
    }

    let created = null;
    if (edit.mode === 'update-recompute') {
      snapshotManager.replaceBranchTailFrom(edit.nodeId);
    } else {
      created = snapshotManager.createBranchFromCursor();
    }
    markProjectDirty();
    renderSnapshots();
    return created;
  }

  if (!gate?.createVariant) return null;
  const continuation = snapshotManager.continuationContext();
  if (
    !continuation ||
    continuation.branchId !== gate.branchId ||
    continuation.snapshotId !== gate.snapshotId ||
    continuation.cursorNodeId !== gate.cursorNodeId
  ) {
    throw new Error('Historical state changed before the operation completed.');
  }

  const created = snapshotManager.createBranchFromCursor();
  markProjectDirty();
  renderSnapshots();
  status(`Created variant "${created.name}" for continued processing.`);
  return created;
}

function recordProcessOperation(operation) {
  const recorded = snapshotManager.recordOperation(operation);
  markProjectDirty();
  renderSnapshots();
  return recorded;
}

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
  setActiveFace: (value) => {
    activeFace = value === 'back' ? 'back' : 'front';
    markProjectDirty();
  },
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
  beforeApply: ensureWritableProcessBranch,
  commitApplyBranch: commitWritableProcessBranch,
  recordProcessOperation,
  afterApply: finishHistoricalStepEdit,
  clearBaseRevertSnapshot: () => {
    baseRevertSnapshot = null;
  },
  colorNewLayer,
  colorNewImplant,
  colorNewElectricalRegion,
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
  openBundledExample,
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

function applyEmbeddedPreviewView(view) {
  if (!EMBEDDED_PREVIEW) return;
  const next = ['main', 'mask', 'three', 'section'].includes(view) ? view : 'main';
  embeddedPreviewView = next;
  document.documentElement.dataset.previewView = next;

  if (next === 'section') {
    $('mainPanel').hidden = true;
    $('maskPanel').hidden = true;
    $('threePanel').hidden = true;
    $('sectionPanel').hidden = false;
    renderSection();
  } else {
    $('sectionPanel').hidden = true;
    workstationUiController.applyViewMode(next, { refresh: false, remember: false });
    if (next === 'three') {
      initThree();
      renderThree();
      if (pendingThreeCamera) threeView?.setViewState?.(pendingThreeCamera);
      else fit3d();
    } else if (next === 'main') {
      renderMain();
    } else if (next === 'mask') {
      renderMask();
    }
  }

  requestAnimationFrame(() => globalThis.dispatchEvent(new Event('resize')));
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

function bindUi() {
  workstationUiController.bind();
  viewPopovers.bind();
  viewMaximizeController.bind();
  roiController.bind();
  processTaskController.bind();
  sectionControls.bind();
  sectionCollapseController.bind();
  sectionDetailRoiController.bind();
  baseControls.bind();
  maskImportController.bind();
  maskRoiController.bind();
  drawMaskController.bind();
  workspaceActions.bind();
  mainCanvasController.bind();
  if (!EMBEDDED_PREVIEW) workspacePersistenceController.bind();

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
