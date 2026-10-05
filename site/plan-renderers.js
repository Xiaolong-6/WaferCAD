import { IMPLANT_DEPTH_GRADIENT } from './annotation-rendering.js';
import { layerById, modelBoundsZ } from './model.js';
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
import { roughLod, roughProfileOffsetAtPoint, roughVisualBoundsZ } from './surface-rendering.js';
import { unionGeometries } from './vector-geometry.js';
import {
  createSectionZTransform,
  niceSectionTicks,
  resolveSectionCollapse,
  sectionVisibleZSpan,
} from './section-z-collapse.js';

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
}) {
  const $ = (id) => root.getElementById(id);

  function canvasPathMulti(ctx, geom, v, back = false) {
    ctx.beginPath();
    for (const poly of geom || [])
      for (const ring of poly)
        ring.forEach((p, i) => {
          const q = worldToCanvas(p, v, back);
          i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
        });
  }
  function drawBaseOutline(ctx, v, { fill = true, back = false } = {}) {
    const { model } = getState();
    ctx.save();
    canvasPathMulti(ctx, model.boundary, v, back);
    if (fill) {
      ctx.fillStyle = '#f1f4f6';
      ctx.fill('evenodd');
    } else {
      ctx.setLineDash([5, 4]);
    }
    ctx.strokeStyle = fill ? '#96a1ad' : '#aab3bd';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  function traceElement(ctx, e, v, selected) {
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
      ctx.fill();
      ctx.strokeStyle = selected || hovered ? layerColor(key, 0.98) : 'rgba(148,159,171,.52)';
      ctx.lineWidth = hovered ? 1.7 : selected ? 1 : 0.6;
      ctx.stroke();
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
  function drawRoi(ctx, v, back = false) {
    const { roi, roiDraft, sectionEditEnabled, roiTool } = getState();
    if (!roi && !roiDraft) return;
    const r = roiDraft || roi;
    ctx.save();
    ctx.strokeStyle = '#d65361';
    ctx.fillStyle = 'rgba(214,83,97,.05)';
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
        ctx.strokeStyle = '#d65361';
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
    ctx.beginPath();
    for (const polygon of geom || []) {
      for (const ring of polygon || []) {
        ring.forEach((point, index) => {
          const q = worldToCanvas(point, v, back);
          if (index === 0) ctx.moveTo(q[0], q[1]);
          else ctx.lineTo(q[0], q[1]);
        });
        if (ring?.length) ctx.closePath();
      }
    }
    ctx.stroke();
  }

  function drawMaskStructureReference(ctx, v) {
    const { model, activeFace } = getState();
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
    const { activeFace, maskSourceMode, layout, maskOpacity, readOnlyPreview } = getState();
    const c = $('maskCanvas'),
      { ctx, w, h } = setupCanvas(c),
      v = viewport(w, h, 'mask');
    ctx.clearRect(0, 0, w, h);

    // Alignment reference: current process surface topology. Rough areas get a
    // subtle neutral darkening so they read as wafer topography without changing
    // the mask palette or material hue.
    drawMaskStructureReference(ctx, v);
    fillRoughPlanOverlay(ctx, v, activeFace === 'back', 0.07);

    if (maskSourceMode === 'draw') {
      getDrawMaskController()?.render(ctx, v, maskOpacity);
    } else {
      ctx.save();
      ctx.globalAlpha = maskOpacity;
      for (const e of layout.linework || []) traceElement(ctx, e, v, false);
      for (const e of layout.elements || []) traceElement(ctx, e, v, selectedElement(e));
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

  function renderMain() {
    const { model, activeFace, section, readOnlyPreview } = getState();
    const c = $('mainCanvas'),
      { ctx, w, h } = setupCanvas(c),
      v = viewport(w, h, 'main'),
      back = activeFace === 'back';
    c.dataset.xPxPerUm = String(v.s);
    $('mainCoords').style.bottom = `${$('mainPanel').clientHeight - c.offsetTop - h + 26}px`;
    ctx.clearRect(0, 0, w, h);
    drawBaseOutline(ctx, v, { fill: false, back });
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
    ctx.save();
    ctx.setLineDash([5, 4]);
    canvasPathMulti(ctx, model.boundary, v, back);
    ctx.strokeStyle = '#aab3bd';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    if (!readOnlyPreview) {
      drawRoi(ctx, v, back);
      const a = worldToCanvas(section.a, v, back),
        b = worldToCanvas(section.b, v, back);
      ctx.strokeStyle = '#cc5062';
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
    const { model, section, sectionScaleMode, sectionShowBorders, sectionCollapse } = getState();
    const mainCanvas = $('sectionCanvas'),
      c = targetCanvas || mainCanvas,
      { ctx, w, h } = setupCanvas(c),
      mainRect = mainCanvas.getBoundingClientRect(),
      viewW = detailRoi ? Math.max(2, mainRect.width) : w,
      viewH = detailRoi ? Math.max(2, mainRect.height) : h;
    ctx.clearRect(0, 0, w, h);

    const [idealLo, idealHi] = modelBoundsZ(model),
      [lo, hi] = roughVisualBoundsZ(model, [idealLo, idealHi]),
      collapse = resolveSectionCollapse(sectionCollapse, model, [lo, hi]),
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
        upperFraction: 0.8,
        mode: sectionScaleMode,
        xScale,
      }),
      zScale = Math.max(1e-12, zTransform.topScale),
      zExaggeration = zScale / Math.max(xScale, 1e-12),
      detailX = detailRoi ? detailRoi.x * viewW : 0,
      detailY = detailRoi ? detailRoi.y * viewH : 0,
      detailScaleX = detailRoi ? w / Math.max(1, detailRoi.width * viewW) : 1,
      detailScaleY = detailRoi ? h / Math.max(1, detailRoi.height * viewH) : 1,
      screenX = (value) => (value - detailX) * detailScaleX,
      screenY = (value) => (value - detailY) * detailScaleY,
      baseMapT = (t) => plotLeft + t * plotWidth,
      baseMapZ = zTransform.mapZ,
      mapT = (t) => screenX(baseMapT(t)),
      mapZ = (z) => screenY(baseMapZ(z)),
      effectiveXScale = xScale * detailScaleX;

    if (!detailRoi) {
      c.dataset.scaleMode = sectionScaleMode;
      c.dataset.xPxPerUm = String(xScale);
      c.dataset.zPxPerUm = String(zScale);
      c.dataset.zMinUm = String(lo);
      c.dataset.zMaxUm = String(hi);
      c.dataset.sectionPlotLeft = String(plotLeft);
      c.dataset.sectionCollapseBreakY = String(zTransform.breakCenter);
      c.dataset.sectionCollapseUpperY = String(zTransform.upperBottom);
      c.dataset.sectionCollapseLowerY = String(zTransform.lowerTop);
      c.dataset.sectionFrameTop = String(zTransform.frameTop);
      c.dataset.sectionFrameBottom = String(zTransform.frameBottom);
      c.dataset.sectionZ0Um = String(z0);
      c.dataset.sectionZ1Um = String(z1);
      c.dataset.sectionBottomPxPerUm = String(zTransform.bottomScale);
      c.dataset.sectionCollapseEnabled = String(collapseEnabled);
      c.dataset.sectionCollapseTopUm = String(collapse.top);
      c.dataset.sectionCollapseBottomUm = String(collapse.bottom);
    }

    ctx.fillStyle = '#fbfcfd';
    ctx.fillRect(0, 0, w, h);
    for (const contour of sectionContours(model, section.a, section.b)) {
      const layer = layerById(model, contour.layerId);
      if (!layer) continue;
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
      ctx.fillStyle = layer.color;
      ctx.fill('evenodd');
      if (sectionShowBorders) {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(17,24,32,.72)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    const roughColumns = sectionColumns(model, section.a, section.b),
      sectionDx = section.b[0] - section.a[0],
      sectionDy = section.b[1] - section.a[1],
      sectionUnitX = sectionDx / sectionSpan,
      sectionUnitY = sectionDy / sectionSpan,
      filteredSectionRoughRelief = (appearance, worldX, worldY) => {
        const featurePixels = appearance.featureSize * effectiveXScale;
        if (featurePixels >= 2) return roughProfileOffsetAtPoint(worldX, worldY, appearance);

        // Pixel-footprint filtering is a display anti-aliasing step. Keep every
        // renderer that traces the same physical profile on this shared sampler
        // so material, conformal coating and Implant remain visually registered.
        const halfPixelPhysical = 0.5 / Math.max(effectiveXScale, 1e-12);
        let sum = 0;
        for (const offset of [-1, -0.5, 0, 0.5, 1]) {
          sum += roughProfileOffsetAtPoint(
            worldX + sectionUnitX * halfPixelPhysical * offset,
            worldY + sectionUnitY * halfPixelPhysical * offset,
            appearance,
          );
        }
        return sum / 5;
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

      const roughBoundaries = boundaries.filter((boundary) => boundary.appearance),
        widthPixels = Math.max(1, Math.abs(mapT(column.t1) - mapT(column.t0))),
        samples = Math.max(3, Math.min(1100, Math.ceil(widthPixels / 1.5))),
        profileReliefCache = new Map(),
        profiles = boundaries.map(() => []);

      const filteredRelief = filteredSectionRoughRelief;

      for (let sample = 0; sample <= samples; sample++) {
        const fraction = sample / samples,
          t = column.t0 + (column.t1 - column.t0) * fraction,
          worldX = section.a[0] + sectionDx * t,
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

      const x0 = mapT(column.t0),
        x1 = mapT(column.t1);

      for (let segmentIndex = 0; segmentIndex < column.stack.length; segmentIndex++) {
        const segment = column.stack[segmentIndex],
          layer = layerById(model, segment.layerId),
          bottomProfile = profiles[segmentIndex],
          topProfile = profiles[segmentIndex + 1];
        if (!layer) continue;

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
        ctx.fillStyle = layer.color;
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

    for (const electrical of electricalRegionSectionBands(model, section.a, section.b)) {
      const appearance = electrical.surfaceAppearance,
        faceDirection = electrical.face === 'back' ? -1 : 1,
        widthPixels = Math.max(1, Math.abs(mapT(electrical.t1) - mapT(electrical.t0))),
        samples =
          appearance?.kind === 'rough'
            ? Math.max(3, Math.min(1100, Math.ceil(widthPixels / 1.5)))
            : 1,
        outerPoints = [],
        innerPoints = [];

      for (let sample = 0; sample <= samples; sample++) {
        const fraction = sample / samples,
          t = electrical.t0 + (electrical.t1 - electrical.t0) * fraction,
          worldX = section.a[0] + sectionDx * t,
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
      ctx.fillStyle = rgbaColor(electrical.color, 0.22);
      ctx.fill();
      if (sectionShowBorders) {
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = rgbaColor(electrical.color, 0.95);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const implant of implantSectionBands(model, section.a, section.b)) {
      const appearance = implant.surfaceAppearance,
        faceDirection = implant.face === 'back' ? -1 : 1,
        widthPixels = Math.max(1, Math.abs(mapT(implant.t1) - mapT(implant.t0))),
        samples =
          appearance?.kind === 'rough'
            ? Math.max(3, Math.min(1100, Math.ceil(widthPixels / 1.5)))
            : 1,
        tiltTangent = Math.tan(((Number(implant.tilt) || 0) * Math.PI) / 180),
        outerPoints = [],
        innerPoints = [];
      let outerZSum = 0,
        innerZSum = 0,
        activeSamples = 0;

      for (let sample = 0; sample <= samples; sample++) {
        const fraction = sample / samples,
          t = implant.t0 + (implant.t1 - implant.t0) * fraction,
          worldX = section.a[0] + sectionDx * t,
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
        outerZSum += outerZ;
        innerZSum += innerZ;
        activeSamples++;
      }
      if (outerPoints.length < 2 || !activeSamples) continue;

      const gradient = ctx.createLinearGradient(
        0,
        mapZ(outerZSum / activeSamples),
        0,
        mapZ(innerZSum / activeSamples),
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
      ctx.fillStyle = gradient;
      ctx.fill();
      if (sectionShowBorders) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = '#111820';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Auto mode keeps sub-pixel physical sidewalls legible. Draw this last so the
    // visibility aid cannot be erased by rough-surface compositing.
    for (const slice of sectionSlices(model, section.a, section.b)) {
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
      ctx.fillRect(sx0, sy0, sideWidth, sy1 - sy0);
      if (sectionShowBorders) {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(17,24,32,.72)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(sx0, sy0, sideWidth, sy1 - sy0);
      }
    }

    // Hide all geometry inside the collapsed Z interval. With collapse disabled,
    // Section is one continuous physical-Z view and nothing is masked.
    if (collapseEnabled) {
      ctx.fillStyle = '#fbfcfd';
      const collapseLeft = screenX(plotLeft),
        collapseRight = screenX(plotLeft + plotWidth),
        collapseTop = screenY(zTransform.upperBottom - 0.5),
        collapseBottom = screenY(zTransform.lowerTop + 0.5);
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

    ctx.strokeStyle = '#8995a1';
    ctx.lineWidth = 0.8;
    if (collapseEnabled) {
      ctx.beginPath();
      ctx.moveTo(plotLeft, zTransform.frameTop);
      ctx.lineTo(plotLeft + plotWidth, zTransform.frameTop);
      ctx.lineTo(plotLeft + plotWidth, zTransform.upperBottom);
      ctx.moveTo(plotLeft + plotWidth, zTransform.lowerTop);
      ctx.lineTo(plotLeft + plotWidth, zTransform.frameBottom);
      ctx.lineTo(plotLeft, zTransform.frameBottom);
      ctx.lineTo(plotLeft, zTransform.lowerTop);
      ctx.moveTo(plotLeft, zTransform.upperBottom);
      ctx.lineTo(plotLeft, zTransform.frameTop);
      ctx.stroke();

      // Restrained break notches at the plot edges; the interactive entry point
      // is the small DOM control over the left Z axis.
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = '#788593';
      ctx.lineWidth = 0.8;
      for (const [x, direction] of [
        [plotLeft, 1],
        [plotLeft + plotWidth, -1],
      ]) {
        ctx.beginPath();
        ctx.moveTo(x, zTransform.upperBottom - 1);
        ctx.lineTo(x + direction * 6, zTransform.upperBottom + 3);
        ctx.lineTo(x + direction * 12, zTransform.upperBottom - 1);
        ctx.moveTo(x, zTransform.lowerTop + 1);
        ctx.lineTo(x + direction * 6, zTransform.lowerTop - 3);
        ctx.lineTo(x + direction * 12, zTransform.lowerTop + 1);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      ctx.strokeRect(plotLeft, zTransform.frameTop, plotWidth, zTransform.frameHeight);
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
      ctx.moveTo(plotLeft - 4, y);
      ctx.lineTo(plotLeft, y);
      ctx.stroke();
      ctx.fillStyle = '#707b86';
      ctx.fillText(formatXY(value), plotLeft - 6, y);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('A', plotLeft, Math.min(h - 5, zTransform.frameBottom + 15));
    ctx.textAlign = 'right';
    ctx.fillText('B', plotLeft + plotWidth, Math.min(h - 5, zTransform.frameBottom + 15));
    ctx.textAlign = 'left';

    const scaleButton = $('sectionScaleModeBtn');
    scaleButton.textContent = sectionScaleMode === 'auto' ? 'Auto' : '1:1';
    scaleButton.classList.toggle('active', sectionScaleMode === 'physical');
    scaleButton.setAttribute('aria-pressed', String(sectionScaleMode === 'physical'));
    scaleButton.title =
      sectionScaleMode === 'auto'
        ? 'Auto: X and Z fit independently. Click for physical 1:1 X:Z scale.'
        : 'Physical 1:1: X and Z use the same px/µm. Click for Auto fit.';

    const borderButton = $('sectionBordersBtn');
    borderButton.classList.toggle('active', sectionShowBorders);
    borderButton.setAttribute('aria-pressed', String(sectionShowBorders));
    borderButton.title = sectionShowBorders
      ? 'Hide structural borders in Section A–B'
      : 'Show structural borders in Section A–B';

    const scaleLabel =
      sectionScaleMode === 'auto' ? `Z ×${Number(zExaggeration.toPrecision(3))}` : '1:1';
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
