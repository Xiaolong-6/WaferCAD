import {
  allocateDrawShapeId,
  drawShapeContainsPoint,
  drawShapeGeometry,
  drawShapeHandles,
  drawShapeTypeLabel,
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
  xyUnitLabel,
  formatLengthField,
  manualMicron,
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
    polygonHover = null,
    ignoreNextDoubleClick = false;

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

  function closeEditor() {
    if ($('drawShapeEditor')) $('drawShapeEditor').hidden = true;
  }

  function fieldRow(label, id, value, suffix = '') {
    const row = root.createElement('label');
    row.className = 'draw-shape-editor-row';
    const labelText = root.createElement('span');
    labelText.textContent = suffix ? `${label} ${suffix}` : label;
    const input = root.createElement('input');
    input.id = id;
    input.type = 'number';
    input.step = 'any';
    input.value = value;
    row.append(labelText, input);
    return row;
  }

  function polygonRow(shape) {
    const row = root.createElement('label');
    row.className = 'draw-shape-editor-row wide';
    const labelText = root.createElement('span');
    labelText.textContent = `Points (${xyUnitLabel()}) — one x, y pair per line`;
    const textarea = root.createElement('textarea');
    textarea.id = 'drawShapePoints';
    textarea.spellcheck = false;
    textarea.value = shape.points
      .map(
        ([x, y]) =>
          `${formatLengthField(x)}, ${formatLengthField(y)}`,
      )
      .join('\n');
    row.append(labelText, textarea);
    return row;
  }

  function renderEditor() {
    const editor = $('drawShapeEditor'),
      body = $('drawShapeEditorBody'),
      shape = selectedShape();
    if (!editor || !body) return;
    if (!shape) {
      editor.hidden = true;
      return;
    }

    $('drawShapeEditorTitle').textContent = drawShapeTypeLabel(shape);
    body.replaceChildren();
    const unit = `(${xyUnitLabel()})`;

    if (shape.type === 'rect') {
      const cx = (shape.a[0] + shape.b[0]) / 2,
        cy = (shape.a[1] + shape.b[1]) / 2,
        width = shape.b[0] - shape.a[0],
        height = shape.b[1] - shape.a[1];
      body.append(
        fieldRow('Center X', 'drawShapeCx', formatLengthField(cx), unit),
        fieldRow('Center Y', 'drawShapeCy', formatLengthField(cy), unit),
        fieldRow('Width', 'drawShapeWidth', formatLengthField(width), unit),
        fieldRow('Height', 'drawShapeHeight', formatLengthField(height), unit),
      );
    } else if (shape.type === 'circle') {
      body.append(
        fieldRow('Center X', 'drawShapeCx', formatLengthField(shape.c[0]), unit),
        fieldRow('Center Y', 'drawShapeCy', formatLengthField(shape.c[1]), unit),
        fieldRow('Radius', 'drawShapeRadius', formatLengthField(shape.r), unit),
      );
    } else if (shape.type === 'polygon') {
      body.append(polygonRow(shape));
      const help = root.createElement('p');
      help.className = 'draw-shape-editor-help';
      help.textContent =
        'Example: 12.5, -4.0. At least three coordinate rows are required.';
      body.append(help);
    } else {
      body.append(
        fieldRow('Center X', 'drawShapeCx', formatLengthField(shape.c[0]), unit),
        fieldRow('Center Y', 'drawShapeCy', formatLengthField(shape.c[1]), unit),
        fieldRow(
          'Inner radius',
          'drawShapeInnerRadius',
          formatLengthField(shape.innerR),
          unit,
        ),
        fieldRow(
          'Outer radius',
          'drawShapeOuterRadius',
          formatLengthField(shape.outerR),
          unit,
        ),
      );
      if (shape.type === 'ring-sector') {
        body.append(
          fieldRow('Start angle', 'drawShapeStartDeg', String(shape.startDeg), '(°)'),
          fieldRow('End angle', 'drawShapeEndDeg', String(shape.endDeg), '(°)'),
        );
      }
    }
  }

  function openEditor(shape = selectedShape()) {
    if (!shape) return;
    selectedId = shape.id;
    renderEditor();
    $('drawShapeEditor').hidden = false;
    syncUi({ preserveEditor: true });
    renderMask();
  }

  function numberValue(id) {
    return Number($(id)?.value);
  }

  function lengthValue(id) {
    return manualMicron(numberValue(id));
  }

  function parsePolygonEditor() {
    const text = $('drawShapePoints')?.value || '',
      rows = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
      points = [];
    for (const row of rows) {
      const values = row
        .split(/[\s,]+/)
        .map(Number)
        .filter((value) => Number.isFinite(value));
      if (values.length !== 2) return null;
      points.push([manualMicron(values[0]), manualMicron(values[1])]);
    }
    return points.length >= 3 ? points : null;
  }

  function applyEditor() {
    const shape = selectedShape();
    if (!shape) return closeEditor();

    let next = null;
    if (shape.type === 'rect') {
      const cx = lengthValue('drawShapeCx'),
        cy = lengthValue('drawShapeCy'),
        width = Math.abs(lengthValue('drawShapeWidth')),
        height = Math.abs(lengthValue('drawShapeHeight'));
      next = normalizeDrawShape({
        ...shape,
        a: [cx - width / 2, cy - height / 2],
        b: [cx + width / 2, cy + height / 2],
      });
    } else if (shape.type === 'circle') {
      next = normalizeDrawShape({
        ...shape,
        c: [lengthValue('drawShapeCx'), lengthValue('drawShapeCy')],
        r: Math.abs(lengthValue('drawShapeRadius')),
      });
    } else if (shape.type === 'polygon') {
      const points = parsePolygonEditor();
      next = points ? normalizeDrawShape({ ...shape, points }) : null;
    } else {
      const common = {
        ...shape,
        c: [lengthValue('drawShapeCx'), lengthValue('drawShapeCy')],
        innerR: Math.abs(lengthValue('drawShapeInnerRadius')),
        outerR: Math.abs(lengthValue('drawShapeOuterRadius')),
      };
      next =
        shape.type === 'ring-sector'
          ? normalizeDrawShape({
              ...common,
              startDeg: numberValue('drawShapeStartDeg'),
              endDeg: numberValue('drawShapeEndDeg'),
            })
          : normalizeDrawShape(common);
    }

    if (!next) {
      status(
        shape.type === 'polygon'
          ? 'Polygon needs at least three valid x, y coordinate rows.'
          : 'Shape parameters are invalid. Check dimensions, radii, and angles.',
        'error',
      );
      return;
    }

    replaceShape(shape.id, next);
    renderEditor();
    syncUi({ preserveEditor: true });
    renderMask();
    onMaskChanged();
    status(`${drawShapeTypeLabel(next)} parameters updated.`, 'success');
  }

  function removeSelected() {
    if (!selectedId) return;
    const mask = currentMask();
    mask.shapes = mask.shapes.filter((shape) => shape.id !== selectedId);
    selectedId = null;
    setMask(mask);
    closeEditor();
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
    closeEditor();
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
    closeEditor();
    setMode(mode);
    syncUi();
    renderMask();
    onMaskChanged();
    status(mode === 'draw' ? 'Mask source: Draw.' : 'Mask source: File.');
  }

  function syncUi({ preserveEditor = false } = {}) {
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
      $('drawMaskHint').textContent =
        `${mask.shapes.length} shape${mask.shapes.length === 1 ? '' : 's'}${suffix}`;
    }
    if (draw && $('maskCellLabel')) {
      $('maskCellLabel').textContent = `${mask.shapes.length} drawn`;
    }
    if (!draw || !selected) closeEditor();
    else if (preserveEditor && !$('drawShapeEditor').hidden) renderEditor();

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

  function dedupePolygonPoints(points) {
    const out = [];
    for (const point of points || []) {
      const previous = out.at(-1);
      if (
        !previous ||
        Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 1e-9
      ) {
        out.push(point);
      }
    }
    if (
      out.length > 3 &&
      Math.hypot(out.at(-1)[0] - out[0][0], out.at(-1)[1] - out[0][1]) <= 1e-9
    ) {
      out.pop();
    }
    return out;
  }

  function finishPolygon() {
    const points = dedupePolygonPoints(polygonDraft);
    if (points.length < 3) {
      polygonDraft = null;
      polygonHover = null;
      syncUi();
      renderMask();
      status('Polygon needs at least three points.', 'warning');
      return;
    }

    const mask = currentMask(),
      allocation = allocateDrawShapeId(mask),
      shape = normalizeDrawShape({
        id: allocation.id,
        type: 'polygon',
        points,
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
      status(`Drawn ${drawShapeTypeLabel(shape)} created.`, 'success');
    }
    draft = null;
    drag = null;
    tool = null;
    syncUi();
    renderMask();
  }

  function traceGeometry(ctx, geometry, view) {
    ctx.beginPath();
    for (const polygon of geometry || []) {
      for (const ring of polygon || []) {
        ring.forEach((point, index) => {
          const q = worldToCanvas(point, view);
          if (index === 0) ctx.moveTo(q[0], q[1]);
          else ctx.lineTo(q[0], q[1]);
        });
        if (ring.length) ctx.closePath();
      }
    }
  }

  function traceShape(ctx, shape, view) {
    const candidate = shape.id ? shape : { ...shape, id: '__draft__' };
    traceGeometry(ctx, drawShapeGeometry(candidate), view);
  }

  function render(ctx, view, opacity = 1) {
    if (getMode() !== 'draw') return;
    const mask = currentMask();
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    for (const shape of mask.shapes) {
      traceShape(ctx, shape, view);
      ctx.fillStyle =
        shape.id === selectedId ? 'rgba(72,105,135,.34)' : 'rgba(72,105,135,.22)';
      ctx.strokeStyle = shape.id === selectedId ? '#344f68' : '#526b84';
      ctx.lineWidth = shape.id === selectedId ? 1.5 : 1.05;
      ctx.fill('evenodd');
      ctx.stroke();
    }
    if (draft) {
      traceShape(ctx, draft, view);
      ctx.fillStyle = 'rgba(72,105,135,.14)';
      ctx.strokeStyle = '#526b84';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      ctx.fill('evenodd');
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
      if (['radius', 'inner', 'outer', 'start', 'end'].includes(name)) {
        ctx.beginPath();
        ctx.arc(q[0], q[1], 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle =
          name === 'start' ? '#d39b2e' : name === 'end' ? '#5b8fc9' : '#344f68';
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
    closeEditor();
    syncUi();
  }

  function bind() {
    $('maskSourceToggleBtn').onclick = () =>
      setSourceMode(getMode() === 'draw' ? 'file' : 'draw');

    root.querySelectorAll('.draw-mask-tool').forEach((button) => {
      button.onclick = () => setTool(button.dataset.drawTool || null);
    });
    $('drawMaskDeleteBtn').onclick = removeSelected;
    $('drawShapeEditorDelete').onclick = removeSelected;
    $('drawShapeEditorClose').onclick = closeEditor;
    $('drawShapeEditorApply').onclick = applyEditor;
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
        } else if (drag?.mode === 'create-ring' || drag?.mode === 'create-ring-sector') {
          const outerR = Math.hypot(
            point[0] - drag.start[0],
            point[1] - drag.start[1],
          );
          draft = {
            type: drag.mode === 'create-ring' ? 'ring' : 'ring-sector',
            c: drag.start,
            innerR: outerR / 2,
            outerR,
            ...(drag.mode === 'create-ring-sector'
              ? { startDeg: 0, endDeg: 90 }
              : {}),
          };
          renderMask();
        } else if (drag?.mode === 'move') {
          if (
            Math.hypot(screen[0] - drag.startScreen[0], screen[1] - drag.startScreen[1]) >
            3
          ) {
            drag.moved = true;
          }
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
              ? nearestHandle(
                  selected,
                  screen,
                  view,
                  event.pointerType === 'touch' ? 18 : 9,
                )
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
          if (event.detail >= 2) {
            ignoreNextDoubleClick = true;
            finishPolygon();
          } else {
            syncUi();
            renderMask();
          }
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }

        if (['rect', 'circle', 'ring', 'ring-sector'].includes(tool)) {
          drag = {
            mode: `create-${tool}`,
            start: point,
            pointerId: event.pointerId,
          };
          if (tool === 'rect') {
            draft = { type: 'rect', a: point, b: point };
          } else if (tool === 'circle') {
            draft = { type: 'circle', c: point, r: 0 };
          } else {
            draft = {
              type: tool,
              c: point,
              innerR: 0,
              outerR: 0,
              ...(tool === 'ring-sector' ? { startDeg: 0, endDeg: 90 } : {}),
            };
          }
        } else {
          const selected = selectedShape(),
            handle = selected
              ? nearestHandle(
                  selected,
                  screen,
                  view,
                  event.pointerType === 'touch' ? 18 : 9,
                )
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
            closeEditor();
            syncUi();
            if (hit && event.detail >= 2) {
              openEditor(hit);
              event.preventDefault();
              event.stopImmediatePropagation();
              return;
            }
            if (hit) {
              drag = {
                mode: 'move',
                pointerId: event.pointerId,
                original: structuredClone(hit),
                start: point,
                startScreen: screen,
                moved: false,
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
        const completed = drag;
        if (completed.mode.startsWith('create-')) {
          finishCreate();
        } else {
          drag = null;
          syncUi();
          renderMask();
          onMaskChanged();
          if (
            completed.mode === 'move' &&
            !completed.moved &&
            completed.original.type !== 'polygon'
          ) {
            openEditor(selectedShape());
          }
        }
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
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
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        event.stopImmediatePropagation();
      },
      true,
    );

    canvas.addEventListener(
      'dblclick',
      (event) => {
        if (getMode() !== 'draw') return;
        if (ignoreNextDoubleClick) {
          ignoreNextDoubleClick = false;
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (tool === 'polygon') {
          event.preventDefault();
          event.stopImmediatePropagation();
          finishPolygon();
          return;
        }
        if (tool) return;
        const { point } = worldPoint(event, canvas),
          hit = hitShape(point);
        if (!hit) return;
        selectedId = hit.id;
        event.preventDefault();
        event.stopImmediatePropagation();
        openEditor(hit);
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
        closeEditor();
        syncUi();
        renderMask();
      } else if (event.key === 'Enter' && tool === 'polygon') {
        event.preventDefault();
        finishPolygon();
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        !tool &&
        selectedId &&
        root.activeElement?.tagName !== 'TEXTAREA' &&
        root.activeElement?.tagName !== 'INPUT'
      ) {
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
