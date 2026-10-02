import { parseLayoutFile } from './layout-io.js';
import {
  baseCoverageState,
  cloneModel,
  createModel,
  fullFaceGeometry,
  hasMaterial,
  layerById,
  surfaceSegment,
  surfaceZ,
} from './model.js';
import {
  bufferPolyline,
  circleMulti,
  difference,
  intersection,
  isEmpty,
  rectMulti,
  transformMulti,
  unionGeometries,
} from './vector-geometry.js';
import { downloadProject } from './project-io.js';
import { createThreeView } from './three-view.js';
import { sectorBoundaryPoints } from './roi-editor.js';
import { maskRoiWorldGeometry } from './mask-roi-geometry.js';
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
import {
  clearWorkspaceRecoveryPoints,
  clearWorkspaceState,
  createWorkspaceRecoveryCheckpoint,
  listWorkspaceRecoveryPoints,
  loadWorkspaceRecoveryPoint,
  loadWorkspaceState,
  saveWorkspaceState,
} from './workspace-persistence.js';
import { createBuildController } from './controllers/build-controller.js';
import { createFeedbackController } from './controllers/feedback-controller.js';
import { createStartupController } from './controllers/startup-controller.js';
import { bindToolTabs } from './controllers/tool-tabs-controller.js';
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
import { createBaseControlsController } from './controllers/base-controls-controller.js';
import { createMaskImportController } from './controllers/mask-import-controller.js';
import { createMainCanvasController } from './controllers/main-canvas-controller.js';
import { createWorkspaceActionsController } from './controllers/workspace-actions-controller.js';
import { createWorkspaceSessionController } from './controllers/workspace-session-controller.js';
import { createDrawMaskController } from './controllers/draw-mask-controller.js';
import {
  createEmptyDrawMask,
  drawMaskGeometry,
  drawShapeContainsPoint,
} from './draw-mask-geometry.js';
import {
  createEmptyLayout,
  createProjectStateController,
} from './controllers/project-state-controller.js';
import { createPlanViewController } from './controllers/plan-view-controller.js';
import { createPlanRenderers } from './plan-renderers.js';

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
const viewPopovers = createViewPopoverController({ root: document });

function status(message, level = 'auto') {
  feedback.show(message, level);
}

function normalizedProjectName(value = projectName) {
  return String(value ?? '').trim().slice(0, 256) || 'Untitled';
}

function projectExportFilename() {
  const stem = normalizedProjectName()
    .replace(/[<>:"|?*\u0000-\u001f]/g, '-')
    .replace(/[\\/]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  return `${stem || 'Untitled'}.wafercad`;
}

function syncProjectNameInput() {
  const input = $('projectNameInput');
  if (input && document.activeElement !== input) input.value = normalizedProjectName();
}

let workspacePersistenceReady = false,
  workspacePersistenceTimer = null,
  workspacePersistenceWrite = Promise.resolve(),
  workspaceSession = null,
  workspaceUpdateCommit = '';

function setWorkspaceSaveStatus(text, failed = false) {
  const host = $('workspaceSaveStatus');
  if (!host) return;
  host.textContent = text;
  host.dataset.failed = failed ? 'true' : 'false';
}

function savedTimeLabel(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function persistWorkspaceNow() {
  if (!workspacePersistenceReady || !workspaceSession?.canWrite()) return Promise.resolve(false);
  if (workspacePersistenceTimer != null) {
    clearTimeout(workspacePersistenceTimer);
    workspacePersistenceTimer = null;
  }
  const project = buildProjectSnapshot(true);
  setWorkspaceSaveStatus('Autosaving…');
  workspacePersistenceWrite = workspacePersistenceWrite
    .catch(() => {})
    .then(() => saveWorkspaceState(project, { appCommit: loadedBuildVersion }))
    .then(() => {
      setWorkspaceSaveStatus(`Autosaved · ${savedTimeLabel()}`);
      return true;
    });
  workspacePersistenceWrite.catch((error) => {
    setWorkspaceSaveStatus('Local save failed', true);
    console.warn('Workspace autosave failed.', error);
  });
  return workspacePersistenceWrite;
}

function scheduleWorkspacePersistence() {
  if (!workspacePersistenceReady || !workspaceSession?.canWrite()) return;
  setWorkspaceSaveStatus('Autosaving…');
  if (workspacePersistenceTimer != null) clearTimeout(workspacePersistenceTimer);
  workspacePersistenceTimer = setTimeout(() => {
    workspacePersistenceTimer = null;
    void persistWorkspaceNow();
  }, 800);
}

async function refreshRecoveryOptions() {
  const select = $('workspaceRecoverySelect'),
    restore = $('workspaceRestoreBtn'),
    clear = $('workspaceRecoveryClearBtn');
  if (!select || !restore) return;
  try {
    const points = await listWorkspaceRecoveryPoints();
    select.replaceChildren();
    if (!points.length) {
      select.append(new Option('No recovery points', ''));
      restore.disabled = true;
      if (clear) clear.disabled = true;
      return;
    }
    for (const point of points) {
      const date = new Date(point.updatedAt);
      const reason = point.reason ? ` · ${point.reason}` : '';
      const commit = point.appCommit ? ` · ${point.appCommit.slice(0, 7)}` : '';
      select.append(new Option(`${date.toLocaleString()}${reason}${commit}`, point.key));
    }
    const writable = workspaceSession?.canWrite() ?? false;
    restore.disabled = !writable;
    if (clear) clear.disabled = !writable;
  } catch (error) {
    console.warn('Could not list workspace recovery points.', error);
  }
}

function syncWorkspaceSessionState({ writable }) {
  const workspace = document.querySelector('.workspace'),
    dialog = $('workspaceConflictDialog');
  if (workspace) {
    workspace.inert = false;
    workspace.dataset.autosaveOwner = writable ? 'true' : 'false';
  }
  if (dialog) dialog.hidden = writable;
  if (!writable) {
    if (workspacePersistenceTimer != null) {
      clearTimeout(workspacePersistenceTimer);
      workspacePersistenceTimer = null;
    }
    setWorkspaceSaveStatus('Autosave paused · another tab owns local storage');
    if ($('workspaceRestoreBtn')) $('workspaceRestoreBtn').disabled = true;
    if ($('workspaceRecoveryClearBtn')) $('workspaceRecoveryClearBtn').disabled = true;
    status(
      'Another tab owns local autosave. Editing and mask import remain available; use Take over to save from this tab.',
      'warning',
    );
  } else {
    if (workspacePersistenceReady) scheduleWorkspacePersistence();
    void refreshRecoveryOptions();
  }
}

const loadedBuildVersion = new URL(import.meta.url).searchParams.get('v') || '';
workspaceSession = createWorkspaceSessionController({
  onStateChange: syncWorkspaceSessionState,
});

const { checkForBuildUpdate, loadBuildCommit } = createBuildController({
  buildVersion: loadedBuildVersion,
  status,
  onUpdateAvailable: (commit) => {
    workspaceUpdateCommit = commit;
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
  }),
  viewport,
  worldToCanvas,
  maskPoint,
  selectedElement,
  layerKey,
  layerColor,
  formatXY,
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
  onChanged: () => {
    updateOperationUI();
    scheduleWorkspacePersistence();
  },
  status,
});

const layerLegendController = createLayerLegendController({
  getModel: () => model,
  getActiveStructurePalette: () => activeStructurePalette,
  setActiveStructurePalette: (value) => {
    activeStructurePalette = value;
  },
  getCustomStructurePalette: () => customStructurePalette,
  setCustomStructurePalette: (value) => {
    customStructurePalette = value;
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
  status,
});
const { renderLayerLegend, colorNewLayer, colorNewImplant } = layerLegendController;

function selectedFileMaskGeometry() {
  const geoms = [];
  for (const e of layout.elements || []) {
    if (!selectedElement(e)) continue;
    if (e.kind === 'polygon') {
      geoms.push([[e.points.map(maskPoint)]]);
    } else if (e.kind === 'path' && e.width > 0) {
      geoms.push(
        bufferPolyline(e.points.map(maskPoint), (e.width * maskTransform.scale) / 2, 28, false),
      );
    }
  }
  const merged = unionGeometries(geoms);
  return isEmpty(merged) ? [] : merged;
}
function activeMaskGeometry() {
  const selected =
    maskSourceMode === 'draw' ? drawMaskGeometry(drawMask) : selectedFileMaskGeometry();
  return isEmpty(selected) ? [] : intersection(selected, model.boundary);
}

function maskRoiGeometry() {
  if (!maskRoi) return null;
  const transform =
    maskSourceMode === 'file'
      ? maskTransform
      : { x: 0, y: 0, scale: 1, rotation: 0 };
  return maskRoiWorldGeometry(maskRoi, transform, 96);
}

function operationAreaGeometry(mode) {
  let area;
  if (mode === 'full') {
    area = fullFaceGeometry(model);
  } else {
    const selected = activeMaskGeometry();
    if (isEmpty(selected)) return [];
    area = mode === 'invert' ? difference(model.boundary, selected) : selected;
  }

  const limiter = maskRoiGeometry();
  return limiter ? intersection(area, limiter) : area;
}
function roiGeometry() {
  if (!roi) return null;
  if (roi.type === 'rect') {
    const x0 = Math.min(roi.a[0], roi.b[0]),
      x1 = Math.max(roi.a[0], roi.b[0]),
      y0 = Math.min(roi.a[1], roi.b[1]),
      y1 = Math.max(roi.a[1], roi.b[1]);
    return rectMulti(x1 - x0, y1 - y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  if (roi.type === 'circle') return circleMulti(roi.r * 2, roi.r * 2, 96, roi.c[0], roi.c[1]);
  if (roi.type === 'sector') {
    const ring = sectorBoundaryPoints(roi, 96);
    return ring.length ? [[ring]] : null;
  }
  return null;
}
function stateSnapshot() {
  return { model: cloneModel(model), section: structuredClone(section) };
}
function restoreSnapshot(snapshot) {
  model = cloneModel(snapshot.model);
  section = structuredClone(snapshot.section || section);
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
  const imported = await parseLayoutFile(arrayBuffer, filename);
  applyImportedLayout(imported, displayName);
  return imported;
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
  threeView?.render();
  scheduleWorkspacePersistence();
}

function fit3d() {
  threeView?.fit();
}

function baseSummaryText() {
  const coverage = baseCoverageState(model);
  const shape =
    model.shape === 'circle'
      ? `Circle · Ø${formatXY(model.width)} ${xyUnit().label}`
      : `Rectangle · ${formatXY(model.width)} × ${formatXY(model.height)} ${xyUnit().label}`;
  const state =
    coverage === 'removed'
      ? 'Base removed'
      : coverage === 'partial'
        ? 'Base partially removed'
        : 'Base present';
  return `${shape} · ${state}`;
}

function syncMaskSourceSummary() {
  if (maskSourceMode === 'draw') {
    $('maskSummary').textContent = `Draw · ${drawMask.shapes.length} shapes`;
    $('maskCellLabel').textContent = `${drawMask.shapes.length} drawn`;
  } else {
    $('maskSummary').textContent = layout.name || 'No mask';
    syncMaskCellLabel();
  }
}

function renderAll() {
  renderCellTree();
  renderMaskList();
  renderLayerLegend();
  renderMask();
  renderMain();
  renderSection();
  renderThree();
  syncRoiEditor();
  $('mainFaceLabel').textContent = `${activeFace} surface`;
  const faceLabel = activeFace[0].toUpperCase() + activeFace.slice(1);
  $('faceToggleBtn').textContent = faceLabel;
  $('faceToggleBtn').setAttribute('aria-label', `Switch active face; currently ${faceLabel}`);
  syncMaskSourceSummary();
  syncProjectNameInput();
  drawMaskController?.syncUi();
  maskRoiController?.syncEditor();
  $('baseSummary').textContent = baseSummaryText();
  updateOperationUI();
  syncUndo();
}
function resetRoughDraftControls() {
  $('roughPolarity').value = 'inverted';
  $('roughFeatureSize').value = formatLengthField(0.5);
  $('roughAmplitude').value = formatLengthField(1);
  $('roughFeatureCv').value = '25';
  $('roughHeightCv').value = '25';
}

function syncBaseControls() {
  $('baseWidth').value = formatLengthField(model.width);
  $('baseHeight').value = formatLengthField(model.height);
  $('baseThickness').value = formatLengthField(model.thickness);
  $('baseHeight').disabled = model.shape === 'circle';
  $('baseWidthUnit').textContent = xyUnit().label;
  $('baseHeightUnit').textContent = xyUnit().label;
  $('baseThicknessUnit').textContent = xyUnit().label;
  $('operationThicknessUnit').textContent = xyUnit().label;
  $('roughFeatureUnit').textContent = xyUnit().label;
  $('roughHeightUnit').textContent = xyUnit().label;
  $('xyUnitSelect').value = xyDisplayUnit;
  $('applyBaseBtn').textContent =
    baseCoverageState(model) === 'removed' ? 'Recreate base' : 'Apply base';
  document
    .querySelectorAll('#substrateShape button')
    .forEach((b) => b.classList.toggle('active', b.dataset.shape === model.shape));
}
let processPanelController = null;

function updateOperationUI() {
  processPanelController?.updateUi();
}

async function applyOp() {
  if (processTaskController?.isBusy()) {
    status('An operation is already running. Abort it before starting another.', 'warning');
    return;
  }

  const type = $('operationType').value,
    thickness = manualMicron($('operationThickness').value);
  $('operationThickness').value = formatLengthField(thickness);
  if (!(thickness > 0)) return status('Thickness must be greater than zero.', 'error');

  const areaMode = $('operationArea').value;

  const name =
      type === 'implant'
        ? $('implantName').value.trim() || `Implant ${model.nextImplantId || 1}`
        : $('layerName').value.trim() || `Layer ${model.layers.length}`,
    targetLayerId = $('targetLayer').value;
  if (type === 'grow' && !targetLayerId) {
    return status('No exposed target layer is available to Extend.', 'warning');
  }

  let roughSurface = null;
  const etchSurfaceMode = $('etchSurfaceMode').value;
  if (type === 'etch' && etchSurfaceMode !== 'smooth') {
    const pyramid = etchSurfaceMode === 'pyramid',
      featureSize = manualMicron($('roughFeatureSize').value),
      meanHeight = manualMicron($('roughAmplitude').value),
      featureCvPercent = pyramid ? 0 : Number($('roughFeatureCv').value),
      heightCvPercent = pyramid ? 0 : Number($('roughHeightCv').value),
      featureCv = featureCvPercent / 100,
      heightCv = heightCvPercent / 100;
    $('roughFeatureSize').value = formatLengthField(featureSize);
    $('roughAmplitude').value = formatLengthField(meanHeight);
    if (!(featureSize > 0) || !(meanHeight > 0)) {
      return status(
        pyramid
          ? 'Pyramid XY and Height must be greater than zero.'
          : 'Rough mean Feature XY and Height must be greater than zero.',
        'error',
      );
    }
    if (meanHeight > thickness + 1e-9) {
      return status(
        pyramid
          ? 'Pyramid Height cannot exceed Etch Depth.'
          : 'Rough mean Height cannot exceed Etch Depth.',
        'error',
      );
    }
    if (
      !Number.isFinite(featureCvPercent) ||
      !Number.isFinite(heightCvPercent) ||
      featureCvPercent < 0 ||
      featureCvPercent > 100 ||
      heightCvPercent < 0 ||
      heightCvPercent > 100
    ) {
      return status('Rough Feature CV and Height CV must be between 0% and 100%.', 'error');
    }
    roughSurface = {
      kind: 'rough',
      morphology: pyramid ? 'pyramid' : 'stochastic',
      polarity: $('roughPolarity').value === 'normal' ? 'normal' : 'inverted',
      featureSize,
      meanHeight,
      featureCv,
      heightCv,
      geometryMode: 'ideal',
    };
  }

  const beforeBase = baseCoverageState(model),
    params = { type, name, targetLayerId, thickness, face: activeFace };
  if (type === 'etch') params.surface = roughSurface;
  else if (type === 'implant') {
    const tilt = Number($('implantTilt').value);
    if (!Number.isFinite(tilt) || tilt < -80 || tilt > 80) {
      return status('Implant Tilt X must be between -80° and 80°.', 'error');
    }
    params.tilt = tilt;
  } else params.growth = $('growthMode').value;

  const taskLabel =
    type === 'etch'
      ? 'Etching structure…'
      : type === 'grow'
        ? 'Extending layer…'
        : type === 'implant'
          ? `Marking ${name} implant…`
          : `Depositing ${name}…`;

  const areaRequest = {
    mode: areaMode,
    maskSourceMode,
    maskRoi: maskRoi ? structuredClone(maskRoi) : null,
    ...(maskSourceMode === 'draw'
      ? { drawMask: structuredClone(drawMask) }
      : {
          maskTransform: { ...maskTransform },
          elements: (layout.elements || [])
            .filter(selectedElement)
            .map((element) => ({
              kind: element.kind,
              width: element.width,
              points: element.points,
            })),
        }),
  };

  const task = await processTaskController.run(model, params, taskLabel, areaRequest);
  if (task?.aborted || task?.error || task?.busy) return;

  const result = task.result;
  if (!result?.changed) {
    return status(result?.error || 'The operation did not change the model.', 'warning');
  }

  saveHistory();
  baseRevertSnapshot = null;
  model = task.model;

  if (type === 'add' && result.layerId) {
    colorNewLayer(result.layerId);
    $('layerName').value = `Layer ${model.nextLayerId}`;
  } else if (type === 'implant' && result.implantId) {
    colorNewImplant(result.implantId);
    $('implantName').value = `Implant ${model.nextImplantId || (model.implants?.length || 0) + 1}`;
  }

  renderAll();

  if (!hasMaterial(model)) {
    return status(
      'All material has been removed. Undo, restore a snapshot, or recreate the Base.',
      'warning',
    );
  }

  const afterBase = baseCoverageState(model);
  if (type === 'etch' && beforeBase !== 'removed' && afterBase === 'removed') {
    return status(
      'Base fully removed. Remaining material, if any, is shown independently.',
      'warning',
    );
  }

  const growthLabel =
    type === 'etch' || type === 'implant'
      ? ''
      : params.growth === 'conformal'
        ? ' · Conformal'
        : ' · Directional';
  status(
    `${
      type === 'etch'
        ? 'Etched'
        : type === 'grow'
          ? `Extended ${layerById(model, targetLayerId)?.name || 'layer'}`
          : type === 'implant'
            ? `Marked implant ${name} (experimental)`
            : `Deposited ${name}`
    }${growthLabel} on the ${activeFace}${maskRoi ? ' within Mask ROI' : ''}.`,
    'success',
  );
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
  },
  getSnapshotRecords: () => snapshotManager.exportRecords(),
  syncThreeControls: ({
    maskOpacity: maskAlpha,
    threeOpacity: opacity,
    threeShowBorders: borders,
  }) => {
    $('maskOpacityRange').value = String(maskAlpha);
    $('maskOpacityValue').value = `${Math.round(maskAlpha * 100)}%`;
    $('threeOpacityRange').value = String(opacity);
    $('threeOpacityValue').value = `${Math.round(opacity * 100)}%`;
    $('threeBorders').checked = borders;
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

const projectController = createProjectController({
  importLayoutBuffer,
  loadProjectSnapshot,
  snapshotManager,
  syncBaseControls,
  syncTransformInputs: () => maskImportController.syncTransformInputs(),
  renderAll,
  fit3d,
  status,
  onProjectChanged: scheduleWorkspacePersistence,
});
const { renderSnapshots, openLayoutFile, openProjectFile, openVisualizationExample } =
  projectController;

const maskImportController = createMaskImportController({
  getMaskTransform: () => maskTransform,
  setMaskTransform: (value) => {
    maskTransform = value;
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
  },
  getDrawMask: () => drawMask,
  setDrawMask: (value) => {
    drawMask = value;
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
  getActiveFace: () => activeFace,
  operationAreaGeometry,
  processTaskController,
});

const baseControls = createBaseControlsController({
  getModel: () => model,
  setModel: (value) => {
    model = value;
  },
  setSection: (value) => {
    section = value;
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
});

const workspaceActions = createWorkspaceActionsController({
  getXyUnit: xyUnit,
  setXyDisplayUnit: (value) => {
    xyDisplayUnit = value;
  },
  formatLengthField,
  manualMicron,
  syncTransformInputs: () => maskImportController.syncTransformInputs(),
  renderAll,
  status,
  getActiveFace: () => activeFace,
  setActiveFace: (value) => {
    activeFace = value;
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
  },
  getSectionShowBorders: () => sectionShowBorders,
  setSectionShowBorders: (value) => {
    sectionShowBorders = Boolean(value);
  },
  renderSection,
  getMaskOpacity: () => maskOpacity,
  setMaskOpacity: (value) => {
    maskOpacity = value;
  },
  renderMask,
  getThreeOpacity: () => threeOpacity,
  setThreeOpacity: (value) => {
    threeOpacity = value;
  },
  getThreeShowBorders: () => threeShowBorders,
  setThreeShowBorders: (value) => {
    threeShowBorders = value;
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
});

const mainCanvasController = createMainCanvasController({
  getSection: () => section,
  setSection: (value) => {
    section = value;
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

async function restoreSelectedWorkspaceRecovery() {
  if (!workspaceSession?.canWrite()) {
    status('This tab is read-only. Take over the workspace before restoring a checkpoint.', 'warning');
    return;
  }
  const key = $('workspaceRecoverySelect')?.value;
  if (!key) return;
  if (
    !globalThis.confirm(
      'Restore this local recovery checkpoint? The current workspace will be checkpointed first.',
    )
  ) {
    return;
  }

  try {
    const current = buildProjectSnapshot(true);
    await createWorkspaceRecoveryCheckpoint(current, {
      appCommit: loadedBuildVersion,
      reason: 'pre-restore',
    });
    const recovered = await loadWorkspaceRecoveryPoint(key);
    if (!recovered) throw new Error('Recovery checkpoint is unavailable.');
    loadProjectSnapshot(recovered);
    snapshotManager.importRecords(recovered.snapshots || []);
    syncBaseControls();
    maskImportController.syncTransformInputs();
    renderAll();
    renderSnapshots();
    fit3d();
    await persistWorkspaceNow();
    await refreshRecoveryOptions();
    status(`Restored local recovery checkpoint for "${normalizedProjectName()}".`);
  } catch (error) {
    console.error(error);
    status(`Recovery restore failed: ${error.message}`, 'error');
  }
}

async function reloadWorkspaceSafely() {
  if (!workspaceSession?.canWrite()) {
    status('This tab is read-only. Update from the tab that owns the workspace.', 'warning');
    return;
  }
  const button = $('safeReloadBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Saving…';
  }

  try {
    if (workspacePersistenceTimer != null) {
      clearTimeout(workspacePersistenceTimer);
      workspacePersistenceTimer = null;
    }
    const project = buildProjectSnapshot(true);
    setWorkspaceSaveStatus('Autosaving…');
    workspacePersistenceWrite = workspacePersistenceWrite
      .catch(() => {})
      .then(() => saveWorkspaceState(project, { appCommit: loadedBuildVersion }))
      .then(() =>
        createWorkspaceRecoveryCheckpoint(project, {
          appCommit: loadedBuildVersion,
          reason: workspaceUpdateCommit
            ? `pre-update-${workspaceUpdateCommit.slice(0, 7)}`
            : 'pre-reload',
        }),
      );
    await workspacePersistenceWrite;
    setWorkspaceSaveStatus(`Autosaved · ${savedTimeLabel()}`);
    workspaceSession.stop();
    globalThis.location.reload();
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = 'Reload safely';
    }
    setWorkspaceSaveStatus('Local save failed', true);
    status(`Safe reload cancelled: ${error.message}`, 'error');
  }
}

function bindUi() {
  bindToolTabs();
  viewPopovers.bind();
  viewMaximizeController.bind();
  roiController.bind();
  processTaskController.bind();
  sectionControls.bind();
  baseControls.bind();
  maskImportController.bind();
  maskRoiController.bind();
  drawMaskController.bind();
  workspaceActions.bind();
  mainCanvasController.bind();

  $('workspaceTakeOverBtn').onclick = () => {
    if (
      !globalThis.confirm(
        'Take over editing in this tab? The other tab will become read-only and may contain newer unsaved edits.',
      )
    ) {
      return;
    }
    if (workspaceSession.takeOver()) {
      status('This tab now owns the local workspace.');
      scheduleWorkspacePersistence();
      void refreshRecoveryOptions();
    }
  };
  $('safeReloadBtn').onclick = () => {
    void reloadWorkspaceSafely();
  };
  $('workspaceRecoverySelect').onchange = (event) => {
    $('workspaceRestoreBtn').disabled = !event.target.value || !workspaceSession?.canWrite();
  };
  $('workspaceRestoreBtn').onclick = () => {
    void restoreSelectedWorkspaceRecovery();
  };
  $('workspaceRecoveryClearBtn').onclick = async () => {
    if (!workspaceSession?.canWrite()) {
      status('This tab cannot clear local Recovery while another tab owns browser storage.', 'warning');
      return;
    }
    if (!globalThis.confirm('Clear all local Recovery checkpoints? The current autosaved workspace is kept.')) {
      return;
    }
    try {
      const removed = await clearWorkspaceRecoveryPoints();
      await refreshRecoveryOptions();
      status(
        removed
          ? `Cleared ${removed} local Recovery checkpoint${removed === 1 ? '' : 's'}.`
          : 'Recovery is already empty.',
      );
    } catch (error) {
      console.error(error);
      status(`Could not clear Recovery: ${error.message}`, 'error');
    }
  };

  $('projectNameInput').oninput = (event) => {
    projectName = String(event.target.value ?? '').slice(0, 256);
    scheduleWorkspacePersistence();
  };
  $('projectNameInput').onchange = () => {
    projectName = normalizedProjectName();
    $('projectNameInput').value = projectName;
    scheduleWorkspacePersistence();
  };

  $('newProjectBtn').onclick = () => {
    if (!globalThis.confirm('New project will replace the current workspace. Continue?')) return;
    void clearWorkspaceState().catch((error) => console.warn('Could not clear autosave.', error));
    resetProjectState();
    resetRoughDraftControls();
    clearRoiDrawingMode();
    maskRoiController.clearDrawingMode();
    snapshotManager.clear();
    syncBaseControls();
    renderAll();
    renderSnapshots();
    fit3d();
    status('New empty project.');
  };

  $('saveProjectBtn').onclick = async () => {
    if (!workspaceSession?.canWrite()) {
      status('This tab cannot Save locally while another tab owns browser storage.', 'warning');
      return;
    }
    try {
      projectName = normalizedProjectName();
      syncProjectNameInput();
      if (workspacePersistenceTimer != null) {
        clearTimeout(workspacePersistenceTimer);
        workspacePersistenceTimer = null;
      }
      const project = buildProjectSnapshot(true);
      setWorkspaceSaveStatus('Autosaving…');
      workspacePersistenceWrite = workspacePersistenceWrite
        .catch(() => {})
        .then(() => saveWorkspaceState(project, { appCommit: loadedBuildVersion }))
        .then(() =>
          createWorkspaceRecoveryCheckpoint(project, {
            appCommit: loadedBuildVersion,
            reason: `manual-save · ${projectName}`,
          }),
        );
      await workspacePersistenceWrite;
      setWorkspaceSaveStatus(`Saved checkpoint · ${savedTimeLabel()}`);
      await refreshRecoveryOptions();
      status(`Saved "${projectName}" locally. It is available in Recovery.`);
    } catch (error) {
      console.error(error);
      setWorkspaceSaveStatus('Local save failed', true);
      status(`Local Save failed: ${error.message}`, 'error');
    }
  };

  $('exportProjectBtn').onclick = () => {
    try {
      projectName = normalizedProjectName();
      syncProjectNameInput();
      downloadProject(buildProjectSnapshot(true), projectExportFilename());
      status(`Exported ${projectExportFilename()}.`);
    } catch (error) {
      console.error(error);
      status(`Export failed: ${error.message}`, 'error');
    }
  };

  $('openProjectInput').onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!globalThis.confirm('Open project will replace the current workspace. Continue?')) {
      event.target.value = '';
      return;
    }
    await openProjectFile(file);
    event.target.value = '';
  };
}

async function initializePersistedWorkspace() {
  const hasExplicitStart = new URLSearchParams(globalThis.location?.search || '').has('start');

  try {
    if (hasExplicitStart) {
      await initializeWorkspaceStart();
    } else {
      const saved = await loadWorkspaceState();
      if (saved) {
        loadProjectSnapshot(saved);
        snapshotManager.importRecords(saved.snapshots || []);
        syncBaseControls();
        maskImportController.syncTransformInputs();
        renderAll();
        renderSnapshots();
        fit3d();
        status(`Restored local workspace "${normalizedProjectName()}".`);
      }
    }
  } catch (error) {
    console.warn('Workspace restore failed.', error);
    status(`Local workspace restore failed: ${error.message}`);
  } finally {
    workspacePersistenceReady = true;
    scheduleWorkspacePersistence();
    void refreshRecoveryOptions();
  }
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
    maskOpacity,
  }),
  getDrawMaskController: () => drawMaskController,
  getMaskRoiController: () => maskRoiController,
  getSectionEditor: () => sectionEditor,
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
  scheduleWorkspacePersistence,
});

workspaceSession.start();
bindUi();
loadBuildCommit();
window.addEventListener('focus', checkForBuildUpdate);
window.addEventListener('pagehide', () => {
  void persistWorkspaceNow();
  workspaceSession.stop();
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
void initializePersistedWorkspace();
