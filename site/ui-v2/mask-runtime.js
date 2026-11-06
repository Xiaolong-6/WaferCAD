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
import { maskTransformAfterDrag } from '../view-interactions.js';

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
    alignment,
    alignmentDraft = null,
    alignmentOriginalPan = null,
    alignmentDrag = null,
    alignmentFrame = 0,
    exporting = false;
  const renderMask = () => {
    renderer?.renderMask();
    roi?.syncEditor();
    onChange();
  };
  const redrawAlignmentPreview = () => {
    // Preview is renderer-only: never autosave a drag or change the Process mask.
    renderer?.renderMask();
    alignment?.syncTransformInputs();
  };
  const units = createDisplayUnits(() => state);
  const lengths = {
    xyUnitLabel: units.label,
    formatLengthField: units.format,
    formatNumericField: (value) => String(value),
    manualMicron: units.parse,
    xyText: (value) => `${units.format(value)} ${units.label()}`,
  };
  const maskPoint = (point) => maskLocalToWorld(point, alignmentDraft || state.maskTransform);
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
    fitMaskToContent: readOnly,
    getViewportMargin: (_kind, width, height) =>
      readOnly ? Math.max(8, Math.round(Math.min(width, height) * 0.08)) : 34,
    // Keep the camera fitted to committed geometry while an Alignment draft moves.
    maskPoint: (point) => maskLocalToWorld(point, state.maskTransform),
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
      state.maskSourceMode === 'file'
        ? alignmentDraft || state.maskTransform
        : { x: 0, y: 0, scale: 1, rotation: 0 },
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
    getState: () =>
      alignmentDraft ? { ...state, maskTransform: alignmentDraft, alignmentDraft } : state,
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
  const endAlignmentDrag = () => {
    if (!alignmentDrag) return;
    if (alignmentFrame) cancelAnimationFrame(alignmentFrame);
    alignmentFrame = 0;
    const id = alignmentDrag.id;
    alignmentDrag = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };
  const applyAlignmentPointer = () => {
    if (!alignmentDrag || !alignmentDraft) return;
    const drag = alignmentDrag;
    const next = maskTransformAfterDrag(
      drag.transform,
      drag.x - drag.startX,
      drag.y - drag.startY,
      drag.scale,
    );
    if (next) {
      alignmentDraft = next;
      redrawAlignmentPreview();
    }
  };
  const consumeAlignmentPointer = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  // Registered before the existing Pan, Draw and ROI capture handlers.
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (!alignmentDraft || event.button !== 0) return;
      if (!alignmentDrag) {
        const rect = canvas.getBoundingClientRect();
        const view = plan.viewport(rect.width, rect.height, 'mask');
        if (view.s > 0) {
          alignmentDrag = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            x: event.clientX,
            y: event.clientY,
            scale: view.s,
            transform: { ...alignmentDraft },
          };
          canvas.setPointerCapture(event.pointerId);
        }
      }
      consumeAlignmentPointer(event);
    },
    true,
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (!alignmentDraft) return;
      if (alignmentDrag?.id === event.pointerId) {
        alignmentDrag.x = event.clientX;
        alignmentDrag.y = event.clientY;
        if (!alignmentFrame) {
          alignmentFrame = requestAnimationFrame(() => {
            alignmentFrame = 0;
            applyAlignmentPointer();
          });
        }
      }
      consumeAlignmentPointer(event);
    },
    true,
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      if (!alignmentDraft) return;
      if (alignmentDrag?.id === event.pointerId) {
        alignmentDrag.x = event.clientX;
        alignmentDrag.y = event.clientY;
        if (alignmentFrame) cancelAnimationFrame(alignmentFrame);
        alignmentFrame = 0;
        applyAlignmentPointer();
        endAlignmentDrag();
      }
      consumeAlignmentPointer(event);
    },
    true,
  );
  canvas.addEventListener(
    'pointercancel',
    (event) => {
      if (!alignmentDraft) return;
      if (alignmentDrag?.id === event.pointerId) {
        alignmentDraft = alignmentDrag.transform;
        endAlignmentDrag();
        redrawAlignmentPreview();
      }
      consumeAlignmentPointer(event);
    },
    true,
  );
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
  const alignmentFields = createMaskImportController({
    root,
    getMaskTransform: () => alignmentDraft || state.maskTransform,
    setMaskTransform: (value) => {
      if (alignmentDraft) alignmentDraft = value;
      else state.maskTransform = value;
    },
    ...lengths,
    renderMask: () => (alignmentDraft ? redrawAlignmentPreview() : renderMask()),
    status,
  });
  const exitAlignment = () => {
    endAlignmentDrag();
    alignmentDraft = null;
    if (alignmentOriginalPan !== null) state.panEnabled = alignmentOriginalPan;
    alignmentOriginalPan = null;
    canvas.style.cursor = '';
    canvas.style.touchAction = '';
    renderMask();
  };
  alignment = {
    ...alignmentFields,
    isActive: () => Boolean(alignmentDraft),
    begin() {
      if (readOnly || state.maskSourceMode !== 'file') return false;
      if (alignmentDraft) return true;
      alignmentOriginalPan = state.panEnabled;
      state.panEnabled = false;
      draw.setTool(null);
      roi.clearDrawingMode();
      alignmentDraft = { ...state.maskTransform };
      canvas.style.cursor = 'move';
      canvas.style.touchAction = 'none';
      renderMask();
      alignmentFields.syncTransformInputs();
      return true;
    },
    reset() {
      if (!alignmentDraft) return;
      alignmentDraft = { x: 0, y: 0, scale: 1, rotation: 0 };
      redrawAlignmentPreview();
    },
    cancel() {
      if (alignmentDraft) exitAlignment();
    },
    commit() {
      if (!alignmentDraft) return false;
      alignmentFields.updateTransform();
      const next = { ...alignmentDraft };
      // Keep the same view on screen when fitted bounds change at commit.
      const rect = canvas.getBoundingClientRect();
      const before = plan.viewport(rect.width, rect.height, 'mask');
      state.maskTransform = next;
      const after = plan.viewport(rect.width, rect.height, 'mask');
      const current = state.planViews.mask;
      if (before.s > 0 && after.s > 0) {
        current.zoom *= before.s / after.s;
        const adjusted = plan.viewport(rect.width, rect.height, 'mask');
        current.panX += before.cx - adjusted.cx;
        current.panY += before.cy - adjusted.cy;
      }
      exitAlignment();
      return true;
    },
  };
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
    // Exports must use only the committed transform, never the drag preview.
    maskPoint: (point) => maskLocalToWorld(point, state.maskTransform),
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
      if (alignmentDraft) alignment.cancel();
      state.panEnabled = value;
      renderMask();
    },
    setZoomEnabled(value) {
      state.zoomEnabled = value;
      renderMask();
    },
    chooseDrawTool(value) {
      if (alignmentDraft) alignment.cancel();
      state.panEnabled = false;
      roi.clearDrawingMode();
      draw.setTool(value === 'select' ? null : value);
    },
    chooseRoiTool(value) {
      if (alignmentDraft) alignment.cancel();
      state.panEnabled = false;
      draw.setTool(null);
      state.maskRoiTool = value === 'square' ? 'rect' : value;
      state.maskRoiDraft = null;
      renderMask();
      status('Drag in Mask to create the ROI.');
    },
  };
}
