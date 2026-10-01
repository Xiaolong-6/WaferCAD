import {
  circleRoiFromAnchor,
  normalizeRoi,
  rectRoiFromAnchor,
  resizeRoiFromHandle,
  roiAnchorPoint,
  roiContainsPoint,
  roiHandlePoints,
  sectorAngleHandlePoints,
  sectorRoiFromAnchor,
  setSectorAngleFromPoint,
  translateRoi,
} from '../roi-editor.js';
import { nearestNamedPoint } from '../view-interactions.js';

export function createRoiController({
  root = document,
  getRoi,
  setRoi,
  getRoiTool,
  setRoiTool,
  getRoiDraft,
  setRoiDraft,
  getRoiAnchor,
  setRoiAnchor,
  getActiveFace,
  xyUnitLabel,
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
  closeSliceControls = () => {},
  renderMain,
  renderAll,
  status,
}) {
  const $ = (id) => root.getElementById(id);

  function clearDrawingMode() {
    setRoiTool(null);
    setRoiDraft(null);
    root.querySelectorAll('.roi-tool').forEach((button) => button.classList.remove('active'));
  }

  function syncEditor() {
    const editor = $('roiEditor'),
      roi = getRoi();
    if (!editor) return;
    editor.hidden = !roi;
    if (!roi) return;

    const point = roiAnchorPoint(roi, getRoiAnchor());
    if (!point) return;

    $('roiShapeLabel').textContent =
      roi.type === 'rect' ? 'Rectangle' : roi.type === 'sector' ? 'Sector' : 'Circle';
    $('roiUnitLabel').textContent = xyUnitLabel();
    $('roiAnchorSelect').value = getRoiAnchor();
    $('roiX').value = formatLengthField(point[0]);
    $('roiY').value = formatLengthField(point[1]);
    $('roiRectFields').hidden = roi.type !== 'rect';
    $('roiCircleFields').hidden = !['circle', 'sector'].includes(roi.type);
    $('roiSectorFields').hidden = roi.type !== 'sector';

    if (roi.type === 'rect') {
      $('roiWidth').value = formatLengthField(roi.b[0] - roi.a[0]);
      $('roiHeight').value = formatLengthField(roi.b[1] - roi.a[1]);
    } else {
      $('roiRadius').value = formatLengthField(roi.r);
      if (roi.type === 'sector') {
        $('roiStartAngle').value = formatNumericField(roi.startDeg, 3);
        $('roiEndAngle').value = formatNumericField(roi.endDeg, 3);
      }
    }
  }

  function applyEditor() {
    const roi = getRoi();
    if (!roi) return;

    const x = manualMicron($('roiX').value),
      y = manualMicron($('roiY').value),
      anchor = getRoiAnchor();
    let next = null;

    if (roi.type === 'rect') {
      next = rectRoiFromAnchor(
        manualMicron($('roiWidth').value),
        manualMicron($('roiHeight').value),
        anchor,
        x,
        y,
      );
    } else {
      const radius = manualMicron($('roiRadius').value);
      next =
        roi.type === 'sector'
          ? sectorRoiFromAnchor(
              radius,
              Number($('roiStartAngle').value),
              Number($('roiEndAngle').value),
              anchor,
              x,
              y,
            )
          : circleRoiFromAnchor(radius, anchor, x, y);
    }

    if (!next) {
      syncEditor();
      status('ROI geometry requires finite coordinates and positive dimensions.');
      return;
    }

    setRoi(next);
    renderAll();
  }

  function resizeCursor(handle) {
    return handle === 'top-left' || handle === 'bottom-right' ? 'nwse-resize' : 'nesw-resize';
  }

  function screenHandles(roi, view, back = false) {
    const angleHandles =
        roi.type === 'sector'
          ? Object.fromEntries(
              Object.entries(sectorAngleHandlePoints(roi)).map(([name, point]) => [
                name,
                worldToCanvas(point, view, back),
              ]),
            )
          : {},
      handles = Object.fromEntries(
        Object.entries(roiHandlePoints(roi)).map(([name, point]) => [
          name,
          worldToCanvas(point, view, back),
        ]),
      );
    return { angleHandles, handles };
  }

  function bindControls() {
    $('focusEditor').addEventListener('toggle', () => {
      if ($('focusEditor').open) closeSliceControls();
    });

    root.querySelectorAll('.roi-tool').forEach((button) => {
      button.onclick = () => {
        setRoiTool(button.dataset.tool);
        setRoiDraft(null);
        root
          .querySelectorAll('.roi-tool')
          .forEach((item) => item.classList.toggle('active', item === button));
        $('focusEditor').open = false;
        renderMain();
        status('ROI: drag once in Main to create the region.');
      };
    });

    $('clearRoiBtn').onclick = () => {
      setRoi(null);
      setRoiAnchor('center');
      clearDrawingMode();
      renderAll();
      status('ROI cleared.');
    };

    $('roiAnchorSelect').onchange = () => {
      setRoiAnchor($('roiAnchorSelect').value);
      syncEditor();
    };

    for (const id of [
      'roiWidth',
      'roiHeight',
      'roiRadius',
      'roiStartAngle',
      'roiEndAngle',
      'roiX',
      'roiY',
    ]) {
      $(id).onchange = applyEditor;
    }
  }

  function bindMaskViewport() {
    const canvas = $('maskCanvas');

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        zoomPlanView(
          'mask',
          canvas,
          event.deltaY < 0 ? 1.35 : 1 / 1.35,
          event.clientX,
          event.clientY,
        );
      },
      { passive: false },
    );

    canvas.addEventListener('dblclick', (event) => {
      event.preventDefault();
      resetPlanView('mask');
    });

    canvas.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect(),
        { w, h } = setupCanvas(canvas),
        view = viewport(w, h, 'mask'),
        point = canvasToWorld(event.clientX - rect.left, event.clientY - rect.top, view);
      $('maskCoords').textContent = `x ${xyText(point[0])} · y ${xyText(point[1])}`;
      canvas.style.cursor = 'default';
    });
  }

  function bindMainCanvas() {
    const canvas = $('mainCanvas');
    let drag = null;

    canvas.addEventListener('pointermove', (event) => {
      if (event.defaultPrevented && !drag) return;
      const rect = canvas.getBoundingClientRect(),
        { w, h } = setupCanvas(canvas),
        view = viewport(w, h, 'main'),
        back = getActiveFace() === 'back',
        screen = [event.clientX - rect.left, event.clientY - rect.top],
        point = canvasToWorld(screen[0], screen[1], view, back),
        roi = getRoi(),
        roiTool = getRoiTool();

      if (!drag) {
        if (roiTool) {
          canvas.style.cursor = 'crosshair';
          return;
        }
        if (!roi) {
          canvas.style.cursor = 'default';
          return;
        }

        const { angleHandles, handles } = screenHandles(roi, view, back),
          radius = event.pointerType === 'touch' ? 24 : 14,
          angleHandle = nearestNamedPoint(screen, angleHandles, radius),
          handle = nearestNamedPoint(screen, handles, radius);
        canvas.style.cursor = angleHandle
          ? 'grab'
          : handle
            ? resizeCursor(handle)
            : roiContainsPoint(roi, point)
              ? 'move'
              : 'default';
        return;
      }

      if (drag.mode === 'create') {
        setRoiDraft(
          roiTool === 'rect'
            ? normalizeRoi({ type: 'rect', a: drag.start, b: point })
            : normalizeRoi({
                type: roiTool === 'sector' ? 'sector' : 'circle',
                c: drag.start,
                r: Math.hypot(point[0] - drag.start[0], point[1] - drag.start[1]),
                ...(roiTool === 'sector' ? { startDeg: 0, endDeg: 90 } : {}),
              }),
        );
        renderMain();
        return;
      }

      if (drag.mode === 'angle') {
        setRoi(setSectorAngleFromPoint(drag.original, drag.handle, point));
        syncEditor();
        renderMain();
        return;
      }

      if (drag.mode === 'resize') {
        setRoi(
          resizeRoiFromHandle(drag.original, drag.handle, [
            point[0] - drag.offset[0],
            point[1] - drag.offset[1],
          ]),
        );
        syncEditor();
        renderMain();
        return;
      }

      setRoi(translateRoi(drag.original, point[0] - drag.start[0], point[1] - drag.start[1]));
      syncEditor();
      renderMain();
    });

    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.defaultPrevented) return;
      const rect = canvas.getBoundingClientRect(),
        { w, h } = setupCanvas(canvas),
        view = viewport(w, h, 'main'),
        back = getActiveFace() === 'back',
        screen = [event.clientX - rect.left, event.clientY - rect.top],
        point = canvasToWorld(screen[0], screen[1], view, back),
        roiTool = getRoiTool(),
        roi = getRoi();

      if (roiTool) {
        drag = { mode: 'create', start: point };
      } else if (roi) {
        const { angleHandles, handles } = screenHandles(roi, view, back),
          radius = event.pointerType === 'touch' ? 24 : 14,
          angleHandle = nearestNamedPoint(screen, angleHandles, radius),
          handle = nearestNamedPoint(screen, handles, radius);

        if (angleHandle) {
          drag = { mode: 'angle', handle: angleHandle, original: structuredClone(roi) };
        } else if (handle) {
          const corner = roiHandlePoints(roi)[handle];
          drag = {
            mode: 'resize',
            handle,
            start: point,
            original: structuredClone(roi),
            offset: [point[0] - corner[0], point[1] - corner[1]],
          };
        } else if (roiContainsPoint(roi, point)) {
          drag = { mode: 'move', start: point, original: structuredClone(roi) };
        } else {
          return;
        }
      } else {
        return;
      }

      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
    });

    const finishDrag = (event) => {
      if (!drag) return;

      const draft = getRoiDraft();
      if (drag.mode === 'create' && draft) {
        const next = normalizeRoi(draft),
          valid =
            next &&
            (next.type === 'circle' || next.type === 'sector'
              ? next.r > 1e-9
              : next.b[0] - next.a[0] > 1e-9 && next.b[1] - next.a[1] > 1e-9);

        if (valid) {
          setRoi(next);
          setRoiAnchor('center');
          clearDrawingMode();
          status(
            'ROI created. Drag it to move, use corner handles to resize, or edit values from ROI.',
          );
        }
        setRoiDraft(null);
      }

      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      drag = null;
      renderAll();
    };

    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', (event) => {
      if (drag?.original) setRoi(drag.original);
      syncEditor();
      setRoiDraft(null);
      drag = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      renderMain();
    });
  }

  function bind() {
    bindControls();
    bindMaskViewport();
    bindMainCanvas();
  }

  return { bind, clearDrawingMode, syncEditor, applyEditor };
}
