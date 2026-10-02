import {
  circleMaskRoiFromAnchor,
  maskLocalToWorld,
  maskRoiAnchorPoint,
  maskRoiContainsPoint,
  maskRoiHandlePoints,
  maskSquareCorners,
  normalizeMaskRoi,
  resizeMaskRoiFromHandle,
  squareMaskRoiFromAnchor,
  translateMaskRoi,
  worldToMaskLocal,
} from '../mask-roi-geometry.js';
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
  getTransform = () => ({ x: 0, y: 0, scale: 1, rotation: 0 }),
  xyUnitLabel,
  formatLengthField,
  formatNumericField = (value) => String(Number(value) || 0),
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
    const roi = normalizeMaskRoi(getRoi()),
      editor = $('maskRoiFields');
    if (!editor) return;
    editor.hidden = !roi;
    if (!roi) return;

    const point = maskRoiAnchorPoint(roi, getAnchor());
    if (!point) return;

    $('maskRoiShapeLabel').textContent = roi.type === 'square' ? 'Square' : 'Circle';
    $('maskRoiUnitLabel').textContent = xyUnitLabel();
    $('maskRoiAnchorSelect').value = getAnchor();
    $('maskRoiX').value = formatLengthField(point[0]);
    $('maskRoiY').value = formatLengthField(point[1]);
    $('maskRoiRectFields').hidden = roi.type !== 'square';
    $('maskRoiCircleFields').hidden = roi.type !== 'circle';
    if (roi.type === 'square') {
      $('maskRoiSize').value = formatLengthField(roi.size);
      $('maskRoiRotation').value = formatNumericField(roi.rotation, 3);
    } else {
      $('maskRoiRadius').value = formatLengthField(roi.r);
    }
  }

  function applyEditor() {
    const roi = normalizeMaskRoi(getRoi());
    if (!roi) return;

    const x = manualMicron($('maskRoiX').value),
      y = manualMicron($('maskRoiY').value),
      anchor = getAnchor(),
      next =
        roi.type === 'square'
          ? squareMaskRoiFromAnchor(
              manualMicron($('maskRoiSize').value),
              Number($('maskRoiRotation').value),
              anchor,
              x,
              y,
            )
          : circleMaskRoiFromAnchor(
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
    const transform = getTransform();
    return Object.fromEntries(
      Object.entries(maskRoiHandlePoints(roi)).map(([name, point]) => [
        name,
        worldToCanvas(maskLocalToWorld(point, transform), view),
      ]),
    );
  }

  function resizeCursor(handle) {
    return handle === 'top-left' || handle === 'bottom-right' ? 'nwse-resize' : 'nesw-resize';
  }

  function render(ctx, view) {
    const shape = normalizeMaskRoi(getDraft() || getRoi());
    if (!shape) return;

    const transform = getTransform();
    ctx.save();
    ctx.strokeStyle = '#9a5b23';
    ctx.fillStyle = 'rgba(230, 162, 60, .05)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();

    if (shape.type === 'square') {
      const corners = maskSquareCorners(shape),
        points = ['bottom-left', 'bottom-right', 'top-right', 'top-left'].map((key) =>
          worldToCanvas(maskLocalToWorld(corners[key], transform), view),
        );
      points.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    } else {
      const center = worldToCanvas(maskLocalToWorld(shape.c, transform), view),
        radius =
          shape.r *
          Math.max(1e-12, Math.abs(Number(transform.scale) || 1)) *
          view.s;
      ctx.arc(center[0], center[1], radius, 0, Math.PI * 2);
    }

    ctx.fill();
    ctx.stroke();

    if (!getDraft() && getRoi() && !getTool()) {
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      for (const point of Object.values(maskRoiHandlePoints(shape))) {
        const q = worldToCanvas(maskLocalToWorld(point, transform), view);
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
        status('Mask ROI: drag in Mask. The ROI stays attached to the active Mask coordinates.');
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

    for (const id of ['maskRoiSize', 'maskRoiRotation', 'maskRoiRadius', 'maskRoiX', 'maskRoiY']) {
      $(id).onchange = applyEditor;
    }
  }

  function bindCanvas() {
    const canvas = $('maskCanvas');

    function eventGeometry(event) {
      const { w, h } = setupCanvas(canvas),
        rect = canvas.getBoundingClientRect(),
        view = viewport(w, h, 'mask'),
        screen = [event.clientX - rect.left, event.clientY - rect.top],
        world = canvasToWorld(screen[0], screen[1], view),
        local = worldToMaskLocal(world, getTransform());
      return { view, screen, world, local };
    }

    canvas.addEventListener(
      'pointermove',
      (event) => {
        const { view, screen, world, local } = eventGeometry(event),
          roi = normalizeMaskRoi(getRoi()),
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
          } else if (maskRoiContainsPoint(roi, local) && canMoveBody(world)) {
            canvas.style.cursor = 'move';
            event.stopImmediatePropagation();
          }
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        if (drag.mode === 'create') {
          if (getTool() === 'rect') {
            const dx = local[0] - drag.start[0],
              dy = local[1] - drag.start[1],
              side = Math.max(Math.abs(dx), Math.abs(dy)),
              corner = [
                drag.start[0] + (Math.sign(dx) || 1) * side,
                drag.start[1] + (Math.sign(dy) || 1) * side,
              ];
            setDraft({
              type: 'square',
              c: [(drag.start[0] + corner[0]) / 2, (drag.start[1] + corner[1]) / 2],
              size: side,
              rotation: 0,
            });
          } else {
            setDraft({
              type: 'circle',
              c: [...drag.start],
              r: Math.hypot(local[0] - drag.start[0], local[1] - drag.start[1]),
            });
          }
          renderMask();
          return;
        }

        if (drag.mode === 'resize') {
          const adjusted = [
            local[0] - drag.offset[0],
            local[1] - drag.offset[1],
          ];
          setRoi(resizeMaskRoiFromHandle(drag.original, drag.handle, adjusted));
          syncEditor();
          renderMask();
          return;
        }

        setRoi(
          translateMaskRoi(
            drag.original,
            local[0] - drag.start[0],
            local[1] - drag.start[1],
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
        const { view, screen, world, local } = eventGeometry(event),
          roi = normalizeMaskRoi(getRoi()),
          tool = getTool();

        if (tool) {
          drag = { mode: 'create', pointerId: event.pointerId, start: local };
        } else if (roi) {
          const handle = nearestNamedPoint(
            screen,
            screenHandles(roi, view),
            event.pointerType === 'touch' ? 22 : 12,
          );
          if (handle) {
            const corner = maskRoiHandlePoints(roi)[handle];
            drag = {
              mode: 'resize',
              pointerId: event.pointerId,
              handle,
              original: structuredClone(roi),
              offset: [local[0] - corner[0], local[1] - corner[1]],
            };
          } else if (maskRoiContainsPoint(roi, local) && canMoveBody(world)) {
            drag = {
              mode: 'move',
              pointerId: event.pointerId,
              start: local,
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
          const next = normalizeMaskRoi(getDraft()),
            valid =
              next &&
              (next.type === 'circle' ? next.r > 1e-9 : next.size > 1e-9);
          if (valid) {
            setRoi(next);
            setAnchor('center');
            clearDrawingMode();
            syncEditor();
            onChanged();
            status('Mask ROI created. Drag it or its handles to adjust the mask-local region.');
          }
          setDraft(null);
        } else {
          onChanged();
        }

        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
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
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
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
