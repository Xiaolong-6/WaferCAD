import { annotationDepthFraction, IMPLANT_DEPTH_GRADIENT } from './annotation-rendering.js';
import { hasMaterial, layerById, modelBoundsZ } from './model.js';
import {
  annotationInspectionCutSegments,
  electricalRegionSolids,
  implantSolids,
} from './model-view-geometry.js';
import { buildRenderSurfacePlan } from './renderer-geometry.js';
import { triangulatePolygon } from './polygon-triangulation.js';
import {
  spatialInstanceChunks,
  translatedPolygonInstanceGroups,
  translatedSidewallInstanceGroups,
} from './renderer-instancing.js';
import { createCollapsedZDisplayTransform, resolveSectionCollapse } from './section-z-collapse.js';
import { geometryFromRoughCap, geometryFromRoughMeshData } from './rough-mesh-geometry.js';
import { buildRoughSpatialZones, prepareMorphologyExportTasks } from './morphology-mesh-policy.js';
import {
  adaptiveRoughMeshLod,
  allocateRoughTriangleBudgets,
  projectedPixelsPerUnit,
  roughProfileOffsetAtPoint,
  roughSceneTriangleBudget,
  roughLod,
  roughVisualBoundsZ,
} from './surface-rendering.js';

let THREE = null;
let OrbitControls = null;
let dependencyError = null;
let dependencyPromise = null;

function loadDependencies() {
  if (THREE && OrbitControls) return Promise.resolve(true);
  if (dependencyPromise) return dependencyPromise;

  dependencyPromise = (async () => {
    try {
      const threeModule = await import('three'),
        controlsModule = await import('three/addons/controls/OrbitControls.js');
      THREE = threeModule;
      OrbitControls = controlsModule.OrbitControls;
      dependencyError = null;
      return true;
    } catch (error) {
      dependencyError = error;
      return false;
    }
  })();

  return dependencyPromise;
}

export function createThreeView({
  host,
  stats,
  getModel,
  getClipGeometry = () => null,
  getInspection = () => ({ opacity: 1, borders: false }),
  getZCollapse = () => null,
  onViewChanged = () => {},
} = {}) {
  if (!host) throw new TypeError('3D host is required.');
  if (!stats) throw new TypeError('3D stats host is required.');
  if (typeof getModel !== 'function') throw new TypeError('getModel must be a function.');

  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let group = null;
  let axesHelper = null;
  let ready = false;
  let initPromise = null;
  let frame = null;
  let interacting = false;
  let rendering = false;
  let lastLodSignature = null;
  let roughMeshes = [];
  let roughTasks = [];
  let roughOwnedObjects = new Set();
  let roughRenderContext = null;
  let roughRebuildCount = 0;
  let roughSpatialZoneBuildCount = 0;
  let roughBaseTriangulationCount = 0;
  let surfacePlanBuildCount = 0;
  let smoothCapInstanceGroupCount = 0;
  let smoothCapInstanceCount = 0;
  let smoothCapTemplateTriangleCount = 0;
  let smoothSidewallInstanceGroupCount = 0;
  let smoothSidewallInstanceCount = 0;
  let smoothSidewallTemplateTriangleCount = 0;
  let transparentMeshes = [];
  let roughWorker = null;
  let roughWorkerResolve = null;
  let roughWorkerGeneration = 0;
  let roughRefineTimer = null;
  let roughInteractionCache = null;
  let currentRoughMode = 'none';
  let sceneGeneration = 0;
  let pendingRender = false;
  let pendingViewState = null;
  let zDisplayObjects = new Set();
  let currentZDisplay = null;
  let preferredPixelRatio = 1;

  function normalizeViewState(value) {
    if (!value || typeof value !== 'object') return null;
    const position = Array.isArray(value.position) ? value.position.map(Number) : null,
      target = Array.isArray(value.target) ? value.target.map(Number) : null,
      fov = Number(value.fov);
    if (
      position?.length !== 3 ||
      target?.length !== 3 ||
      !position.every(Number.isFinite) ||
      !target.every(Number.isFinite) ||
      !Number.isFinite(fov) ||
      !(fov > 1 && fov < 179)
    ) {
      return null;
    }
    return { position, target, fov };
  }

  function getViewState() {
    if (!ready || !camera || !controls) {
      return pendingViewState ? structuredClone(pendingViewState) : null;
    }
    return {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
      fov: camera.fov,
    };
  }

  function setViewState(value) {
    const normalized = normalizeViewState(value);
    pendingViewState = normalized;
    if (!normalized || !ready || !camera || !controls) return Boolean(normalized);

    camera.position.set(...normalized.position);
    controls.target.set(...normalized.target);
    camera.fov = normalized.fov;
    camera.updateProjectionMatrix();
    controls.update();
    scheduleFrame();
    return true;
  }

  function showUnavailable({
    status = '3D unavailable',
    reason = 'unknown',
    title = '3D unavailable',
    detail = 'The 3D view could not be initialized.',
    warning = '',
    error = null,
  } = {}) {
    ready = false;
    host.classList.remove('three-loading');
    host.classList.add('three-unavailable');
    host.dataset.threeUnavailableReason = reason;
    delete host.dataset.renderError;

    try {
      renderer?.dispose?.();
    } catch {
      // Best-effort cleanup after partial renderer initialization.
    }
    renderer = null;
    scene = null;
    camera = null;
    controls = null;
    group = null;
    axesHelper = null;

    const notice = host.ownerDocument.createElement('div'),
      heading = host.ownerDocument.createElement('strong'),
      description = host.ownerDocument.createElement('span');
    notice.className = 'three-unavailable-card';
    notice.setAttribute('role', 'status');
    heading.textContent = title;
    description.textContent = detail;
    notice.append(heading, description);
    host.replaceChildren(notice);
    stats.textContent = status;

    if (warning) console.warn(warning, error);
    return false;
  }

  function currentViewport() {
    return {
      width: Math.max(2, renderer?.domElement?.clientWidth || host.clientWidth || 2),
      height: Math.max(2, renderer?.domElement?.clientHeight || host.clientHeight || 2),
      pixelRatio: Math.max(0.25, renderer?.getPixelRatio?.() || 1),
    };
  }

  function zDisplayState(model) {
    const [idealLo, idealHi] = modelBoundsZ(model),
      [lo, hi] = roughVisualBoundsZ(model, [idealLo, idealHi]),
      collapse = resolveSectionCollapse(getZCollapse(), model, [lo, hi]),
      transform = createCollapsedZDisplayTransform({
        zMin: lo,
        zMax: hi,
        collapse,
        breakFraction: 0,
      }),
      xySpan = Math.max(Number(model.width) || 0, Number(model.height) || 0, 1e-12),
      scale = (xySpan * 0.12) / Math.max(transform.displaySpan, 1e-12);

    return {
      ...transform,
      scale,
    };
  }

  function objectZRecord(object) {
    return object?.userData?.waferCadZDisplay || null;
  }

  function trackZDisplayObject(object) {
    const positions = object?.geometry?.getAttribute?.('position');
    if (!positions?.count) return object;

    let minZ = Infinity,
      maxZ = -Infinity;
    for (let index = 0; index < positions.count; index++) {
      const z = positions.getZ(index);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    if (![minZ, maxZ].every(Number.isFinite)) return object;

    object.userData.waferCadZDisplay = {
      minZ,
      maxZ,
      canonicalZ: null,
      mode: 'canonical',
    };
    zDisplayObjects.add(object);
    if (currentZDisplay) applyZDisplayToObject(object, currentZDisplay);
    return object;
  }

  function ensureCanonicalZ(record, positions) {
    if (record.canonicalZ) return record.canonicalZ;
    const values = new Float32Array(positions.count);
    for (let index = 0; index < positions.count; index++) values[index] = positions.getZ(index);
    record.canonicalZ = values;
    return values;
  }

  function restoreCanonicalZ(record, positions) {
    if (!record.canonicalZ) return;
    for (let index = 0; index < positions.count; index++) {
      positions.setZ(index, record.canonicalZ[index]);
    }
    positions.needsUpdate = true;
  }

  function refreshGeometryBounds(object) {
    object.geometry?.computeBoundingBox?.();
    object.geometry?.computeBoundingSphere?.();
  }

  function applyZDisplayToObject(object, state) {
    const record = objectZRecord(object),
      positions = object?.geometry?.getAttribute?.('position');
    if (!record || !positions?.count || !state) return;

    const fullyHidden =
        state.enabled !== false && record.minZ > state.bottom && record.maxZ < state.top,
      fullyUpper = record.minZ >= state.top,
      fullyLower = record.maxZ <= state.bottom,
      sideScale = fullyUpper
        ? Number(state.frontScale) || 1
        : fullyLower
          ? Number(state.backScale) || 1
          : 1,
      canTranslateSide = (fullyUpper || fullyLower) && Math.abs(sideScale - 1) <= 1e-12;

    object.visible = !fullyHidden;
    if (fullyHidden) return;

    if (canTranslateSide) {
      if (record.mode === 'mapped') {
        restoreCanonicalZ(record, positions);
        refreshGeometryBounds(object);
      }
      const sample = fullyUpper ? record.minZ : record.maxZ;
      object.position.z = state.mapZ(sample) - sample;
      record.mode = 'translated';
      return;
    }

    const canonicalZ = ensureCanonicalZ(record, positions);
    object.position.z = 0;
    for (let index = 0; index < positions.count; index++) {
      positions.setZ(index, state.mapZ(canonicalZ[index]));
    }
    positions.needsUpdate = true;
    if (object.isMesh && object.geometry.getAttribute('normal')) {
      object.geometry.computeVertexNormals();
    }
    refreshGeometryBounds(object);
    record.mode = 'mapped';
  }

  function displayedObjectCenter(object) {
    const center = geometryCenter(object.geometry);
    center.add(object.position);
    center.z *= group?.scale?.z || 1;
    return center;
  }

  function applyZDisplayState(model = getModel()) {
    if (!model || !group) return null;
    currentZDisplay = zDisplayState(model);
    group.scale.z = currentZDisplay.scale;
    for (const object of zDisplayObjects) applyZDisplayToObject(object, currentZDisplay);

    host.dataset.zCollapseFollow = 'section';
    host.dataset.zCollapseEnabled = String(currentZDisplay.enabled !== false);
    host.dataset.zCollapseTopUm = String(currentZDisplay.top);
    host.dataset.zCollapseBottomUm = String(currentZDisplay.bottom);
    host.dataset.zCollapseGapUm = String(currentZDisplay.gap);
    host.dataset.zDisplayScale = String(currentZDisplay.scale);
    host.dataset.zFrontScale = String(currentZDisplay.frontScale);
    host.dataset.zBackScale = String(currentZDisplay.backScale);
    host.dataset.zScaleLinked = String(currentZDisplay.scaleLinked !== false);

    updateTransparentOrder();
    updateRoughMaterialLod();
    scheduleFrame();
    return currentZDisplay;
  }

  function updateZCollapse() {
    if (!ready || !group) return false;
    return Boolean(applyZDisplayState());
  }

  function zIsVisible(z, state = currentZDisplay) {
    const value = Number(z);
    if (!state || state.enabled === false || !Number.isFinite(value)) return true;
    return value >= state.top || value <= state.bottom;
  }

  function visibleZIntervals(z0, z1, state = currentZDisplay) {
    const start = Number(z0),
      end = Number(z1);
    if (!state || state.enabled === false || !Number.isFinite(start) || !Number.isFinite(end)) {
      return [[start, end]];
    }

    const ascending = end >= start,
      lo = Math.min(start, end),
      hi = Math.max(start, end),
      intervals = [];

    if (lo < state.bottom) {
      const upper = Math.min(hi, state.bottom);
      if (upper > lo) intervals.push([lo, upper]);
    }
    if (hi > state.top) {
      const lower = Math.max(lo, state.top);
      if (hi > lower) intervals.push([lower, hi]);
    }

    if (lo === state.bottom && hi === lo) intervals.push([lo, hi]);
    if (lo === state.top && hi === lo) intervals.push([lo, hi]);

    return ascending ? intervals : intervals.map(([a, b]) => [b, a]);
  }

  function displaySolidForZCollapse(solid, state = currentZDisplay) {
    if (!solid || !state) return solid;
    const slabs = [];
    for (const slab of solid.slabs || []) {
      for (const [z0, z1] of visibleZIntervals(slab.z0, slab.z1, state)) {
        if (z0 === z1) continue;
        slabs.push({ ...slab, z0, z1 });
      }
    }
    return {
      ...solid,
      slabs,
      caps: (solid.caps || []).filter((cap) => zIsVisible(cap.z, state)),
    };
  }

  function displaySidewallParts(parts, state = currentZDisplay) {
    if (!state) return parts || [];
    const visible = [];
    for (const part of parts || []) {
      const hasDepth =
          Number.isFinite(Number(part.lowerDepth)) && Number.isFinite(Number(part.upperDepth)),
        depthAt = (z) => {
          if (!hasDepth) return null;
          const span = part.z1 - part.z0;
          if (Math.abs(span) < 1e-12) return Number(part.lowerDepth);
          const t = Math.max(0, Math.min(1, (z - part.z0) / span));
          return Number(part.lowerDepth) + (Number(part.upperDepth) - Number(part.lowerDepth)) * t;
        };
      for (const [z0, z1] of visibleZIntervals(part.z0, part.z1, state)) {
        if (z0 === z1) continue;
        visible.push({
          ...part,
          z0,
          z1,
          lowerSurface: Math.abs(z0 - part.z0) <= 1e-10 ? part.lowerSurface : null,
          upperSurface: Math.abs(z1 - part.z1) <= 1e-10 ? part.upperSurface : null,
          ...(hasDepth ? { lowerDepth: depthAt(z0), upperDepth: depthAt(z1) } : {}),
        });
      }
    }
    return visible;
  }

  function displayBorderPositions(positions, state = currentZDisplay) {
    if (!state || !positions?.length) return positions || [];
    const out = [],
      lerpPoint = (a, b, t) => [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ];

    for (let index = 0; index + 5 < positions.length; index += 6) {
      const a = [positions[index], positions[index + 1], positions[index + 2]],
        b = [positions[index + 3], positions[index + 4], positions[index + 5]],
        dz = b[2] - a[2],
        cuts = [0, 1];

      if (Math.abs(dz) > 1e-12) {
        for (const boundary of [state.bottom, state.top]) {
          const t = (boundary - a[2]) / dz;
          if (t > 0 && t < 1) cuts.push(t);
        }
      }

      cuts.sort((left, right) => left - right);
      for (let part = 0; part < cuts.length - 1; part++) {
        const t0 = cuts[part],
          t1 = cuts[part + 1],
          middleZ = a[2] + dz * ((t0 + t1) / 2);
        if (!zIsVisible(middleZ, state)) continue;
        out.push(...lerpPoint(a, b, t0), ...lerpPoint(a, b, t1));
      }
    }
    return out;
  }

  function visibleBounds(model, clip) {
    const modelBounds = {
        minX: -model.width / 2,
        minY: -model.height / 2,
        maxX: model.width / 2,
        maxY: model.height / 2,
      },
      clipBounds = xyBounds(clip);
    if (!clipBounds) return modelBounds;
    const bounds = {
      minX: Math.max(modelBounds.minX, clipBounds.minX),
      minY: Math.max(modelBounds.minY, clipBounds.minY),
      maxX: Math.min(modelBounds.maxX, clipBounds.maxX),
      maxY: Math.min(modelBounds.maxY, clipBounds.maxY),
    };
    return bounds.maxX > bounds.minX && bounds.maxY > bounds.minY ? bounds : modelBounds;
  }

  function boundsArea(bounds) {
    if (!bounds) return 0;
    return Math.max(0, bounds.maxX - bounds.minX) * Math.max(0, bounds.maxY - bounds.minY);
  }

  function lodContextFor(
    model,
    clip,
    polys,
    z = 0,
    {
      visibleFraction = null,
      screenPriority = 1,
      maxDepth = 10,
      patchBounds: patchBoundsOverride = null,
    } = {},
  ) {
    const viewport = currentViewport(),
      patchBounds = patchBoundsOverride || xyBounds(polys),
      viewBounds = visibleBounds(model, clip),
      modelArea = Math.max(1e-12, Number(model.width) * Number(model.height)),
      visibleArea = Math.max(1e-12, boundsArea(viewBounds)),
      patchArea = Math.max(1e-12, Math.min(visibleArea, boundsArea(patchBounds) || visibleArea)),
      center = patchBounds
        ? new THREE.Vector3(
            (patchBounds.minX + patchBounds.maxX) / 2,
            (patchBounds.minY + patchBounds.maxY) / 2,
            (currentZDisplay?.mapZ?.(z) ?? z) * (group?.scale?.z || 1),
          )
        : controls.target.clone(),
      distance = Math.max(1e-9, camera.position.distanceTo(center));

    return {
      distance,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      pixelRatio: viewport.pixelRatio,
      fovDegrees: camera.fov,
      visibleFraction:
        visibleFraction == null
          ? Math.max(0, Math.min(1, patchArea / visibleArea))
          : Math.max(0, Math.min(1, Number(visibleFraction) || 0)),
      roiFraction: Math.max(0, Math.min(1, visibleArea / modelArea)),
      screenPriority,
      maxDepth,
    };
  }

  function focusBounds() {
    const distance = Math.max(1e-9, camera.position.distanceTo(controls.target)),
      halfHeight = distance * Math.tan((camera.fov * Math.PI) / 360) * 1.8,
      halfWidth = halfHeight * Math.max(0.2, camera.aspect),
      right = new THREE.Vector3(),
      viewUp = new THREE.Vector3();
    camera.updateMatrixWorld();
    const elements = camera.matrixWorld.elements;
    right.set(elements[0], elements[1], elements[2]).normalize();
    viewUp.set(elements[4], elements[5], elements[6]).normalize();

    const corners = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        corners.push(
          controls.target
            .clone()
            .addScaledVector(right, halfWidth * sx)
            .addScaledVector(viewUp, halfHeight * sy),
        );
      }
    }
    const xs = corners.map((point) => point.x),
      ys = corners.map((point) => point.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  function prepareRoughSpatialZones(task) {
    if (task.spatialZones !== undefined) return task.spatialZones;
    task.spatialZones = buildRoughSpatialZones(THREE, task.cap);
    roughBaseTriangulationCount++;
    roughSpatialZoneBuildCount++;
    return task.spatialZones;
  }

  function boundsOverlap(a, b) {
    return Boolean(
      a && b && a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY,
    );
  }

  function roughZonePriority(bounds, focus) {
    if (!bounds || !focus) return 0.06;
    if (boundsOverlap(bounds, focus)) return 1;

    const cx = (bounds.minX + bounds.maxX) / 2,
      cy = (bounds.minY + bounds.maxY) / 2,
      fx = (focus.minX + focus.maxX) / 2,
      fy = (focus.minY + focus.maxY) / 2,
      halfWidth = Math.max(1e-9, (focus.maxX - focus.minX) / 2),
      halfHeight = Math.max(1e-9, (focus.maxY - focus.minY) / 2),
      normalizedDistance = Math.hypot((cx - fx) / halfWidth, (cy - fy) / halfHeight);
    return normalizedDistance <= 1.75 ? 0.28 : 0.06;
  }

  function adaptiveLodSignature() {
    if (!camera || !renderer || !controls) return null;
    const viewport = currentViewport(),
      distance = Math.max(1e-9, camera.position.distanceTo(controls.target)),
      pxPerUnit = projectedPixelsPerUnit({
        distance,
        viewportHeight: viewport.height,
        fovDegrees: camera.fov,
        pixelRatio: viewport.pixelRatio,
      }),
      direction = camera.position.clone().sub(controls.target).normalize(),
      azimuth = Math.atan2(direction.y, direction.x),
      elevation = Math.asin(Math.max(-1, Math.min(1, direction.z))),
      scaleBucket = Math.round(Math.log2(Math.max(1e-12, pxPerUnit)) * 2),
      azimuthBucket = Math.round(azimuth / (Math.PI / 12)),
      elevationBucket = Math.round(elevation / (Math.PI / 12)),
      widthBucket = Math.round((viewport.width * viewport.pixelRatio) / 160),
      heightBucket = Math.round((viewport.height * viewport.pixelRatio) / 160),
      targetQuantum = Math.max(1e-9, 80 / Math.max(1e-12, pxPerUnit)),
      targetXBucket = Math.round(controls.target.x / targetQuantum),
      targetYBucket = Math.round(controls.target.y / targetQuantum);
    return `${scaleBucket}:${azimuthBucket}:${elevationBucket}:${widthBucket}:${heightBucket}:${targetXBucket}:${targetYBucket}`;
  }

  function updateRoughMaterialLod() {
    if (!camera || !renderer || !roughMeshes.length) return;
    const viewport = currentViewport();
    for (const entry of roughMeshes) {
      const point = displayedObjectCenter(entry.mesh);
      const distance = Math.max(1e-9, camera.position.distanceTo(point)),
        pxPerUm = projectedPixelsPerUnit({
          distance,
          viewportHeight: viewport.height,
          fovDegrees: camera.fov,
          pixelRatio: viewport.pixelRatio,
        }),
        featurePixels = entry.appearance.featureSize * pxPerUm,
        lod = roughLod(featurePixels);
      entry.material.roughness = 0.82 + 0.12 * lod.detail;
    }
  }

  function updateRoughDiagnostics() {
    if (!renderer?.domElement) return;
    const depths = roughMeshes
        .map((entry) => Number(entry.mesh.geometry?.userData?.roughSubdivisionDepth))
        .filter(Number.isFinite),
      triangles = roughMeshes.reduce(
        (sum, entry) => sum + (entry.mesh.geometry?.getAttribute('position')?.count || 0) / 3,
        0,
      ),
      subdivisionTriangles = roughMeshes.reduce(
        (sum, entry) =>
          sum + (Number(entry.mesh.geometry?.userData?.roughSubdivisionTriangleCount) || 0),
        0,
      ),
      zones = roughMeshes.reduce(
        (sum, entry) => sum + (Number(entry.mesh.geometry?.userData?.roughLodZoneCount) || 0),
        0,
      ),
      stitches = roughMeshes.reduce(
        (sum, entry) => sum + (Number(entry.mesh.geometry?.userData?.roughLodStitchCount) || 0),
        0,
      ),
      data = renderer.domElement.dataset;

    if (!depths.length) {
      delete data.roughLodDepthMin;
      delete data.roughLodDepthMax;
      delete data.roughTriangleCount;
      delete data.roughSubdivisionTriangleCount;
      delete data.roughLodZones;
      delete data.roughLodStitches;
      delete data.roughSceneTriangleBudget;
      delete data.roughRequestedSceneTriangleBudget;
      delete data.roughBaseTriangleCount;
      delete data.roughSpatialZoneBuildCount;
      delete data.roughBaseTriangulationCount;
      return;
    }
    data.roughLodDepthMin = String(Math.min(...depths));
    data.roughLodDepthMax = String(Math.max(...depths));
    data.roughTriangleCount = String(Math.round(triangles));
    data.roughSubdivisionTriangleCount = String(Math.round(subdivisionTriangles));
    data.roughLodZones = String(zones);
    data.roughLodStitches = String(stitches);
  }

  function clearRoughRefineTimer() {
    if (roughRefineTimer == null) return;
    clearTimeout(roughRefineTimer);
    roughRefineTimer = null;
  }

  function terminateRoughWorker({ invalidate = false } = {}) {
    const resolve = roughWorkerResolve;
    roughWorkerResolve = null;
    if (roughWorker) {
      roughWorker.terminate();
      roughWorker = null;
    }
    if (invalidate) roughWorkerGeneration++;
    resolve?.(false);
  }

  function scheduleDetailedRoughBuild(delay = 140) {
    if (!ready || interacting || rendering || !roughTasks.length) return;
    clearRoughRefineTimer();
    roughRefineTimer = setTimeout(
      () => {
        roughRefineTimer = null;
        if (!interacting) void requestRoughGeometry('detailed');
      },
      Math.max(0, Number(delay) || 0),
    );
  }

  function scheduleFrame() {
    if (!renderer || frame != null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const changed = controls?.update?.() || false;
      updateRoughMaterialLod();
      updateTransparentOrder();
      renderer.render(scene, camera);
      if (interacting || changed) scheduleFrame();
    });
  }

  function resize() {
    if (!renderer) return;
    const rect = host.getBoundingClientRect();
    renderer.setSize(Math.max(2, rect.width), Math.max(2, rect.height), false);
    camera.aspect = Math.max(2, rect.width) / Math.max(2, rect.height);
    camera.updateProjectionMatrix();
    if (!interacting) scheduleDetailedRoughBuild();
    scheduleFrame();
  }

  function disposeGroup() {
    if (!group) return;
    clearRoughRefineTimer();
    terminateRoughWorker({ invalidate: true });
    roughInteractionCache = null;
    currentRoughMode = 'none';
    lastLodSignature = null;
    if (renderer?.domElement?.dataset) {
      renderer.domElement.dataset.roughMeshMode = 'none';
      renderer.domElement.dataset.roughMeshWorker = 'false';
    }
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    for (const object of group.children) {
      if (object.geometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) {
        if (!material) continue;
        materials.add(material);
        if (material.bumpMap) textures.add(material.bumpMap);
      }
    }
    group.clear();
    zDisplayObjects = new Set();
    currentZDisplay = null;
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    roughMeshes = [];
    roughTasks = [];
    roughOwnedObjects = new Set();
    roughRenderContext = null;
    transparentMeshes = [];
  }

  function inspectionMaterialState(value) {
    const number = Number(value),
      opacity = Math.max(0.1, Math.min(1, Number.isFinite(number) ? number : 1)),
      translucent = opacity < 0.999;
    return {
      opacity,
      transparent: translucent,
      depthTest: true,
      depthWrite: !translucent,
    };
  }

  function xyBounds(geometry) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const polygon of geometry || []) {
      for (const ring of polygon || []) {
        for (const point of ring || []) {
          minX = Math.min(minX, point[0]);
          minY = Math.min(minY, point[1]);
          maxX = Math.max(maxX, point[0]);
          maxY = Math.max(maxY, point[1]);
        }
      }
    }
    return [minX, minY, maxX, maxY].every(Number.isFinite) ? { minX, minY, maxX, maxY } : null;
  }

  function geometryFromSolid({ slabs, caps }) {
    const positions = [],
      normals = [];
    const triangle = (a, b, c, normal) => {
      positions.push(...a, ...b, ...c);
      normals.push(...normal, ...normal, ...normal);
    };
    for (const { z, normal, polys } of caps)
      for (const poly of polys)
        for (const triangle2d of triangulatePolygon(THREE, poly)) {
          let [a, b, c] = triangle2d.map(([x, y]) => [x, y, z]);
          const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
          if (cross * normal < 0) [b, c] = [c, b];
          triangle(a, b, c, [0, 0, normal]);
        }
    for (const { z0, z1, polys } of slabs)
      for (const poly of polys)
        for (let r = 0; r < poly.length; r++) {
          const ring = poly[r].slice(0, -1);
          const signedArea = ring.reduce((sum, p, i) => {
            const q = ring[(i + 1) % ring.length];
            return sum + p[0] * q[1] - p[1] * q[0];
          }, 0);
          if (signedArea > 0 !== (r === 0)) ring.reverse();
          for (let i = 0; i < ring.length; i++) {
            const p = ring[i],
              q = ring[(i + 1) % ring.length];
            const dx = q[0] - p[0],
              dy = q[1] - p[1],
              length = Math.hypot(dx, dy);
            if (!length) continue;
            const normal = [dy / length, -dx / length, 0];
            const a = [...p, z0],
              b = [...q, z0],
              c = [...q, z1],
              d = [...p, z1];
            triangle(a, b, c, normal);
            triangle(a, c, d, normal);
          }
        }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geometry;
  }

  function shearImplantGeometry(geometry, implant) {
    const positions = geometry.getAttribute('position'),
      tangent = Math.tan(((Number(implant.tilt) || 0) * Math.PI) / 180);
    if (!positions || Math.abs(tangent) < 1e-12) return geometry;
    for (let index = 0; index < positions.count; index++) {
      const z = positions.getZ(index),
        depth = Math.max(0, implant.face === 'front' ? implant.sourceZ - z : z - implant.sourceZ);
      positions.setX(index, positions.getX(index) + tangent * depth);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function setAnnotationDepthAttribute(geometry, annotation, constantDepth = null) {
    const positions = geometry?.getAttribute?.('position');
    if (!positions?.count) return geometry;
    const hasFixedDepth = constantDepth != null && Number.isFinite(Number(constantDepth)),
      fixedDepth = hasFixedDepth ? Number(constantDepth) : null,
      values = new Float32Array(positions.count);
    for (let index = 0; index < positions.count; index++) {
      values[index] = hasFixedDepth
        ? Math.max(0, Math.min(1, fixedDepth))
        : annotationDepthFraction(annotation, positions.getZ(index));
    }
    geometry.setAttribute('annotationDepth', new THREE.Float32BufferAttribute(values, 1));
    return geometry;
  }

  function annotationSidewallParts(annotation, inspectionClip = null) {
    const appearance =
        annotation?.surfaceAppearance?.kind === 'rough' ? annotation.surfaceAppearance : null,
      faceDirection = annotation?.face === 'back' ? -1 : 1,
      outerSurface = appearance ? { appearance, profileNormal: faceDirection } : null,
      innerSurface =
        appearance && annotation?.depthProfile !== 'smooth'
          ? { appearance, profileNormal: faceDirection }
          : null,
      front = annotation?.face !== 'back',
      lowerSurface = front ? innerSurface : outerSurface,
      upperSurface = front ? outerSurface : innerSurface,
      lowerDepth = annotationDepthFraction(annotation, annotation.z0),
      upperDepth = annotationDepthFraction(annotation, annotation.z1),
      parts = [],
      edges = [];

    if (inspectionClip) {
      edges.push(...annotationInspectionCutSegments(annotation, inspectionClip));
    } else {
      for (const poly of annotation?.polys || []) {
        for (const closed of poly || []) {
          for (let index = 1; index < closed.length; index++) {
            edges.push({ p: closed[index - 1], q: closed[index] });
          }
        }
      }
    }
    for (const { p, q } of edges) {
      if (!p || !q || (p[0] === q[0] && p[1] === q[1])) continue;
      parts.push({
        p,
        q,
        z0: annotation.z0,
        z1: annotation.z1,
        lowerSurface,
        upperSurface,
        lowerDepth,
        upperDepth,
      });
    }
    return parts;
  }

  function geometryCenter(geometry) {
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox?.getCenter(center);
    return center;
  }

  function geometryFromSidewallParts(parts) {
    const positions = [],
      normals = [],
      annotationDepths = [];

    const triangle = (a, b, c, depths = null) => {
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
          ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
          normal = [
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
          ],
          magnitude = Math.hypot(...normal) || 1,
          unit = normal.map((value) => value / magnitude);
        positions.push(...a, ...b, ...c);
        normals.push(...unit, ...unit, ...unit);
        if (depths) annotationDepths.push(...depths);
      },
      displacedZ = (point, z, surface) =>
        surface?.appearance?.kind === 'rough'
          ? z +
            (Number(surface.profileNormal) || 1) *
              roughProfileOffsetAtPoint(point[0], point[1], surface.appearance)
          : z;

    for (const part of parts || []) {
      const p = part.p,
        q = part.q,
        dx = q[0] - p[0],
        dy = q[1] - p[1],
        length = Math.hypot(dx, dy);
      if (!length) continue;

      const featureSizes = [part.lowerSurface, part.upperSurface]
          .map((surface) => Number(surface?.appearance?.featureSize))
          .filter((value) => Number.isFinite(value) && value > 0),
        targetStep = featureSizes.length ? Math.max(1e-6, Math.min(...featureSizes) / 4) : length,
        segments = Math.max(1, Math.min(512, Math.ceil(length / targetStep))),
        pointAt = (t) => [p[0] + dx * t, p[1] + dy * t],
        hasDepth =
          Number.isFinite(Number(part.lowerDepth)) && Number.isFinite(Number(part.upperDepth)),
        lowerDepth = hasDepth ? Math.max(0, Math.min(1, Number(part.lowerDepth))) : null,
        upperDepth = hasDepth ? Math.max(0, Math.min(1, Number(part.upperDepth))) : null;

      for (let segment = 0; segment < segments; segment++) {
        const t0 = segment / segments,
          t1 = (segment + 1) / segments,
          p0 = pointAt(t0),
          p1 = pointAt(t1),
          lower0 = [...p0, displacedZ(p0, part.z0, part.lowerSurface)],
          lower1 = [...p1, displacedZ(p1, part.z0, part.lowerSurface)],
          upper1 = [...p1, displacedZ(p1, part.z1, part.upperSurface)],
          upper0 = [...p0, displacedZ(p0, part.z1, part.upperSurface)],
          firstDepths = hasDepth ? [lowerDepth, lowerDepth, upperDepth] : null,
          secondDepths = hasDepth ? [lowerDepth, upperDepth, upperDepth] : null;
        triangle(lower0, lower1, upper1, firstDepths);
        triangle(lower0, upper1, upper0, secondDepths);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    if (annotationDepths.length === positions.length / 3 && annotationDepths.length) {
      geometry.setAttribute(
        'annotationDepth',
        new THREE.Float32BufferAttribute(annotationDepths, 1),
      );
    }
    return geometry;
  }

  function updateTransparentOrder() {
    if (!camera || !group || !transparentMeshes.length) return;
    camera.updateMatrixWorld();
    for (const entry of transparentMeshes) {
      const point = displayedObjectCenter(entry.mesh);
      point.applyMatrix4(camera.matrixWorldInverse);
      entry.depth = point.z;
    }
    transparentMeshes.sort(
      (a, b) => a.depth - b.depth || a.sortBias - b.sortBias || a.sequence - b.sequence,
    );
    transparentMeshes.forEach((entry, index) => {
      entry.mesh.renderOrder = 100 + index;
    });
  }

  function createSurfaceMaterial(layer, materialState, appearance = null) {
    return new THREE.MeshStandardMaterial({
      color: layer?.color || '#999',
      roughness: appearance ? 0.84 : 0.78,
      metalness: 0.015,
      side: THREE.DoubleSide,
      ...materialState,
    });
  }

  function createAnnotationGradientMaterial(
    annotation,
    materialState,
    { roughness = 0.72, metalness = 0 } = {},
  ) {
    const { midDepth, outerAlpha, midAlpha, innerAlpha } = IMPLANT_DEPTH_GRADIENT,
      midScale = midAlpha / outerAlpha,
      innerScale = innerAlpha / outerAlpha,
      material = new THREE.MeshStandardMaterial({
        color: annotation?.color || '#D65A6F',
        roughness,
        metalness,
        side: THREE.DoubleSide,
        ...materialState,
        transparent: true,
        depthTest: true,
        depthWrite: false,
      });
    material.userData.waferCadAnnotationGradient = 'section-depth';
    material.customProgramCacheKey = () => 'wafercad-annotation-depth-gradient-v1';
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute float annotationDepth;
varying float vWaferCadAnnotationDepth;
void main() {
  vWaferCadAnnotationDepth = annotationDepth;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `varying float vWaferCadAnnotationDepth;
void main() {`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float waferCadDepth = clamp(vWaferCadAnnotationDepth, 0.0, 1.0);
float waferCadAlphaScale = waferCadDepth <= ${midDepth}
  ? mix(1.0, ${midScale}, waferCadDepth / ${midDepth})
  : mix(${midScale}, ${innerScale}, (waferCadDepth - ${midDepth}) / ${1 - midDepth});
diffuseColor.a *= waferCadAlphaScale;`,
      );
    };
    return material;
  }

  function addSurfaceMesh(
    geometry,
    material,
    materialState,
    appearance = null,
    sortBias = 0,
    trackAdaptiveRough = false,
  ) {
    if (!geometry.getAttribute('position')?.count) {
      geometry.dispose();
      material?.dispose?.();
      return null;
    }
    const mesh = new THREE.Mesh(geometry, material),
      center = geometryCenter(geometry);
    mesh.renderOrder = materialState.transparent ? 100 : 0;
    group.add(mesh);
    trackZDisplayObject(mesh);
    if (materialState.transparent) {
      transparentMeshes.push({
        mesh,
        center,
        depth: 0,
        sortBias,
        sequence: transparentMeshes.length,
      });
    }
    if (appearance) mesh.userData.surfaceAppearance = { ...appearance };
    if (appearance && trackAdaptiveRough) {
      roughMeshes.push({
        mesh,
        material,
        appearance: { ...appearance },
        center,
      });
    }
    return mesh;
  }

  function addInstancedSurfaceMeshes(
    geometry,
    material,
    translations,
    { name = '', maxInstancesPerMesh = 64 } = {},
  ) {
    if (!geometry.getAttribute('position')?.count || !translations?.length) {
      geometry.dispose();
      material?.dispose?.();
      return [];
    }

    const chunks = spatialInstanceChunks(translations, { maxInstances: maxInstancesPerMesh }),
      meshes = [];
    chunks.forEach((chunk, chunkIndex) => {
      // Z-collapse can remap vertex Z coordinates in place. Give each spatial
      // chunk its own tiny template geometry so one chunk cannot mutate the
      // canonical coordinates observed by another chunk.
      const chunkGeometry = chunkIndex === 0 ? geometry : geometry.clone(),
        mesh = new THREE.InstancedMesh(chunkGeometry, material, chunk.length),
        matrix = new THREE.Matrix4();
      chunk.forEach(([x, y], index) => {
        matrix.makeTranslation(Number(x) || 0, Number(y) || 0, 0);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox?.();
      mesh.computeBoundingSphere?.();
      if (name) mesh.name = chunks.length > 1 ? `${name} ${chunkIndex + 1}/${chunks.length}` : name;
      group.add(mesh);
      trackZDisplayObject(mesh);
      meshes.push(mesh);
    });
    return meshes;
  }

  function disposeObjectResources(object) {
    object?.geometry?.dispose?.();
    const materials = Array.isArray(object?.material) ? object.material : [object?.material];
    for (const material of materials) {
      if (!material) continue;
      material.bumpMap?.dispose?.();
      material.dispose?.();
    }
  }

  function clearAdaptiveRoughObjects() {
    if (!roughOwnedObjects.size) {
      roughMeshes = [];
      return;
    }
    const owned = new Set(roughOwnedObjects);
    transparentMeshes = transparentMeshes.filter((entry) => !owned.has(entry.mesh));
    for (const object of owned) {
      zDisplayObjects.delete(object);
      group?.remove(object);
      disposeObjectResources(object);
    }
    roughOwnedObjects.clear();
    roughMeshes = [];
  }

  function addBorderPositions(
    positions,
    { order = 100000, opacity = 1, adaptiveRough = false } = {},
  ) {
    if (!positions?.length) return null;
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x111820,
        transparent: opacity < 0.999,
        opacity: opacity < 0.999 ? 0.62 : 1,
        depthTest: true,
        depthFunc: THREE.LessEqualDepth,
        depthWrite: false,
      }),
      edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edges.renderOrder = order;
    group.add(edges);
    trackZDisplayObject(edges);
    if (adaptiveRough) roughOwnedObjects.add(edges);
    return edges;
  }

  function roughSceneRoiFraction(model, clip) {
    const modelArea = Math.max(1e-12, Number(model.width) * Number(model.height)),
      visibleArea = Math.max(1e-12, boundsArea(visibleBounds(model, clip)));
    return Math.max(0, Math.min(1, visibleArea / modelArea));
  }

  function prepareAdaptiveRoughTasks({ interactive = false } = {}) {
    const context = roughRenderContext;
    if (!context || !roughTasks.length) return { tasks: [], sceneBudget: 0 };
    const focus = focusBounds(),
      requests = [],
      tasks = roughTasks.map((task) => {
        const zones = prepareRoughSpatialZones(task).map((zone) => {
          const priority = roughZonePriority(zone.bounds, focus),
            lodContext = lodContextFor(context.model, context.clip, null, task.cap.z, {
              visibleFraction: priority >= 0.9 ? 1 : priority >= 0.2 ? 0.2 : 0.04,
              screenPriority: priority,
              maxDepth: interactive ? 3 : priority >= 0.9 ? 10 : priority >= 0.2 ? 7 : 5,
              patchBounds: zone.bounds,
            }),
            preview = adaptiveRoughMeshLod({
              triangleCount: zone.baseTriangles.length,
              maxEdge: zone.maxEdge,
              featureSize: task.cap.appearance?.featureSize,
              ...lodContext,
            }),
            prepared = {
              ...zone,
              lodContext,
              triangleBudget: null,
            };
          requests.push({
            zone: prepared,
            baseTriangles: Math.max(1, zone.baseTriangles.length),
            desiredTriangles: Math.max(1, preview.desiredTriangles),
            priority,
          });
          return prepared;
        });
        return { ...task, zones };
      }),
      viewport = currentViewport(),
      requestedSceneBudget = roughSceneTriangleBudget({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        pixelRatio: viewport.pixelRatio,
        roiFraction: roughSceneRoiFraction(context.model, context.clip),
        hardCap: interactive ? 70000 : 900000,
      }),
      baseTriangleCount = requests.reduce((sum, request) => sum + request.baseTriangles, 0),
      sceneBudget = Math.max(requestedSceneBudget, baseTriangleCount),
      allocations = allocateRoughTriangleBudgets(requests, {
        totalBudget: sceneBudget,
      });

    requests.forEach((request, index) => {
      request.zone.triangleBudget = allocations[index];
    });
    return { tasks, sceneBudget, requestedSceneBudget, baseTriangleCount };
  }

  function roughWorkerDiagnostics(prepared) {
    return {
      sceneBudget: prepared.sceneBudget,
      requestedSceneBudget: prepared.requestedSceneBudget,
      baseTriangleCount: prepared.baseTriangleCount,
    };
  }

  function applyRoughMeshResults(
    results,
    diagnostics,
    mode,
    signature = null,
    sceneToken = roughRenderContext?.sceneGeneration ?? null,
  ) {
    const context = roughRenderContext;
    if (
      !context ||
      sceneToken == null ||
      context.sceneGeneration !== sceneToken ||
      sceneGeneration !== sceneToken
    ) {
      return false;
    }
    clearAdaptiveRoughObjects();

    for (const result of results || []) {
      const task = roughTasks[result.taskId];
      if (!task || !result.data) continue;
      const cap = task.cap,
        meshData = task.implant
          ? {
              ...result.data,
              positions: result.data.positions.slice(),
              normals: result.data.normals.slice(),
            }
          : result.data;
      let geometry = geometryFromRoughMeshData(THREE, meshData);
      if (task.implant) {
        setAnnotationDepthAttribute(
          geometry,
          task.implant,
          annotationDepthFraction(task.implant, cap.z),
        );
        geometry = shearImplantGeometry(geometry, task.implant);
      }

      const material = task.implant
        ? createAnnotationGradientMaterial(task.implant, task.state, {
            roughness: cap.appearance ? 0.84 : 0.72,
          })
        : createSurfaceMaterial(task.layer, task.state, cap.appearance);
      if (task.polygonOffset) {
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -1;
      }
      const mesh = addSurfaceMesh(
        geometry,
        material,
        task.state,
        cap.appearance,
        task.sortBias ?? (cap.buried ? 12 : 0),
        true,
      );
      if (mesh) {
        roughOwnedObjects.add(mesh);
        if (task.name) mesh.name = task.name;
      }

      if (
        task.includeBorders !== false &&
        context.borders &&
        !cap.buried &&
        geometry.userData.roughBorderPositions?.length
      ) {
        addBorderPositions(geometry.userData.roughBorderPositions, {
          order: 100010 + (cap.solidIndex || 0),
          opacity: context.opacity,
          adaptiveRough: true,
        });
      }
    }

    roughRebuildCount++;
    currentRoughMode = mode;
    const data = renderer?.domElement?.dataset;
    if (data) {
      data.roughSceneTriangleBudget = String(diagnostics?.sceneBudget || 0);
      data.roughRequestedSceneTriangleBudget = String(diagnostics?.requestedSceneBudget || 0);
      data.roughBaseTriangleCount = String(diagnostics?.baseTriangleCount || 0);
      data.roughSpatialZoneBuildCount = String(roughSpatialZoneBuildCount);
      data.roughBaseTriangulationCount = String(roughBaseTriangulationCount);
      data.roughRebuildCount = String(roughRebuildCount);
      data.surfacePlanBuildCount = String(surfacePlanBuildCount);
      data.roughMeshMode = mode;
      data.roughMeshWorker = 'true';
    }
    updateRoughMaterialLod();
    updateTransparentOrder();
    updateRoughDiagnostics();
    if (mode === 'detailed') lastLodSignature = signature || adaptiveLodSignature();
    host.dataset.renderState = 'ready';
    stats.textContent = hasMaterial(context.model)
      ? context.clip
        ? 'ROI'
        : 'full model'
      : 'no material';
    scheduleFrame();
    return true;
  }

  function roughWorkerPayload(prepared) {
    return prepared.tasks.map((task, taskId) => {
      const cap = task.cap;
      return {
        taskId,
        geometry: {
          z: cap.z,
          normal: cap.normal,
          appearance: cap.appearance,
          closeToIdeal: task.closeToIdeal ?? !cap.buried,
          sidewallBoundaryIntervals: cap.sidewallBoundaryIntervals,
          profileNormal: cap.profileNormal,
          lodZones: task.zones.map((zone) => ({
            baseTriangles: zone.baseTriangles,
            maxEdge: zone.maxEdge,
            edges: zone.edges,
            lodContext: zone.lodContext,
            triangleBudget: zone.triangleBudget,
          })),
        },
      };
    });
  }

  function requestRoughGeometry(mode = 'detailed', { force = false, refineAfter = false } = {}) {
    if (!roughRenderContext || !roughTasks.length || rendering) return Promise.resolve(false);
    const sceneToken = roughRenderContext.sceneGeneration,
      interactive = mode === 'interactive',
      signature = adaptiveLodSignature();
    if (
      !interactive &&
      !force &&
      currentRoughMode === 'detailed' &&
      signature &&
      signature === lastLodSignature
    ) {
      return Promise.resolve(false);
    }

    clearRoughRefineTimer();
    terminateRoughWorker();
    const prepared = prepareAdaptiveRoughTasks({ interactive }),
      diagnostics = roughWorkerDiagnostics(prepared);
    if (!prepared.tasks.length) return Promise.resolve(false);

    let worker;
    try {
      const workerUrl = new URL('./rough-mesh-worker.js', import.meta.url),
        currentModuleUrl = new URL(import.meta.url);
      workerUrl.search = currentModuleUrl.search;
      worker = new Worker(workerUrl);
    } catch (error) {
      console.warn('Rough mesh worker unavailable; using synchronous fallback.', error);
      if (!interactive) return Promise.resolve(rebuildAdaptiveRoughGeometrySync({ sceneToken }));
      return Promise.resolve(false);
    }

    const generation = ++roughWorkerGeneration,
      id = `rough-${generation}`;
    roughWorker = worker;

    return new Promise((resolve) => {
      roughWorkerResolve = resolve;
      const finish = () => {
        if (roughWorker === worker) {
          roughWorker = null;
          roughWorkerResolve = null;
        }
        worker.terminate();
      };

      worker.onmessage = (event) => {
        const message = event.data || {};
        if (message.id !== id || message.generation !== generation) return;
        if (generation !== roughWorkerGeneration) {
          finish();
          resolve(false);
          return;
        }
        if (message.type === 'error') {
          console.warn('Rough mesh worker failed.', message.message);
          finish();
          if (!interactive) resolve(rebuildAdaptiveRoughGeometrySync({ sceneToken }));
          else resolve(false);
          return;
        }
        if (message.type !== 'done') return;

        finish();
        if (generation !== roughWorkerGeneration) {
          resolve(false);
          return;
        }
        if (interactive) {
          roughInteractionCache = {
            results: message.results,
            diagnostics,
            sceneGeneration: sceneToken,
          };
        }
        const applied = applyRoughMeshResults(
          message.results,
          diagnostics,
          mode,
          interactive ? null : signature,
          sceneToken,
        );
        if (interactive && refineAfter && !interacting) scheduleDetailedRoughBuild(60);
        resolve(applied);
      };

      worker.onerror = (event) => {
        if (generation !== roughWorkerGeneration) {
          finish();
          resolve(false);
          return;
        }
        console.warn('Rough mesh worker failed.', event.message || event);
        finish();
        if (!interactive) resolve(rebuildAdaptiveRoughGeometrySync({ sceneToken }));
        else resolve(false);
      };

      try {
        worker.postMessage({
          id,
          generation,
          tasks: roughWorkerPayload(prepared),
        });
      } catch (error) {
        console.warn('Could not start rough mesh worker task.', error);
        finish();
        if (!interactive) resolve(rebuildAdaptiveRoughGeometrySync({ sceneToken }));
        else resolve(false);
      }
    });
  }

  function rebuildAdaptiveRoughGeometrySync({
    interactive = false,
    sceneToken = roughRenderContext?.sceneGeneration ?? null,
  } = {}) {
    const context = roughRenderContext;
    if (
      !context ||
      sceneToken == null ||
      context.sceneGeneration !== sceneToken ||
      sceneGeneration !== sceneToken
    ) {
      return false;
    }
    clearAdaptiveRoughObjects();
    if (!roughTasks.length) {
      lastLodSignature = null;
      updateRoughDiagnostics();
      return false;
    }

    const wasRendering = rendering;
    rendering = true;
    try {
      const prepared = prepareAdaptiveRoughTasks({ interactive });
      for (const task of prepared.tasks) {
        const cap = task.cap;
        let geometry = geometryFromRoughCap(THREE, {
          z: cap.z,
          normal: cap.normal,
          polys: cap.polys,
          appearance: cap.appearance,
          closeToIdeal: task.closeToIdeal ?? !cap.buried,
          sidewallBoundaryIntervals: cap.sidewallBoundaryIntervals,
          profileNormal: cap.profileNormal,
          lodContext: lodContextFor(context.model, context.clip, cap.polys, cap.z),
          lodZones: task.zones,
        });
        if (task.implant) {
          setAnnotationDepthAttribute(
            geometry,
            task.implant,
            annotationDepthFraction(task.implant, cap.z),
          );
          geometry = shearImplantGeometry(geometry, task.implant);
        }

        const material = task.implant
          ? createAnnotationGradientMaterial(task.implant, task.state, {
              roughness: cap.appearance ? 0.84 : 0.72,
            })
          : createSurfaceMaterial(task.layer, task.state, cap.appearance);
        if (task.polygonOffset) {
          material.polygonOffset = true;
          material.polygonOffsetFactor = -1;
          material.polygonOffsetUnits = -1;
        }
        const mesh = addSurfaceMesh(
          geometry,
          material,
          task.state,
          cap.appearance,
          task.sortBias ?? (cap.buried ? 12 : 0),
          true,
        );
        if (mesh) {
          roughOwnedObjects.add(mesh);
          if (task.name) mesh.name = task.name;
        }

        if (
          task.includeBorders !== false &&
          context.borders &&
          !cap.buried &&
          geometry.userData.roughBorderPositions?.length
        ) {
          addBorderPositions(geometry.userData.roughBorderPositions, {
            order: 100010 + (cap.solidIndex || 0),
            opacity: context.opacity,
            adaptiveRough: true,
          });
        }
      }

      roughRebuildCount++;
      currentRoughMode = interactive ? 'interactive' : 'detailed';
      const data = renderer?.domElement?.dataset;
      if (data) {
        data.roughSceneTriangleBudget = String(prepared.sceneBudget);
        data.roughRequestedSceneTriangleBudget = String(prepared.requestedSceneBudget);
        data.roughBaseTriangleCount = String(prepared.baseTriangleCount);
        data.roughSpatialZoneBuildCount = String(roughSpatialZoneBuildCount);
        data.roughBaseTriangulationCount = String(roughBaseTriangulationCount);
        data.roughRebuildCount = String(roughRebuildCount);
        data.surfacePlanBuildCount = String(surfacePlanBuildCount);
        data.roughMeshMode = currentRoughMode;
        data.roughMeshWorker = 'false';
      }
      updateRoughMaterialLod();
      updateTransparentOrder();
      updateRoughDiagnostics();
      if (!interactive) lastLodSignature = adaptiveLodSignature();
      return true;
    } finally {
      rendering = wasRendering;
    }
  }

  function init() {
    if (ready) return Promise.resolve(true);
    if (initPromise) return initPromise;

    host.classList.add('three-loading');
    stats.textContent = 'loading 3D…';

    initPromise = loadDependencies()
      .then((available) => {
        if (!available || !THREE || !OrbitControls) {
          return showUnavailable({
            status: 'dependency unavailable',
            reason: 'dependency',
            detail:
              'Three.js resources could not be loaded. Main, Mask, and Section remain available.',
            warning: '3D dependencies unavailable; continuing without the 3D view.',
            error: dependencyError,
          });
        }

        try {
          renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
        } catch (error) {
          return showUnavailable({
            status: 'WebGL unavailable',
            reason: 'webgl',
            detail:
              'This browser or environment could not create a WebGL context. Main, Mask, and Section remain available.',
            warning: 'WebGL unavailable; continuing without the 3D view.',
            error,
          });
        }

        try {
          preferredPixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
          renderer.setPixelRatio(preferredPixelRatio);
          renderer.setClearColor(0xf5f7f9);

          scene = new THREE.Scene();
          camera = new THREE.PerspectiveCamera(34, 1, 1, 1e9);
          camera.up.set(0, 0, 1);
          camera.position.set(115, -125, 95);

          controls = new OrbitControls(camera, renderer.domElement);
          controls.target.set(0, 0, 0);
          controls.enableDamping = true;
          controls.addEventListener('start', () => {
            interacting = true;
            clearRoughRefineTimer();
            terminateRoughWorker({ invalidate: true });
            const interactionPixelRatio = Math.min(preferredPixelRatio, 1);
            if (Math.abs(renderer.getPixelRatio() - interactionPixelRatio) > 1e-9) {
              renderer.setPixelRatio(interactionPixelRatio);
              resize();
            }
            host.dataset.interactionPixelRatio = String(interactionPixelRatio);
            if (
              roughInteractionCache &&
              roughInteractionCache.sceneGeneration === sceneGeneration
            ) {
              applyRoughMeshResults(
                roughInteractionCache.results,
                roughInteractionCache.diagnostics,
                'interactive',
                null,
                roughInteractionCache.sceneGeneration,
              );
            } else if (roughTasks.length) {
              void requestRoughGeometry('interactive');
            }
            scheduleFrame();
          });
          controls.addEventListener('change', () => {
            if (!interacting) scheduleDetailedRoughBuild();
            scheduleFrame();
          });
          controls.addEventListener('end', () => {
            interacting = false;
            if (Math.abs(renderer.getPixelRatio() - preferredPixelRatio) > 1e-9) {
              renderer.setPixelRatio(preferredPixelRatio);
              resize();
            }
            host.dataset.interactionPixelRatio = String(preferredPixelRatio);
            scheduleDetailedRoughBuild();
            pendingViewState = getViewState();
            onViewChanged(pendingViewState ? structuredClone(pendingViewState) : null);
            scheduleFrame();
          });

          scene.add(new THREE.HemisphereLight(0xffffff, 0x7b8794, 2.25));
          const directional = new THREE.DirectionalLight(0xffffff, 2.2);
          directional.position.set(80, -70, 130);
          scene.add(directional);

          group = new THREE.Group();
          scene.add(group);
          axesHelper = new THREE.AxesHelper(12);
          scene.add(axesHelper);

          host.classList.remove('three-loading', 'three-unavailable');
          delete host.dataset.threeUnavailableReason;
          host.prepend(renderer.domElement);
          new ResizeObserver(resize).observe(host);
          ready = true;
          resize();
          if (!setViewState(pendingViewState)) fit({ notify: false });
          render();
          scheduleFrame();
          return true;
        } catch (error) {
          return showUnavailable({
            status: '3D initialization failed',
            reason: 'initialization',
            detail:
              'The 3D renderer started but could not finish initialization. Main, Mask, and Section remain available.',
            warning: '3D initialization failed; continuing without the 3D view.',
            error,
          });
        }
      })
      .catch((error) =>
        showUnavailable({
          status: '3D initialization failed',
          reason: 'initialization',
          detail:
            'The 3D renderer could not be initialized. Main, Mask, and Section remain available.',
          warning: '3D initialization failed; continuing without the 3D view.',
          error,
        }),
      );

    return initPromise;
  }

  function render() {
    if (!ready) return;
    if (rendering) {
      pendingRender = true;
      return;
    }
    const model = getModel();
    if (!model) return;

    const renderGeneration = ++sceneGeneration;
    pendingRender = false;
    host.dataset.renderState = 'building';
    host.dataset.sceneGeneration = String(renderGeneration);
    host.dataset.modelRevision = String(model.revision ?? 0);
    host.dataset.processRevision = String(model.processRevision ?? 0);
    stats.textContent = 'rebuilding 3D…';

    rendering = true;
    try {
      disposeGroup();
      applyZDisplayState(model);

      const clip = getClipGeometry(),
        inspection = getInspection() || {},
        materialState = inspectionMaterialState(inspection.opacity),
        opacity = materialState.opacity,
        borders = Boolean(inspection.borders),
        plan = buildRenderSurfacePlan(model, clip),
        interfaceState = materialState.transparent
          ? {
              opacity: Math.max(0.035, Math.min(0.34, opacity * 0.42)),
              transparent: true,
              depthTest: true,
              depthWrite: false,
            }
          : null,
        smoothCaps = new Map(),
        sidewalls = new Map();

      surfacePlanBuildCount++;
      if (renderer?.domElement?.dataset) {
        renderer.domElement.dataset.surfacePlanBuildCount = String(surfacePlanBuildCount);
      }
      roughRenderContext = {
        model,
        clip,
        opacity,
        borders,
        sceneGeneration: renderGeneration,
        modelRevision: model.revision ?? 0,
        processRevision: model.processRevision ?? 0,
      };

      const stateFor = (part) => (part.buried ? interfaceState : materialState),
        bucketKey = (part, state) => {
          const base = `${part.layerId}\u0000${part.buried ? 'interface' : 'exterior'}`;
          if (!state?.transparent) return base;
          if (part.type === 'cap') return `${base}\u0000cap\u0000${part.z}\u0000${part.normal}`;
          return `${base}\u0000side\u0000${part.z0}\u0000${part.z1}`;
        },
        pushBucket = (map, part, state) => {
          const key = bucketKey(part, state);
          if (!map.has(key)) map.set(key, { part, items: [] });
          map.get(key).items.push(part);
        };

      for (const cap of plan.caps) {
        if (!zIsVisible(cap.z)) continue;
        const state = stateFor(cap);
        if (!state) continue;
        const layer = layerById(model, cap.layerId);

        if (!cap.appearance) {
          pushBucket(smoothCaps, cap, state);
          continue;
        }

        roughTasks.push({
          kind: 'material',
          cap,
          layer,
          state,
          sortBias: cap.buried ? 12 : 0,
          closeToIdeal: !cap.buried,
          includeBorders: true,
        });
      }

      smoothCapInstanceGroupCount = 0;
      smoothCapInstanceCount = 0;
      smoothCapTemplateTriangleCount = 0;
      for (const bucket of smoothCaps.values()) {
        const state = stateFor(bucket.part),
          visibleCaps = bucket.items.filter((part) => zIsVisible(part.z));
        if (!state || !visibleCaps.length) continue;

        if (!state.transparent) {
          const planes = new Map();
          for (const part of visibleCaps) {
            const key = `${Number(part.z).toPrecision(15)}|${part.normal}`;
            if (!planes.has(key)) {
              planes.set(key, { z: part.z, normal: part.normal, polys: [] });
            }
            planes.get(key).polys.push(...(part.polys || []));
          }
          const preparedPlanes = [...planes.values()].map((plane) => ({
              ...plane,
              instances: translatedPolygonInstanceGroups(plane.polys, { minInstances: 8 }),
            })),
            totalInstances = preparedPlanes.reduce(
              (sum, plane) => sum + plane.instances.instanceCount,
              0,
            );

          if (totalInstances > 0) {
            for (const plane of preparedPlanes) {
              for (const instances of plane.instances.groups) {
                const geometry = geometryFromSolid({
                    slabs: [],
                    caps: [
                      {
                        z: plane.z,
                        normal: plane.normal,
                        polys: [instances.localPoly],
                      },
                    ],
                  }),
                  material = createSurfaceMaterial(layerById(model, bucket.part.layerId), state),
                  meshes = addInstancedSurfaceMeshes(geometry, material, instances.translations, {
                    name: `${bucket.part.layerId || 'material'} repeated cap`,
                  });
                if (!meshes.length) continue;
                smoothCapInstanceGroupCount += meshes.length;
                smoothCapInstanceCount += instances.translations.length;
                smoothCapTemplateTriangleCount += geometry.getAttribute('position')?.count / 3 || 0;
              }

              if (plane.instances.leftovers.length) {
                const geometry = geometryFromSolid({
                    slabs: [],
                    caps: [
                      {
                        z: plane.z,
                        normal: plane.normal,
                        polys: plane.instances.leftovers,
                      },
                    ],
                  }),
                  material = createSurfaceMaterial(layerById(model, bucket.part.layerId), state);
                addSurfaceMesh(geometry, material, state, null, bucket.part.buried ? 10 : 0);
              }
            }
            continue;
          }
        }

        const geometry = geometryFromSolid({
            slabs: [],
            caps: visibleCaps.map((part) => ({
              z: part.z,
              normal: part.normal,
              polys: part.polys,
            })),
          }),
          material = createSurfaceMaterial(layerById(model, bucket.part.layerId), state);
        addSurfaceMesh(geometry, material, state, null, bucket.part.buried ? 10 : 0);
      }
      host.dataset.smoothCapInstanceGroups = String(smoothCapInstanceGroupCount);
      host.dataset.smoothCapInstanceCount = String(smoothCapInstanceCount);
      host.dataset.smoothCapTemplateTriangles = String(Math.round(smoothCapTemplateTriangleCount));

      for (const sidewall of plan.sidewalls) {
        const state = stateFor(sidewall);
        if (!state) continue;
        pushBucket(sidewalls, sidewall, state);
      }
      smoothSidewallInstanceGroupCount = 0;
      smoothSidewallInstanceCount = 0;
      smoothSidewallTemplateTriangleCount = 0;
      for (const bucket of sidewalls.values()) {
        const state = stateFor(bucket.part),
          visibleParts = displaySidewallParts(bucket.items);
        if (!state || !visibleParts.length) continue;

        if (!state.transparent) {
          const instances = translatedSidewallInstanceGroups(visibleParts, { minInstances: 8 });
          if (instances.instanceCount > 0) {
            for (const groupInstances of instances.groups) {
              const geometry = geometryFromSidewallParts([groupInstances.template]),
                material = createSurfaceMaterial(layerById(model, bucket.part.layerId), state),
                meshes = addInstancedSurfaceMeshes(
                  geometry,
                  material,
                  groupInstances.translations,
                  {
                    name: `${bucket.part.layerId || 'material'} repeated sidewall`,
                  },
                );
              if (!meshes.length) continue;
              smoothSidewallInstanceGroupCount += meshes.length;
              smoothSidewallInstanceCount += groupInstances.translations.length;
              smoothSidewallTemplateTriangleCount +=
                geometry.getAttribute('position')?.count / 3 || 0;
            }

            if (instances.leftovers.length) {
              const geometry = geometryFromSidewallParts(instances.leftovers),
                material = createSurfaceMaterial(layerById(model, bucket.part.layerId), state);
              addSurfaceMesh(geometry, material, state, null, bucket.part.buried ? 11 : 0);
            }
            continue;
          }
        }

        const geometry = geometryFromSidewallParts(visibleParts),
          material = createSurfaceMaterial(layerById(model, bucket.part.layerId), state);
        addSurfaceMesh(geometry, material, state, null, bucket.part.buried ? 11 : 0);
      }
      host.dataset.smoothSidewallInstanceGroups = String(smoothSidewallInstanceGroupCount);
      host.dataset.smoothSidewallInstanceCount = String(smoothSidewallInstanceCount);
      host.dataset.smoothSidewallTemplateTriangles = String(
        Math.round(smoothSidewallTemplateTriangleCount),
      );

      if (borders) {
        addBorderPositions(displayBorderPositions(plan.borderLines.flat(2)), {
          order: 100000,
          opacity,
        });
      }

      // Implant is a non-material annotation volume. Opaque inspection still
      // hides buried volume, but an ROI clip creates a real inspection cut face:
      // the clipped sidewall is rendered on top of the material cut with the same
      // surface-to-depth gradient used by Section A–B. Transparent inspection
      // additionally shows the full clipped internal volume.
      const showInternalImplants = materialState.transparent;
      let implantInternalCount = 0,
        implantSurfaceCount = 0,
        implantCutCount = 0,
        implantGradientMeshCount = 0;
      for (const implant of implantSolids(model, clip)) {
        const inspectionSegments = annotationInspectionCutSegments(implant, clip);
        if (!showInternalImplants && !implant.surfaceExposed && !inspectionSegments.length)
          continue;

        const outerNormal = implant.face === 'front' ? 1 : -1,
          appearance =
            implant.surfaceAppearance?.kind === 'rough' ? implant.surfaceAppearance : null,
          followDepthProfile = Boolean(appearance && implant.depthProfile !== 'smooth'),
          sidewallGeometry = (inspectionClip = null) =>
            shearImplantGeometry(
              geometryFromSidewallParts(
                displaySidewallParts(annotationSidewallParts(implant, inspectionClip)),
              ),
              implant,
            );

        if (inspectionSegments.length) {
          const cutState = {
              opacity:
                opacity * (materialState.transparent ? 0.5 : IMPLANT_DEPTH_GRADIENT.outerAlpha),
              transparent: true,
              depthTest: true,
              depthWrite: false,
            },
            cutGeometry = sidewallGeometry(clip),
            cutMaterial = createAnnotationGradientMaterial(implant, cutState, {
              roughness: appearance ? 0.8 : 0.72,
            });
          cutMaterial.polygonOffset = true;
          cutMaterial.polygonOffsetFactor = -2;
          cutMaterial.polygonOffsetUnits = -2;
          cutMaterial.depthFunc = THREE.LessEqualDepth;
          const cut = addSurfaceMesh(cutGeometry, cutMaterial, cutState, null, 46);
          if (cut) {
            cut.name = `${implant.name || implant.implantId || 'Implant'} ROI cut`;
            implantCutCount++;
            implantGradientMeshCount++;
          }
        }

        if (showInternalImplants) {
          const implantState = {
            opacity: opacity * 0.18,
            transparent: true,
            depthTest: true,
            depthWrite: false,
          };
          let bodyGeometry = followDepthProfile
            ? sidewallGeometry()
            : geometryFromSolid(displaySolidForZCollapse(implant));
          if (!followDepthProfile) {
            setAnnotationDepthAttribute(bodyGeometry, implant);
            bodyGeometry = shearImplantGeometry(bodyGeometry, implant);
          }
          const bodyMaterial = createAnnotationGradientMaterial(implant, implantState, {
              roughness: 0.7,
            }),
            body = addSurfaceMesh(bodyGeometry, bodyMaterial, implantState, null, 30);
          if (body) {
            body.name = implant.name || implant.implantId || 'Implant';
            implantInternalCount++;
            implantGradientMeshCount++;
          }

          if (followDepthProfile && zIsVisible(implant.innerZ)) {
            roughTasks.push({
              kind: 'implant-depth',
              cap: {
                type: 'cap',
                layerId: implant.layerId || implant.implantId || 'implant',
                z: implant.innerZ,
                normal: -outerNormal,
                polys: implant.polys,
                appearance,
                profileNormal: outerNormal,
                buried: true,
                solidIndex: 0,
              },
              layer: { color: implant.color || '#D65A6F' },
              state: {
                opacity: opacity * 0.24,
                transparent: true,
                depthTest: true,
                depthWrite: false,
              },
              sortBias: 31,
              closeToIdeal: false,
              includeBorders: false,
              implant,
              name: `${implant.name || implant.implantId || 'Implant'} depth boundary`,
            });
          }
        }

        // A clipped sidewall is not a physical top/bottom surface. In opaque
        // mode it is enough to show the ROI cut; only a genuinely exposed
        // surviving outer face receives the horizontal surface overlay.
        if (!showInternalImplants && !implant.surfaceExposed) continue;

        implantSurfaceCount++;
        const capState = {
            opacity: opacity * 0.3,
            transparent: true,
            depthTest: true,
            depthWrite: false,
          },
          capName = `${implant.name || implant.implantId || 'Implant'} surface`;

        if (appearance && zIsVisible(implant.outerZ)) {
          roughTasks.push({
            kind: 'implant',
            cap: {
              type: 'cap',
              layerId: implant.layerId || implant.implantId || 'implant',
              z: implant.outerZ,
              normal: outerNormal,
              polys: implant.polys,
              appearance,
              profileNormal: outerNormal,
              buried: false,
              solidIndex: 0,
            },
            layer: { color: implant.color || '#D65A6F' },
            state: capState,
            sortBias: 40,
            closeToIdeal: false,
            includeBorders: false,
            implant,
            polygonOffset: true,
            name: capName,
          });
        } else {
          if (!zIsVisible(implant.outerZ)) continue;
          let capGeometry = geometryFromSolid({
            slabs: [],
            caps: [{ z: implant.outerZ, normal: outerNormal, polys: implant.polys }],
          });
          setAnnotationDepthAttribute(
            capGeometry,
            implant,
            annotationDepthFraction(implant, implant.outerZ),
          );
          capGeometry = shearImplantGeometry(capGeometry, implant);
          const capMaterial = createAnnotationGradientMaterial(implant, capState, {
            roughness: 0.72,
          });
          capMaterial.polygonOffset = true;
          capMaterial.polygonOffsetFactor = -1;
          capMaterial.polygonOffsetUnits = -1;
          const cap = addSurfaceMesh(capGeometry, capMaterial, capState, null, 40);
          if (cap) {
            cap.name = capName;
            implantGradientMeshCount++;
          }
        }
      }

      host.dataset.implantInternalCount = String(implantInternalCount);
      host.dataset.implantSurfaceCount = String(implantSurfaceCount);
      host.dataset.implantCutCount = String(implantCutCount);
      host.dataset.implantGradientMeshCount = String(implantGradientMeshCount);
      host.dataset.implantGradient = 'section-depth';

      // Electrical regions are first-class non-material annotations. Their
      // volume is visible through transparent host material; an exposed/cut
      // region may also contribute a restrained surface cap in opaque mode.
      const showInternalElectrical = materialState.transparent;
      let electricalRegionInternalCount = 0,
        electricalRegionSurfaceCount = 0;
      for (const electrical of electricalRegionSolids(model, clip)) {
        if (!showInternalElectrical && !electrical.surfaceExposed) continue;

        const outerNormal = electrical.face === 'front' ? 1 : -1,
          appearance =
            electrical.surfaceAppearance?.kind === 'rough' ? electrical.surfaceAppearance : null,
          followDepthProfile = Boolean(appearance && electrical.depthProfile !== 'smooth');

        if (showInternalElectrical) {
          const electricalState = {
              opacity: opacity * 0.14,
              transparent: true,
              depthTest: true,
              depthWrite: false,
            },
            bodyGeometry = geometryFromSolid(
              displaySolidForZCollapse(
                followDepthProfile ? { slabs: electrical.slabs, caps: [] } : electrical,
              ),
            ),
            bodyMaterial = new THREE.MeshStandardMaterial({
              color: electrical.color || '#7A6FD0',
              roughness: 0.82,
              metalness: 0,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: electricalState.opacity,
              depthTest: true,
              depthWrite: false,
            }),
            body = addSurfaceMesh(bodyGeometry, bodyMaterial, electricalState, null, 34);
          if (body) {
            body.name = electrical.name || electrical.electricalRegionId || 'Electrical Region';
            electricalRegionInternalCount++;
          }

          if (followDepthProfile && zIsVisible(electrical.innerZ)) {
            roughTasks.push({
              kind: 'electrical-depth',
              cap: {
                type: 'cap',
                layerId: electrical.layerId || electrical.electricalRegionId || 'electrical-region',
                z: electrical.innerZ,
                normal: -outerNormal,
                polys: electrical.polys,
                appearance,
                profileNormal: outerNormal,
                buried: true,
                solidIndex: 0,
              },
              layer: { color: electrical.color || '#7A6FD0' },
              state: {
                opacity: opacity * 0.2,
                transparent: true,
                depthTest: true,
                depthWrite: false,
              },
              sortBias: 35,
              closeToIdeal: false,
              includeBorders: false,
              name: `${electrical.name || electrical.electricalRegionId || 'Electrical Region'} depth boundary`,
            });
          }
        }

        electricalRegionSurfaceCount++;
        const capState = {
            opacity: opacity * 0.24,
            transparent: true,
            depthTest: true,
            depthWrite: false,
          },
          capName = `${electrical.name || electrical.electricalRegionId || 'Electrical Region'} surface`;

        if (appearance && zIsVisible(electrical.outerZ)) {
          roughTasks.push({
            kind: 'electrical',
            cap: {
              type: 'cap',
              layerId: electrical.layerId || electrical.electricalRegionId || 'electrical-region',
              z: electrical.outerZ,
              normal: outerNormal,
              polys: electrical.polys,
              appearance,
              profileNormal: outerNormal,
              buried: false,
              solidIndex: 0,
            },
            layer: { color: electrical.color || '#7A6FD0' },
            state: capState,
            sortBias: 44,
            closeToIdeal: false,
            includeBorders: false,
            polygonOffset: true,
            name: capName,
          });
        } else {
          if (!zIsVisible(electrical.outerZ)) continue;
          const capGeometry = geometryFromSolid({
              slabs: [],
              caps: [{ z: electrical.outerZ, normal: outerNormal, polys: electrical.polys }],
            }),
            capMaterial = createSurfaceMaterial({ color: electrical.color || '#7A6FD0' }, capState);
          capMaterial.polygonOffset = true;
          capMaterial.polygonOffsetFactor = -1;
          capMaterial.polygonOffsetUnits = -1;
          const cap = addSurfaceMesh(capGeometry, capMaterial, capState, null, 44);
          if (cap) cap.name = capName;
        }
      }

      host.dataset.electricalRegionInternalCount = String(electricalRegionInternalCount);
      host.dataset.electricalRegionSurfaceCount = String(electricalRegionSurfaceCount);
      updateTransparentOrder();
      if (!roughTasks.length) {
        host.dataset.renderState = 'ready';
        stats.textContent = hasMaterial(model) ? (clip ? 'ROI' : 'full model') : 'no material';
      }
    } finally {
      rendering = false;
    }

    if (pendingRender) {
      queueMicrotask(() => {
        if (!rendering && pendingRender) render();
      });
      scheduleFrame();
      return;
    }

    if (roughTasks.length) {
      host.dataset.renderState = 'refining';
      void requestRoughGeometry('interactive', { refineAfter: true });
    }
    scheduleFrame();
  }

  function fit({ notify = true } = {}) {
    if (!ready || !camera || !controls || !axesHelper) return;
    const model = getModel();
    if (!model) return;

    const zState = applyZDisplayState(model) || zDisplayState(model),
      zScale = zState.scale,
      zSpan = zState.displaySpan * zScale,
      clipBounds = xyBounds(getClipGeometry()),
      modelBounds = {
        minX: -model.width / 2,
        minY: -model.height / 2,
        maxX: model.width / 2,
        maxY: model.height / 2,
      },
      visibleBounds = clipBounds
        ? {
            minX: Math.max(modelBounds.minX, clipBounds.minX),
            minY: Math.max(modelBounds.minY, clipBounds.minY),
            maxX: Math.min(modelBounds.maxX, clipBounds.maxX),
            maxY: Math.min(modelBounds.maxY, clipBounds.maxY),
          }
        : modelBounds,
      validVisibleBounds =
        visibleBounds.maxX > visibleBounds.minX && visibleBounds.maxY > visibleBounds.minY,
      fitBounds = validVisibleBounds ? visibleBounds : modelBounds,
      spanX = fitBounds.maxX - fitBounds.minX,
      spanY = fitBounds.maxY - fitBounds.minY,
      centerX = (fitBounds.minX + fitBounds.maxX) / 2,
      centerY = (fitBounds.minY + fitBounds.maxY) / 2,
      size = Math.max(spanX, spanY, zSpan);

    const halfFov = (camera.fov * Math.PI) / 360;
    const limitingAngle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect));
    const radius = Math.max(1e-9, Math.hypot(spanX / 2, spanY / 2, zSpan / 2));
    const distance = (radius / Math.sin(limitingAngle)) * 1.12;
    camera.near = Math.max(1e-6, radius / 200);
    camera.far = Math.max(camera.near * 1000, distance + radius * 20);
    camera.updateProjectionMatrix();
    controls.target.set(centerX, centerY, ((zState.displayMin + zState.displayMax) / 2) * zScale);
    camera.position.copy(
      new THREE.Vector3(1.05, -1.15, 0.82)
        .normalize()
        .multiplyScalar(distance)
        .add(controls.target),
    );
    controls.update();
    axesHelper.scale.setScalar(Math.max(0.6, size / 100));
    pendingViewState = getViewState();
    if (notify) onViewChanged(pendingViewState ? structuredClone(pendingViewState) : null);
    scheduleFrame();
  }

  async function exportGlb({ signal = null, onProgress = null } = {}) {
    if (!ready || !THREE) throw new Error('3D view is unavailable.');
    const model = getModel();
    if (!model) throw new Error('No model to export.');

    const throwIfAborted = () => {
        if (signal?.aborted) throw new DOMException('GLB export cancelled.', 'AbortError');
      },
      reportProgress = (progress, label = '') => {
        throwIfAborted();
        if (typeof onProgress === 'function') {
          onProgress(Math.max(0, Math.min(1, Number(progress) || 0)), label);
        }
      },
      yieldToUi = async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        throwIfAborted();
      },
      buildExportRoughMeshData = (tasks) => {
        if (!tasks.length) return Promise.resolve(new Map());

        let worker;
        try {
          const workerUrl = new URL('./rough-mesh-worker.js', import.meta.url),
            currentModuleUrl = new URL(import.meta.url);
          workerUrl.search = currentModuleUrl.search;
          worker = new Worker(workerUrl);
        } catch (error) {
          console.warn('GLB morphology worker unavailable; using synchronous fallback.', error);
          return Promise.resolve(null);
        }

        const id = 'glb-export',
          generation = 1,
          payload = tasks.map((task, taskId) => ({
            taskId,
            geometry: {
              z: task.cap.z,
              normal: task.cap.normal,
              appearance: task.cap.appearance,
              closeToIdeal: !task.cap.buried,
              sidewallBoundaryIntervals: task.cap.sidewallBoundaryIntervals,
              profileNormal: task.cap.profileNormal,
              lodZones: task.lodZones.map((zone) => ({
                baseTriangles: zone.baseTriangles,
                maxEdge: zone.maxEdge,
                edges: zone.edges,
                lodContext: zone.lodContext,
                triangleBudget: zone.triangleBudget,
              })),
            },
          }));

        return new Promise((resolve, reject) => {
          let settled = false;
          const finish = () => {
              if (settled) return false;
              settled = true;
              signal?.removeEventListener?.('abort', onAbort);
              worker.terminate();
              return true;
            },
            onAbort = () => {
              if (!finish()) return;
              reject(new DOMException('GLB export cancelled.', 'AbortError'));
            };

          signal?.addEventListener?.('abort', onAbort, { once: true });
          if (signal?.aborted) {
            onAbort();
            return;
          }

          worker.onmessage = (event) => {
            const message = event.data || {};
            if (message.id !== id || message.generation !== generation || settled) return;
            if (message.type === 'progress') {
              const total = Math.max(1, Number(message.total) || tasks.length),
                completed = Math.max(0, Number(message.completed) || 0);
              reportProgress(0.1 + 0.46 * Math.min(1, completed / total), 'Building morphology');
              return;
            }
            if (message.type === 'error') {
              if (!finish()) return;
              reject(new Error(message.message || 'Morphology worker failed.'));
              return;
            }
            if (message.type !== 'done') return;

            const byCap = new Map();
            for (const result of message.results || []) {
              const task = tasks[result.taskId];
              if (task?.cap && result.data) byCap.set(task.cap, result.data);
            }
            if (!finish()) return;
            resolve(byCap);
          };

          worker.onerror = (event) => {
            if (!finish()) return;
            reject(new Error(event.message || 'Morphology worker failed.'));
          };

          try {
            worker.postMessage({ id, generation, tasks: payload, reportProgress: true });
          } catch (error) {
            if (!finish()) return;
            reject(error);
          }
        });
      };

    reportProgress(0, 'Preparing exporter');
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    throwIfAborted();

    const exportGroup = new THREE.Group(),
      disposable = [];
    exportGroup.name = 'WaferCAD';
    // glTF uses metres. Canonical WaferCAD geometry is stored in micrometres.
    exportGroup.scale.setScalar(1e-6);

    const exportMaterial = (layer) =>
        new THREE.MeshStandardMaterial({
          color: layer?.color || '#999',
          roughness: 0.78,
          metalness: 0.015,
          side: THREE.DoubleSide,
        }),
      addExportMesh = (geometry, layerId, suffix = '') => {
        if (!geometry?.getAttribute?.('position')?.count) {
          geometry?.dispose?.();
          return null;
        }
        const layer = layerById(model, layerId),
          material = exportMaterial(layer),
          mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${layer?.name || layerId || 'Layer'}${suffix}`;
        exportGroup.add(mesh);
        disposable.push(mesh);
        return mesh;
      };

    try {
      reportProgress(0.04, 'Resolving surface ownership');
      const clip = getClipGeometry(),
        surfacePlan = buildRenderSurfacePlan(model, clip),
        roughCaps = surfacePlan.caps.filter((cap) => cap.appearance?.kind === 'rough');

      await yieldToUi();
      reportProgress(0.08, 'Allocating morphology mesh');
      const roughTasks = prepareMorphologyExportTasks(THREE, roughCaps),
        capCount = Math.max(1, surfacePlan.caps.length);
      let roughMeshDataByCap = null;
      try {
        roughMeshDataByCap = await buildExportRoughMeshData(roughTasks);
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        console.warn('GLB morphology worker failed; using synchronous fallback.', error);
      }
      throwIfAborted();

      // Export the same topology-owned surface plan used by the interactive 3D
      // renderer. Rough/Pyramid caps use a deterministic, camera-independent
      // mesh policy, so GLB does not fall back to ideal flat canonical caps.
      for (let capIndex = 0; capIndex < surfacePlan.caps.length; capIndex++) {
        throwIfAborted();
        const cap = surfacePlan.caps[capIndex];
        if (cap.appearance?.kind === 'rough') {
          const task = roughTasks.find((entry) => entry.cap === cap),
            meshData = roughMeshDataByCap?.get(cap) || null;
          if (task?.lodZones?.length) {
            if (!meshData) await yieldToUi();
            const geometry = meshData
              ? geometryFromRoughMeshData(THREE, meshData)
              : geometryFromRoughCap(THREE, {
                  z: cap.z,
                  normal: cap.normal,
                  polys: cap.polys,
                  appearance: cap.appearance,
                  closeToIdeal: !cap.buried,
                  sidewallBoundaryIntervals: cap.sidewallBoundaryIntervals,
                  profileNormal: cap.profileNormal,
                  lodZones: task.lodZones,
                });
            const roughBorderVertexCount = Math.floor(
              (geometry.userData?.roughBorderPositions?.length || 0) / 3,
            );
            // Renderer-only LOD/debug metadata can include large typed arrays.
            // Keep GLB extras compact and publish only the stable export contract
            // on the mesh itself.
            geometry.userData = {};
            const mesh = addExportMesh(geometry, cap.layerId, ' · morphology');
            if (mesh) {
              mesh.userData.wafercadMorphology = cap.appearance.morphology || 'rough';
              mesh.userData.wafercadMorphologySeed = Number(cap.appearance.seed) >>> 0;
              mesh.userData.wafercadMorphologyFeatureSizeUm =
                Number(cap.appearance.featureSize) || 0;
              mesh.userData.wafercadMorphologyPolarity = cap.appearance.polarity || 'normal';
              mesh.userData.wafercadBuriedInterface = Boolean(cap.buried);
              mesh.userData.wafercadLayerId = cap.layerId || null;
              mesh.userData.wafercadSurfaceOwnership = cap.ownership || 'exterior';
              mesh.userData.wafercadInterfaceLayerId = cap.interfaceLayerId || null;
              mesh.userData.wafercadSurfaceFace = cap.face || (cap.normal > 0 ? 'front' : 'back');
              mesh.userData.wafercadSurfaceZUm = Number(cap.z) || 0;
              mesh.userData.wafercadRoughBorderVertexCount = roughBorderVertexCount;
            }
          }
        } else {
          const mesh = addExportMesh(
            geometryFromSolid({
              slabs: [],
              caps: [{ z: cap.z, normal: cap.normal, polys: cap.polys }],
            }),
            cap.layerId,
          );
          if (mesh) {
            mesh.userData.wafercadLayerId = cap.layerId || null;
            mesh.userData.wafercadSurfaceOwnership = cap.ownership || 'exterior';
            mesh.userData.wafercadInterfaceLayerId = cap.interfaceLayerId || null;
            mesh.userData.wafercadBuriedInterface = Boolean(cap.buried);
            mesh.userData.wafercadSurfaceFace = cap.face || (cap.normal > 0 ? 'front' : 'back');
            mesh.userData.wafercadSurfaceZUm = Number(cap.z) || 0;
          }
        }
        reportProgress(0.58 + 0.2 * ((capIndex + 1) / capCount), 'Building surfaces');
      }

      throwIfAborted();
      const sidewallsByLayer = new Map();
      for (const sidewall of surfacePlan.sidewalls) {
        if (!sidewallsByLayer.has(sidewall.layerId)) sidewallsByLayer.set(sidewall.layerId, []);
        sidewallsByLayer.get(sidewall.layerId).push(sidewall);
      }

      let sidewallIndex = 0;
      const sidewallGroupCount = Math.max(1, sidewallsByLayer.size);
      for (const [layerId, parts] of sidewallsByLayer) {
        throwIfAborted();
        addExportMesh(geometryFromSidewallParts(parts), layerId, ' · sidewalls');
        sidewallIndex++;
        reportProgress(0.79 + 0.1 * (sidewallIndex / sidewallGroupCount), 'Building sidewalls');
        if (sidewallIndex % 2 === 0) await yieldToUi();
      }

      await yieldToUi();
      reportProgress(0.91, 'Encoding GLB');
      const exporter = new GLTFExporter();
      const result = await new Promise((resolve, reject) =>
        exporter.parse(exportGroup, resolve, reject, {
          binary: true,
          onlyVisible: true,
          trs: false,
        }),
      );
      throwIfAborted();
      reportProgress(1, 'Complete');
      return new Blob([result], { type: 'model/gltf-binary' });
    } finally {
      for (const object of disposable) {
        object.geometry?.dispose();
        object.material?.dispose();
      }
    }
  }

  async function capturePng(scale = 3) {
    if (!ready || !renderer || !scene || !camera) throw new Error('3D view is unavailable.');
    const rect = host.getBoundingClientRect(),
      oldPixelRatio = renderer.getPixelRatio(),
      multiplier = Math.max(1, Math.min(4, Number(scale) || 3)),
      width = Math.max(2, rect.width),
      height = Math.max(2, rect.height),
      captureRenderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });

    captureRenderer.setPixelRatio(multiplier);
    captureRenderer.setSize(width, height, false);
    captureRenderer.setClearColor(0xf5f7f9);
    captureRenderer.outputColorSpace = renderer.outputColorSpace;
    captureRenderer.toneMapping = renderer.toneMapping;
    captureRenderer.toneMappingExposure = renderer.toneMappingExposure;

    // The main renderer's pixel ratio feeds adaptive rough LOD decisions. Raise
    // it for the capture build without retaining a persistent drawing buffer.
    renderer.setPixelRatio(multiplier);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    await requestRoughGeometry('detailed', { force: true });
    try {
      captureRenderer.render(scene, camera);
      return await new Promise((resolve, reject) =>
        captureRenderer.domElement.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('PNG capture failed.'))),
          'image/png',
        ),
      );
    } finally {
      captureRenderer.dispose();
      renderer.setPixelRatio(oldPixelRatio);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      await requestRoughGeometry('detailed', { force: true });
      scheduleFrame();
    }
  }

  return {
    init,
    render,
    fit,
    getViewState,
    setViewState,
    updateZCollapse,
    exportGlb,
    capturePng,
    get ready() {
      return ready;
    },
  };
}
