import {
  allocateDrawShapeId,
  drawShapeContainsPoint,
  drawShapeHandles,
  normalizeDrawMask,
  normalizeDrawShape,
  resizeDrawShape,
  translateDrawShape,
} from '../draw-mask-geometry.js';

export function createDrawMaskController({
  root = document,
  getMode,
  setMode,
  getDrawMask,
  setDrawMask,
  setupCanvas,
  viewport,
  canvasToWorld,
  worldToCanvas,
  xyText,
  renderMask,
  syncSourceSummary = () => {},
  onMaskChanged = () => {},
  status,
}) {
  const $ = (id) => root.getElementById(id);
  let tool = null,
    selectedId = null,
    drag = null,
    draft = null,
    polygonDraft = null,
    polygonHover = null;

  function currentMask() {
    return normalizeDrawMask(getDrawMask());
  }

  function setMask(next) {
    setDrawMask(normalizeDrawMask(next));
  }

  function selectedShape() {
    return currentMask().shapes.find((shape) => shape.id === selectedId) || null;
  }

  function replaceShape(id, nextShape) {
    const mask = currentMask();
    mask.shapes = mask.shapes.map((shape) => (shape.id === id ? nextShape : shape));
    setMask(mask);
  }

  function removeSelected() {
    if (!selectedId) return;
    const mask = currentMask();
    mask.shapes = mask.shapes.filter((shape) => shape.id !== selectedId);
    selectedId = null;
    setMask(mask);
    syncUi();
    renderMask();
    onMaskChanged();
    status('Deleted drawn mask shape.', 'success');
  }

  function setTool(next) {
    tool = next || null;
    draft = null;
    polygonDraft = null;
    polygonHover = null;
    syncUi();
    renderMask();
  }

  function setSourceMode(next) {
    const mode = next === 'draw' ? 'draw' : 'file';
    if (getMode() === mode) return;
    drag = null;
    draft = null;
    polygonDraft = null;
    polygonHover = null;
    tool = null;
    setMode(mode);
    syncUi();
    renderMask();
    onMaskChanged();
    status(mode === 'draw' ? 'Mask source: Draw.' : 'Mask source: File.');
  }

  function syncUi() {
    const draw = getMode() === 'draw',
      mask = currentMask();
    if (selectedId && !mask.shapes.some((shape) => shape.id === selectedId)) selectedId = null;
    const selected = selectedShape();
    if ($('maskSourceToggleBtn')) {
      $('maskSourceToggleBtn').textContent = draw ? 'Draw' : 'File';
      $('maskSourceToggleBtn').classList.toggle('active', draw);
      $('maskSourceToggleBtn').setAttribute('aria-pressed', String(draw));
      $('maskSourceToggleBtn').title = draw
        ? 'Mask source: Draw. Click to switch to File.'
        : 'Mask source: File. Click to switch to Draw.';
    }
    if ($('drawMaskToolbar')) $('drawMaskToolbar').hidden = !draw;
    if ($('maskFileControls')) $('maskFileControls').hidden = draw;
    if ($('maskDrawInfo')) $('maskDrawInfo').hidden = !draw;
    root.querySelectorAll('.draw-mask-tool').forEach((button) => {
      const active = (button.dataset.drawTool || null) === tool;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if ($('drawMaskDeleteBtn')) $('drawMaskDeleteBtn').disabled = !selected;
    if ($('drawMaskClearBtn')) $('drawMaskClearBtn').disabled = mask.shapes.length === 0;
    if ($('drawMaskHint')) {
      const suffix = polygonDraft ? ` · polygon ${polygonDraft.length} pt` : '';
      $('drawMaskHint').textContent = `${mask.shapes.length} shape${mask.shapes.length === 1 ? '' : 's'}${suffix}`;
    }
    if (draw && $('maskCellLabel')) {
      $('maskCellLabel').textContent = `${mask.shapes.length} drawn`;
    }
    syncSourceSummary();
  }

  function screenPoint(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  function worldPoint(event, canvas) {
    const { w, h } = setupCanvas(canvas),
      view = viewport(w, h, 'mask'),
      screen = screenPoint(event, canvas);
    return {
      view,
      screen,
      point: canvasToWorld(screen[0], screen[1], view),
    };
  }

  function nearestHandle(shape, screen, view, radius) {
    let best = null,
      bestDistance = radius;
    for (const [name, point] of Object.entries(drawShapeHandles(shape))) {
      const q = worldToCanvas(point, view),
        distance = Math.hypot(screen[0] - q[0], screen[1] - q[1]);
      if (distance <= bestDistance) {
        best = name;
        bestDistance = distance;
      }
    }
    return best;
  }

  function hitShape(point) {
    const shapes = currentMask().shapes;
    for (let index = shapes.length - 1; index >= 0; index--) {
      if (drawShapeContainsPoint(shapes[index], point)) return shapes[index];
    }
    return null;
  }

  function finishPolygon() {
    if (!polygonDraft || polygonDraft.length < 3) {
      polygonDraft = null;
      polygonHover = null;
      syncUi();
      renderMask();
      return;
    }
    const mask = currentMask(),
      allocation = allocateDrawShapeId(mask),
      shape = normalizeDrawShape({
        id: allocation.id,
        type: 'polygon',
        points: polygonDraft,
      });
    if (shape) {
      mask.nextShapeId = allocation.nextShapeId;
      mask.shapes.push(shape);
      selectedId = shape.id;
      setMask(mask);
      onMaskChanged();
      status('Drawn polygon created.', 'success');
    }
    polygonDraft = null;
    polygonHover = null;
    tool = null;
    syncUi();
    renderMask();
  }

  function finishCreate() {
    if (!draft) return;
    const mask = currentMask(),
      allocation = allocateDrawShapeId(mask),
      shape = normalizeDrawShape({ ...draft, id: allocation.id });
    if (shape) {
      mask.nextShapeId = allocation.nextShapeId;
      mask.shapes.push(shape);
      selectedId = shape.id;
      setMask(mask);
      onMaskChanged();
      status(
        shape.type === 'rect' ? 'Drawn rectangle created.' : 'Drawn circle created.',
        'success',
      );
    }
    draft = null;
    drag = null;
    tool = null;
    syncUi();
    renderMask();
  }

  function drawPath(ctx, shape, view) {
    ctx.beginPath();
    if (shape.type === 'rect') {
      const a = worldToCanvas(shape.a, view),
        b = worldToCanvas(shape.b, view);
      ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      return;
    }
    if (shape.type === 'circle') {
      const c = worldToCanvas(shape.c, view);
      ctx.arc(c[0], c[1], shape.r * view.s, 0, Math.PI * 2);
      return;
    }
    shape.points.forEach((point, index) => {
      const q = worldToCanvas(point, view);
      if (index === 0) ctx.moveTo(q[0], q[1]);
      else ctx.lineTo(q[0], q[1]);
    });
    ctx.closePath();
  }

  function render(ctx, view, opacity = 1) {
    if (getMode() !== 'draw') return;
    const mask = currentMask();
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    for (const shape of mask.shapes) {
      drawPath(ctx, shape, view);
      ctx.fillStyle = shape.id === selectedId ? 'rgba(72,105,135,.34)' : 'rgba(72,105,135,.22)';
      ctx.strokeStyle = shape.id === selectedId ? '#344f68' : '#526b84';
      ctx.lineWidth = shape.id === selectedId ? 1.5 : 1.05;
      ctx.fill();
      ctx.stroke();
    }
    if (draft) {
      drawPath(ctx, draft, view);
      ctx.fillStyle = 'rgba(72,105,135,.14)';
      ctx.strokeStyle = '#526b84';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      ctx.fill();
      ctx.stroke();
    }
    if (polygonDraft?.length) {
      ctx.beginPath();
      polygonDraft.forEach((point, index) => {
        const q = worldToCanvas(point, view);
        if (index === 0) ctx.moveTo(q[0], q[1]);
        else ctx.lineTo(q[0], q[1]);
      });
      if (polygonHover) {
        const q = worldToCanvas(polygonHover, view);
        ctx.lineTo(q[0], q[1]);
      }
      ctx.strokeStyle = '#526b84';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();

    const selected = selectedShape();
    if (!selected || tool) return;
    ctx.save();
    ctx.lineWidth = 1;
    for (const [name, point] of Object.entries(drawShapeHandles(selected))) {
      const q = worldToCanvas(point, view);
      if (name === 'radius') {
        ctx.beginPath();
        ctx.arc(q[0], q[1], 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = '#344f68';
        ctx.stroke();
      } else {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#344f68';
        ctx.fillRect(q[0] - 4, q[1] - 4, 8, 8);
        ctx.strokeRect(q[0] - 4, q[1] - 4, 8, 8);
      }
    }
    ctx.restore();
  }

  function resetInteraction() {
    tool = null;
    selectedId = null;
    drag = null;
    draft = null;
    polygonDraft = null;
    polygonHover = null;
    syncUi();
  }

  function bind() {
    $('maskSourceToggleBtn').onclick = () =>
      setSourceMode(getMode() === 'draw' ? 'file' : 'draw');

    root.querySelectorAll('.draw-mask-tool').forEach((button) => {
      button.onclick = () => setTool(button.dataset.drawTool || null);
    });
    $('drawMaskDeleteBtn').onclick = removeSelected;
    $('drawMaskClearBtn').onclick = () => {
      if (!currentMask().shapes.length) return;
      if (!globalThis.confirm('Clear all drawn mask shapes?')) return;
      selectedId = null;
      setMask({ nextShapeId: 1, shapes: [] });
      setTool(null);
      syncUi();
      renderMask();
      onMaskChanged();
      status('Cleared drawn mask.', 'success');
    };

    const canvas = $('maskCanvas');

    canvas.addEventListener(
      'pointermove',
      (event) => {
        if (getMode() !== 'draw') return;
        const { view, screen, point } = worldPoint(event, canvas);
        $('maskCoords').textContent = `x ${xyText(point[0])} · y ${xyText(point[1])}`;

        if (drag?.mode === 'create-rect') {
          draft = { type: 'rect', a: drag.start, b: point };
          renderMask();
        } else if (drag?.mode === 'create-circle') {
          draft = {
            type: 'circle',
            c: drag.start,
            r: Math.hypot(point[0] - drag.start[0], point[1] - drag.start[1]),
          };
          renderMask();
        } else if (drag?.mode === 'move') {
          replaceShape(
            drag.original.id,
            translateDrawShape(
              drag.original,
              point[0] - drag.start[0],
              point[1] - drag.start[1],
            ),
          );
          renderMask();
        } else if (drag?.mode === 'resize') {
          replaceShape(drag.original.id, resizeDrawShape(drag.original, drag.handle, point));
          renderMask();
        } else if (tool === 'polygon' && polygonDraft) {
          polygonHover = point;
          renderMask();
        } else if (!tool) {
          const selected = selectedShape(),
            handle = selected
              ? nearestHandle(selected, screen, view, event.pointerType === 'touch' ? 18 : 9)
              : null;
          if (handle) canvas.style.cursor = 'nwse-resize';
          else canvas.style.cursor = hitShape(point) ? 'move' : 'default';
        } else {
          canvas.style.cursor = 'crosshair';
        }

        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );

    canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (getMode() !== 'draw' || event.button !== 0) return;
        const { view, screen, point } = worldPoint(event, canvas);

        if (tool === 'polygon') {
          if (!polygonDraft) polygonDraft = [];
          polygonDraft.push(point);
          polygonHover = point;
          syncUi();
          renderMask();
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }

        if (tool === 'rect' || tool === 'circle') {
          drag = {
            mode: tool === 'rect' ? 'create-rect' : 'create-circle',
            start: point,
            pointerId: event.pointerId,
          };
          draft =
            tool === 'rect'
              ? { type: 'rect', a: point, b: point }
              : { type: 'circle', c: point, r: 0 };
        } else {
          const selected = selectedShape(),
            handle = selected
              ? nearestHandle(selected, screen, view, event.pointerType === 'touch' ? 18 : 9)
              : null;
          if (selected && handle) {
            drag = {
              mode: 'resize',
              pointerId: event.pointerId,
              original: structuredClone(selected),
              handle,
            };
          } else {
            const hit = hitShape(point);
            selectedId = hit?.id || null;
            syncUi();
            if (hit) {
              drag = {
                mode: 'move',
                pointerId: event.pointerId,
                original: structuredClone(hit),
                start: point,
              };
            } else {
              renderMask();
              event.preventDefault();
              event.stopImmediatePropagation();
              return;
            }
          }
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
        if (getMode() !== 'draw' || !drag || drag.pointerId !== event.pointerId) return;
        if (drag.mode === 'create-rect' || drag.mode === 'create-circle') finishCreate();
        else {
          drag = null;
          syncUi();
          renderMask();
          onMaskChanged();
        }
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );

    canvas.addEventListener(
      'pointercancel',
      (event) => {
        if (getMode() !== 'draw' || !drag || drag.pointerId !== event.pointerId) return;
        if (drag.original) replaceShape(drag.original.id, drag.original);
        drag = null;
        draft = null;
        renderMask();
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        event.stopImmediatePropagation();
      },
      true,
    );

    window.addEventListener('keydown', (event) => {
      if (getMode() !== 'draw') return;
      if (event.key === 'Escape') {
        if (drag?.original) replaceShape(drag.original.id, drag.original);
        drag = null;
        draft = null;
        polygonDraft = null;
        polygonHover = null;
        tool = null;
        syncUi();
        renderMask();
      } else if (event.key === 'Enter' && tool === 'polygon') {
        event.preventDefault();
        finishPolygon();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && !tool && selectedId) {
        event.preventDefault();
        removeSelected();
      }
    });

    syncUi();
  }

  return {
    bind,
    render,
    syncUi,
    getTool: () => tool,
    getSelectedId: () => selectedId,
    resetInteraction,
  };
}
