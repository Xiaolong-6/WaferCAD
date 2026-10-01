import { parseLayoutFile } from './layout-io.js';
import {
  applyOperation,
  baseCoverageState,
  cloneModel,
  createModel,
  exposedLayerIds,
  fullFaceGeometry,
  hasMaterial,
  layerById,
  modelBoundsZ,
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
import { sectionContours, sectionSlices, surfaceGroups } from './model-view-geometry.js';
import { sectorAngleHandlePoints, sectorBoundaryPoints, roiHandlePoints } from './roi-editor.js';
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
  clearWorkspaceState,
  loadWorkspaceState,
  saveWorkspaceState,
} from './workspace-persistence.js';
import { createBuildController } from './controllers/build-controller.js';
import { createFeedbackController } from './controllers/feedback-controller.js';
import { createStartupController } from './controllers/startup-controller.js';
import { bindToolTabs } from './controllers/tool-tabs-controller.js';
import { createViewMaximizeController } from './controllers/view-maximize-controller.js';
import { createMaskBrowserController } from './controllers/mask-browser-controller.js';
import { createExportController } from './controllers/export-controller.js';
import { createRoiController } from './controllers/roi-controller.js';
import { createLayerLegendController } from './controllers/layer-legend-controller.js';
import { createProjectController } from './controllers/project-controller.js';
import { createSectionControlsController } from './controllers/section-controls-controller.js';
import { createBaseControlsController } from './controllers/base-controls-controller.js';
import { createMaskImportController } from './controllers/mask-import-controller.js';
import { createMainCanvasController } from './controllers/main-canvas-controller.js';
import { createWorkspaceActionsController } from './controllers/workspace-actions-controller.js';
import { createDrawMaskController } from './controllers/draw-mask-controller.js';
import { createEmptyDrawMask, drawMaskGeometry } from './draw-mask-geometry.js';
import {
  createEmptyLayout,
  createProjectStateController,
} from './controllers/project-state-controller.js';
import { createPlanViewController } from './controllers/plan-view-controller.js';

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
  activeFace = 'front',
  roi = null,
  roiTool = null,
  roiDraft = null,
  roiAnchor = 'center';
let projectName = 'Untitled',
  section = { a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] },
  sectionScaleMode = 'auto',
  sectionEditEnabled = false,
  sectionEditor = null,
  history = [],
  future = [],
  baseRevertSnapshot = null,
  drawMaskController = null;
const planViews = { mask: { zoom: 1, panX: 0, panY: 0 }, main: { zoom: 1, panX: 0, panY: 0 } };
const feedback = createFeedbackController();

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
  workspacePersistenceWrite = Promise.resolve();

function persistWorkspaceNow() {
  if (!workspacePersistenceReady) return Promise.resolve(false);
  if (workspacePersistenceTimer != null) {
    clearTimeout(workspacePersistenceTimer);
    workspacePersistenceTimer = null;
  }
  const project = buildProjectSnapshot(true);
  workspacePersistenceWrite = workspacePersistenceWrite
    .catch(() => {})
    .then(() => saveWorkspaceState(project));
  workspacePersistenceWrite.catch((error) => {
    console.warn('Workspace autosave failed.', error);
  });
  return workspacePersistenceWrite;
}

function scheduleWorkspacePersistence() {
  if (!workspacePersistenceReady) return;
  if (workspacePersistenceTimer != null) clearTimeout(workspacePersistenceTimer);
  workspacePersistenceTimer = setTimeout(() => {
    workspacePersistenceTimer = null;
    void persistWorkspaceNow();
  }, 800);
}

const loadedBuildVersion = new URL(import.meta.url).searchParams.get('v') || '';
const { checkForBuildUpdate, loadBuildCommit } = createBuildController({
  buildVersion: loadedBuildVersion,
  status,
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
    activeFace,
    section,
    maskTransform,
    maskSourceMode,
    drawMask,
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
const { downloadBlob, exportMainSvg, exportMaskSvg, exportSectionSvg } = exportController;

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
const { renderLayerLegend, colorNewLayer } = layerLegendController;

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

function operationAreaGeometry(mode) {
  if (mode === 'full') return fullFaceGeometry(model);
  const selected = activeMaskGeometry();
  if (isEmpty(selected)) return [];
  return mode === 'invert' ? difference(model.boundary, selected) : selected;
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

function canvasPathMulti(ctx, geom, v, back = false) {
  ctx.beginPath();
  for (const poly of geom || [])
    for (const ring of poly)
      ring.forEach((p, i) => {
        const q = worldToCanvas(p, v, back);
        i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
      });
}
function drawBaseOutline(ctx, v, { fill = true, back = false } = {}) {
  ctx.save();
  canvasPathMulti(ctx, model.boundary, v, back);
  if (fill) {
    ctx.fillStyle = '#f1f4f6';
    ctx.fill('evenodd');
  } else {
    ctx.setLineDash([5, 4]);
  }
  ctx.strokeStyle = fill ? '#96a1ad' : '#aab3bd';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}
function traceElement(ctx, e, v, selected) {
  const key = layerKey(e.layer, e.datatype),
    hovered = hoveredLayerKey === key;
  ctx.beginPath();
  if (e.kind === 'polygon') {
    e.points.map(maskPoint).forEach((p, i) => {
      const q = worldToCanvas(p, v);
      i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
    });
    ctx.closePath();
    ctx.fillStyle = selected
      ? layerColor(key, hovered ? 0.8 : 0.58)
      : hovered
        ? layerColor(key, 0.28)
        : 'rgba(155,166,178,.10)';
    ctx.fill();
    ctx.strokeStyle = selected || hovered ? layerColor(key, 0.98) : 'rgba(148,159,171,.52)';
    ctx.lineWidth = hovered ? 1.7 : selected ? 1 : 0.6;
    ctx.stroke();
  } else {
    e.points.map(maskPoint).forEach((p, i) => {
      const q = worldToCanvas(p, v);
      i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
    });
    ctx.strokeStyle = selected ? layerColor(key, 0.95) : '#aab3bd';
    ctx.lineWidth = Math.max(0.8, e.width * maskTransform.scale * v.s);
    ctx.stroke();
  }
}
function drawRoi(ctx, v, back = false) {
  if (!roi && !roiDraft) return;
  const r = roiDraft || roi;
  ctx.save();
  ctx.strokeStyle = '#d65361';
  ctx.fillStyle = 'rgba(214,83,97,.05)';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (r.type === 'rect') {
    const a = worldToCanvas(r.a, v, back),
      b = worldToCanvas(r.b, v, back);
    ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
  } else if (r.type === 'circle') {
    const c = worldToCanvas(r.c, v, back);
    ctx.arc(c[0], c[1], r.r * v.s, 0, Math.PI * 2);
  } else if (r.type === 'sector') {
    sectorBoundaryPoints(r, 96)
      .map((point) => worldToCanvas(point, v, back))
      .forEach((point, index) => {
        if (index === 0) ctx.moveTo(point[0], point[1]);
        else ctx.lineTo(point[0], point[1]);
      });
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();

  if (!roiDraft && roi && !sectionEditEnabled && !roiTool) {
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    for (const point of Object.values(roiHandlePoints(roi))) {
      const q = worldToCanvas(point, v, back);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#d65361';
      ctx.fillRect(q[0] - 5, q[1] - 5, 10, 10);
      ctx.strokeRect(q[0] - 5, q[1] - 5, 10, 10);
    }
    if (roi.type === 'sector') {
      for (const point of Object.values(sectorAngleHandlePoints(roi))) {
        const q = worldToCanvas(point, v, back);
        ctx.beginPath();
        ctx.arc(q[0], q[1], 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f5c04a';
        ctx.strokeStyle = '#8f6500';
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

let maskStructureCache = {
  model: null,
  revision: null,
  processRevision: null,
  face: null,
  patches: [],
};

function maskStructurePatches() {
  if (
    maskStructureCache.model === model &&
    maskStructureCache.revision === model.revision &&
    maskStructureCache.processRevision === model.processRevision &&
    maskStructureCache.face === activeFace
  ) {
    return maskStructureCache.patches;
  }

  // Collapse same-height surface groups across materials. The Mask reference
  // is topography-only: material/color boundaries at the same Z are omitted.
  const byHeight = new Map();
  for (const patch of surfaceGroups(model, activeFace)) {
    const key = String(patch.z);
    const geoms = byHeight.get(key) || [];
    geoms.push(patch.geom);
    byHeight.set(key, geoms);
  }
  const patches = [...byHeight.entries()].map(([z, geoms]) => ({
    z: Number(z),
    geom: unionGeometries(geoms),
  }));

  maskStructureCache = {
    model,
    revision: model.revision,
    processRevision: model.processRevision,
    face: activeFace,
    patches,
  };
  return patches;
}

function strokeClosedGeometry(ctx, geom, v, back = false) {
  ctx.beginPath();
  for (const polygon of geom || []) {
    for (const ring of polygon || []) {
      ring.forEach((point, index) => {
        const q = worldToCanvas(point, v, back);
        if (index === 0) ctx.moveTo(q[0], q[1]);
        else ctx.lineTo(q[0], q[1]);
      });
      if (ring?.length) ctx.closePath();
    }
  }
  ctx.stroke();
}

function drawMaskStructureReference(ctx, v) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = 'rgba(86, 100, 114, .58)';
  ctx.lineWidth = 0.8;

  const back = activeFace === 'back';
  for (const patch of maskStructurePatches()) {
    strokeClosedGeometry(ctx, patch.geom, v, back);
  }

  ctx.setLineDash([7, 4]);
  ctx.strokeStyle = 'rgba(139, 150, 161, .56)';
  ctx.lineWidth = 0.85;
  strokeClosedGeometry(ctx, model.boundary, v, back);
  ctx.restore();
}

function renderMask() {
  const c = $('maskCanvas'),
    { ctx, w, h } = setupCanvas(c),
    v = viewport(w, h, 'mask');
  ctx.clearRect(0, 0, w, h);

  // Alignment reference: current process surface topology, rendered only as
  // neutral outlines so it cannot be confused with mask layer colors.
  drawMaskStructureReference(ctx, v);

  if (maskSourceMode === 'draw') {
    drawMaskController?.render(ctx, v, maskOpacity);
  } else {
    ctx.save();
    ctx.globalAlpha = maskOpacity;
    for (const e of layout.linework || []) traceElement(ctx, e, v, false);
    for (const e of layout.elements || []) traceElement(ctx, e, v, selectedElement(e));
    ctx.restore();
  }

  drawPlanAxes(ctx, v, w, h, false);
  scheduleWorkspacePersistence();
}
function shadeColor(hex, delta) {
  const n = parseInt(hex.slice(1), 16),
    r = Math.max(0, Math.min(255, (n >> 16) + delta)),
    g = Math.max(0, Math.min(255, ((n >> 8) & 255) + delta)),
    b = Math.max(0, Math.min(255, (n & 255) + delta));
  return `rgb(${r},${g},${b})`;
}

function renderMain() {
  const c = $('mainCanvas'),
    { ctx, w, h } = setupCanvas(c),
    v = viewport(w, h, 'main'),
    back = activeFace === 'back';
  $('mainCoords').style.bottom = `${$('mainPanel').clientHeight - c.offsetTop - h + 26}px`;
  ctx.clearRect(0, 0, w, h);
  drawBaseOutline(ctx, v, { fill: false, back });
  const patches = surfaceGroups(model, activeFace);
  for (const patch of patches) {
    const layer = layerById(model, patch.layerId);
    if (!layer) continue;
    canvasPathMulti(ctx, patch.geom, v, back);
    const shade = Math.max(-12, Math.min(14, patch.z * 0.8));
    ctx.fillStyle = shadeColor(layer.color, shade);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(36,46,56,.24)';
    ctx.lineWidth = 0.65;
    ctx.stroke();
  }
  ctx.save();
  ctx.setLineDash([5, 4]);
  canvasPathMulti(ctx, model.boundary, v, back);
  ctx.strokeStyle = '#aab3bd';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  drawRoi(ctx, v, back);
  const a = worldToCanvas(section.a, v, back),
    b = worldToCanvas(section.b, v, back);
  ctx.strokeStyle = '#cc5062';
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.lineTo(...b);
  ctx.stroke();
  drawPlanAxes(ctx, v, w, h, back);
  syncSectionInputs();
  sectionEditor?.update();
  scheduleWorkspacePersistence();
}
function renderSection() {
  const c = $('sectionCanvas'),
    { ctx, w, h } = setupCanvas(c);
  ctx.clearRect(0, 0, w, h);

  const [lo, hi] = modelBoundsZ(model),
    pad = Math.max(1e-9, (hi - lo) * 0.08),
    z0 = lo - pad,
    z1 = hi + pad,
    zSpan = Math.max(z1 - z0, 1e-12),
    sectionSpan = Math.max(
      Math.hypot(section.b[0] - section.a[0], section.b[1] - section.a[1]),
      1e-12,
    ),
    left = 27,
    right = 10,
    top = 10,
    bottom = 22,
    iw = w - left - right,
    ih = h - top - bottom,
    autoXScale = iw / sectionSpan,
    autoZScale = ih / zSpan;

  let plotLeft = left,
    plotTop = top,
    plotWidth = iw,
    plotHeight = ih;

  if (sectionScaleMode === 'physical') {
    const scale = Math.min(autoXScale, autoZScale);
    plotWidth = sectionSpan * scale;
    plotHeight = zSpan * scale;
    plotLeft = left + (iw - plotWidth) / 2;
    plotTop = top + (ih - plotHeight) / 2;
  }

  const xScale = plotWidth / sectionSpan,
    zScale = plotHeight / zSpan,
    zExaggeration = zScale / xScale,
    mapT = (t) => plotLeft + t * plotWidth,
    mapZ = (z) => plotTop + ((z1 - z) / zSpan) * plotHeight;

  c.dataset.scaleMode = sectionScaleMode;
  c.dataset.xPxPerUm = String(xScale);
  c.dataset.zPxPerUm = String(zScale);

  ctx.fillStyle = '#fbfcfd';
  ctx.fillRect(0, 0, w, h);
  for (const contour of sectionContours(model, section.a, section.b)) {
    const layer = layerById(model, contour.layerId);
    if (!layer) continue;
    ctx.beginPath();
    for (const poly of contour.polys)
      for (const ring of poly) {
        ring.forEach(([t, z], i) => {
          const point = [mapT(t), mapZ(z)];
          if (i === 0) ctx.moveTo(...point);
          else ctx.lineTo(...point);
        });
        ctx.closePath();
      }
    ctx.fillStyle = layer.color;
    ctx.fill('evenodd');
  }

  // Auto mode keeps sub-pixel physical sidewalls legible. Physical 1:1 mode
  // disables this screen-space widening so X and Z use the same px/µm scale.
  for (const slice of sectionSlices(model, section.a, section.b)) {
    if (slice.role !== 'conformal-sidewall') continue;
    const layer = layerById(model, slice.layerId);
    if (!layer) continue;
    const x0 = mapT(slice.t0),
      x1 = mapT(slice.t1),
      center = (x0 + x1) / 2,
      minWidth = sectionScaleMode === 'auto' ? 3 : 0,
      sx0 = Math.min(x0, center - minWidth / 2),
      sx1 = Math.max(x1, center + minWidth / 2),
      sy0 = mapZ(slice.z1),
      sy1 = mapZ(slice.z0);
    ctx.fillStyle = layer.color;
    ctx.fillRect(sx0, sy0, Math.max(minWidth, sx1 - sx0), sy1 - sy0);
  }

  ctx.strokeStyle = '#8995a1';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(plotLeft, plotTop, plotWidth, plotHeight);
  ctx.fillStyle = '#707b86';
  ctx.font = '8px system-ui';
  ctx.fillText(formatXY(z1), 3, plotTop + 7);
  ctx.fillText(formatXY(z0), 3, plotTop + plotHeight);
  ctx.fillText('A', plotLeft, Math.min(h - 5, plotTop + plotHeight + 15));
  ctx.fillText('B', plotLeft + plotWidth - 7, Math.min(h - 5, plotTop + plotHeight + 15));

  const scaleButton = $('sectionScaleModeBtn');
  scaleButton.textContent = sectionScaleMode === 'auto' ? 'Auto' : '1:1';
  scaleButton.classList.toggle('active', sectionScaleMode === 'physical');
  scaleButton.setAttribute('aria-pressed', String(sectionScaleMode === 'physical'));
  scaleButton.title =
    sectionScaleMode === 'auto'
      ? 'Auto: X and Z fit independently. Click for physical 1:1 X:Z scale.'
      : 'Physical 1:1: X and Z use the same px/µm. Click for Auto fit.';

  const scaleLabel =
    sectionScaleMode === 'auto' ? `Z ×${Number(zExaggeration.toPrecision(3))}` : '1:1';
  $('sectionMeta').textContent = `${xyText(sectionSpan)} span · ${scaleLabel}`;
  $('sectionRange').textContent = `Z (${xyUnit().label}) ${formatXY(lo)} → ${formatXY(hi)}`;
  scheduleWorkspacePersistence();
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
  $('baseSummary').textContent = baseSummaryText();
  updateOperationUI();
  syncUndo();
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
  $('xyUnitSelect').value = xyDisplayUnit;
  $('applyBaseBtn').textContent =
    baseCoverageState(model) === 'removed' ? 'Recreate base' : 'Apply base';
  document
    .querySelectorAll('#substrateShape button')
    .forEach((b) => b.classList.toggle('active', b.dataset.shape === model.shape));
}
function updateGrowTargets() {
  const select = $('targetLayer');
  if (!select) return;
  const previous = select.value;
  select.innerHTML = '';

  const area = operationAreaGeometry($('operationArea').value);
  const exposed = new Set(exposedLayerIds(model, area, activeFace));
  for (const layer of model.layers) {
    if (!exposed.has(layer.id)) continue;
    select.add(new Option(layer.name, layer.id));
  }
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  select.disabled = !select.options.length;
}

function updateOperationUI() {
  const t = $('operationType').value;
  document.querySelectorAll('[data-process-mode]').forEach((button) => {
    const active = button.dataset.processMode === t;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  $('layerNameRow').classList.toggle('hidden', t !== 'add');
  $('targetLayerRow').classList.toggle('hidden', t !== 'grow');
  $('growthModeRow').classList.toggle('hidden', t === 'etch');
  $('processThicknessLabel').textContent = t === 'etch' ? 'Depth' : 'Z';

  if (t === 'grow') updateGrowTargets();

  const materialExists = hasMaterial(model);
  $('applyOperationBtn').disabled = !materialExists;
  const faceLabel = activeFace[0].toUpperCase() + activeFace.slice(1);
  $('processSummary').textContent =
    `${faceLabel} · ${t === 'add' ? 'Deposit layer' : t === 'grow' ? 'Extend layer' : 'Etch'}`;

  $('operationNote').hidden = !materialExists;
  if (!materialExists) return;

  $('operationNote').textContent =
    t === 'etch'
      ? 'Etch removes material vertically and may create through-holes.'
      : $('growthMode').value === 'conformal'
        ? 'Conformal coverage follows exposed steps and includes sidewalls.'
        : 'Directional coverage follows the selected footprint.';
}

function applyOp() {
  const type = $('operationType').value,
    thickness = manualMicron($('operationThickness').value);
  $('operationThickness').value = formatLengthField(thickness);
  if (!(thickness > 0)) return status('Thickness must be greater than zero.', 'error');

  const areaMode = $('operationArea').value,
    area = operationAreaGeometry(areaMode);
  if (isEmpty(area))
    return status(
      areaMode === 'full'
        ? 'The process domain has no editable area.'
        : maskSourceMode === 'draw'
          ? 'Draw at least one mask shape that overlaps the process domain first.'
          : 'Select a mask layer that overlaps the process domain first.',
      'warning',
    );

  const name = $('layerName').value.trim() || `Layer ${model.layers.length}`,
    targetLayerId = $('targetLayer').value;
  if (type === 'grow' && !targetLayerId)
    return status('No exposed target layer is available to Extend.', 'warning');

  const beforeBase = baseCoverageState(model);
  saveHistory();
  baseRevertSnapshot = null;
  const params = { type, name, targetLayerId, thickness, face: activeFace, area };
  if (type !== 'etch') params.growth = $('growthMode').value;
  const result = applyOperation(model, params);
  if (!result.changed) {
    restoreSnapshot(history.pop());
    syncUndo();
    return status(result.error || 'The operation did not change the model.', 'warning');
  }

  if (type === 'add' && result.layerId) {
    colorNewLayer(result.layerId);
    $('layerName').value = `Layer ${model.nextLayerId}`;
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
    type === 'etch' ? '' : params.growth === 'conformal' ? ' · Conformal' : ' · Directional';
  status(
    `${type === 'etch' ? 'Etched' : type === 'grow' ? `Extended ${layerById(model, targetLayerId)?.name || 'layer'}` : `Deposited ${name}`}${growthLabel} on the ${activeFace}.`,
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
    activeFace,
    roi,
    roiAnchor,
    section,
    sectionScaleMode,
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
    activeFace = next.activeFace;
    roi = next.roi;
    roiAnchor = next.roiAnchor;
    section = next.section;
    if (next.projectName) projectName = next.projectName;
    if (next.sectionScaleMode) sectionScaleMode = next.sectionScaleMode;
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
  syncSourceSummary: syncMaskSourceSummary,
  onMaskChanged: updateOperationUI,
  status,
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
  exportSectionSvg,
  getThreeView: () => threeView,
  downloadBlob,
  getRoi: () => roi,
  getSectionScaleMode: () => sectionScaleMode,
  setSectionScaleMode: (value) => {
    sectionScaleMode = value;
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

function bindUi() {
  bindToolTabs();
  viewMaximizeController.bind();
  roiController.bind();
  sectionControls.bind();
  baseControls.bind();
  maskImportController.bind();
  drawMaskController.bind();
  workspaceActions.bind();
  mainCanvasController.bind();

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
    clearRoiDrawingMode();
    snapshotManager.clear();
    syncBaseControls();
    renderAll();
    renderSnapshots();
    fit3d();
    status('New empty project.');
  };

  $('saveProjectBtn').onclick = () => {
    try {
      projectName = normalizedProjectName();
      syncProjectNameInput();
      downloadProject(buildProjectSnapshot(true), projectExportFilename());
      status(`Project saved as ${projectExportFilename()}.`);
    } catch (error) {
      console.error(error);
      status(`Save failed: ${error.message}`);
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
  }
}

bindUi();
loadBuildCommit();
window.addEventListener('focus', checkForBuildUpdate);
window.addEventListener('pagehide', () => {
  void persistWorkspaceNow();
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
status('Ready. Create a base or import a layout.');
void initializePersistedWorkspace();
