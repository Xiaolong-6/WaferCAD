import { layerById, modelBoundsZ } from '../model.js';
import { sectionContours, sectionSlices, surfaceGroups } from '../model-view-geometry.js';
import { sectorBoundaryPoints } from '../roi-editor.js';
import { drawMaskGeometry } from '../draw-mask-geometry.js';
import { maskRoiWorldGeometry, multiBounds } from '../mask-roi-geometry.js';
import { bufferPolyline, intersection, isEmpty } from '../vector-geometry.js';
import {
  collectMaskExportElements,
  serializeGDS,
  serializeOASIS,
} from '../layout-export.js';

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

  function maskView(width, height, roiGeometry) {
    const bounds = multiBounds(roiGeometry);
    if (!bounds) return viewport(width, height, 'mask');
    const spanX = Math.max(1e-12, bounds.maxX - bounds.minX),
      spanY = Math.max(1e-12, bounds.maxY - bounds.minY),
      margin = 4,
      scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY),
      centerX = (bounds.minX + bounds.maxX) / 2,
      centerY = (bounds.minY + bounds.maxY) / 2;
    return {
      s: scale,
      cx: width / 2 - centerX * scale,
      cy: height / 2 + centerY * scale,
    };
  }

  function selectedOptions(id) {
    return new Set([...($(id)?.selectedOptions || [])].map((option) => option.value));
  }

  function syncMaskExportOptions() {
    const { layout, maskSourceMode, activeCell, selectedLayerKeys } = getState(),
      cellsSelect = $('maskExportCells'),
      layersSelect = $('maskExportLayers'),
      filterGroup = $('maskExportFilterGroup'),
      drawNote = $('maskExportDrawNote');
    if (!cellsSelect || !layersSelect) return;
    const draw = maskSourceMode === 'draw';
    filterGroup.hidden = draw;
    drawNote.hidden = !draw;
    if (draw) return;

    const oldCells = selectedOptions('maskExportCells'),
      oldLayers = selectedOptions('maskExportLayers'),
      cells = new Set(),
      layers = new Map();
    for (const element of [...(layout.elements || []), ...(layout.linework || [])]) {
      cells.add(element.sourceCell || layout.root || 'ROOT');
      layers.set(layerKey(element.layer, element.datatype), `${element.layer}/${element.datatype}`);
    }

    cellsSelect.replaceChildren();
    for (const name of [...cells].sort((a, b) => a.localeCompare(b))) {
      const option = root.createElement('option');
      option.value = name;
      option.textContent = name;
      option.selected = oldCells.size ? oldCells.has(name) : activeCell ? name === activeCell : true;
      cellsSelect.append(option);
    }
    if (![...cellsSelect.options].some((option) => option.selected)) {
      [...cellsSelect.options].forEach((option) => {
        option.selected = true;
      });
    }

    layersSelect.replaceChildren();
    for (const [key, label] of [...layers.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
      const option = root.createElement('option');
      option.value = key;
      option.textContent = label;
      option.selected = oldLayers.size
        ? oldLayers.has(key)
        : Array.isArray(selectedLayerKeys)
          ? selectedLayerKeys.includes(key)
          : selectedLayerKeys?.has?.(key) ?? true;
      layersSelect.append(option);
    }
    if (![...layersSelect.options].some((option) => option.selected)) {
      [...layersSelect.options].forEach((option) => {
        option.selected = true;
      });
    }
  }

  function maskExportContext() {
    const { layout, maskTransform, maskSourceMode, drawMask, maskRoi } = getState(),
      roiTransform =
        maskSourceMode === 'file'
          ? maskTransform
          : { x: 0, y: 0, scale: 1, rotation: 0 },
      roiGeometry = maskRoi ? maskRoiWorldGeometry(maskRoi, roiTransform, 128) : null,
      cells = selectedOptions('maskExportCells'),
      layers = selectedOptions('maskExportLayers');
    if (maskSourceMode === 'file' && (!cells.size || !layers.size)) {
      status('Select at least one Cell and one Layer before exporting Mask.', 'warning');
      return null;
    }
    return {
      layout,
      maskTransform,
      maskSourceMode,
      drawMask,
      maskRoi,
      roiGeometry,
      cells,
      layers,
    };
  }

  function exportMaskLayout(format) {
    const context = maskExportContext();
    if (!context) return;
    const exported = collectMaskExportElements({
      layout: context.layout,
      maskSourceMode: context.maskSourceMode,
      drawMask: context.drawMask,
      maskTransform: context.maskTransform,
      maskRoi: context.maskRoi,
      selectedCells: context.cells,
      selectedLayerKeys: context.layers,
    });
    if (!exported.elements.length) {
      status('Nothing from the selected Mask source overlaps the export region.', 'warning');
      return;
    }

    try {
      const oasis = format === 'oas',
        bytes = oasis ? serializeOASIS(exported.elements) : serializeGDS(exported.elements),
        extension = oasis ? 'oas' : 'gds',
        mime = oasis ? 'application/vnd.semi-oasis' : 'application/octet-stream';
      downloadBlob(new Blob([bytes], { type: mime }), `wafercad-mask.${extension}`);
      status(
        `Exported ${context.maskSourceMode === 'draw' ? 'Draw' : 'File'} Mask as ${
          oasis ? 'OASIS' : 'GDSII'
        }${context.maskRoi ? ' cropped to Mask ROI' : ''}.`,
        'success',
      );
    } catch (error) {
      console.error(error);
      status(`Mask ${oasis ? 'OASIS' : 'GDSII'} export failed: ${error.message}`, 'error');
    }
  }

  function exportMaskGds() {
    exportMaskLayout('gds');
  }

  function exportMaskOas() {
    exportMaskLayout('oas');
  }

  function exportMaskSvg() {
    const { layout, maskTransform, maskSourceMode, drawMask, maskRoi } = getState(),
      canvas = $('maskCanvas'),
      rect = canvas.getBoundingClientRect(),
      width = Math.max(2, rect.width),
      height = Math.max(2, rect.height),
      roiTransform =
        maskSourceMode === 'file'
          ? maskTransform
          : { x: 0, y: 0, scale: 1, rotation: 0 },
      roiGeom = maskRoi ? maskRoiWorldGeometry(maskRoi, roiTransform, 128) : null,
      view = maskView(width, height, roiGeom),
      map = (point) => worldToCanvas(point, view),
      cells = selectedOptions('maskExportCells'),
      layers = selectedOptions('maskExportLayers');
    let body = '';

    if (maskSourceMode === 'draw') {
      let geometry = drawMaskGeometry(drawMask);
      if (roiGeom) geometry = intersection(geometry, roiGeom);
      if (!isEmpty(geometry)) {
        body += `<path d="${svgPathFromMulti(
          geometry,
          map,
        )}" fill="rgba(72,105,135,.36)" stroke="#526b84" stroke-width="1.1" fill-rule="evenodd"/>`;
      }
    } else {
      if (!cells.size || !layers.size) {
        status('Select at least one Cell and one Layer before exporting Mask.', 'warning');
        return;
      }
      for (const element of layout.elements || []) {
        const key = layerKey(element.layer, element.datatype);
        if (
          !Array.isArray(element.points) ||
          !cells.has(element.sourceCell || layout.root || 'ROOT') ||
          !layers.has(key)
        ) continue;

        let geometry =
          element.kind === 'polygon'
            ? [[element.points.map(maskPoint)]]
            : element.kind === 'path' && Number(element.width) > 0
              ? bufferPolyline(
                  element.points.map(maskPoint),
                  (Number(element.width) * Math.abs(maskTransform.scale || 1)) / 2,
                  28,
                  false,
                )
              : [];
        if (roiGeom && !isEmpty(geometry)) geometry = intersection(geometry, roiGeom);
        if (isEmpty(geometry)) continue;
        body += `<path d="${svgPathFromMulti(geometry, map)}" fill="${layerColor(
          key,
          0.58,
        )}" stroke="${layerColor(key, 0.98)}" stroke-width="1" fill-rule="evenodd"/>`;
      }
      if (!roiGeom) {
        for (const element of layout.linework || []) {
          const key = layerKey(element.layer, element.datatype);
          if (
            !Array.isArray(element.points) ||
            element.points.length < 2 ||
            !cells.has(element.sourceCell || layout.root || 'ROOT') ||
            !layers.has(key)
          ) continue;
          const points = element.points.map(maskPoint).map(map),
            d = points
              .map((point, index) =>
                `${index ? 'L' : 'M'}${svgNumber(point[0])} ${svgNumber(point[1])}`,
              )
              .join('');
          body += `<path d="${d}" fill="none" stroke="${layerColor(
            key,
            0.95,
          )}" stroke-width="${svgNumber(
            Math.max(0.8, element.width * maskTransform.scale * view.s),
          )}"/>`;
        }
      }
    }

    if (!body) {
      status('Nothing from the selected Mask source overlaps the export region.', 'warning');
      return;
    }
    downloadText(svgDocument(width, height, body), 'wafercad-mask.svg');
    status(
      `Exported ${maskSourceMode === 'draw' ? 'Draw' : 'File'} Mask as SVG${
        maskRoi ? ' cropped to Mask ROI' : ''
      }.`,
      'success',
    );
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

  return {
    downloadBlob,
    exportMainSvg,
    exportMaskSvg,
    exportMaskGds,
    exportMaskOas,
    exportSectionSvg,
    syncMaskExportOptions,
  };
}
