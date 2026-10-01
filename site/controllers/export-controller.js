import { layerById, modelBoundsZ } from '../model.js';
import { sectionContours, sectionSlices, surfaceGroups } from '../model-view-geometry.js';
import { sectorBoundaryPoints } from '../roi-editor.js';

function shadeColor(hex, delta) {
  const n = parseInt(hex.slice(1), 16),
    r = Math.max(0, Math.min(255, (n >> 16) + delta)),
    g = Math.max(0, Math.min(255, ((n >> 8) & 255) + delta)),
    b = Math.max(0, Math.min(255, (n & 255) + delta));
  return `rgb(${r},${g},${b})`;
}

function svgNumber(value) {
  return Number(Number(value).toFixed(3));
}

function svgPathFromMulti(geom, mapPoint) {
  let d = '';
  for (const poly of geom || []) {
    for (const ring of poly || []) {
      ring.forEach((point, index) => {
        const mapped = mapPoint(point);
        d += `${index ? 'L' : 'M'}${svgNumber(mapped[0])} ${svgNumber(mapped[1])}`;
      });
      d += 'Z';
    }
  }
  return d;
}

function svgDocument(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgNumber(width)}" height="${svgNumber(
    height,
  )}" viewBox="0 0 ${svgNumber(width)} ${svgNumber(height)}"><rect width="100%" height="100%" fill="#fbfcfd"/>${body}</svg>`;
}

export function createExportController({
  root = document,
  getState,
  viewport,
  worldToCanvas,
  maskPoint,
  selectedElement,
  layerKey,
  layerColor,
  formatXY,
  status,
}) {
  const $ = (id) => root.getElementById(id);

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = root.createElement('a');
    link.href = url;
    link.download = filename;
    root.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadText(text, filename, type = 'image/svg+xml') {
    downloadBlob(new Blob([text], { type }), filename);
  }

  function exportMainSvg() {
    const { model, activeFace, section, roi } = getState();
    const canvas = $('mainCanvas'),
      rect = canvas.getBoundingClientRect(),
      width = Math.max(2, rect.width),
      height = Math.max(2, rect.height),
      view = viewport(width, height, 'main'),
      back = activeFace === 'back',
      map = (point) => worldToCanvas(point, view);
    let body = `<path d="${svgPathFromMulti(model.boundary, map)}" fill="#f1f4f6" stroke="#96a1ad" stroke-width="1"/>`;

    for (const patch of surfaceGroups(model, activeFace)) {
      const layer = layerById(model, patch.layerId);
      if (!layer) continue;
      const shade = Math.max(-12, Math.min(14, patch.z * 0.8));
      body += `<path d="${svgPathFromMulti(patch.geom, map)}" fill="${shadeColor(
        layer.color,
        shade,
      )}" fill-rule="evenodd" stroke="rgba(36,46,56,.24)" stroke-width=".65"/>`;
    }
    body += `<path d="${svgPathFromMulti(model.boundary, map)}" fill="none" stroke="#87939f" stroke-width="1"/>`;

    const a = map(section.a),
      b = map(section.b);
    body += `<line x1="${svgNumber(a[0])}" y1="${svgNumber(a[1])}" x2="${svgNumber(
      b[0],
    )}" y2="${svgNumber(b[1])}" stroke="#cc5062" stroke-width="2.3"/>`;
    for (const [point, label] of [
      [a, 'A'],
      [b, 'B'],
    ]) {
      body += `<circle cx="${svgNumber(point[0])}" cy="${svgNumber(
        point[1],
      )}" r="4.5" fill="#cc5062"/><text x="${svgNumber(point[0] + 6)}" y="${svgNumber(
        point[1] - 6,
      )}" font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="#cc5062">${label}</text>`;
    }

    if (roi) {
      body += `<path d="${svgRoiPath(
        roi,
        view,
        back,
      )}" fill="rgba(214,83,97,.05)" stroke="#d65361" stroke-width="1.2" stroke-dasharray="5 4"/>`;
    }

    downloadText(svgDocument(width, height, body), 'wafercad-main.svg');
    status('Exported Main as SVG.');
  }

  function svgRoiPath(shape, view, back = false) {
    if (!shape) return '';
    if (shape.type === 'rect') {
      const a = worldToCanvas(shape.a, view, back),
        b = worldToCanvas(shape.b, view, back);
      return `M${svgNumber(a[0])} ${svgNumber(a[1])}L${svgNumber(b[0])} ${svgNumber(
        a[1],
      )}L${svgNumber(b[0])} ${svgNumber(b[1])}L${svgNumber(a[0])} ${svgNumber(b[1])}Z`;
    }
    if (shape.type === 'circle') {
      const center = worldToCanvas(shape.c, view, back),
        radius = shape.r * view.s;
      return `M${svgNumber(center[0] + radius)} ${svgNumber(center[1])}A${svgNumber(
        radius,
      )} ${svgNumber(radius)} 0 1 0 ${svgNumber(center[0] - radius)} ${svgNumber(
        center[1],
      )}A${svgNumber(radius)} ${svgNumber(radius)} 0 1 0 ${svgNumber(
        center[0] + radius,
      )} ${svgNumber(center[1])}Z`;
    }
    if (shape.type === 'sector') {
      const points = sectorBoundaryPoints(shape, 96);
      return (
        points
          .map((point, index) => {
            const mapped = worldToCanvas(point, view, back);
            return `${index ? 'L' : 'M'}${svgNumber(mapped[0])} ${svgNumber(mapped[1])}`;
          })
          .join('') + 'Z'
      );
    }
    return '';
  }

  function exportMaskSvg() {
    const { model, layout, maskTransform } = getState();
    const canvas = $('maskCanvas'),
      rect = canvas.getBoundingClientRect(),
      width = Math.max(2, rect.width),
      height = Math.max(2, rect.height),
      view = viewport(width, height, 'mask'),
      map = (point) => worldToCanvas(point, view, back);
    let body = `<path d="${svgPathFromMulti(model.boundary, map)}" fill="#f1f4f6" stroke="#96a1ad" stroke-width="1"/>`;

    for (const element of layout.linework || []) {
      if (!Array.isArray(element.points) || element.points.length < 2) continue;
      const points = element.points.map(maskPoint).map(map);
      const d = points
        .map((point, index) => `${index ? 'L' : 'M'}${svgNumber(point[0])} ${svgNumber(point[1])}`)
        .join('');
      const selected = selectedElement(element);
      body += `<path d="${d}" fill="none" stroke="${
        selected ? layerColor(layerKey(element.layer, element.datatype), 0.95) : '#aab3bd'
      }" stroke-width="${svgNumber(
        Math.max(0.8, element.width * maskTransform.scale * view.s),
      )}"/>`;
    }

    for (const element of layout.elements || []) {
      if (element.kind !== 'polygon' || !Array.isArray(element.points)) continue;
      const points = element.points.map(maskPoint).map(map);
      const d =
        points
          .map(
            (point, index) => `${index ? 'L' : 'M'}${svgNumber(point[0])} ${svgNumber(point[1])}`,
          )
          .join('') + 'Z';
      const key = layerKey(element.layer, element.datatype),
        selected = selectedElement(element);
      body += `<path d="${d}" fill="${
        selected ? layerColor(key, 0.58) : 'rgba(155,166,178,.10)'
      }" stroke="${selected ? layerColor(key, 0.98) : 'rgba(148,159,171,.52)'}" stroke-width="${
        selected ? 1 : 0.6
      }"/>`;
    }



    downloadText(svgDocument(width, height, body), 'wafercad-mask.svg');
    status('Exported Mask as SVG.');
  }

  function exportSectionSvg() {
    const { model, section, sectionScaleMode } = getState();
    const canvas = $('sectionCanvas'),
      rect = canvas.getBoundingClientRect(),
      width = Math.max(2, rect.width),
      height = Math.max(2, rect.height),
      [lo, hi] = modelBoundsZ(model),
      pad = Math.max(1e-9, (hi - lo) * 0.08),
      z0 = lo - pad,
      z1 = hi + pad,
      zSpan = Math.max(z1 - z0, 1e-12),
      sectionSpan = Math.max(
        Math.hypot(section.b[0] - section.a[0], section.b[1] - section.a[1]),
        1e-12,
      ),
      left = 27,
      right = 10,
      top = 10,
      bottom = 22,
      innerWidth = width - left - right,
      innerHeight = height - top - bottom,
      autoXScale = innerWidth / sectionSpan,
      autoZScale = innerHeight / zSpan;

    let plotLeft = left,
      plotTop = top,
      plotWidth = innerWidth,
      plotHeight = innerHeight;

    if (sectionScaleMode === 'physical') {
      const scale = Math.min(autoXScale, autoZScale);
      plotWidth = sectionSpan * scale;
      plotHeight = zSpan * scale;
      plotLeft = left + (innerWidth - plotWidth) / 2;
      plotTop = top + (innerHeight - plotHeight) / 2;
    }

    const map = ([t, z]) => [plotLeft + t * plotWidth, plotTop + ((z1 - z) / zSpan) * plotHeight];
    let body = '';

    for (const contour of sectionContours(model, section.a, section.b)) {
      const layer = layerById(model, contour.layerId);
      if (!layer) continue;
      body += `<path d="${svgPathFromMulti(
        contour.polys,
        map,
      )}" fill="${layer.color}" fill-rule="evenodd"/>`;
    }

    for (const slice of sectionSlices(model, section.a, section.b)) {
      if (slice.role !== 'conformal-sidewall') continue;
      const layer = layerById(model, slice.layerId);
      if (!layer) continue;
      const x0 = plotLeft + slice.t0 * plotWidth,
        x1 = plotLeft + slice.t1 * plotWidth,
        center = (x0 + x1) / 2,
        minWidth = sectionScaleMode === 'auto' ? 3 : 0,
        sx0 = Math.min(x0, center - minWidth / 2),
        sx1 = Math.max(x1, center + minWidth / 2),
        sy0 = map([0, slice.z1])[1],
        sy1 = map([0, slice.z0])[1];
      body += `<rect x="${svgNumber(sx0)}" y="${svgNumber(sy0)}" width="${svgNumber(
        Math.max(minWidth, sx1 - sx0),
      )}" height="${svgNumber(sy1 - sy0)}" fill="${layer.color}"/>`;
    }

    body += `<rect x="${svgNumber(plotLeft)}" y="${svgNumber(plotTop)}" width="${svgNumber(
      plotWidth,
    )}" height="${svgNumber(plotHeight)}" fill="none" stroke="#8995a1" stroke-width=".8"/>`;
    body += `<text x="3" y="${svgNumber(
      plotTop + 7,
    )}" font-family="system-ui,sans-serif" font-size="8" fill="#707b86">${formatXY(
      z1,
    )}</text><text x="3" y="${svgNumber(
      plotTop + plotHeight,
    )}" font-family="system-ui,sans-serif" font-size="8" fill="#707b86">${formatXY(
      z0,
    )}</text><text x="${svgNumber(plotLeft)}" y="${svgNumber(
      Math.min(height - 5, plotTop + plotHeight + 15),
    )}" font-family="system-ui,sans-serif" font-size="8" fill="#707b86">A</text><text x="${svgNumber(
      plotLeft + plotWidth - 7,
    )}" y="${svgNumber(
      Math.min(height - 5, plotTop + plotHeight + 15),
    )}" font-family="system-ui,sans-serif" font-size="8" fill="#707b86">B</text>`;

    downloadText(svgDocument(width, height, body), 'wafercad-section-ab.svg');
    status('Exported Section A–B as SVG.');
  }

  return { downloadBlob, exportMainSvg, exportMaskSvg, exportSectionSvg };
}
