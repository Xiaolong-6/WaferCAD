import {
  isArrayModel,
  arrayParts,
  geometryBounds as arrayBounds,
  boundsOverlap,
} from './model-array.js';
import { IMPLANT_DEPTH_GRADIENT } from './annotation-rendering.js';
import { continuousSectionAnnotationPolygons } from './continuous-etch-annotations.js';
import { createContinuousPlanSampler } from './continuous-etch-plan.js';
import {
  continuousEtchDisplayCollapse,
  validateContinuousEtchModel,
} from './continuous-etch-model.js';
import { visibleSurfaceGroups } from './process-topology.js';
import { layerById, modelBoundsZ } from './model.js';
import { layerInspectionTone, sectionInspectionFill } from './layer-inspection-presentation.js';
import { drawPlanGrid } from './plan-grid.js';
import { ringMayIntersectCanvas } from './plan-ring-visibility.js';
import { createMaskViewportCuller } from './mask-viewport-culling.js';
import { maskVisibleOutlineEdges } from './mask-outline-edges.js';
import { clipCanvasSegment } from './canvas-segment-clip.js';
import { validateExperimentalPhysicalFacetModel } from './experimental/physical-facets/physical-facet-model.js';
import {
  electricalRegionSectionBands,
  electricalRegionSurfaceGroups,
  implantSectionBands,
  implantSurfaceGroups,
  sectionColumns,
  sectionContours,
  sectionSlices,
  surfaceGroups,
} from './model-view-geometry.js';
import { sectorAngleHandlePoints, sectorBoundaryPoints, roiHandlePoints } from './roi-editor.js';
import {
  roughLod,
  roughProfileOffsetAtPixelFootprint,
  roughVisualBoundsZ,
} from './surface-rendering.js';
import { unionGeometries } from './vector-geometry.js';
import {
  createSectionZTransform,
  niceSectionTicks,
  resolveSectionCollapse,
  sectionVisibleZSpan,
} from './section-z-collapse.js';
import {
  normalizeSectionViewport,
  sectionViewportMap,
  sectionViewportUnmap,
} from './section-view-viewport.js';

export function createPlanRenderers({
  root = document,
  getState,
  getDrawMaskController,
  getMaskRoiController,
  getSectionEditor,
  getSectionCollapseController = () => null,
  setupCanvas,
  viewport,
  worldToCanvas,
  selectedElement,
  maskPoint,
  layerKey,
  layerColor,
  drawPlanAxes,
  syncSectionInputs,
  formatXY,
  xyText,
  xyUnitLabel,
  canvasTheme = false,
}) {
  const $ = (id) => root.getElementById(id);
  const intersectsMaskViewport = createMaskViewportCuller(maskPoint);
  let maskPaintBounds = null;
  let maskElementIndex = null;
  function maskElementVisible(element, view) {
    if (!maskPaintBounds) return true;
    const margin = Math.max(
      4,
      Math.abs(Number(element.width) || 0) * Math.abs(maskPaintBounds.scale) * view.s + 4,
    );
    return intersectsMaskViewport(
      element,
      view,
      maskPaintBounds.width,
      maskPaintBounds.height,
      maskPaintBounds.transformKey,
      margin,
    );
  }
  function maskElementsByLayer(layout) {
    const elements = layout?.elements || [];
    if (maskElementIndex?.elements === elements && maskElementIndex.count === elements.length)
      return maskElementIndex.groups;
    const groups = new Map();
    for (const element of elements) {
      const key = `${element.layer}|${element.datatype}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(element);
    }
    maskElementIndex = { elements, count: elements.length, groups };
    return groups;
  }
  const canvasColors = (canvas) => {
    // Shared renderer is also called by the legacy adapter. Only v2 opts in.
    const style = canvasTheme ? getComputedStyle(canvas) : null;
    const color = (name, oldValue, newValue) =>
      canvasTheme ? style.getPropertyValue(`--wc-canvas-${name}`).trim() || newValue : oldValue;
    return {
      minor: color('grid-minor', '#edf1f5', '#edf1f5'),
      major: color('grid-major', '#dbe2ea', '#dbe2ea'),
      axis: color('grid-axis', '#9fb0c1', '#9fb0c1'),
      solid: color('outline-solid', '#96a1ad', '#7f93a8'),
      dashed: color('outline-dashed', '#aab3bd', '#9fb0c1'),
      section: color('section-highlight', '#cc5062', '#e8590c'),
      roiStroke: color('section-highlight', '#d65361', '#e8590c'),
      roiFill: color('roi-fill', 'rgba(214,83,97,.05)', 'rgba(232,89,12,.05)'),
    };
  };

  function canvasPathMulti(ctx, geom, v, back = false) {
    ctx.beginPath();
    // Multi-hole GDS contours can exceed 39k rings. Offscreen holes need no
    // Canvas2D path commands at this zoom; retain exact coordinates for all
    // visible rings and leave scientific ownership/export paths untouched.
    const dense = geom?.length >= 512 || geom?.some((poly) => poly.length >= 128);
    const rect = dense ? ctx.canvas?.getBoundingClientRect?.() : null;
    const model = getState().model;
    const cull =
      rect?.width > 0 &&
      rect?.height > 0 &&
      Math.max(Number(model?.width) || 0, Number(model?.height) || 0) * v.s >
        Math.max(rect.width, rect.height) * 1.25;
    for (const poly of geom || []) {
      for (const ring of poly) {
        if (cull && !ringMayIntersectCanvas(ring, v, rect.width, rect.height, back)) continue;
        ring.forEach((p, i) => {
          const q = worldToCanvas(p, v, back);
          i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
        });
      }
    }
  }
  function drawBaseOutline(ctx, v, { fill = true, back = false, colors } = {}) {
    const { model } = getState();
    ctx.save();
    canvasPathMulti(ctx, model.boundary, v, back);
    if (fill) {
      ctx.fillStyle = '#f1f4f6';
      ctx.fill('evenodd');
    } else {
      ctx.setLineDash([5, 4]);
    }
    ctx.strokeStyle = fill ? colors.solid : colors.dashed;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  const maskOutlineCache = new WeakMap();
  const maskOutline = (element) => {
    if (element.points.length < 6) return null;
    if (!maskOutlineCache.has(element)) {
      maskOutlineCache.set(element, maskVisibleOutlineEdges(element.points));
    }
    return maskOutlineCache.get(element);
  };
  function strokeMaskOutline(ctx, e, v, fallback) {
    const edges = maskOutline(e);
    if (!edges) {
      fallback();
      return;
    }
    ctx.beginPath();
    for (const [a, b] of edges) {
      const start = worldToCanvas(maskPoint(a), v),
        end = worldToCanvas(maskPoint(b), v);
      ctx.moveTo(...start);
      ctx.lineTo(...end);
    }
    ctx.stroke();
  }
  function tracePresentedMask(ctx, e, v, style) {
    if (!maskElementVisible(e, v)) return;
    const projected = e.points.map(maskPoint).map((point) => worldToCanvas(point, v));
    if (!projected.length) return;
    const bounds = {
      x0: Math.min(...projected.map((point) => point[0])),
      x1: Math.max(...projected.map((point) => point[0])),
      y0: Math.min(...projected.map((point) => point[1])),
      y1: Math.max(...projected.map((point) => point[1])),
    };
    ctx.save();
    ctx.beginPath();
    projected.forEach(([x, y], index) => {
      if (index) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    const { color, mode, opacity } = style;
    if (mode === 'fill' || mode === 'hatch') {
      ctx.fillStyle = color;
      ctx.globalAlpha *= opacity;
      ctx.fill(maskOutline(e) ? 'evenodd' : 'nonzero');
      ctx.globalAlpha /= opacity;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = mode === 'outline' ? 1.5 : 1;
    strokeMaskOutline(ctx, e, v, () => ctx.stroke());
    if (mode === 'hatch' || mode === 'cross') {
      ctx.beginPath();
      projected.forEach(([x, y], index) => {
        if (index) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.clip(maskOutline(e) ? 'evenodd' : 'nonzero');
      ctx.beginPath();
      const { x0, x1, y0, y1 } = bounds;
      if (mode === 'cross') {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.moveTo(x1, y0);
        ctx.lineTo(x0, y1);
      } else {
        const height = y1 - y0;
        for (let x = x0 - height; x < x1 + height; x += 5) {
          ctx.moveTo(x, y0);
          ctx.lineTo(x + height, y1);
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = mode === 'cross' ? 0.8 : 0.65;
      ctx.stroke();
    }
    ctx.restore();
  }
  function traceElement(ctx, e, v, selected) {
    if (!maskElementVisible(e, v)) return;
    const { hoveredLayerKey, maskTransform } = getState();
    const key = layerKey(e.layer, e.datatype),
      hovered = hoveredLayerKey === key;
    ctx.beginPath();
    if (e.kind === 'polygon') {
      e.points.map(maskPoint).forEach((p, i) => {
        const q = worldToCanvas(p, v);
        i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
      });
      ctx.closePath();
      ctx.fillStyle = selected
        ? layerColor(key, hovered ? 0.8 : 0.58)
        : hovered
          ? layerColor(key, 0.28)
          : 'rgba(155,166,178,.10)';
      ctx.fill(maskOutline(e) ? 'evenodd' : 'nonzero');
      ctx.strokeStyle = selected || hovered ? layerColor(key, 0.98) : 'rgba(148,159,171,.52)';
      ctx.lineWidth = hovered ? 1.7 : selected ? 1 : 0.6;
      strokeMaskOutline(ctx, e, v, () => ctx.stroke());
    } else {
      e.points.map(maskPoint).forEach((p, i) => {
        const q = worldToCanvas(p, v);
        i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
      });
      ctx.strokeStyle = selected ? layerColor(key, 0.95) : '#aab3bd';
      ctx.lineWidth = Math.max(0.8, e.width * maskTransform.scale * v.s);
      ctx.stroke();
    }
  }
  function drawRoi(ctx, v, back = false, colors) {
    const { roi, roiDraft, sectionEditEnabled, roiTool } = getState();
    if (!roi && !roiDraft) return;
    const r = roiDraft || roi;
    ctx.save();
    ctx.strokeStyle = colors.roiStroke;
    ctx.fillStyle = colors.roiFill;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (r.type === 'rect') {
      const a = worldToCanvas(r.a, v, back),
        b = worldToCanvas(r.b, v, back);
      ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    } else if (r.type === 'circle') {
      const c = worldToCanvas(r.c, v, back);
      ctx.arc(c[0], c[1], r.r * v.s, 0, Math.PI * 2);
    } else if (r.type === 'sector') {
      sectorBoundaryPoints(r, 96)
        .map((point) => worldToCanvas(point, v, back))
        .forEach((point, index) => {
          if (index === 0) ctx.moveTo(point[0], point[1]);
          else ctx.lineTo(point[0], point[1]);
        });
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();

    if (!roiDraft && roi && !sectionEditEnabled && !roiTool) {
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      for (const point of Object.values(roiHandlePoints(roi))) {
        const q = worldToCanvas(point, v, back);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = colors.roiStroke;
        ctx.fillRect(q[0] - 5, q[1] - 5, 10, 10);
        ctx.strokeRect(q[0] - 5, q[1] - 5, 10, 10);
      }
      if (roi.type === 'sector') {
        for (const point of Object.values(sectorAngleHandlePoints(roi))) {
          const q = worldToCanvas(point, v, back);
          ctx.beginPath();
          ctx.arc(q[0], q[1], 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#f5c04a';
          ctx.strokeStyle = '#8f6500';
          ctx.lineWidth = 1;
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  let maskStructureCache = {
    model: null,
    revision: null,
    processRevision: null,
    face: null,
    patches: [],
  };

  const arrayImageCaches = new WeakMap();
  function arrayLeafDrawing(ctx, leaf, v, back, mask) {
    const bounds = arrayBounds(leaf.boundary);
    const stroke = (geom) => {
      ctx.beginPath();
      for (const polygon of geom)
        for (const ring of polygon)
          for (let i = 1; i < ring.length; i++) {
            const a = ring[i - 1],
              b = ring[i];
            if (
              (a[0] === b[0] && (a[0] === bounds.minX || a[0] === bounds.maxX)) ||
              (a[1] === b[1] && (a[1] === bounds.minY || a[1] === bounds.maxY))
            )
              continue;
            const p = worldToCanvas(a, v, back),
              q = worldToCanvas(b, v, back);
            ctx.moveTo(...p);
            ctx.lineTo(...q);
          }
      ctx.stroke();
    };
    const { activeFace } = getState();
    for (const patch of surfaceGroups(leaf, activeFace)) {
      if (!mask) {
        const layer = layerById(leaf, patch.layerId);
        if (!layer) continue;
        canvasPathMulti(ctx, patch.geom, v, back);
        ctx.fillStyle = shadeColor(layer.color, Math.max(-12, Math.min(14, patch.z * 0.8)));
        ctx.fill('evenodd');
      }
      ctx.strokeStyle = mask ? 'rgba(86,100,114,.58)' : 'rgba(36,46,56,.24)';
      ctx.lineWidth = mask ? 0.8 : 0.65;
      ctx.setLineDash(mask ? [4, 3] : []);
      stroke(patch.geom);
    }
    for (const patch of surfaceGroups(leaf, activeFace))
      if (patch.appearance?.kind === 'rough') {
        canvasPathMulti(ctx, patch.geom, v, back);
        ctx.fillStyle = 'rgba(17,24,32,.09)';
        ctx.fill('evenodd');
      }
    if (mask) return;
    for (const [items, alpha] of [
      [implantSurfaceGroups(leaf), 0.14],
      [electricalRegionSurfaceGroups(leaf), 0.1],
    ])
      for (const item of items) {
        if (item.face !== activeFace) continue;
        canvasPathMulti(ctx, item.polys, v, back);
        ctx.fillStyle = rgbaColor(item.color, alpha);
        ctx.fill('evenodd');
        if (alpha === 0.1) {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = rgbaColor(item.color, 0.78);
          ctx.lineWidth = 0.85;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
  }
  function drawArrayPlan(ctx, v, back, mask = false) {
    const { model, activeFace } = getState(),
      scale = Math.abs(v.s);
    const signature = [model.revision, model.processRevision, scale, back, mask, activeFace].join(
      '|',
    );
    let arrayImageCache = arrayImageCaches.get(ctx.canvas);
    if (arrayImageCache?.model !== model || arrayImageCache.signature !== signature) {
      arrayImageCache = { model, signature, images: new Map() };
      arrayImageCaches.set(ctx.canvas, arrayImageCache);
    }
    let drawn = 0,
      vectors = 0;
    const view = {
      minX: -v.cx / scale,
      maxX: ((ctx.canvas.getBoundingClientRect().width || ctx.canvas.width) - v.cx) / scale,
      minY: (v.cy - (ctx.canvas.getBoundingClientRect().height || ctx.canvas.height)) / scale,
      maxY: v.cy / scale,
    };
    if (back) {
      const low = -view.maxX;
      view.maxX = -view.minX;
      view.minX = low;
    }
    if (!mask) {
      const backgrounds = new Map();
      for (const part of arrayParts(model))
        if (part.role === 'background' && boundsOverlap(part.bounds, view)) {
          for (const patch of surfaceGroups(part.model, activeFace)) {
            const layer = layerById(part.model, patch.layerId);
            if (!layer) continue;
            const color = shadeColor(layer.color, Math.max(-12, Math.min(14, patch.z * 0.8)));
            if (!backgrounds.has(color)) backgrounds.set(color, []);
            backgrounds.get(color).push({ part, geom: patch.geom });
          }
        }
      for (const [color, items] of backgrounds) {
        ctx.beginPath();
        for (const { part, geom } of items)
          for (const polygon of geom)
            for (const ring of polygon) {
              ring.forEach(([x, y], i) => {
                const p = worldToCanvas([x + part.x, y + part.y], v, back);
                if (i === 0) ctx.moveTo(...p);
                else ctx.lineTo(...p);
              });
              ctx.closePath();
            }
        ctx.fillStyle = color;
        ctx.fill('evenodd');
      }
    }
    for (const part of arrayParts(model)) {
      if (!boundsOverlap(part.bounds, view)) continue;
      drawn++;
      const box = arrayBounds(part.model.boundary),
        width = box.width * scale,
        height = box.height * scale;
      if (Math.max(width, height) > 2048) {
        vectors++;
        ctx.save();
        arrayLeafDrawing(
          ctx,
          part.model,
          { ...v, cx: v.cx + (back ? -part.x : part.x) * scale, cy: v.cy - part.y * scale },
          back,
          mask,
        );
        ctx.restore();
        continue;
      }
      let image = arrayImageCache.images.get(part.model);
      if (!image) {
        image = root.createElement
          ? root.createElement('canvas')
          : document.createElement('canvas');
        image.width = Math.max(1, Math.ceil(width)) + 4;
        image.height = Math.max(1, Math.ceil(height)) + 4;
        const leafView = {
          ...v,
          cx: 2 + (back ? box.maxX : -box.minX) * scale,
          cy: 2 + box.maxY * scale,
        };
        arrayLeafDrawing(image.getContext('2d'), part.model, leafView, back, mask);
        arrayImageCache.images.set(part.model, image);
      }
      const left = v.cx + (back ? -part.bounds.maxX : part.bounds.minX) * scale - 2,
        top = v.cy - part.bounds.maxY * scale - 2;
      ctx.drawImage(image, left, top);
    }
    ctx.canvas.dataset.arrayDrawnInstances = String(drawn);
    ctx.canvas.dataset.arrayTemplateImages = String(arrayImageCache.images.size);
    ctx.canvas.dataset.arrayVectorInstances = String(vectors);
  }

  function maskStructurePatches() {
    const { model, activeFace } = getState();
    if (
      maskStructureCache.model === model &&
      maskStructureCache.revision === model.revision &&
      maskStructureCache.processRevision === model.processRevision &&
      maskStructureCache.face === activeFace
    ) {
      return maskStructureCache.patches;
    }

    // Collapse same-height surface groups across materials. The Mask reference
    // is topography-only: material/color boundaries at the same Z are omitted.
    const byHeight = new Map();
    for (const patch of surfaceGroups(model, activeFace)) {
      const key = String(patch.z);
      const geoms = byHeight.get(key) || [];
      geoms.push(patch.geom);
      byHeight.set(key, geoms);
    }
    const patches = [...byHeight.entries()].map(([z, geoms]) => ({
      z: Number(z),
      geom: unionGeometries(geoms),
    }));

    maskStructureCache = {
      model,
      revision: model.revision,
      processRevision: model.processRevision,
      face: activeFace,
      patches,
    };
    return patches;
  }

  function strokeClosedGeometry(ctx, geom, v, back = false) {
    const rect = ctx.canvas?.getBoundingClientRect?.();
    const clip = rect?.width > 0 && rect?.height > 0;
    ctx.beginPath();
    for (const polygon of geom || []) {
      for (const ring of polygon || []) {
        if (!ring?.length) continue;
        if (!clip) {
          ring.forEach((point, index) => {
            const q = worldToCanvas(point, v, back);
            if (index === 0) ctx.moveTo(q[0], q[1]);
            else ctx.lineTo(q[0], q[1]);
          });
          ctx.closePath();
          continue;
        }
        let lastEnd = null;
        for (let index = 0; index < ring.length; index++) {
          const start = worldToCanvas(ring[index], v, back);
          const end = worldToCanvas(ring[(index + 1) % ring.length], v, back);
          const segment = clipCanvasSegment(start, end, rect.width, rect.height);
          if (!segment) {
            lastEnd = null;
            continue;
          }
          if (!lastEnd || lastEnd[0] !== segment[0][0] || lastEnd[1] !== segment[0][1]) {
            ctx.moveTo(segment[0][0], segment[0][1]);
          }
          ctx.lineTo(segment[1][0], segment[1][1]);
          lastEnd = segment[1];
        }
      }
    }
    ctx.stroke();
  }

  function drawMaskStructureReference(ctx, v) {
    const { model, activeFace } = getState();
    // The source 2.5D regions are not the post-release material. Until Main
    // planar projection accepts exact continuous ownership, never draw them as
    // a false structural Mask reference. The real Mask layout stays editable.
    if (model?.kernel === 'vector-continuous-etch-v1') return;
    if (isArrayModel(model)) {
      drawArrayPlan(ctx, v, activeFace === 'back', true);
      return;
    }
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(86, 100, 114, .58)';
    ctx.lineWidth = 0.8;

    const back = activeFace === 'back';
    for (const patch of maskStructurePatches()) {
      strokeClosedGeometry(ctx, patch.geom, v, back);
    }

    ctx.setLineDash([7, 4]);
    ctx.strokeStyle = 'rgba(139, 150, 161, .56)';
    ctx.lineWidth = 0.85;
    strokeClosedGeometry(ctx, model.boundary, v, back);
    ctx.restore();
  }

  function fillRoughPlanOverlay(ctx, v, back, alpha = 0.08) {
    const { model, activeFace } = getState();
    if (model?.kernel === 'vector-continuous-etch-v1') return;
    if (isArrayModel(model)) return;
    ctx.save();
    ctx.fillStyle = `rgba(17,24,32,${Math.max(0, Math.min(0.2, alpha))})`;
    // Plan views describe the currently exposed process face. Buried rough
    // interfaces are useful to Section/3D inspection, but must never leak into
    // the opposite Main/Mask face as a ghost topography overlay.
    for (const patch of surfaceGroups(model, activeFace)) {
      if (patch.appearance?.kind !== 'rough') continue;
      canvasPathMulti(ctx, patch.geom, v, back);
      ctx.fill('evenodd');
    }
    ctx.restore();
  }

  function renderMask() {
    const { model, activeFace, maskSourceMode, layout, maskOpacity, readOnlyPreview } = getState();
    const c = $('maskCanvas'),
      { ctx, w, h } = setupCanvas(c),
      v = viewport(w, h, 'mask'),
      colors = canvasColors(c);
    const maskTransform = getState().maskTransform || {};
    maskPaintBounds = {
      width: w,
      height: h,
      scale: Number(maskTransform.scale) || 1,
      transformKey: [
        maskTransform.x,
        maskTransform.y,
        maskTransform.scale,
        maskTransform.rotation,
      ].join(':'),
    };
    ctx.clearRect(0, 0, w, h);
    if (validateExperimentalPhysicalFacetModel(model)) {
      // The fixed read-only lab offers physical 3D and Section only. Refuse
      // to draw the flat compatibility region as a misleading Mask reference.
      ctx.fillStyle = '#576b7a';
      ctx.font = '12px system-ui';
      ctx.fillText('Physical Mask reference unavailable in this experimental model', 24, 36);
      c.dataset.physicalFacetUnsupported = 'true';
      return;
    }
    if (canvasTheme) drawPlanGrid(ctx, v, w, h, worldToCanvas, colors);

    const presentation = maskSourceMode === 'file' ? layout.maskPresentation : null;
    if (presentation) {
      ctx.fillStyle = presentation.background;
      ctx.fillRect(0, 0, w, h);
    }
    if (!presentation || presentation.showStructure) {
      drawMaskStructureReference(ctx, v);
      fillRoughPlanOverlay(ctx, v, activeFace === 'back', 0.07);
    }

    if (maskSourceMode === 'draw') {
      getDrawMaskController()?.render(ctx, v, maskOpacity);
    } else {
      ctx.save();
      ctx.globalAlpha = presentation ? 1 : maskOpacity;
      if (presentation) {
        // Keep the physical File Mask unchanged. Presentation is an opt-in,
        // display-only overlay with per-layer ordering and visual semantics.
        const grouped = maskElementsByLayer(layout);
        for (const style of presentation.layers) {
          for (const element of grouped.get(`${style.layer}|${style.datatype}`) || []) {
            if (selectedElement(element)) tracePresentedMask(ctx, element, v, style);
          }
        }
        if (presentation.showUnselected) {
          for (const element of layout.elements || []) {
            if (!selectedElement(element)) traceElement(ctx, element, v, false);
          }
        }
      } else {
        for (const e of layout.linework || []) traceElement(ctx, e, v, false);
        for (const e of layout.elements || []) traceElement(ctx, e, v, selectedElement(e));
      }
      ctx.restore();
    }

    if (!readOnlyPreview) getMaskRoiController()?.render(ctx, v);
    drawPlanAxes(ctx, v, w, h, false);
  }
  function shadeColor(hex, delta) {
    const n = parseInt(hex.slice(1), 16),
      r = Math.max(0, Math.min(255, (n >> 16) + delta)),
      g = Math.max(0, Math.min(255, ((n >> 8) & 255) + delta)),
      b = Math.max(0, Math.min(255, (n & 255) + delta));
    return `rgb(${r},${g},${b})`;
  }
  function rgbaColor(hex, alpha) {
    const value = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#D65A6F',
      n = parseInt(value.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  let continuousMainCache = null;
  function drawContinuousPlan(ctx, w, h, v, model, face) {
    const back = face === 'back';
    const appearance = model.layers
      .map((layer) => `${layer.id}:${layer.visible !== false}:${layer.color}`)
      .join('|');
    const key = [w, h, v.cx, v.cy, v.s, face, appearance].join('|');
    if (continuousMainCache?.model !== model || continuousMainCache.key !== key) {
      const sample = createContinuousPlanSampler(model, face);
      // Physical XY/Z columns remain exact; only the display raster is sampled.
      // Cap the interactive Main projection to avoid rerunning geometry at device-pixel resolution.
      const step = Math.max(2, Math.ceil(Math.sqrt((w * h) / 16000)));
      const nx = Math.max(1, Math.ceil(w / step));
      const ny = Math.max(1, Math.ceil(h / step));
      const raster = document.createElement('canvas');
      raster.width = nx;
      raster.height = ny;
      const rasterCtx = raster.getContext('2d');
      const image = rasterCtx.createImageData(nx, ny);
      const palette = new Map(
        model.layers.map((layer) => {
          const hex = /^#[0-9a-f]{6}$/i.test(layer.color) ? layer.color : '#a4adb7';
          return [layer.id, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))];
        }),
      );
      for (let iy = 0; iy < ny; iy++) {
        const y = ((iy + 0.5) * h) / ny;
        for (let ix = 0; ix < nx; ix++) {
          const x = ((ix + 0.5) * w) / nx;
          const xy = [((back ? -1 : 1) * (x - v.cx)) / v.s, (v.cy - y) / v.s];
          const exposed = sample(xy);
          if (!exposed) continue;
          const rgb = palette.get(exposed.layerId);
          if (!rgb) continue;
          const shade = Math.max(-12, Math.min(14, exposed.z * 0.8));
          const pos = (iy * nx + ix) * 4;
          for (let channel = 0; channel < 3; channel++)
            image.data[pos + channel] = Math.max(0, Math.min(255, rgb[channel] + shade));
          image.data[pos + 3] = 255;
        }
      }
      rasterCtx.putImageData(image, 0, 0);
      // Untouched exposed materials retain their exact source XY polygons.
      // Draw them as true vector edges above the sampled release height field;
      // sampled cells are used only for surfaces whose visibility may change.
      const owner = validateContinuousEtchModel(model);
      const targets = new Set(owner.fronts.map((front) => front.layerId));
      const exactPatches = visibleSurfaceGroups(owner.sourceModel, { face }).filter(
        (patch) =>
          !targets.has(patch.layerId) &&
          model.layers.some((layer) => layer.id === patch.layerId && layer.visible !== false),
      );
      continuousMainCache = { model, key, raster, exactPatches };
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(continuousMainCache.raster, 0, 0, w, h);
    for (const patch of continuousMainCache.exactPatches) {
      const layer = layerById(model, patch.layerId);
      if (!layer) continue;
      canvasPathMulti(ctx, patch.geom, v, back);
      const shade = Math.max(-12, Math.min(14, patch.z * 0.8));
      ctx.fillStyle = shadeColor(layer.color, shade);
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(36,46,56,.24)';
      ctx.lineWidth = 0.65;
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderMain() {
    const { model, activeFace, section, readOnlyPreview } = getState();
    if (validateExperimentalPhysicalFacetModel(model)) {
      // Never display the flat Base compatibility stack as physical Main.
      // The read-only laboratory route enables only 3D and Section.
      const canvas = $('mainCanvas');
      const { ctx, w, h } = setupCanvas(canvas);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#576b7a';
      ctx.font = '12px system-ui';
      ctx.fillText('Physical Main view unavailable in this experimental model', 24, 36);
      canvas.dataset.physicalFacetUnsupported = 'true';
      return;
    }
    const c = $('mainCanvas'),
      { ctx, w, h } = setupCanvas(c),
      v = viewport(w, h, 'main'),
      back = activeFace === 'back',
      colors = canvasColors(c);
    c.dataset.xPxPerUm = String(v.s);
    $('mainCoords').style.bottom = `${$('mainPanel').clientHeight - c.offsetTop - h + 26}px`;
    ctx.clearRect(0, 0, w, h);
    if (canvasTheme) drawPlanGrid(ctx, v, w, h, worldToCanvas, colors);
    drawBaseOutline(ctx, v, { fill: false, back, colors });
    if (model?.kernel === 'vector-continuous-etch-v1') {
      delete c.dataset.continuousPlanUnsupported;
      drawContinuousPlan(ctx, w, h, v, model, activeFace);
    } else if (isArrayModel(model)) drawArrayPlan(ctx, v, back);
    else {
      const patches = surfaceGroups(model, activeFace);
      for (const patch of patches) {
        const layer = layerById(model, patch.layerId);
        if (!layer) continue;
        canvasPathMulti(ctx, patch.geom, v, back);
        const shade = Math.max(-12, Math.min(14, patch.z * 0.8));
        ctx.fillStyle = shadeColor(layer.color, shade);
        ctx.fill('evenodd');
        ctx.strokeStyle = 'rgba(36,46,56,.24)';
        ctx.lineWidth = 0.65;
        ctx.stroke();
      }
      fillRoughPlanOverlay(ctx, v, back, 0.09);
      for (const implant of implantSurfaceGroups(model)) {
        if (implant.face !== activeFace) continue;
        ctx.save();
        canvasPathMulti(ctx, implant.polys, v, back);
        ctx.fillStyle = rgbaColor(implant.color, 0.14);
        ctx.fill('evenodd');
        ctx.restore();
      }
      for (const electrical of electricalRegionSurfaceGroups(model)) {
        if (electrical.face !== activeFace) continue;
        ctx.save();
        canvasPathMulti(ctx, electrical.polys, v, back);
        ctx.fillStyle = rgbaColor(electrical.color, 0.1);
        ctx.fill('evenodd');
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = rgbaColor(electrical.color, 0.78);
        ctx.lineWidth = 0.85;
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.setLineDash([5, 4]);
    canvasPathMulti(ctx, model.boundary, v, back);
    ctx.strokeStyle = colors.dashed;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    if (!readOnlyPreview) {
      drawRoi(ctx, v, back, colors);
      const a = worldToCanvas(section.a, v, back),
        b = worldToCanvas(section.b, v, back);
      ctx.strokeStyle = colors.section;
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      ctx.stroke();
      syncSectionInputs();
      getSectionEditor()?.update();
    }
    drawPlanAxes(ctx, v, w, h, back);
  }
  function renderSection(targetCanvas = null, detailRoi = null) {
    const {
      model,
      section,
      sectionScaleMode,
      sectionShowBorders,
      sectionCollapse,
      sectionViewport,
      inspectionLayerId,
    } = getState();
    const physicalOwner = validateExperimentalPhysicalFacetModel(model);
    const mainCanvas = $('sectionCanvas'),
      c = targetCanvas || mainCanvas,
      { ctx, w, h } = setupCanvas(c),
      mainRect = mainCanvas.getBoundingClientRect(),
      viewW = detailRoi ? Math.max(2, mainRect.width) : w,
      viewH = detailRoi ? Math.max(2, mainRect.height) : h;
    ctx.clearRect(0, 0, w, h);

    const [idealLo, idealHi] = modelBoundsZ(model),
      [lo, hi] = roughVisualBoundsZ(model, [idealLo, idealHi]),
      collapse = resolveSectionCollapse(
        continuousEtchDisplayCollapse(model, sectionCollapse),
        model,
        [lo, hi],
      ),
      collapseEnabled = collapse.enabled !== false,
      edgeSpan = collapseEnabled
        ? Math.max(hi - collapse.top, collapse.bottom - lo, (hi - lo) * 0.005)
        : hi - lo,
      pad = Math.max(1e-9, Math.min((hi - lo) * 0.08, edgeSpan * 0.12)),
      z0 = lo - pad,
      z1 = hi + pad,
      sectionSpan = Math.max(
        Math.hypot(section.b[0] - section.a[0], section.b[1] - section.a[1]),
        1e-12,
      ),
      left = 27,
      right = 10,
      top = 10,
      bottom = 22,
      breakPixels = collapseEnabled ? 8 : 0,
      iw = Math.max(1, viewW - left - right),
      ih = Math.max(breakPixels + 1, viewH - top - bottom),
      autoXScale = iw / sectionSpan;

    let plotLeft = left,
      plotTop = top,
      plotWidth = iw,
      plotHeight = ih;

    if (sectionScaleMode === 'physical') {
      const visibleZSpan = Math.max(sectionVisibleZSpan(z0, z1, collapse), 1e-12),
        scale = Math.min(autoXScale, Math.max(1e-12, (ih - breakPixels) / visibleZSpan));
      plotWidth = sectionSpan * scale;
      plotHeight = visibleZSpan * scale + breakPixels;
      plotLeft = left + (iw - plotWidth) / 2;
      plotTop = top + (ih - plotHeight) / 2;
    }

    const xScale = plotWidth / sectionSpan,
      zTransform = createSectionZTransform({
        zMin: z0,
        zMax: z1,
        collapse,
        plotTop,
        plotHeight,
        breakPixels,
        mode: sectionScaleMode,
        xScale,
      }),
      screenViewport = normalizeSectionViewport(sectionViewport),
      viewportX = (x) => sectionViewportMap(x, viewW, screenViewport.panX, screenViewport.zoom),
      viewportY = (y) => sectionViewportMap(y, viewH, screenViewport.panY, screenViewport.zoom),
      zScale = Math.max(1e-12, zTransform.topScale),
      zExaggeration = zScale / Math.max(xScale, 1e-12),
      bottomZExaggeration = Math.max(1e-12, zTransform.bottomScale) / Math.max(xScale, 1e-12),
      detailX = detailRoi ? detailRoi.x * viewW : 0,
      detailY = detailRoi ? detailRoi.y * viewH : 0,
      detailScaleX = detailRoi ? w / Math.max(1, detailRoi.width * viewW) : 1,
      detailScaleY = detailRoi ? h / Math.max(1, detailRoi.height * viewH) : 1,
      screenX = (value) => (value - detailX) * detailScaleX,
      screenY = (value) => (value - detailY) * detailScaleY,
      baseMapT = (t) => viewportX(plotLeft + t * plotWidth),
      baseMapZ = (z) => viewportY(zTransform.mapZ(z)),
      mapT = (t) => screenX(baseMapT(t)),
      mapZ = (z) => screenY(baseMapZ(z)),
      effectiveXScale = xScale * screenViewport.zoom * detailScaleX;

    if (!detailRoi) {
      c.dataset.physicalFacetOwner = physicalOwner?.kind || '';
      c.dataset.scaleMode = sectionScaleMode;
      c.dataset.xPxPerUm = String(xScale * screenViewport.zoom);
      c.dataset.zPxPerUm = String(zScale * screenViewport.zoom);
      c.dataset.sectionFrontPxPerUm = String(zTransform.topScale * screenViewport.zoom);
      c.dataset.sectionBackPxPerUm = String(zTransform.bottomScale * screenViewport.zoom);
      c.dataset.sectionScaleLinked = String(collapse.scaleLinked !== false);
      c.dataset.zMinUm = String(lo);
      c.dataset.zMaxUm = String(hi);
      c.dataset.sectionPlotLeft = String(viewportX(plotLeft));
      c.dataset.sectionCollapseBreakY = String(viewportY(zTransform.breakCenter));
      c.dataset.sectionCollapseUpperY = String(viewportY(zTransform.upperBottom));
      c.dataset.sectionCollapseLowerY = String(viewportY(zTransform.lowerTop));
      c.dataset.sectionFrameTop = String(viewportY(zTransform.frameTop));
      c.dataset.sectionFrameBottom = String(viewportY(zTransform.frameBottom));
      c.dataset.sectionZ0Um = String(z0);
      c.dataset.sectionZ1Um = String(z1);
      c.dataset.sectionBottomPxPerUm = String(zTransform.bottomScale * screenViewport.zoom);
      c.dataset.sectionViewportZoom = String(screenViewport.zoom);
      c.dataset.sectionViewportPanX = String(screenViewport.panX);
      c.dataset.sectionViewportPanY = String(screenViewport.panY);
      c.dataset.sectionCollapseEnabled = String(collapseEnabled);
      c.dataset.sectionCollapseTopUm = String(collapse.top);
      c.dataset.sectionCollapseBottomUm = String(collapse.bottom);
    }

    ctx.fillStyle = '#fbfcfd';
    ctx.fillRect(0, 0, w, h);
    const materialContours = sectionContours(model, section.a, section.b);
    for (const contour of materialContours) {
      const layer = layerById(model, contour.layerId);
      const experimentalOxide =
        physicalOwner && contour.layerId === model.experimentalPhysicalFacetShell?.layerId;
      if (!layer && !experimentalOxide) continue;
      ctx.beginPath();
      for (const poly of contour.polys)
        for (const ring of poly) {
          ring.forEach(([t, z], i) => {
            const point = [mapT(t), mapZ(z)];
            if (i === 0) ctx.moveTo(...point);
            else ctx.lineTo(...point);
          });
          ctx.closePath();
        }
      const tone = layerInspectionTone(contour.layerId, inspectionLayerId);
      ctx.fillStyle = sectionInspectionFill(
        experimentalOxide ? '#d88b37' : layer.color,
        contour.layerId,
        inspectionLayerId,
      );
      ctx.fill('evenodd');
      // Keep the physical contour draw order: buried layers remain buried.
      // Focus never overrides model visibility, stacking or shared rough boundaries.
      if (sectionShowBorders || tone === 'focused') {
        ctx.setLineDash([]);
        ctx.strokeStyle =
          tone === 'deemphasized'
            ? 'rgba(126,135,145,.28)'
            : tone === 'focused'
              ? '#293847'
              : experimentalOxide
                ? 'rgba(216,139,55,.93)'
                : 'rgba(17,24,32,.72)';
        ctx.lineWidth = tone === 'focused' ? 1.35 : 0.8;
        ctx.stroke();
      }
    }

    const continuous = model?.kernel === 'vector-continuous-etch-v1',
      hasContinuousAnnotations =
        continuous &&
        [...(model.electricalRegions || []), ...(model.implants || [])].some(
          (item) => item.visible !== false,
        ),
      continuousAnnotations = hasContinuousAnnotations
        ? continuousSectionAnnotationPolygons(model, section.a, section.b, materialContours)
        : { electrical: [], implants: [] },
      roughColumns = physicalOwner || continuous ? [] : sectionColumns(model, section.a, section.b),
      sidewallProfiles = new Map(),
      sectionDx = section.b[0] - section.a[0],
      sectionDy = section.b[1] - section.a[1],
      sectionUnitX = sectionDx / sectionSpan,
      sectionUnitY = sectionDy / sectionSpan,
      filteredSectionRoughRelief = (appearance, worldX, worldY) =>
        roughProfileOffsetAtPixelFootprint(worldX, worldY, appearance, {
          pixelsPerUm: effectiveXScale,
          unitX: sectionUnitX,
          unitY: sectionUnitY,
        });

    // Use one screen-space lattice for material and annotation profiles. Detail
    // sampling stays within the visible interval instead of spending its budget
    // on the offscreen wafer and misregistering a thin coating.
    const profileStep = Math.max(1.5, w / 1100),
      profileTimes = (t0, t1) => {
        const x0 = Math.max(-profileStep, mapT(t0)),
          x1 = Math.min(w + profileStep, mapT(t1));
        if (x1 <= x0) return [];
        const toT = (x) =>
            (sectionViewportUnmap(
              x / detailScaleX + detailX,
              viewW,
              screenViewport.panX,
              screenViewport.zoom,
            ) -
              plotLeft) /
            plotWidth,
          times = [toT(x0)];
        for (let x = (Math.floor(x0 / profileStep) + 1) * profileStep; x < x1; x += profileStep) {
          times.push(toT(x));
        }
        times.push(toT(x1));
        return times;
      };

    for (const column of roughColumns) {
      if (
        !column.stack.some(
          (segment) =>
            segment.frontSurface?.kind === 'rough' || segment.backSurface?.kind === 'rough',
        )
      ) {
        continue;
      }

      const boundaries = [];
      for (let index = 0; index <= column.stack.length; index++) {
        const below = index > 0 ? column.stack[index - 1] : null,
          above = index < column.stack.length ? column.stack[index] : null;
        let appearance = null,
          sourceFace = null;
        if (below?.frontSurface?.kind === 'rough') {
          appearance = below.frontSurface;
          sourceFace = 'front';
        } else if (above?.backSurface?.kind === 'rough') {
          appearance = above.backSurface;
          sourceFace = 'back';
        }
        const z =
          index === 0
            ? column.stack[0].z0
            : index === column.stack.length
              ? column.stack.at(-1).z1
              : below.z1;
        boundaries.push({ z, appearance, sourceFace });
      }

      const times = profileTimes(column.t0, column.t1),
        profileReliefCache = new Map(),
        profiles = boundaries.map(() => []);

      const filteredRelief = filteredSectionRoughRelief;

      if (times.length < 2) continue;
      for (const [sample, t] of times.entries()) {
        const worldX = section.a[0] + sectionDx * t,
          worldY = section.a[1] + sectionDy * t;

        boundaries.forEach((boundary, boundaryIndex) => {
          let profileZ = boundary.z;
          if (boundary.appearance) {
            const profileId =
                boundary.appearance.profileId ||
                `legacy-${boundary.appearance.seed}-${boundary.appearance.featureSize}`,
              cacheKey = `${profileId}:${sample}`;
            if (!profileReliefCache.has(cacheKey)) {
              profileReliefCache.set(cacheKey, filteredRelief(boundary.appearance, worldX, worldY));
            }
            const relief = profileReliefCache.get(cacheKey),
              direction = boundary.sourceFace === 'back' ? -1 : 1;
            profileZ += direction * relief;
          }
          profiles[boundaryIndex].push([mapT(t), mapZ(profileZ)]);
        });
      }

      for (let segmentIndex = 0; segmentIndex < column.stack.length; segmentIndex++) {
        const segment = column.stack[segmentIndex],
          layer = layerById(model, segment.layerId),
          bottomProfile = profiles[segmentIndex],
          topProfile = profiles[segmentIndex + 1];
        if (!layer) continue;
        if (segment.role === 'conformal-sidewall') {
          sidewallProfiles.set(`${column.t0}:${column.t1}:${segment.layerId}`, {
            bottom: bottomProfile,
            top: topProfile,
          });
        }

        ctx.beginPath();
        bottomProfile.forEach(([x, y], index) => {
          const drawX = index === 0 ? x - 0.65 : index === bottomProfile.length - 1 ? x + 0.65 : x;
          if (index === 0) ctx.moveTo(drawX, y);
          else ctx.lineTo(drawX, y);
        });
        for (let index = topProfile.length - 1; index >= 0; index--) {
          const [x, y] = topProfile[index],
            drawX = index === 0 ? x - 0.65 : index === topProfile.length - 1 ? x + 0.65 : x;
          ctx.lineTo(drawX, y);
        }
        ctx.closePath();
        ctx.fillStyle = sectionInspectionFill(layer.color, segment.layerId, inspectionLayerId);
        ctx.fill();
      }

      boundaries.forEach((boundary, boundaryIndex) => {
        if (boundary.appearance?.kind !== 'rough') return;
        const profile = profiles[boundaryIndex],
          lod = roughLod(boundary.appearance.featureSize * effectiveXScale);
        ctx.beginPath();
        profile.forEach(([x, y], index) => {
          const drawX = index === 0 ? x - 0.65 : index === profile.length - 1 ? x + 0.65 : x;
          if (index === 0) ctx.moveTo(drawX, y);
          else ctx.lineTo(drawX, y);
        });
        if (sectionShowBorders) {
          ctx.setLineDash([]);
          ctx.strokeStyle = '#111820';
          ctx.globalAlpha = 0.58 + lod.detail * 0.2;
          ctx.lineWidth = 1.05 + (1 - lod.detail) * 0.75;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.lineCap = 'butt';
          ctx.lineJoin = 'miter';
        }
      });
    }

    // Paint annotation footprints derived from the continuous material owner,
    // never from the predecessor's pre-release planar material silhouette.
    const traceAnnotationPolygons = (polys) => {
      ctx.beginPath();
      for (const poly of polys)
        for (const ring of poly) {
          ring.forEach(([t, z], index) => {
            if (index === 0) ctx.moveTo(mapT(t), mapZ(z));
            else ctx.lineTo(mapT(t), mapZ(z));
          });
          ctx.closePath();
        }
    };

    for (const electrical of physicalOwner
      ? []
      : continuous
        ? continuousAnnotations.electrical
        : electricalRegionSectionBands(model, section.a, section.b)) {
      if (continuous) {
        ctx.save();
        traceAnnotationPolygons(electrical.polys);
        ctx.fillStyle = rgbaColor(electrical.color, 0.52);
        ctx.fill('evenodd');
        if (sectionShowBorders) {
          ctx.setLineDash([2, 3]);
          ctx.strokeStyle = rgbaColor(electrical.color, 0.95);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      const appearance = electrical.surfaceAppearance,
        faceDirection = electrical.face === 'back' ? -1 : 1,
        times =
          appearance?.kind === 'rough'
            ? profileTimes(electrical.t0, electrical.t1)
            : [electrical.t0, electrical.t1],
        outerPoints = [],
        innerPoints = [];

      for (const t of times) {
        const worldX = section.a[0] + sectionDx * t,
          worldY = section.a[1] + sectionDy * t,
          relief =
            appearance?.kind === 'rough'
              ? filteredSectionRoughRelief(appearance, worldX, worldY)
              : 0,
          outerZ = electrical.outerZ + faceDirection * relief,
          innerZ =
            electrical.innerZ + (electrical.depthProfile === 'follow' ? faceDirection * relief : 0);
        if (!(Math.abs(outerZ - innerZ) > 1e-12)) continue;
        outerPoints.push([mapT(t), mapZ(outerZ)]);
        innerPoints.push([mapT(t), mapZ(innerZ)]);
      }
      if (outerPoints.length < 2) continue;

      ctx.save();
      ctx.beginPath();
      outerPoints.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      for (let index = innerPoints.length - 1; index >= 0; index--) {
        ctx.lineTo(...innerPoints[index]);
      }
      ctx.closePath();
      // An electrical region is a scientific annotation, not a faint shadow.
      // Preserve its true 0.5 um height while keeping it legible without Section Borders.
      ctx.fillStyle = rgbaColor(electrical.color, 0.52);
      ctx.fill();
      if (sectionShowBorders) {
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = rgbaColor(electrical.color, 0.95);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    const implantBorderPolygons = new Map();
    for (const implant of physicalOwner
      ? []
      : continuous
        ? continuousAnnotations.implants
        : implantSectionBands(model, section.a, section.b)) {
      if (continuous) {
        const faceDirection = implant.face === 'back' ? -1 : 1;
        const gradient = ctx.createLinearGradient(
          0,
          mapZ(implant.sourceZ),
          0,
          mapZ(implant.sourceZ - faceDirection * implant.thickness),
        );
        gradient.addColorStop(
          IMPLANT_DEPTH_GRADIENT.outerDepth,
          rgbaColor(implant.color, IMPLANT_DEPTH_GRADIENT.outerAlpha),
        );
        gradient.addColorStop(
          IMPLANT_DEPTH_GRADIENT.midDepth,
          rgbaColor(implant.color, IMPLANT_DEPTH_GRADIENT.midAlpha),
        );
        gradient.addColorStop(
          IMPLANT_DEPTH_GRADIENT.innerDepth,
          rgbaColor(implant.color, IMPLANT_DEPTH_GRADIENT.innerAlpha),
        );
        ctx.save();
        traceAnnotationPolygons(implant.polys);
        ctx.fillStyle = gradient;
        ctx.fill('evenodd');
        ctx.restore();
        if (sectionShowBorders) {
          const key = implant.implantId;
          if (!implantBorderPolygons.has(key)) implantBorderPolygons.set(key, []);
          implantBorderPolygons
            .get(key)
            .push(
              implant.polys.map((poly) =>
                poly.map((ring) => ring.map(([t, z]) => [mapT(t), mapZ(z)])),
              ),
            );
        }
        continue;
      }
      const appearance = implant.surfaceAppearance,
        faceDirection = implant.face === 'back' ? -1 : 1,
        times =
          appearance?.kind === 'rough'
            ? profileTimes(implant.t0, implant.t1)
            : [implant.t0, implant.t1],
        tiltTangent = Math.tan(((Number(implant.tilt) || 0) * Math.PI) / 180),
        outerPoints = [],
        innerPoints = [],
        reliefSamples = [];
      let outerZSum = 0,
        innerZSum = 0,
        activeSamples = 0;

      for (const t of times) {
        const worldX = section.a[0] + sectionDx * t,
          worldY = section.a[1] + sectionDy * t,
          relief =
            appearance?.kind === 'rough'
              ? filteredSectionRoughRelief(appearance, worldX, worldY)
              : 0,
          outerZ = implant.outerZ + faceDirection * relief,
          innerZ =
            implant.innerZ + (implant.depthProfile === 'follow' ? faceDirection * relief : 0),
          outerDepth = Math.max(
            0,
            implant.face === 'front' ? implant.sourceZ - outerZ : outerZ - implant.sourceZ,
          ),
          innerDepth = Math.max(
            0,
            implant.face === 'front' ? implant.sourceZ - innerZ : innerZ - implant.sourceZ,
          ),
          outerDeltaT = (tiltTangent * outerDepth * sectionUnitX) / sectionSpan,
          innerDeltaT = (tiltTangent * innerDepth * sectionUnitX) / sectionSpan;

        if (!(Math.abs(outerZ - innerZ) > 1e-12)) continue;
        outerPoints.push([mapT(t + outerDeltaT), mapZ(outerZ)]);
        innerPoints.push([mapT(t + innerDeltaT), mapZ(innerZ)]);
        reliefSamples.push(relief);
        outerZSum += outerZ;
        innerZSum += innerZ;
        activeSamples++;
      }
      if (outerPoints.length < 2 || !activeSamples) continue;

      const outerRelief = outerZSum / activeSamples - implant.outerZ,
        innerRelief = innerZSum / activeSamples - implant.innerZ;
      const gradient = ctx.createLinearGradient(
        0,
        mapZ(implant.sourceZ + outerRelief),
        0,
        mapZ(implant.sourceZ - faceDirection * implant.thickness + innerRelief),
      );
      gradient.addColorStop(
        IMPLANT_DEPTH_GRADIENT.outerDepth,
        rgbaColor(implant.color, IMPLANT_DEPTH_GRADIENT.outerAlpha),
      );
      gradient.addColorStop(
        IMPLANT_DEPTH_GRADIENT.midDepth,
        rgbaColor(implant.color, IMPLANT_DEPTH_GRADIENT.midAlpha),
      );
      gradient.addColorStop(
        IMPLANT_DEPTH_GRADIENT.innerDepth,
        rgbaColor(implant.color, IMPLANT_DEPTH_GRADIENT.innerAlpha),
      );

      ctx.save();
      ctx.beginPath();
      outerPoints.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      for (let index = innerPoints.length - 1; index >= 0; index--) {
        ctx.lineTo(...innerPoints[index]);
      }
      ctx.closePath();
      if (appearance?.kind === 'rough') {
        // Follow the local source surface, not its band-wide average height.
        // Clip once and fill pixel columns so adjacent translucent strips do
        // not acquire antialiasing seams or double opacity.
        ctx.clip();
        for (let index = 1; index < outerPoints.length; index++) {
          const sourceLeft = outerPoints[index - 1][0],
            sourceRight = outerPoints[index][0],
            left = index === 1 ? Math.min(sourceLeft, innerPoints[0][0]) : sourceLeft,
            right =
              index === outerPoints.length - 1
                ? Math.max(sourceRight, innerPoints.at(-1)[0])
                : sourceRight;
          if (right <= left) continue;
          const firstPixel = index === 1 ? Math.floor(left) : Math.ceil(left - 0.5),
            lastPixel =
              index === outerPoints.length - 1 ? Math.ceil(right) : Math.ceil(right - 0.5);
          for (let x = Math.max(0, firstPixel); x < Math.min(w, lastPixel); x++) {
            const fraction = Math.max(
                0,
                Math.min(1, (x + 0.5 - sourceLeft) / Math.max(sourceRight - sourceLeft, 1e-12)),
              ),
              relief = reliefSamples[index - 1] * (1 - fraction) + reliefSamples[index] * fraction,
              localGradient = ctx.createLinearGradient(
                0,
                mapZ(implant.sourceZ + faceDirection * relief),
                0,
                mapZ(
                  implant.sourceZ -
                    faceDirection * implant.thickness +
                    (implant.depthProfile === 'follow' ? faceDirection * relief : 0),
                ),
              );
            localGradient.addColorStop(
              IMPLANT_DEPTH_GRADIENT.outerDepth,
              rgbaColor(implant.color, IMPLANT_DEPTH_GRADIENT.outerAlpha),
            );
            localGradient.addColorStop(
              IMPLANT_DEPTH_GRADIENT.midDepth,
              rgbaColor(implant.color, IMPLANT_DEPTH_GRADIENT.midAlpha),
            );
            localGradient.addColorStop(
              IMPLANT_DEPTH_GRADIENT.innerDepth,
              rgbaColor(implant.color, IMPLANT_DEPTH_GRADIENT.innerAlpha),
            );
            ctx.fillStyle = localGradient;
            ctx.fillRect(x, 0, 1, h);
          }
        }
      } else {
        ctx.fillStyle = gradient;
        ctx.fill();
      }
      if (sectionShowBorders) {
        const key = implant.implantId;
        if (!implantBorderPolygons.has(key)) implantBorderPolygons.set(key, []);
        const ring = [...outerPoints, ...innerPoints.toReversed(), outerPoints[0]];
        implantBorderPolygons.get(key).push([[ring]]);
      }
      ctx.restore();
    }

    // Union the outline across host-layer/depth fragments. Their internal edges
    // are bookkeeping boundaries, not boundaries of the surviving Implant.
    for (const polygons of implantBorderPolygons.values()) {
      ctx.save();
      ctx.beginPath();
      for (const poly of unionGeometries(polygons)) {
        for (const ring of poly) {
          ring.forEach(([x, y], index) => {
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
        }
      }
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#111820';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Auto mode keeps sub-pixel physical sidewalls legible. Draw this last so the
    // visibility aid cannot be erased by rough-surface compositing.
    for (const slice of physicalOwner || continuous
      ? []
      : sectionSlices(model, section.a, section.b)) {
      if (slice.role !== 'conformal-sidewall') continue;
      const layer = layerById(model, slice.layerId);
      if (!layer) continue;
      const x0 = mapT(slice.t0),
        x1 = mapT(slice.t1),
        center = (x0 + x1) / 2,
        minWidth = sectionScaleMode === 'auto' ? 3 : 0,
        sx0 = Math.min(x0, center - minWidth / 2),
        sx1 = Math.max(x1, center + minWidth / 2),
        sy0 = mapZ(slice.z1),
        sy1 = mapZ(slice.z0);
      ctx.fillStyle = layer.color;
      const sideWidth = Math.max(minWidth, sx1 - sx0);
      const profile = sidewallProfiles.get(`${slice.t0}:${slice.t1}:${slice.layerId}`);
      if (profile) {
        ctx.beginPath();
        const widen = (x) => sx0 + ((x - x0) / Math.max(x1 - x0, 1e-12)) * sideWidth;
        profile.bottom.forEach(([x, y], index) => {
          if (index === 0) ctx.moveTo(widen(x), y);
          else ctx.lineTo(widen(x), y);
        });
        for (const [x, y] of profile.top.toReversed()) ctx.lineTo(widen(x), y);
        ctx.closePath();
        ctx.fill();
      } else ctx.fillRect(sx0, sy0, sideWidth, sy1 - sy0);
      if (sectionShowBorders) {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(17,24,32,.72)';
        ctx.lineWidth = 0.8;
        if (profile) ctx.stroke();
        else ctx.strokeRect(sx0, sy0, sideWidth, sy1 - sy0);
      }
    }

    // Hide all geometry inside the collapsed Z interval. With collapse disabled,
    // Section is one continuous physical-Z view and nothing is masked.
    if (collapseEnabled) {
      ctx.fillStyle = '#fbfcfd';
      const collapseLeft = screenX(viewportX(plotLeft)),
        collapseRight = screenX(viewportX(plotLeft + plotWidth)),
        collapseTop = screenY(viewportY(zTransform.upperBottom - 0.5)),
        collapseBottom = screenY(viewportY(zTransform.lowerTop + 0.5));
      ctx.fillRect(
        Math.min(collapseLeft, collapseRight),
        Math.min(collapseTop, collapseBottom),
        Math.abs(collapseRight - collapseLeft),
        Math.abs(collapseBottom - collapseTop),
      );
    }

    if (detailRoi) {
      ctx.strokeStyle = 'rgba(137,149,161,.5)';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(0.35, 0.35, Math.max(0, w - 0.7), Math.max(0, h - 0.7));
      return;
    }

    // The axes and all material contours use the SAME projected viewport.
    // Labels remain screen-size independent rather than scaling the canvas CSS.
    const frameLeft = viewportX(plotLeft),
      frameRight = viewportX(plotLeft + plotWidth),
      frameTop = viewportY(zTransform.frameTop),
      frameBottom = viewportY(zTransform.frameBottom),
      upperBottom = viewportY(zTransform.upperBottom),
      lowerTop = viewportY(zTransform.lowerTop);
    ctx.strokeStyle = '#8995a1';
    ctx.lineWidth = 0.8;
    if (collapseEnabled) {
      ctx.beginPath();
      ctx.moveTo(frameLeft, frameTop);
      ctx.lineTo(frameRight, frameTop);
      ctx.lineTo(frameRight, upperBottom);
      ctx.moveTo(frameRight, lowerTop);
      ctx.lineTo(frameRight, frameBottom);
      ctx.lineTo(frameLeft, frameBottom);
      ctx.lineTo(frameLeft, lowerTop);
      ctx.moveTo(frameLeft, upperBottom);
      ctx.lineTo(frameLeft, frameTop);
      ctx.stroke();

      // Physical break indicators travel with the plotted Z interfaces.
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = '#788593';
      ctx.lineWidth = 0.8;
      for (const [x, direction] of [
        [frameLeft, 1],
        [frameRight, -1],
      ]) {
        ctx.beginPath();
        ctx.moveTo(x, upperBottom - 1);
        ctx.lineTo(x + direction * 6, upperBottom + 3);
        ctx.lineTo(x + direction * 12, upperBottom - 1);
        ctx.moveTo(x, lowerTop + 1);
        ctx.lineTo(x + direction * 6, lowerTop - 3);
        ctx.lineTo(x + direction * 12, lowerTop + 1);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      ctx.strokeRect(frameLeft, frameTop, frameRight - frameLeft, frameBottom - frameTop);
    }

    ctx.fillStyle = '#707b86';
    ctx.font = '8px system-ui';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const tickValues = collapseEnabled
        ? [...niceSectionTicks(collapse.top, z1, 4), ...niceSectionTicks(z0, collapse.bottom, 2)]
        : niceSectionTicks(z0, z1, 6),
      usedTickY = [];
    for (const value of tickValues) {
      const y = mapZ(value);
      if (usedTickY.some((other) => Math.abs(other - y) < 10)) continue;
      usedTickY.push(y);
      ctx.strokeStyle = '#aab3bd';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(frameLeft - 4, y);
      ctx.lineTo(frameLeft, y);
      ctx.stroke();
      ctx.fillStyle = '#707b86';
      ctx.fillText(formatXY(value), frameLeft - 6, y);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('A', frameLeft, Math.min(h - 5, frameBottom + 15));
    ctx.textAlign = 'right';
    ctx.fillText('B', frameRight, Math.min(h - 5, frameBottom + 15));
    ctx.textAlign = 'left';

    const scaleButton = $('sectionScaleModeBtn');
    scaleButton.value = sectionScaleMode === 'auto' ? 'auto' : 'physical';
    scaleButton.title =
      sectionScaleMode === 'auto'
        ? 'Auto fit: preserves relative front/back display weighting'
        : 'Physical 1:1 X:Z: equal physical scale within the retained Z regions';

    const borderButton = $('sectionBordersBtn');
    borderButton.classList.toggle('active', sectionShowBorders);
    borderButton.setAttribute('aria-pressed', String(sectionShowBorders));
    borderButton.title = sectionShowBorders
      ? 'Hide structural borders in Section A–B'
      : 'Show structural borders in Section A–B';

    const scaleLabel =
      sectionScaleMode === 'auto'
        ? Math.abs(zExaggeration - bottomZExaggeration) <=
          Math.max(1e-9, Math.abs(zExaggeration) * 1e-6)
          ? `Z ×${Number(zExaggeration.toPrecision(3))}`
          : `Z F×${Number(zExaggeration.toPrecision(3))} / B×${Number(
              bottomZExaggeration.toPrecision(3),
            )}`
        : '1:1';
    $('sectionMeta').textContent = `${xyText(sectionSpan)} span · ${scaleLabel}`;
    $('sectionRange').textContent = `Z (${xyUnitLabel()}) ${formatXY(lo)} → ${formatXY(hi)}`;
    getSectionCollapseController()?.sync();
  }

  function renderSectionDetail(canvas, roi) {
    if (!canvas || !roi) return;
    renderSection(canvas, roi);
  }

  return { renderMask, renderMain, renderSection, renderSectionDetail };
}
