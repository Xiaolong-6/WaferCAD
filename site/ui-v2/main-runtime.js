// Main-only dependency injection. No app.js boot, legacy markup, storage, or second renderer.
import { createPlanViewController } from '../controllers/plan-view-controller.js';
import { createPlanRenderers } from '../plan-renderers.js';
import { createMainCanvasController } from '../controllers/main-canvas-controller.js';
import { createRoiController } from '../controllers/roi-controller.js';
import { createSectionControlsController } from '../controllers/section-controls-controller.js';
import { createExportController } from '../controllers/export-controller.js';
import { constrainSquare, squareFromDrag } from './main-square.js';
import { bindPlanGestures } from './view-kit/plan-gestures.js';
import { formatInspectionLength } from './view-kit/inspection-fields.js';
import { createDisplayUnits } from './view-kit/display-units.js';

// UI precision only: never round loaded geometry or pointer projection values.
export const formatMainPosition = formatInspectionLength;

export function createMainRuntime({
  state,
  renderModel = () => state.model,
  onChange,
  status,
  onRoiSync,
  claimPopover,
  readOnly = false,
  root = document,
}) {
  let renderer, main, roi, slice, editor, squareStart;
  const noop = () => {};
  const units = createDisplayUnits(() => state);
  const renderMain = () => {
    renderer?.renderMain();
    roi?.syncEditor();
    onChange();
  };
  const getSection = () => state.section;
  const setSection = (value) => {
    state.section = value;
  };
  const getActiveFace = () => state.activeFace;
  const lengths = {
    xyUnitLabel: units.label,
    formatLengthField: units.format,
    formatNumericField: (value) => String(value),
    manualMicron: units.parse,
    xyText: (value) => `${units.format(value)} ${units.label()}`,
  };
  const plan = createPlanViewController({
    getModel: () => state.model,
    getPlanViews: () => state.planViews,
    getViewportMargin: (_kind, width, height) =>
      readOnly ? Math.max(8, Math.round(Math.min(width, height) * 0.08)) : 34,
    formatXY: units.format,
    xyToDisplay: units.toDisplay,
    xyFromDisplay: units.parse,
    xyUnitLabel: lengths.xyUnitLabel,
    renderMain,
    renderMask: noop,
  });
  slice = createSectionControlsController({
    root,
    getSection,
    setSection,
    getSectionEditor: () => editor,
    setSectionEditEnabledValue: (value) => {
      state.sectionEditEnabled = value;
    },
    closeRoiControls: () => roi?.clearDrawingMode(),
    claimPopover,
    ...lengths,
    renderMain,
    renderSection: noop,
    status,
  });
  main = createMainCanvasController({
    root,
    mainOnly: true,
    getSection,
    setSection,
    getActiveFace,
    getSectionCreateMode: () => state.sectionEditEnabled,
    isRoiDrawing: () =>
      !readOnly && (Boolean(state.roiTool) || (!state.panEnabled && state.tool === 'none')),
    isZoomEnabled: () => state.zoomEnabled,
    completeSectionCreate: () => {
      slice.completeCreate();
      state.tool = 'select';
      renderMain();
    },
    cancelSectionCreate: () => slice.cancelCreate(),
    setSectionEditor: (value) => {
      editor = value;
    },
    ...plan,
    ...lengths,
    renderMain,
    renderMask: noop,
    renderSection: noop,
    renderAll: renderMain,
    onPanModeChange: (active) => {
      state.panEnabled = active;
      onChange();
    },
  });
  roi = createRoiController({
    root,
    getRoi: () => state.roi,
    setRoi: (value) => {
      state.roi = state.roiShape === 'square' ? constrainSquare(value, state.roi) : value;
    },
    getRoiTool: () => (state.roiTool === 'square' ? 'rect' : state.roiTool),
    setRoiTool: (value) => {
      state.roiTool = value;
      if (!value && state.tool === 'roi') state.tool = 'select';
    },
    getRoiDraft: () => state.roiDraft,
    setRoiDraft: (value) => {
      state.roiDraft =
        value && state.roiTool === 'square' && squareStart
          ? squareFromDrag(
              squareStart,
              [0, 1].map((axis) =>
                Math.abs(value.a[axis] - squareStart[axis]) >
                Math.abs(value.b[axis] - squareStart[axis])
                  ? value.a[axis]
                  : value.b[axis],
              ),
            )
          : value;
    },
    getRoiAnchor: () => state.roiAnchor,
    setRoiAnchor: (value) => {
      state.roiAnchor = value;
    },
    getActiveFace,
    isInteractionBlocked: () =>
      readOnly ||
      state.panEnabled ||
      !['select', 'roi'].includes(state.tool) ||
      state.sectionEditEnabled,
    ...plan,
    ...lengths,
    closeSliceControls: () => slice.setCreateMode(false),
    renderMain,
    renderAll: renderMain,
    status,
    onEditorSync: onRoiSync,
  });
  renderer = createPlanRenderers({
    root,
    getState: () => ({ ...state, model: renderModel() }),
    getSectionEditor: () => editor,
    ...plan,
    ...lengths,
    syncSectionInputs: () => slice.syncInputs(),
  });
  const canvas = root.getElementById('mainCanvas');
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (state.roiTool !== 'square' || event.button !== 0 || event.isPrimary === false) return;
      const rect = canvas.getBoundingClientRect();
      squareStart = plan.canvasToWorld(
        event.clientX - rect.left,
        event.clientY - rect.top,
        plan.viewport(rect.width, rect.height, 'main'),
        state.activeFace === 'back',
      );
    },
    true,
  );
  bindPlanGestures({
    canvas,
    panEnabled: () => state.panEnabled,
    zoomEnabled: () => state.zoomEnabled,
    panBy: (dx, dy) => plan.panPlanView('main', dx, dy),
    zoomAt: (factor, x, y) =>
      plan.zoomPlanView('main', canvas, factor, x, y, state.activeFace === 'back'),
  });
  main.bind();
  if (!readOnly) roi.bind({ mainOnly: true });
  main.setPanMode(state.panEnabled);
  renderMain();
  const exporter = createExportController({ root, getState: () => state, ...plan, status });
  return {
    plan,
    roi,
    slice,
    render: renderMain,
    exportMainSvg: exporter.exportMainSvg,
    drawRoi(shape) {
      state.roiShape = shape;
      roi.setDrawingTool(shape);
    },
    setPanEnabled(active) {
      if (active) {
        slice.setCreateMode(false);
        roi.clearDrawingMode();
        state.tool = 'none';
      }
      main.setPanMode(active);
      renderMain();
    },
    setZoomEnabled(active) {
      state.zoomEnabled = active;
      renderMain();
    },
    setTool(tool) {
      slice.setCreateMode(false);
      roi.clearDrawingMode();
      state.tool = tool;
      main.setPanMode(false);
      renderMain();
    },
    fit: () => plan.resetPlanView('main'),
    zoom: (factor, x, y) =>
      plan.zoomPlanView(
        'main',
        root.getElementById('mainCanvas'),
        factor,
        x,
        y,
        state.activeFace === 'back',
      ),
  };
}
