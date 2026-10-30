// Mask-only controller injection. UI hooks are newly built v2 nodes, never legacy markup.
import { createPlanViewController } from '../controllers/plan-view-controller.js';
import { createPlanRenderers } from '../plan-renderers.js';
import { createDrawMaskController } from '../controllers/draw-mask-controller.js';
import { createMaskRoiController } from '../controllers/mask-roi-controller.js';
import { createMaskImportController } from '../controllers/mask-import-controller.js';
import { createExportController } from '../controllers/export-controller.js';
import { maskLocalToWorld } from '../mask-roi-geometry.js';
import { drawShapeContainsPoint } from '../draw-mask-geometry.js';
import { bindPlanGestures } from './view-kit/plan-gestures.js';
import { createDisplayUnits } from './view-kit/display-units.js';

export function createMaskRuntime({
  state,
  root,
  onChange,
  onEditorSync,
  onRoiSync,
  status,
  confirmAction,
  selectedMaskElement,
  readOnly = false,
}) {
  let renderer,
    draw,
    roi,
    exporting = false;
  const renderMask = () => {
    renderer?.renderMask();
    roi?.syncEditor();
    onChange();
  };
  const units = createDisplayUnits(() => state);
  const lengths = {
    xyUnitLabel: units.label,
    formatLengthField: units.format,
    formatNumericField: (value) => String(value),
    manualMicron: units.parse,
    xyText: (value) => `${units.format(value)} ${units.label()}`,
  };
  const maskPoint = (point) => maskLocalToWorld(point, state.maskTransform);
  const layerKey = (layer, datatype) => `${layer}|${datatype}`;
  // Same stable presentation palette as the legacy Mask; no geometry or layer ownership changes.
  const palette = [
    '#4F86C6',
    '#4FAF9F',
    '#E6A23C',
    '#D96C5F',
    '#8A72BE',
    '#57A6C7',
    '#6C8E5E',
    '#C5678B',
  ];
  const layerColor = (key, alpha = 1) => {
    const style = state.layout?.maskPresentation?.layers?.find(
      ({ layer, datatype }) => key === layerKey(layer, datatype),
    );
    if (style) {
      const value = parseInt(style.color.slice(1), 16);
      return alpha >= 0.999
        ? style.color
        : `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
    }
    let hash = 0;
    for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const hex = palette[hash % palette.length],
      value = parseInt(hex.slice(1), 16);
    return alpha >= 0.999
      ? hex
      : `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
  };
  const selectedElement =
    selectedMaskElement ||
    ((element) => state.selectedLayerKeys.includes(layerKey(element.layer, element.datatype)));
  const plan = createPlanViewController({
    getModel: () => state.model,
    getLayout: () => state.layout,
    getMaskTransform: () => state.maskTransform,
    getMaskSourceMode: () => state.maskSourceMode,
    getDrawMask: () => state.drawMask,
    getPlanViews: () => state.planViews,
    getInteractionCanvas: (kind) => root.getElementById(kind === 'mask' ? 'maskCanvas' : 'mainCanvas'),
    fitMaskToContent: readOnly,
    getViewportMargin: (_kind, width, height) =>
      readOnly ? Math.max(8, Math.round(Math.min(width, height) * 0.08)) : 34,
    maskPoint,
    formatXY: units.format,
    xyToDisplay: units.toDisplay,
    xyFromDisplay: units.parse,
    xyUnitLabel: lengths.xyUnitLabel,
    renderMask,
    renderMain: () => {},
  });
  draw = createDrawMaskController({
    root,
    getMode: () => state.maskSourceMode,
    setMode: (value) => {
      state.maskSourceMode = value;
    },
    getDrawMask: () => state.drawMask,
    setDrawMask: (value) => {
      state.drawMask = value;
    },
    ...plan,
    ...lengths,
    renderMask,
    status,
    confirmAction,
    isInteractionBlocked: () =>
      readOnly || state.panEnabled || Boolean(state.maskRoiTool) || !state.drawOpen,
    onUiSync: (value) => {
      state.drawUi = value;
      onChange();
    },
    onEditorSync,
  });
  roi = createMaskRoiController({
    root,
    getRoi: () => state.maskRoi,
    setRoi: (value) => {
      state.maskRoi = value;
    },
    getTool: () => state.maskRoiTool,
    setTool: (value) => {
      state.maskRoiTool = value;
    },
    getDraft: () => state.maskRoiDraft,
    setDraft: (value) => {
      state.maskRoiDraft = value;
    },
    getAnchor: () => state.maskRoiAnchor,
    setAnchor: (value) => {
      state.maskRoiAnchor = value;
    },
    getTransform: () =>
      state.maskSourceMode === 'file' ? state.maskTransform : { x: 0, y: 0, scale: 1, rotation: 0 },
    canMoveBody: (point) =>
      !draw.getTool() &&
      !state.drawMask.shapes.some((shape) => drawShapeContainsPoint(shape, point)),
    ...plan,
    ...lengths,
    renderMask,
    status,
    onEditorSync: onRoiSync,
  });
  renderer = createPlanRenderers({
    root,
    canvasTheme: true,
    getState: () => state,
    getDrawMaskController: () => draw,
    getMaskRoiController: () => roi,
    ...plan,
    ...lengths,
    formatXY: units.format,
    maskPoint,
    layerKey,
    layerColor,
    selectedElement,
  });
  const canvas = root.getElementById('maskCanvas');
  bindPlanGestures({
    canvas,
    mouse: true,
    panEnabled: () => state.panEnabled,
    zoomEnabled: () => state.zoomEnabled,
    panBy: (dx, dy) => plan.panPlanView('mask', dx, dy),
    zoomAt: (factor, x, y) => plan.zoomPlanView('mask', canvas, factor, x, y),
  });
  if (!readOnly) {
    draw.bind();
    roi.bind();
  }
  const alignment = createMaskImportController({
    root,
    getMaskTransform: () => state.maskTransform,
    setMaskTransform: (value) => {
      state.maskTransform = value;
    },
    ...lengths,
    renderMask,
    status,
  });
  const runMaskLayoutExport = (request) => {
    if (exporting) {
      status('Another Mask export is running.');
      return Promise.resolve(null);
    }
    exporting = true;
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../layout-export-worker.js', import.meta.url));
      const finish = (value, error) => {
        worker.terminate();
        exporting = false;
        error ? reject(error) : resolve(value);
      };
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') status(data.stage);
        else if (data.type === 'done') finish(data);
        else if (data.type === 'error') finish(null, Error(data.message));
      };
      worker.onerror = (event) => finish(null, Error(event.message));
      worker.postMessage({ ...request, id: 'mask-review-export' });
    });
  };
  const exporter = createExportController({
    root,
    getState: () => state,
    ...plan,
    maskPoint,
    layerKey,
    layerColor,
    selectedElement,
    formatXY: units.format,
    runMaskLayoutExport,
    status,
  });
  renderMask();
  return {
    layerColor,
    draw,
    roi,
    alignment,
    exporter,
    plan,
    render: renderMask,
    fit: () => plan.resetPlanView('mask'),
    setPanEnabled(value) {
      state.panEnabled = value;
      renderMask();
    },
    setZoomEnabled(value) {
      state.zoomEnabled = value;
      renderMask();
    },
    chooseDrawTool(value) {
      state.panEnabled = false;
      roi.clearDrawingMode();
      draw.setTool(value === 'select' ? null : value);
    },
    chooseRoiTool(value) {
      state.panEnabled = false;
      draw.setTool(null);
      state.maskRoiTool = value === 'square' ? 'rect' : value;
      state.maskRoiDraft = null;
      renderMask();
      status('Drag in Mask to create the ROI.');
    },
  };
}
