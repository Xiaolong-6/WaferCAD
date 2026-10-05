import { minimumSegmentLength, zoomLimitForFeature } from '../view-interactions.js';

export function createPlanViewController({
  windowRef = window,
  getModel,
  getLayout,
  getMaskTransform,
  getMaskSourceMode = () => 'file',
  getDrawMask = () => ({ nextShapeId: 1, shapes: [] }),
  getPlanViews,
  maskPoint,
  formatXY,
  xyToDisplay,
  xyFromDisplay,
  xyUnitLabel,
  renderMask,
  renderMain,
  getViewportMargin = () => 34,
  getCompactAxes = () => false,
  onChanged = () => {},
}) {
  const featureSizeCache = {
    mask: { layout: null, scale: null, value: null },
    main: { model: null, revision: null, value: null },
  };

  function setupCanvas(canvas) {
    const dpr = Math.min(windowRef.devicePixelRatio || 1, 2),
      rect = canvas.getBoundingClientRect(),
      width = Math.max(2, Math.round(rect.width * dpr)),
      height = Math.max(2, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: context, w: rect.width, h: rect.height };
  }

  function maskWorldBounds() {
    const model = getModel(),
      layout = getLayout(),
      base = {
        minX: -model.width / 2,
        maxX: model.width / 2,
        minY: -model.height / 2,
        maxY: model.height / 2,
      };

    let minX = base.minX,
      maxX = base.maxX,
      minY = base.minY,
      maxY = base.maxY;

    if (getMaskSourceMode() === 'draw') {
      for (const shape of getDrawMask()?.shapes || []) {
        if (shape.type === 'rect' && Array.isArray(shape.a) && Array.isArray(shape.b)) {
          minX = Math.min(minX, Number(shape.a[0]), Number(shape.b[0]));
          maxX = Math.max(maxX, Number(shape.a[0]), Number(shape.b[0]));
          minY = Math.min(minY, Number(shape.a[1]), Number(shape.b[1]));
          maxY = Math.max(maxY, Number(shape.a[1]), Number(shape.b[1]));
        } else if (shape.type === 'circle' && Array.isArray(shape.c)) {
          const radius = Math.abs(Number(shape.r) || 0),
            cx = Number(shape.c[0]),
            cy = Number(shape.c[1]);
          minX = Math.min(minX, cx - radius);
          maxX = Math.max(maxX, cx + radius);
          minY = Math.min(minY, cy - radius);
          maxY = Math.max(maxY, cy + radius);
        } else if (
          (shape.type === 'ring' || shape.type === 'ring-sector') &&
          Array.isArray(shape.c)
        ) {
          const radius = Math.abs(Number(shape.outerR) || 0),
            cx = Number(shape.c[0]),
            cy = Number(shape.c[1]);
          minX = Math.min(minX, cx - radius);
          maxX = Math.max(maxX, cx + radius);
          minY = Math.min(minY, cy - radius);
          maxY = Math.max(maxY, cy + radius);
        } else if (shape.type === 'polygon' && Array.isArray(shape.points)) {
          for (const point of shape.points) {
            const x = Number(point?.[0]),
              y = Number(point?.[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
    } else if (layout.elements?.length || layout.linework?.length) {
      const bounds = layout.bounds,
        corners = [
          [bounds.minX, bounds.minY],
          [bounds.minX, bounds.maxY],
          [bounds.maxX, bounds.minY],
          [bounds.maxX, bounds.maxY],
        ].map(maskPoint);

      for (const [x, y] of corners) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(1e-9, maxX - minX),
      height: Math.max(1e-9, maxY - minY),
    };
  }

  function viewport(width, height, kind = 'mask') {
    const model = getModel(),
      margin = Math.max(0, Number(getViewportMargin(kind)) || 0),
      view = getPlanViews()[kind],
      bounds =
        kind === 'mask'
          ? maskWorldBounds()
          : {
              minX: -model.width / 2,
              maxX: model.width / 2,
              minY: -model.height / 2,
              maxY: model.height / 2,
              width: model.width,
              height: model.height,
            },
      baseScale = Math.min(
        (width - margin * 2) / Math.max(bounds.width, 1e-9),
        (height - margin * 2) / Math.max(bounds.height, 1e-9),
      ),
      scale = baseScale * view.zoom,
      centerX = (bounds.minX + bounds.maxX) / 2,
      centerY = (bounds.minY + bounds.maxY) / 2;

    return {
      s: scale,
      cx: width / 2 - centerX * scale + view.panX,
      cy: height / 2 + centerY * scale + view.panY,
    };
  }

  function maskMinimumFeatureSize() {
    if (getMaskSourceMode() === 'draw') {
      const drawMask = getDrawMask(),
        pointGroups = [],
        widths = [];
      for (const shape of drawMask?.shapes || []) {
        if (shape.type === 'rect' && Array.isArray(shape.a) && Array.isArray(shape.b)) {
          const [x0, y0] = shape.a,
            [x1, y1] = shape.b;
          pointGroups.push([
            [x0, y0],
            [x1, y0],
            [x1, y1],
            [x0, y1],
            [x0, y0],
          ]);
        } else if (shape.type === 'circle') {
          widths.push(Math.abs(Number(shape.r) || 0) * 2);
        } else if (shape.type === 'polygon' && Array.isArray(shape.points)) {
          pointGroups.push([...shape.points, shape.points[0]].filter(Boolean));
        } else if (shape.type === 'ring' || shape.type === 'ring-sector') {
          const inner = Math.abs(Number(shape.innerR) || 0),
            outer = Math.abs(Number(shape.outerR) || 0);
          if (outer > inner) widths.push(Math.max(outer - inner, outer * 0.02));
        }
      }
      return minimumSegmentLength(pointGroups, widths);
    }

    const layout = getLayout(),
      scale = Math.abs(getMaskTransform().scale) || 1;

    if (featureSizeCache.mask.layout === layout && featureSizeCache.mask.scale === scale) {
      return featureSizeCache.mask.value;
    }

    const pointGroups = [],
      widths = [];
    for (const element of [...(layout.elements || []), ...(layout.linework || [])]) {
      if (Array.isArray(element.points)) pointGroups.push(element.points);
      if (element.width > 0) widths.push(element.width);
    }

    const raw = minimumSegmentLength(pointGroups, widths),
      value = raw == null ? null : raw * scale;
    featureSizeCache.mask = { layout, scale, value };
    return value;
  }

  function mainMinimumFeatureSize() {
    const model = getModel();
    if (
      featureSizeCache.main.model === model &&
      featureSizeCache.main.revision === model.revision
    ) {
      return featureSizeCache.main.value;
    }

    const pointGroups = [];
    for (const region of model.regions || []) {
      for (const polygon of region.geom || []) {
        for (const ring of polygon || []) pointGroups.push(ring);
      }
    }

    const value = minimumSegmentLength(pointGroups, [model.width, model.height]);
    featureSizeCache.main = { model, revision: model.revision, value };
    return value;
  }

  function maximumPlanZoom(kind, width, height) {
    const state = getPlanViews()[kind],
      current = viewport(width, height, kind),
      baseScale = current.s / Math.max(state.zoom, 1e-12),
      feature = kind === 'mask' ? maskMinimumFeatureSize() : mainMinimumFeatureSize();
    return zoomLimitForFeature(baseScale, feature);
  }

  function worldToCanvas(point, view, back = false) {
    const x = back ? -point[0] : point[0];
    return [view.cx + x * view.s, view.cy - point[1] * view.s];
  }

  function canvasToWorld(x, y, view, back = false) {
    let worldX = (x - view.cx) / view.s;
    if (back) worldX = -worldX;
    return [worldX, (view.cy - y) / view.s];
  }

  function resetPlanView(kind) {
    Object.assign(getPlanViews()[kind], { zoom: 1, panX: 0, panY: 0 });
    onChanged();
    kind === 'mask' ? renderMask() : renderMain();
  }

  function panPlanView(kind, dx, dy) {
    const state = getPlanViews()[kind];
    const deltaX = Number(dx);
    const deltaY = Number(dy);
    if (!state || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
    state.panX += deltaX;
    state.panY += deltaY;
    onChanged();
    kind === 'mask' ? renderMask() : renderMain();
  }

  function zoomPlanView(kind, canvas, factor, clientX = null, clientY = null, back = false) {
    const state = getPlanViews()[kind],
      rect = canvas.getBoundingClientRect(),
      { w, h } = setupCanvas(canvas),
      px = clientX == null ? w / 2 : clientX - rect.left,
      py = clientY == null ? h / 2 : clientY - rect.top,
      before = viewport(w, h, kind),
      anchor = canvasToWorld(px, py, before, back);

    state.zoom = Math.max(0.3, Math.min(maximumPlanZoom(kind, w, h), state.zoom * factor));

    const after = viewport(w, h, kind),
      mapped = worldToCanvas(anchor, after, back);
    state.panX += px - mapped[0];
    state.panY += py - mapped[1];
    onChanged();
    kind === 'mask' ? renderMask() : renderMain();
  }

  function niceStep(range, count = 6) {
    const raw = Math.max(1e-9, range / Math.max(1, count)),
      power = 10 ** Math.floor(Math.log10(raw)),
      normalized = raw / power;
    return (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10) * power;
  }

  function drawPlanAxes(context, view, width, height, back = false) {
    if (getCompactAxes()) {
      const left = 8,
        bottom = height - 8,
        right = width - 7,
        top = 7;
      context.save();
      context.strokeStyle = 'rgba(70,82,95,.2)';
      context.fillStyle = '#7b8792';
      context.lineWidth = 0.65;
      context.beginPath();
      context.moveTo(left, bottom);
      context.lineTo(right, bottom);
      context.moveTo(left, bottom);
      context.lineTo(left, top);
      context.stroke();
      context.font = '700 7px system-ui';
      context.textAlign = 'right';
      context.textBaseline = 'bottom';
      context.fillText(`X (${xyUnitLabel()})`, right, bottom - 2);
      context.textAlign = 'left';
      context.fillText(`Y (${xyUnitLabel()})`, left + 3, top + 8);
      context.restore();
      return;
    }

    context.save();
    context.font = '7.5px system-ui';
    const yLabelWidth = Math.max(
      ...[7, height - 17].map(
        (y) => context.measureText(formatXY(canvasToWorld(0, y, view, back)[1])).width,
      ),
    );
    context.restore();

    const left = Math.max(28, Math.ceil(yLabelWidth + 6)),
      bottom = height - 17,
      right = width - 7,
      top = 7,
      xa = canvasToWorld(left, bottom, view, back),
      xb = canvasToWorld(right, bottom, view, back),
      ya = canvasToWorld(left, bottom, view, back),
      yb = canvasToWorld(left, top, view, back),
      xmin = Math.min(xa[0], xb[0]),
      xmax = Math.max(xa[0], xb[0]),
      ymin = Math.min(ya[1], yb[1]),
      ymax = Math.max(ya[1], yb[1]),
      displayXMin = xyToDisplay(xmin),
      displayXMax = xyToDisplay(xmax),
      displayYMin = xyToDisplay(ymin),
      displayYMax = xyToDisplay(ymax);

    context.save();
    context.font = '7.5px system-ui';
    const labelWidth = Math.max(
        context.measureText(formatXY(xmin)).width,
        context.measureText(formatXY(xmax)).width,
        16,
      ),
      xStep = niceStep(displayXMax - displayXMin, Math.max(2, (right - left) / (labelWidth + 14))),
      yStep = niceStep(displayYMax - displayYMin, Math.max(2, (bottom - top) / 30));
    context.restore();

    context.save();
    context.strokeStyle = 'rgba(70,82,95,.24)';
    context.fillStyle = '#78838f';
    context.lineWidth = 0.7;
    context.font = '7.5px system-ui';
    context.beginPath();
    context.moveTo(left, bottom);
    context.lineTo(right, bottom);
    context.moveTo(left, bottom);
    context.lineTo(left, top);
    context.stroke();

    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (
      let displayX = Math.ceil(displayXMin / xStep) * xStep;
      displayX <= displayXMax + xStep * 0.001;
      displayX += xStep
    ) {
      const x = xyFromDisplay(displayX),
        point = worldToCanvas([x, 0], view, back);
      if (point[0] < left - 1 || point[0] > right + 1) continue;
      context.beginPath();
      context.moveTo(point[0], bottom);
      context.lineTo(point[0], bottom - 3);
      context.stroke();
      const label = Math.abs(displayX) < 1e-12 ? '0' : formatXY(x),
        halfWidth = context.measureText(label).width / 2;
      if (point[0] - halfWidth >= 1 && point[0] + halfWidth <= width - 1) {
        context.fillText(label, point[0], bottom + 1);
      }
    }

    context.textAlign = 'right';
    context.textBaseline = 'middle';
    for (
      let displayY = Math.ceil(displayYMin / yStep) * yStep;
      displayY <= displayYMax + yStep * 0.001;
      displayY += yStep
    ) {
      const y = xyFromDisplay(displayY),
        point = worldToCanvas([0, y], view, back);
      if (point[1] < top - 1 || point[1] > bottom + 1) continue;
      context.beginPath();
      context.moveTo(left, point[1]);
      context.lineTo(left + 3, point[1]);
      context.stroke();
      context.fillText(Math.abs(displayY) < 1e-12 ? '0' : formatXY(y), left - 3, point[1]);
    }

    context.font = '700 7.5px system-ui';
    context.textAlign = 'right';
    context.textBaseline = 'bottom';
    context.fillText(`X (${xyUnitLabel()})`, right, bottom - 3);
    context.textAlign = 'left';
    context.fillText(`Y (${xyUnitLabel()})`, left + 3, top + 8);
    context.restore();
  }

  return {
    setupCanvas,
    viewport,
    worldToCanvas,
    canvasToWorld,
    resetPlanView,
    panPlanView,
    zoomPlanView,
    drawPlanAxes,
  };
}
