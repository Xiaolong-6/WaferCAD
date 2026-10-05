import {
  SECTION_DETAIL_ROI_MIN_EXTENT,
  normalizeSectionDetailRoi,
  sectionDetailRoiFromPoints,
  translateSectionDetailRoi,
} from '../section-detail-roi.js';

export function createSectionDetailRoiController({
  root = document,
  getRoi,
  setRoi,
  renderDetail = null,
  onChanged = () => {},
  status = () => {},
}) {
  const $ = (id) => root.getElementById(id);
  let drawing = false,
    drag = null,
    previewRoi = null,
    insetPosition = null;

  function canvasPoint(event) {
    const canvas = $('sectionCanvas'),
      rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
    };
  }

  function setDrawing(value) {
    drawing = Boolean(value);
    $('sectionCanvas')?.classList.toggle('section-detail-drawing', drawing);
    sync();
  }

  function commit(value, message = '') {
    previewRoi = null;
    setRoi(normalizeSectionDetailRoi(value));
    onChanged();
    sync();
    if (message) status(message);
  }

  function cropRect(roi) {
    const source = $('sectionCanvas');
    return {
      sx: roi.x * source.width,
      sy: roi.y * source.height,
      sw: roi.width * source.width,
      sh: roi.height * source.height,
    };
  }

  function drawInset(roi) {
    const source = $('sectionCanvas'),
      target = $('sectionDetailInsetCanvas');
    if (!source || !target || !roi) return;

    const cssWidth = Math.max(120, target.clientWidth || 190),
      cssHeight = Math.max(120, target.clientHeight || 190);

    if (typeof renderDetail === 'function') {
      renderDetail(target, roi);
      const zoom = $('sectionDetailZoom'),
        sourceCssWidth = roi.width * source.getBoundingClientRect().width,
        zoomFactor = cssWidth / Math.max(1, sourceCssWidth);
      if (zoom) {
        zoom.textContent = `×${zoomFactor < 10 ? zoomFactor.toFixed(1) : Math.round(zoomFactor)}`;
      }
      return;
    }

    const dpr = Math.max(1, Number(globalThis.devicePixelRatio) || 1),
      width = Math.max(1, Math.round(cssWidth * dpr)),
      height = Math.max(1, Math.round(cssHeight * dpr));

    if (target.width !== width) target.width = width;
    if (target.height !== height) target.height = height;

    const ctx = target.getContext('2d'),
      { sx, sy, sw, sh } = cropRect(roi),
      scale = Math.min(width / Math.max(1, sw), height / Math.max(1, sh)),
      dw = sw * scale,
      dh = sh * scale,
      dx = (width - dw) / 2,
      dy = (height - dh) / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fbfcfd';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);

    const zoom = $('sectionDetailZoom'),
      sourceCssWidth = roi.width * source.getBoundingClientRect().width,
      zoomFactor = cssWidth / Math.max(1, sourceCssWidth);
    if (zoom)
      zoom.textContent = `×${zoomFactor < 10 ? zoomFactor.toFixed(1) : Math.round(zoomFactor)}`;
  }

  function syncPosition(roi) {
    const body = $('sectionBody'),
      canvas = $('sectionCanvas'),
      overlay = $('sectionDetailRoiOverlay'),
      inset = $('sectionDetailInset');
    if (!body || !canvas || !overlay || !inset || !roi) return;

    const bodyRect = body.getBoundingClientRect(),
      canvasRect = canvas.getBoundingClientRect(),
      left = canvasRect.left - bodyRect.left + roi.x * canvasRect.width,
      top = canvasRect.top - bodyRect.top + roi.y * canvasRect.height;

    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.width = `${roi.width * canvasRect.width}px`;
    overlay.style.height = `${roi.height * canvasRect.height}px`;

    inset.hidden = false;
    const insetWidth = inset.offsetWidth || 202,
      insetHeight = inset.offsetHeight || 202,
      minLeft = canvasRect.left - bodyRect.left + 6,
      minTop = canvasRect.top - bodyRect.top + 6,
      maxLeft = Math.max(minLeft, canvasRect.right - bodyRect.left - insetWidth - 6),
      maxTop = Math.max(minTop, canvasRect.bottom - bodyRect.top - insetHeight - 6);

    if (!insetPosition) {
      insetPosition = {
        left: maxLeft,
        top: minTop,
      };
    } else {
      insetPosition = {
        left: Math.max(minLeft, Math.min(maxLeft, insetPosition.left)),
        top: Math.max(minTop, Math.min(maxTop, insetPosition.top)),
      };
    }

    inset.style.left = `${insetPosition.left}px`;
    inset.style.top = `${insetPosition.top}px`;
  }

  function sync() {
    const roi = normalizeSectionDetailRoi(previewRoi || getRoi()),
      overlay = $('sectionDetailRoiOverlay'),
      inset = $('sectionDetailInset'),
      button = $('sectionDetailRoiBtn'),
      shapeButton = $('sectionDetailShapeBtn');

    if (!overlay || !inset || !button) return;

    button.classList.toggle('active', drawing || Boolean(roi));
    button.setAttribute('aria-pressed', String(drawing || Boolean(roi)));
    button.title = drawing
      ? 'Drag on Section A–B to define a detail ROI'
      : roi
        ? 'Redraw the Section detail ROI'
        : 'Magnify a local area of Section A–B';

    if (!roi) {
      overlay.hidden = true;
      inset.hidden = true;
      return;
    }

    overlay.hidden = false;
    overlay.classList.toggle('circle', roi.shape === 'circle');
    overlay.classList.toggle('preview', Boolean(previewRoi));
    if (shapeButton) {
      shapeButton.textContent = roi.shape === 'circle' ? '○' : '□';
      shapeButton.title = roi.shape === 'circle' ? 'Use rectangular ROI' : 'Use circular ROI';
    }

    syncPosition(roi);
    drawInset(roi);
  }

  function beginDraw(event) {
    if (!drawing || event.button !== 0) return;
    const point = canvasPoint(event),
      current = normalizeSectionDetailRoi(getRoi());
    drag = {
      mode: 'draw',
      pointerId: event.pointerId,
      start: point,
      shape: current?.shape || 'rect',
    };
    previewRoi = sectionDetailRoiFromPoints(point, point, drag.shape);
    $('sectionCanvas').setPointerCapture?.(event.pointerId);
    sync();
    event.preventDefault();
  }

  function beginMove(event) {
    if (event.button !== 0 || drawing) return;
    const roi = normalizeSectionDetailRoi(getRoi());
    if (!roi) return;
    drag = {
      mode: 'move',
      pointerId: event.pointerId,
      start: canvasPoint(event),
      initial: roi,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function beginInsetMove(event) {
    if (event.button !== 0 || drawing || event.target?.closest?.('button')) return;
    const inset = $('sectionDetailInset');
    if (!inset || inset.hidden) return;
    drag = {
      mode: 'inset',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      initialPosition: insetPosition || {
        left: Number.parseFloat(inset.style.left) || 0,
        top: Number.parseFloat(inset.style.top) || 0,
      },
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.classList.add('dragging');
    event.preventDefault();
    event.stopPropagation();
  }

  function beginResize(corner, event) {
    if (event.button !== 0 || drawing) return;
    const roi = normalizeSectionDetailRoi(getRoi());
    if (!roi) return;
    drag = {
      mode: 'resize',
      pointerId: event.pointerId,
      corner,
      initial: roi,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function resizedRoi(initial, corner, point) {
    let x0 = initial.x,
      y0 = initial.y,
      x1 = initial.x + initial.width,
      y1 = initial.y + initial.height;

    if (corner.includes('w')) x0 = Math.min(point.x, x1 - SECTION_DETAIL_ROI_MIN_EXTENT);
    if (corner.includes('e')) x1 = Math.max(point.x, x0 + SECTION_DETAIL_ROI_MIN_EXTENT);
    if (corner.includes('n')) y0 = Math.min(point.y, y1 - SECTION_DETAIL_ROI_MIN_EXTENT);
    if (corner.includes('s')) y1 = Math.max(point.y, y0 + SECTION_DETAIL_ROI_MIN_EXTENT);

    return normalizeSectionDetailRoi({
      x: x0,
      y: y0,
      width: x1 - x0,
      height: y1 - y0,
      shape: initial.shape,
    });
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const point = canvasPoint(event);

    if (drag.mode === 'draw') {
      previewRoi = sectionDetailRoiFromPoints(drag.start, point, drag.shape);
    } else if (drag.mode === 'move') {
      previewRoi = translateSectionDetailRoi(
        drag.initial,
        point.x - drag.start.x,
        point.y - drag.start.y,
      );
    } else if (drag.mode === 'resize') {
      previewRoi = resizedRoi(drag.initial, drag.corner, point);
    } else if (drag.mode === 'inset') {
      insetPosition = {
        left: drag.initialPosition.left + event.clientX - drag.startClientX,
        top: drag.initialPosition.top + event.clientY - drag.startClientY,
      };
    }
    sync();
  }

  function endDrag(event) {
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
    const completed = previewRoi,
      completedMode = drag.mode;
    drag = null;
    $('sectionDetailInsetHead')?.classList.remove('dragging');
    if (completedMode === 'inset') {
      sync();
      return;
    }
    if (!completed) {
      sync();
      return;
    }

    const wasDrawing = drawing;
    setDrawing(false);
    commit(completed, wasDrawing ? 'Section detail ROI created.' : '');
  }

  function cancelDrawing() {
    drag = null;
    previewRoi = null;
    setDrawing(false);
  }

  function clear() {
    drag = null;
    previewRoi = null;
    setDrawing(false);
    setRoi(null);
    onChanged();
    sync();
    status('Section detail ROI hidden.');
  }

  function toggleShape() {
    const roi = normalizeSectionDetailRoi(getRoi());
    if (!roi) return;
    commit(
      { ...roi, shape: roi.shape === 'circle' ? 'rect' : 'circle' },
      roi.shape === 'circle' ? 'Section detail ROI: rectangular.' : 'Section detail ROI: circular.',
    );
  }

  function bind() {
    const canvas = $('sectionCanvas'),
      overlay = $('sectionDetailRoiOverlay'),
      insetHead = $('sectionDetailInsetHead');

    $('sectionDetailRoiBtn').addEventListener('click', () => {
      if (drawing) {
        cancelDrawing();
        status('Section detail ROI drawing cancelled.');
      } else {
        setDrawing(true);
        status('Drag on Section A–B to define the detail ROI.');
      }
    });

    $('sectionDetailCloseBtn').addEventListener('click', clear);
    $('sectionDetailShapeBtn').addEventListener('click', toggleShape);
    insetHead.addEventListener('pointerdown', beginInsetMove);
    insetHead.addEventListener('dblclick', () => {
      insetPosition = null;
      sync();
      status('Section detail inset position reset.');
    });
    canvas.addEventListener('pointerdown', beginDraw);
    overlay.addEventListener('pointerdown', beginMove);
    overlay.querySelectorAll('[data-detail-handle]').forEach((handle) => {
      handle.addEventListener('pointerdown', (event) =>
        beginResize(handle.dataset.detailHandle, event),
      );
    });

    globalThis.addEventListener('pointermove', moveDrag);
    globalThis.addEventListener('pointerup', endDrag);
    globalThis.addEventListener('pointercancel', endDrag);
    globalThis.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && drawing) {
        event.preventDefault();
        cancelDrawing();
        status('Section detail ROI drawing cancelled.');
      }
    });

    new ResizeObserver(sync).observe(canvas);
    sync();
  }

  return { bind, sync, cancelDrawing, clear };
}
