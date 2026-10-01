import {
  circleRoiFromAnchor,
  normalizeRoi,
  rectRoiFromAnchor,
  resizeRoiFromHandle,
  roiAnchorPoint,
  roiContainsPoint,
  roiHandlePoints,
  translateRoi,
} from '../roi-editor.js';
import { nearestNamedPoint } from '../view-interactions.js';

export function createMaskRoiController({
  root = document,
  getRoi,
  setRoi,
  getTool,
  setTool,
  getDraft,
  setDraft,
  getAnchor,
  setAnchor,
  xyUnitLabel,
  formatLengthField,
  manualMicron,
  setupCanvas,
  viewport,
  canvasToWorld,
  worldToCanvas,
  renderMask,
  canMoveBody = () => true,
  onChanged = () => {},
  status,
}) {
  const $ = (id) => root.getElementById(id);
  let drag = null;

  function clearDrawingMode() {
    setTool(null);
    setDraft(null);
    root.querySelectorAll('.mask-roi-tool').forEach((button) => button.classList.remove('active'));
  }

  function syncEditor() {
    const roi = getRoi(),
      editor = $('maskRoiFields');
    if (!editor) return;
    editor.hidden = !roi;
    if (!roi) return;
    const point = roiAnchorPoint(roi, getAnchor());
    if (!point) return;

    $('maskRoiShapeLabel').textContent = roi.type === 'rect' ? 'Square' : 'Circle';
    $('maskRoiUnitLabel').textContent = xyUnitLabel();
    $('maskRoiAnchorSelect').value = getAnchor();
    $('maskRoiX').value = formatLengthField(point[0]);
    $('maskRoiY').value = formatLengthField(point[1]);
    $('maskRoiRectFields').hidden = roi.type !== 'rect';
    $('maskRoiCircleFields').hidden = roi.type !== 'circle';
    if (roi.type === 'rect') {
      $('maskRoiSize').value = formatLengthField(
        Math.max(roi.b[0] - roi.a[0], roi.b[1] - roi.a[1]),
      );
    } else {
      $('maskRoiRadius').value = formatLengthField(roi.r);
    }
  }

  function applyEditor() {
    const roi = getRoi();
    if (!roi) return;
    const x = manualMicron($('maskRoiX').value),
      y = manualMicron($('maskRoiY').value),
      anchor = getAnchor(),
      next =
        roi.type === 'rect'
          ? rectRoiFromAnchor(
              manualMicron($('maskRoiSize').value),
              manualMicron($('maskRoiSize').value),
              anchor,
              x,
              y,
            )
          : circleRoiFromAnchor(
              manualMicron($('maskRoiRadius').value),
              anchor,
              x,
              y,
            );
    if (!next) {
      syncEditor();
      status('Mask ROI requires finite coordinates and positive dimensions.', 'warning');
      return;
    }
    setRoi(next);
    syncEditor();
    renderMask();
    onChanged();
  }

  function screenHandles(roi, view) {
    return Object.fromEntries(
      Object.entries(roiHandlePoints(roi)).map(([name, point]) => [
        name,
        worldToCanvas(point, view),
      ]),
    );
  }

  function resizeCursor(handle) {
    return handle === 'top-left' || handle === 'bottom-right' ? 'nwse-resize' : 'nesw-resize';
  }

  function render(ctx, view) {
    const shape = getDraft() || getRoi();
    if (!shape) return;

    ctx.save();
    ctx.strokeStyle = '#9a5b23';
    ctx.fillStyle = 'rgba(230, 162, 60, .05)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (shape.type === 'rect') {
      const a = worldToCanvas(shape.a, view),
        b = worldToCanvas(shape.b, view);
      ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    } else {
      const c = worldToCanvas(shape.c, view);
      ctx.arc(c[0], c[1], shape.r * view.s, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    if (!getDraft() && getRoi() && !getTool()) {
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      for (const point of Object.values(roiHandlePoints(getRoi()))) {
        const q = worldToCanvas(point, view);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#9a5b23';
        ctx.fillRect(q[0] - 4.5, q[1] - 4.5, 9, 9);
        ctx.strokeRect(q[0] - 4.5, q[1] - 4.5, 9, 9);
      }
    }
    ctx.restore();
  }

  function bindControls() {
    $('maskRoiEditor')?.addEventListener('toggle', () => {
      if ($('maskRoiEditor').open) {
        for (const details of $('maskPanel').querySelectorAll('details')) {
          if (details !== $('maskRoiEditor')) details.open = false;
        }
        syncEditor();
      }
    });

    root.querySelectorAll('.mask-roi-tool').forEach((button) => {
      button.onclick = () => {
        setTool(button.dataset.tool);
        setDraft(null);
        root
          .querySelectorAll('.mask-roi-tool')
          .forEach((item) => item.classList.toggle('active', item === button));
        $('maskRoiEditor').open = false;
        renderMask();
        status('Mask ROI: drag once in Mask to create the process/export region.');
      };
    });

    $('clearMaskRoiBtn').onclick = () => {
      setRoi(null);
      setAnchor('center');
      clearDrawingMode();
      syncEditor();
      renderMask();
      onChanged();
      status('Mask ROI cleared.');
    };

    $('maskRoiAnchorSelect').onchange = () => {
      setAnchor($('maskRoiAnchorSelect').value);
      syncEditor();
    };

    for (const id of [
      'maskRoiSize',
      'maskRoiRadius',
      'maskRoiX',
      'maskRoiY',
    ]) {
      $(id).onchange = applyEditor;
    }
  }

  function bindCanvas() {
    const canvas = $('maskCanvas');

    canvas.addEventListener(
      'pointermove',
      (event) => {
        const { w, h } = setupCanvas(canvas),
          rect = canvas.getBoundingClientRect(),
          view = viewport(w, h, 'mask'),
          screen = [event.clientX - rect.left, event.clientY - rect.top],
          point = canvasToWorld(screen[0], screen[1], view),
          roi = getRoi(),
          tool = getTool();

        if (!drag) {
          if (tool) {
            canvas.style.cursor = 'crosshair';
            event.stopImmediatePropagation();
            return;
          }
          if (!roi) return;

          const handle = nearestNamedPoint(
            screen,
            screenHandles(roi, view),
            event.pointerType === 'touch' ? 22 : 12,
          );
          if (handle) {
            canvas.style.cursor = resizeCursor(handle);
            event.stopImmediatePropagation();
          } else if (roiContainsPoint(roi, point) && canMoveBody(point)) {
            canvas.style.cursor = 'move';
            event.stopImmediatePropagation();
          }
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        if (drag.mode === 'create') {
          const dx = point[0] - drag.start[0],
            dy = point[1] - drag.start[1],
            side = Math.max(Math.abs(dx), Math.abs(dy)),
            squarePoint = [
              drag.start[0] + (Math.sign(dx) || 1) * side,
              drag.start[1] + (Math.sign(dy) || 1) * side,
            ];
          setDraft(
            getTool() === 'rect'
              ? normalizeRoi({ type: 'rect', a: drag.start, b: squarePoint })
              : normalizeRoi({
                  type: 'circle',
                  c: drag.start,
                  r: Math.hypot(point[0] - drag.start[0], point[1] - drag.start[1]),
                }),
          );
          renderMask();
          return;
        }

        if (drag.mode === 'resize') {
          const adjusted = [
              point[0] - drag.offset[0],
              point[1] - drag.offset[1],
            ],
            original = drag.original;
          if (original.type === 'rect') {
            const opposite = {
                'top-left': 'bottom-right',
                'top-right': 'bottom-left',
                'bottom-left': 'top-right',
                'bottom-right': 'top-left',
              }[drag.handle],
              fixed = roiHandlePoints(original)[opposite],
              side = Math.max(
                Math.abs(adjusted[0] - fixed[0]),
                Math.abs(adjusted[1] - fixed[1]),
              ),
              squarePoint = [
                fixed[0] + (Math.sign(adjusted[0] - fixed[0]) || 1) * side,
                fixed[1] + (Math.sign(adjusted[1] - fixed[1]) || 1) * side,
              ];
            setRoi(normalizeRoi({ type: 'rect', a: fixed, b: squarePoint }));
          } else {
            setRoi(resizeRoiFromHandle(original, drag.handle, adjusted));
          }
          syncEditor();
          renderMask();
          return;
        }

        setRoi(
          translateRoi(
            drag.original,
            point[0] - drag.start[0],
            point[1] - drag.start[1],
          ),
        );
        syncEditor();
        renderMask();
      },
      true,
    );

    canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 0) return;
        const { w, h } = setupCanvas(canvas),
          rect = canvas.getBoundingClientRect(),
          view = viewport(w, h, 'mask'),
          screen = [event.clientX - rect.left, event.clientY - rect.top],
          point = canvasToWorld(screen[0], screen[1], view),
          roi = getRoi(),
          tool = getTool();

        if (tool) {
          drag = { mode: 'create', pointerId: event.pointerId, start: point };
        } else if (roi) {
          const handle = nearestNamedPoint(
            screen,
            screenHandles(roi, view),
            event.pointerType === 'touch' ? 22 : 12,
          );
          if (handle) {
            const corner = roiHandlePoints(roi)[handle];
            drag = {
              mode: 'resize',
              pointerId: event.pointerId,
              handle,
              original: structuredClone(roi),
              offset: [point[0] - corner[0], point[1] - corner[1]],
            };
          } else if (roiContainsPoint(roi, point) && canMoveBody(point)) {
            drag = {
              mode: 'move',
              pointerId: event.pointerId,
              start: point,
              original: structuredClone(roi),
            };
          } else {
            return;
          }
        } else {
          return;
        }

        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );

    canvas.addEventListener(
      'pointerup',
      (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        event.stopImmediatePropagation();

        if (drag.mode === 'create') {
          const next = normalizeRoi(getDraft()),
            valid =
              next &&
              (next.type === 'circle'
                ? next.r > 1e-9
                : next.b[0] - next.a[0] > 1e-9 && next.b[1] - next.a[1] > 1e-9);
          if (valid) {
            setRoi(next);
            setAnchor('center');
            clearDrawingMode();
            syncEditor();
            onChanged();
            status('Mask ROI created. Drag it or its handles to adjust the region.');
          }
          setDraft(null);
        } else {
          onChanged();
        }

        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        drag = null;
        renderMask();
      },
      true,
    );

    canvas.addEventListener(
      'pointercancel',
      (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (drag.original) setRoi(drag.original);
        setDraft(null);
        syncEditor();
        drag = null;
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        renderMask();
        event.stopImmediatePropagation();
      },
      true,
    );
  }

  function bind() {
    bindControls();
    bindCanvas();
  }

  return { bind, clearDrawingMode, syncEditor, render };
}
