import { isArrayModel, resolveArrayModel, geometryBounds, arrayParts } from './model-array.js';
import { annotationDepthFraction, IMPLANT_DEPTH_GRADIENT } from './annotation-rendering.js';
import { threeRenderPolicy } from './render-quality-policy.js';
import {
  electricalDisplaySolidForLod,
  transparentArrayPresentationLod,
} from './transparent-array-lod.js';
import { canRenderPlanarCapInSinglePass } from './transparent-pass-policy.js';
import { buriedInterfaceSubpixelBudget } from './renderer-v3-screen-budget.js';
import { sampleBuriedInterfaceProjection } from './renderer-v3-projection-probe.js';
import { buriedInterfaceTileBounds } from './renderer-v3-tile-bounds.js';
import { buriedInterfaceEdgeTileSurvey } from './renderer-v3-edge-tile-survey.js';
import { appendIndexedSmoothWallQuad, canIndexSmoothSidewallParts } from './renderer-smooth-wall-index.js';
import { hasMaterial, layerById, modelBoundsZ } from './model.js';
import {
  annotationInspectionCutSegments,
  electricalRegionSolids,
  implantSolids,
} from './model-view-geometry.js';
import { buildRenderSurfacePlan } from './renderer-geometry.js';
import { createDerivedDataCache } from './renderer-derived-cache.js';
import {
  mergeCollinearSidewallParts,
  reduceCollinearClosedRing,
  simplifyDisplayPolygons,
  simplifyDisplaySidewallParts,
} from './renderer-line-reduction.js';
import { canUseGpuRoughTask, decorateGpuRoughMaterial } from './gpu-rough-surface.js';
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

const RENDER_EDGE_EPSILON_UM = 1e-4;

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

  const smoothCapDerivedDataCache = createDerivedDataCache();

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
  let lastTransparencySort = -Infinity;
  let transparencyOrderDirty = true;
  let presentationObjects = new Set();
  let surfaceMaterialPool = new Map();
  let presentationUpdateCount = 0;
  let physicalSceneModel = null;
  let physicalSceneSignature = null;
  let physicalSurfacePlan = null;
  let activeSceneVariant = null;
  let sceneVariantCache = new Map();

  function renderPolicy(interactive = interacting) {
    return threeRenderPolicy({ fast: getInspection()?.fast !== false, interactive });
  }

  function syncRenderPolicy() {
    const policy = renderPolicy();
    host.dataset.renderQuality = policy.mode;
    if (renderer?.domElement) renderer.domElement.dataset.renderQuality = policy.mode;
    const ratio = Math.min(preferredPixelRatio, policy.maxPixelRatio);
    host.dataset.presentationPixelRatio = String(ratio);
    host.dataset.fullWaferTransparencyLod = 'false';
    if (renderer && Math.abs(renderer.getPixelRatio() - ratio) > 1e-9) {
      renderer.setPixelRatio(ratio);
      resize();
    }
  }

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
    updateCameraClipping(getModel());
    controls.update();
    refreshCameraArrayLod();
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

  function updateCameraClipping(model, zState = null) {
    if (!camera || !controls || !model) return;
    zState ||= zDisplayState(model);
    const bounds = visibleBounds(model, getClipGeometry()),
      radius = Math.max(
        1e-9,
        Math.hypot(
          (bounds.maxX - bounds.minX) / 2,
          (bounds.maxY - bounds.minY) / 2,
          (zState.displaySpan * zState.scale) / 2,
        ),
      ),
      distance = camera.position.distanceTo(controls.target);
    camera.near = Math.max(1e-6, Math.min(radius / 200, distance / 200));
    camera.far = Math.max(camera.near * 1000, distance + radius * 20);
    camera.updateProjectionMatrix();
    axesHelper?.scale.setScalar(
      Math.max(
        0.6,
        Math.max(
          bounds.maxX - bounds.minX,
          bounds.maxY - bounds.minY,
          zState.displaySpan * zState.scale,
        ) / 100,
      ),
    );
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
      bounds = visibleBounds(model, getClipGeometry()),
      xySpan = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1e-12),
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
    return `${renderPolicy(false).mode}:${scaleBucket}:${azimuthBucket}:${elevationBucket}:${widthBucket}:${heightBucket}:${targetXBucket}:${targetYBucket}`;
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
        lod = roughLod(featurePixels),
        gpuRough = entry.material.userData?.waferCadGpuRough;
      entry.material.roughness = 0.82 + 0.12 * lod.detail;
      if (gpuRough?.uniforms?.waferCadRoughNormalStrength) {
        gpuRough.uniforms.waferCadRoughNormalStrength.value =
          (Number(gpuRough.normalStrengthBase) || 0) * lod.micro;
      }
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

  let completedFrameSerial = 0;
  function scheduleFrame() {
    if (!renderer || frame != null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      // OrbitControls damping keeps scheduling frames after pointer-up.
      // A full-wafer exact transparent array can cost tens of seconds per
      // software-WebGL frame; repeating these frames starves input handling.
      // Retain drag interaction but stop inertial redraws at this costly tier.
      const heavyExactTransparency =
        host.dataset.sceneVariant === 'transparent' &&
        host.dataset.transparentArrayLodTier === 'exact' &&
        Number(host.dataset.arrayInstances || 0) >= 64;
      if (controls) controls.enableDamping = !heavyExactTransparency;
      host.dataset.cameraDampingEnabled = String(Boolean(controls?.enableDamping));
      const changed = controls?.update?.() || false;
      updateRoughMaterialLod();
      updateTransparentOrder();
      const frameStartedAt = performance.now();
      renderer.render(scene, camera);
      // Ready/assembly flags can be set before the first WebGL frame. This
      // sequence is committed only after renderer.render actually returns.
      // CI additionally waits for compositor presentation when profiling.
      completedFrameSerial++;
      host.dataset.rendererFrameSerial = String(completedFrameSerial);
      host.dataset.rendererFrameMs = String(performance.now() - frameStartedAt);
      host.dataset.rendererDrawCalls = String(renderer.info?.render?.calls || 0);
      host.dataset.rendererDrawTriangles = String(renderer.info?.render?.triangles || 0);
      if (interacting || changed) scheduleFrame();
    });
  }

  async function yieldSceneAssembly() {
    scheduleFrame();
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function resize() {
    if (!renderer) return;
    const rect = host.getBoundingClientRect();
    renderer.setSize(Math.max(2, rect.width), Math.max(2, rect.height), false);
    camera.aspect = Math.max(2, rect.width) / Math.max(2, rect.height);
    camera.updateProjectionMatrix();
    if (!interacting) {
      scheduleDetailedRoughBuild();
      refreshCameraArrayLod();
    }
    scheduleFrame();
  }

  function disposeGroup() {
    if (!group) return;
    clearRoughRefineTimer();
    terminateRoughWorker({ invalidate: true });
    roughInteractionCache = null;
    transparencyOrderDirty = true;
    lastTransparencySort = -Infinity;
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
    presentationObjects = new Set();
    surfaceMaterialPool = new Map();
    clearSceneVariantCache();
    activeSceneVariant = null;
    physicalSceneModel = null;
    physicalSceneSignature = null;
    physicalSurfacePlan = null;
  }

  function presentationMode(inspection = getInspection?.() || {}) {
    return Number(inspection.opacity) < 0.999 ? 'transparent' : 'opaque';
  }

  function arrayViewLod(model, clip, inspection = {}) {
    const viewport = currentViewport(),
      distance = camera && controls ? camera.position.distanceTo(controls.target) : 0,
      unitsPerPixel =
        camera && distance > 0
          ? (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / viewport.height
          : 0;
    return transparentArrayPresentationLod({
      // The scene signature must not depend on Opacity: opaque/transparent
      // presentation variants share their canonical surface-plan cache.
      transparent: true,
      fast: inspection.fast !== false,
      clipped: Boolean(clip),
      instanceCount: isArrayModel(model) ? model.array?.instances?.length || 0 : 0,
      unitsPerPixel,
      viewZFraction:
        camera && distance > 0 ? Math.abs(camera.position.z - controls.target.z) / distance : 1,
    });
  }

  function snapshotSceneVariant(mode = activeSceneVariant) {
    if (!mode || !group) return null;
    return {
      mode,
      group,
      zDisplayObjects,
      currentZDisplay,
      roughMeshes,
      roughTasks,
      roughOwnedObjects,
      roughRenderContext,
      roughInteractionCache,
      transparentMeshes,
      presentationObjects,
      surfaceMaterialPool,
      currentRoughMode,
      lastLodSignature,
      arrayLodTier: host.dataset.transparentArrayLodTier || 'exact',
      arrayLodTolerance: host.dataset.transparentArrayDisplayTolerance || '0',
      electricalFarLodBodyCount: host.dataset.electricalFarLodBodyCount || '0',
      v3EdgeSurvey: {
        status: host.dataset.v3EdgeSurveyStatus || 'not-measured',
        gate: host.dataset.v3EdgeSurveyGate || 'not-far',
        owners: host.dataset.v3EdgeSurveyOwners || '0',
        bounds: host.dataset.v3EdgeSurveyBounds || '0',
        subpixel: host.dataset.v3EdgeSurveySubpixel || '0',
        uncertain: host.dataset.v3EdgeSurveyUncertain || '0',
        overflow: host.dataset.v3EdgeSurveyOverflow || '0',
        raw: host.dataset.v3EdgeSurveyRawUpperBound || '0',
        candidateRaw: host.dataset.v3EdgeSurveySubpixelRawUpperBound || '0',
        elapsedMs: host.dataset.v3EdgeSurveyMs || '0',
        topOwners: host.dataset.v3EdgeSurveyTopOwners || '[]',
      },
      v3TileProbe: {
        status: host.dataset.v3TileBoundStatus || 'not-sampled',
        gate: host.dataset.v3TileReductionGate || 'not-far',
        owners: host.dataset.v3TileBoundOwners || '0',
        tiles: host.dataset.v3TileBoundTiles || '0',
        subpixel: host.dataset.v3TileSubpixelBounds || '0',
        offscreen: host.dataset.v3TileOffscreenBounds || '0',
        uncertain: host.dataset.v3TileUncertainBounds || '0',
        ownerOverflow: host.dataset.v3TileOwnerOverflow || '0',
        tileOverflow: host.dataset.v3TileBoundOverflow || '0',
        topOwners: host.dataset.v3TileBoundTopOwners || '[]',
      },
      v3ProjectionProbe: {
        status: host.dataset.v3ProjectionStatus || 'not-sampled',
        owners: host.dataset.v3ProjectionOwners || '0',
        quads: host.dataset.v3ProjectionSampleQuads || '0',
        projected: host.dataset.v3ProjectionVisibleQuads || '0',
        subpixel: host.dataset.v3ProjectionSubpixelQuads || '0',
        offscreen: host.dataset.v3ProjectionOffscreenQuads || '0',
        rawTriangles: host.dataset.v3ProjectionRawTriangleUpperBound || '0',
        topOwners: host.dataset.v3ProjectionTopOwners || '[]',
      },
      v3SubpixelProbe: {
        mode: host.dataset.v3ScreenBudgetMode || 'observe-only',
        qualified: host.dataset.v3ScreenBudgetQualified || 'false',
        reason: host.dataset.v3ScreenBudgetReason || 'unmeasured',
        candidates: host.dataset.v3SubpixelWallCandidates || '0',
        instances: host.dataset.v3SubpixelWallInstances || '0',
        rawTriangles: host.dataset.v3SubpixelRawTriangleEstimate || '0',
        skipped: host.dataset.v3SkippedTriangles || '0',
      },
      model: physicalSceneModel,
      signature: physicalSceneSignature,
    };
  }

  function disposeSceneGroup(targetGroup) {
    if (!targetGroup) return;
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    for (const object of targetGroup.children || []) {
      if (object.geometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) {
        if (!material) continue;
        materials.add(material);
        if (material.bumpMap) textures.add(material.bumpMap);
      }
    }
    targetGroup.clear();
    for (const geometry of geometries) geometry.dispose?.();
    for (const texture of textures) texture.dispose?.();
    for (const material of materials) material.dispose?.();
  }

  function cacheActiveSceneVariant() {
    if (!activeSceneVariant || !group) return;
    sceneVariantCache.set(activeSceneVariant, snapshotSceneVariant(activeSceneVariant));
  }

  function restoreSceneVariant(entry) {
    if (!entry?.group || !scene) return false;
    if (group && group !== entry.group) scene.remove(group);
    group = entry.group;
    group.visible = true;
    if (group.parent !== scene) scene.add(group);
    zDisplayObjects = entry.zDisplayObjects;
    currentZDisplay = entry.currentZDisplay;
    roughMeshes = entry.roughMeshes;
    roughTasks = entry.roughTasks;
    roughOwnedObjects = entry.roughOwnedObjects;
    roughRenderContext = entry.roughRenderContext;
    roughInteractionCache = entry.roughInteractionCache;
    transparentMeshes = entry.transparentMeshes;
    presentationObjects = entry.presentationObjects;
    surfaceMaterialPool = entry.surfaceMaterialPool;
    currentRoughMode = entry.currentRoughMode;
    lastLodSignature = entry.lastLodSignature;
    physicalSceneModel = entry.model;
    physicalSceneSignature = entry.signature;
    activeSceneVariant = entry.mode;
    host.dataset.sceneVariant = entry.mode;
    host.dataset.transparentArrayLodTier = entry.arrayLodTier || 'exact';
    host.dataset.transparentArrayDisplayTolerance = entry.arrayLodTolerance || '0';
    host.dataset.fullWaferTransparencyLod = String(entry.arrayLodTier !== 'exact');
    host.dataset.electricalFarLodBodyCount = entry.electricalFarLodBodyCount || '0';
    host.dataset.v3ScreenBudgetMode = entry.v3SubpixelProbe?.mode || 'observe-only';
    host.dataset.v3ScreenBudgetQualified = entry.v3SubpixelProbe?.qualified || 'false';
    host.dataset.v3ScreenBudgetReason = entry.v3SubpixelProbe?.reason || 'unmeasured';
    host.dataset.v3SubpixelWallCandidates = entry.v3SubpixelProbe?.candidates || '0';
    host.dataset.v3SubpixelWallInstances = entry.v3SubpixelProbe?.instances || '0';
    host.dataset.v3SubpixelRawTriangleEstimate = entry.v3SubpixelProbe?.rawTriangles || '0';
    host.dataset.v3SkippedTriangles = entry.v3SubpixelProbe?.skipped || '0';
    host.dataset.v3ProjectionStatus = entry.v3ProjectionProbe?.status || 'not-sampled';
    host.dataset.v3ProjectionOwners = entry.v3ProjectionProbe?.owners || '0';
    host.dataset.v3ProjectionSampleQuads = entry.v3ProjectionProbe?.quads || '0';
    host.dataset.v3ProjectionVisibleQuads = entry.v3ProjectionProbe?.projected || '0';
    host.dataset.v3ProjectionSubpixelQuads = entry.v3ProjectionProbe?.subpixel || '0';
    host.dataset.v3ProjectionOffscreenQuads = entry.v3ProjectionProbe?.offscreen || '0';
    host.dataset.v3ProjectionRawTriangleUpperBound =
      entry.v3ProjectionProbe?.rawTriangles || '0';
    host.dataset.v3ProjectionTopOwners = entry.v3ProjectionProbe?.topOwners || '[]';
    host.dataset.v3TileBoundStatus = entry.v3TileProbe?.status || 'not-sampled';
    host.dataset.v3TileReductionGate = entry.v3TileProbe?.gate || 'not-far';
    host.dataset.v3TileBoundOwners = entry.v3TileProbe?.owners || '0';
    host.dataset.v3TileBoundTiles = entry.v3TileProbe?.tiles || '0';
    host.dataset.v3TileSubpixelBounds = entry.v3TileProbe?.subpixel || '0';
    host.dataset.v3TileOffscreenBounds = entry.v3TileProbe?.offscreen || '0';
    host.dataset.v3TileUncertainBounds = entry.v3TileProbe?.uncertain || '0';
    host.dataset.v3TileOwnerOverflow = entry.v3TileProbe?.ownerOverflow || '0';
    host.dataset.v3TileBoundOverflow = entry.v3TileProbe?.tileOverflow || '0';
    host.dataset.v3TileBoundTopOwners = entry.v3TileProbe?.topOwners || '[]';
    host.dataset.v3EdgeSurveyStatus = entry.v3EdgeSurvey?.status || 'not-measured';
    host.dataset.v3EdgeSurveyGate = entry.v3EdgeSurvey?.gate || 'not-far';
    host.dataset.v3EdgeSurveyOwners = entry.v3EdgeSurvey?.owners || '0';
    host.dataset.v3EdgeSurveyBounds = entry.v3EdgeSurvey?.bounds || '0';
    host.dataset.v3EdgeSurveySubpixel = entry.v3EdgeSurvey?.subpixel || '0';
    host.dataset.v3EdgeSurveyUncertain = entry.v3EdgeSurvey?.uncertain || '0';
    host.dataset.v3EdgeSurveyOverflow = entry.v3EdgeSurvey?.overflow || '0';
    host.dataset.v3EdgeSurveyRawUpperBound = entry.v3EdgeSurvey?.raw || '0';
    host.dataset.v3EdgeSurveySubpixelRawUpperBound = entry.v3EdgeSurvey?.candidateRaw || '0';
    host.dataset.v3EdgeSurveyMs = entry.v3EdgeSurvey?.elapsedMs || '0';
    host.dataset.v3EdgeSurveyTopOwners = entry.v3EdgeSurvey?.topOwners || '[]';
    return true;
  }

  function startSceneVariantBuild(mode) {
    cacheActiveSceneVariant();
    if (group) scene.remove(group);
    group = new THREE.Group();
    group.visible = false;
    scene.add(group);
    zDisplayObjects = new Set();
    currentZDisplay = null;
    roughMeshes = [];
    roughTasks = [];
    roughOwnedObjects = new Set();
    roughRenderContext = null;
    roughInteractionCache = null;
    transparentMeshes = [];
    presentationObjects = new Set();
    surfaceMaterialPool = new Map();
    currentRoughMode = 'none';
    lastLodSignature = null;
    activeSceneVariant = mode;
    host.dataset.sceneVariant = mode;
  }

  function clearSceneVariantCache({ includeActive = false } = {}) {
    const activeGroup = group;
    for (const entry of sceneVariantCache.values()) {
      if (!entry?.group) continue;
      if (!includeActive && entry.group === activeGroup) continue;
      if (entry.group.parent) entry.group.parent.remove(entry.group);
      disposeSceneGroup(entry.group);
    }
    sceneVariantCache = new Map();
    if (includeActive) activeSceneVariant = null;
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

  function sceneSignature(model, clip, inspection = getInspection() || {}) {
    const layers = (model?.layers || []).map((layer) => [
      layer?.id ?? null,
      layer?.color ?? null,
      layer?.visible ?? null,
      layer?.hidden ?? null,
    ]);
    return JSON.stringify({
      revision: model?.revision ?? 0,
      processRevision: model?.processRevision ?? 0,
      fast: inspection?.fast !== false,
      clip: clip || null,
      zCollapse: getZCollapse?.() || null,
      layers,
      arrayPresentationLod: arrayViewLod(model, clip, inspection).tier,
    });
  }

  function refreshCameraArrayLod() {
    const model = getModel(),
      inspection = getInspection() || {};
    if (
      !ready ||
      !model ||
      !physicalSceneSignature ||
      !isArrayModel(model) ||
      presentationMode(inspection) !== 'transparent'
    )
      return;
    if (sceneSignature(model, getClipGeometry(), inspection) !== physicalSceneSignature) {
      // Only tier transitions rebuild the scene; ordinary orbit movement
      // continues to reuse both opaque and transparent presentation variants.
      void render();
    }
  }

  function interfaceMaterialState(opacity) {
    return {
      opacity: Math.max(0.035, Math.min(0.34, opacity * 0.42)),
      transparent: true,
      depthTest: true,
      depthWrite: false,
    };
  }

  function presentationState(descriptor, inspection = getInspection() || {}) {
    const materialState = inspectionMaterialState(inspection.opacity),
      opacity = materialState.opacity,
      transparent = materialState.transparent,
      alwaysTransparent = (value) => ({
        opacity: Math.max(0, Math.min(1, value)),
        transparent: true,
        depthTest: true,
        depthWrite: false,
      });
    switch (descriptor?.kind) {
      case 'material-interface':
        return {
          visible: transparent,
          materialState: interfaceMaterialState(opacity),
          transparentSort: true,
        };
      case 'border':
        return {
          visible: Boolean(inspection.borders),
          materialState: {
            opacity: transparent ? 0.46 : 1,
            transparent,
            depthTest: true,
            depthWrite: false,
          },
          transparentSort: false,
        };
      case 'implant-cut':
        return {
          visible: true,
          materialState: alwaysTransparent(
            opacity * (transparent ? 0.5 : IMPLANT_DEPTH_GRADIENT.outerAlpha),
          ),
          transparentSort: true,
        };
      case 'implant-internal':
        return {
          visible: transparent,
          materialState: alwaysTransparent(opacity * 0.18),
          transparentSort: true,
        };
      case 'implant-depth':
        return {
          visible: transparent,
          materialState: alwaysTransparent(opacity * 0.24),
          transparentSort: true,
        };
      case 'implant-surface':
        return {
          visible: transparent || Boolean(descriptor?.exposed),
          materialState: alwaysTransparent(opacity * 0.3),
          transparentSort: true,
        };
      case 'electrical-internal':
        return {
          visible: transparent,
          materialState: alwaysTransparent(opacity * 0.14),
          transparentSort: true,
        };
      case 'electrical-depth':
        return {
          visible: transparent,
          materialState: alwaysTransparent(opacity * 0.2),
          transparentSort: true,
        };
      case 'electrical-surface':
        return {
          visible: transparent || Boolean(descriptor?.exposed),
          materialState: alwaysTransparent(opacity * 0.24),
          transparentSort: true,
        };
      case 'material-exterior':
      default:
        return {
          visible: true,
          materialState,
          transparentSort: materialState.transparent,
        };
    }
  }

  function applyMaterialPresentation(material, state) {
    if (!material || !state) return;
    const transparentChanged = material.transparent !== Boolean(state.transparent),
      depthWriteChanged = material.depthWrite !== Boolean(state.depthWrite),
      depthTestChanged = material.depthTest !== Boolean(state.depthTest);
    material.opacity = Number(state.opacity);
    material.transparent = Boolean(state.transparent);
    material.depthTest = Boolean(state.depthTest);
    material.depthWrite = Boolean(state.depthWrite);
    if (transparentChanged || depthWriteChanged || depthTestChanged) material.needsUpdate = true;
  }

  function registerPresentationObject(object, descriptor = null) {
    if (!object || !descriptor) return object;
    object.userData ||= {};
    object.userData.waferCadPresentation = { ...descriptor };
    presentationObjects.add(object);
    const state = presentationState(descriptor),
      materials = Array.isArray(object.material) ? object.material : [object.material];
    object.visible = Boolean(state.visible);
    for (const material of materials) applyMaterialPresentation(material, state.materialState);
    if (object.isLineSegments && descriptor.kind === 'border') {
      object.renderOrder =
        Number(getInspection()?.opacity ?? 1) < 0.999
          ? 80
          : (object.userData?.waferCadBorderOrder ?? object.renderOrder);
    } else if (!state.transparentSort && !object.isLineSegments) object.renderOrder = 0;
    return object;
  }

  function refreshTransparentRegistry() {
    transparentMeshes = [];
    let sequence = 0;
    for (const object of presentationObjects) {
      if (!object?.visible || object.isLineSegments) continue;
      const descriptor = object.userData?.waferCadPresentation || {},
        materials = Array.isArray(object.material) ? object.material : [object.material],
        isTransparent = materials.some((material) => Boolean(material?.transparent));
      if (!isTransparent) {
        object.renderOrder = 0;
        continue;
      }
      transparentMeshes.push({
        mesh: object,
        center: object.boundingSphere?.center?.clone?.() || geometryCenter(object.geometry),
        sortBias: Number(descriptor.sortBias) || 0,
        depth: 0,
        sequence: sequence++,
      });
    }
    transparencyOrderDirty = true;
  }

  function updateSceneResourceDiagnostics() {
    if (!host?.dataset || !group) return;
    const geometries = new Set(),
      materials = new Set();
    let visibleObjects = 0;
    group.traverse?.((object) => {
      if (object === group) return;
      if (object.visible !== false) visibleObjects++;
      if (object.geometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) if (material) materials.add(material);
    });
    host.dataset.sceneObjectCount = String(Math.max(0, group.children.length));
    host.dataset.sceneVisibleObjectCount = String(visibleObjects);
    host.dataset.sceneGeometryCount = String(geometries.size);
    host.dataset.sceneMaterialCount = String(materials.size);
    host.dataset.presentationObjectCount = String(presentationObjects.size);
    // The active scene alone hides the GPU/CPU cost of retained transparent
    // and opaque variants. Count each cached group exactly once.
    const retainedGroups = new Set([group]);
    for (const entry of sceneVariantCache.values()) {
      if (entry?.group) retainedGroups.add(entry.group);
    }
    const retainedGeometries = new Set(),
      retainedMaterials = new Set();
    let retainedObjects = 0;
    for (const retainedGroup of retainedGroups) {
      retainedGroup.traverse?.((object) => {
        if (object === retainedGroup) return;
        retainedObjects++;
        if (object.geometry) retainedGeometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of objectMaterials) if (material) retainedMaterials.add(material);
      });
    }
    host.dataset.sceneRetainedGroupCount = String(retainedGroups.size);
    host.dataset.sceneRetainedObjectCount = String(retainedObjects);
    host.dataset.sceneRetainedGeometryCount = String(retainedGeometries.size);
    host.dataset.sceneRetainedMaterialCount = String(retainedMaterials.size);
    // In full-wafer transparency, a small number of instanced buried surfaces
    // can dominate vertex throughput even when draw calls look manageable.
    // Attribute the *submitted* triangles by presentation ownership.
    const trianglesByKind = new Map(),
      largestTriangleObjects = [];
    let singlePassCapObjects = 0,
      savedCapTriangleSubmissions = 0;
    group.traverse?.((object) => {
      if (!object.isMesh || object.visible === false) return;
      const geometry = object.geometry;
      const primitiveCount =
          geometry?.index?.count || geometry?.getAttribute('position')?.count || 0,
        instances = object.isInstancedMesh ? object.count : 1,
        triangles = Math.round((primitiveCount / 3) * instances);
      if (!triangles) return;
      const kind = object.userData?.waferCadPresentation?.kind || 'untracked';
      trianglesByKind.set(kind, (trianglesByKind.get(kind) || 0) + triangles);
      if (
        object.material?.forceSinglePass === true &&
        object.material?.userData?.waferCadSinglePassPlanarCap &&
        object.material?.transparent === true
      ) {
        singlePassCapObjects++;
        // Diagnostic estimate: the second DoubleSide draw was one more
        // submission of this exact planar geometry, not another mesh.
        savedCapTriangleSubmissions += triangles;
      }
      largestTriangleObjects.push({
        name: object.name || '',
        kind,
        triangles,
        instances,
      });
    });
    host.dataset.sceneTriangleKinds = JSON.stringify(
      [...trianglesByKind].sort((a, b) => b[1] - a[1]),
    );
    host.dataset.sceneTopTriangleObjects = JSON.stringify(
      largestTriangleObjects.sort((a, b) => b.triangles - a.triangles).slice(0, 8),
    );
    host.dataset.sceneSinglePassCapObjects = String(singlePassCapObjects);
    host.dataset.sceneSavedCapTriangleSubmissions = String(savedCapTriangleSubmissions);
    if (renderer?.info?.memory) {
      host.dataset.webglGeometryCount = String(renderer.info.memory.geometries ?? 0);
      host.dataset.webglTextureCount = String(renderer.info.memory.textures ?? 0);
      host.dataset.webglProgramCount = String(renderer.info.programs?.length ?? 0);
    }
  }

  function updateVisibleAnnotationDiagnostics() {
    if (!host?.dataset) return;
    const visibleCount = (kind) =>
      [...presentationObjects].filter(
        (object) =>
          object?.visible !== false && object.userData?.waferCadPresentation?.kind === kind,
      ).length;
    host.dataset.implantInternalCount = String(visibleCount('implant-internal'));
    host.dataset.implantSurfaceCount = String(visibleCount('implant-surface'));
    host.dataset.implantCutCount = String(visibleCount('implant-cut'));
    host.dataset.electricalRegionInternalCount = String(visibleCount('electrical-internal'));
    host.dataset.electricalRegionSurfaceCount = String(visibleCount('electrical-surface'));
  }

  function applyPresentationState({
    profile = true,
    settle = true,
    updateKind = 'presentation',
  } = {}) {
    if (!group || !presentationObjects.size) return false;
    const started = performance.now(),
      inspection = getInspection() || {};
    for (const object of presentationObjects) {
      const descriptor = object.userData?.waferCadPresentation;
      if (!descriptor) continue;
      const state = presentationState(descriptor, inspection),
        materials = Array.isArray(object.material) ? object.material : [object.material];
      object.visible = Boolean(state.visible);
      for (const material of materials) applyMaterialPresentation(material, state.materialState);
      if (object.isLineSegments && descriptor.kind === 'border') {
        // Draw before transparent layer meshes (100+), so intervening colored
        // surfaces attenuate hidden edges rather than leaving a black forest.
        object.renderOrder =
          Number(inspection.opacity ?? 1) < 0.999
            ? 80
            : (object.userData?.waferCadBorderOrder ?? object.renderOrder);
      } else if (!state.transparentSort && !object.isLineSegments) object.renderOrder = 0;
    }
    if (roughRenderContext) {
      const materialState = inspectionMaterialState(inspection.opacity);
      roughRenderContext.opacity = materialState.opacity;
      roughRenderContext.borders = Boolean(inspection.borders);
    }
    refreshTransparentRegistry();
    updateTransparentOrder();
    updateVisibleAnnotationDiagnostics();
    updateSceneResourceDiagnostics();
    if (profile) {
      presentationUpdateCount++;
      host.dataset.presentationUpdateCount = String(presentationUpdateCount);
      host.dataset.rendererUpdateKind = updateKind;
      host.dataset.rendererPresentationMs = String(performance.now() - started);
      host.dataset.rendererTopologyMs = '0';
      host.dataset.rendererSmoothCapsMs = '0';
      host.dataset.rendererSidewallsMs = '0';
      host.dataset.rendererAnnotationsMs = '0';
      host.dataset.rendererAssemblyMs = '0';
    }
    if (settle) {
      host.dataset.renderPhase = 'complete';
      host.dataset.renderState = 'ready';
      const model = getModel(),
        clip = getClipGeometry();
      stats.textContent = hasMaterial(model) ? (clip ? 'ROI' : 'full model') : 'no material';
    }
    scheduleFrame();
    return true;
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

  function geometryFromSolid({ slabs, caps }, displayTolerance = 0) {
    const positions = [],
      normals = [];
    const triangle = (a, b, c, normal) => {
      positions.push(...a, ...b, ...c);
      normals.push(...normal, ...normal, ...normal);
    };
    for (const { z, normal, polys } of caps)
      for (const poly of simplifyDisplayPolygons(polys, displayTolerance))
        for (const triangle2d of triangulatePolygon(
          THREE,
          poly.map((ring) => reduceCollinearClosedRing(ring)),
        )) {
          let [a, b, c] = triangle2d.map(([x, y]) => [x, y, z]);
          const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
          if (cross * normal < 0) [b, c] = [c, b];
          triangle(a, b, c, [0, 0, normal]);
        }
    for (const { z0, z1, polys } of slabs)
      for (const poly of simplifyDisplayPolygons(polys, displayTolerance))
        for (let r = 0; r < poly.length; r++) {
          const ring = reduceCollinearClosedRing(poly[r]).slice(0, -1);
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
            if (length <= RENDER_EDGE_EPSILON_UM) continue;
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

  function geometryFromCachedArrayCap(cap, displayTolerance = 0) {
    const variant = `${Number(cap.z).toPrecision(15)}|${Number(cap.normal) || 1}|lod:${displayTolerance.toPrecision(6)}`,
      data = smoothCapDerivedDataCache.get(cap.polys, variant, () => {
        const source = geometryFromSolid({ slabs: [], caps: [cap] }, displayTolerance),
          positions = source.getAttribute('position')?.array?.slice?.() || new Float32Array(),
          normals = source.getAttribute('normal')?.array?.slice?.() || new Float32Array();
        source.dispose();
        return { positions, normals };
      }),
      geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions.slice(), 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals.slice(), 3));
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

  function geometryFromSidewallParts(parts, displayTolerance = 0, { indexedSmooth = false } = {}) {
    const positions = [],
      normals = [],
      annotationDepths = [],
      indices = [],
      preparedParts = displayTolerance > 0
        ? simplifyDisplaySidewallParts(parts, displayTolerance)
        : mergeCollinearSidewallParts(parts),
      useIndexedSmooth = indexedSmooth && canIndexSmoothSidewallParts(preparedParts);

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

    for (const part of preparedParts) {
      const p = part.p,
        q = part.q,
        dx = q[0] - p[0],
        dy = q[1] - p[1],
        length = Math.hypot(dx, dy);
      if (length <= RENDER_EDGE_EPSILON_UM) continue;
      if (Math.abs(Number(part.z1) - Number(part.z0)) <= 1e-9) continue;

      const featureSizes = [part.lowerSurface, part.upperSurface]
          .map((surface) => Number(surface?.appearance?.featureSize))
          .filter((value) => Number.isFinite(value) && value > 0),
        targetStep = featureSizes.length
          ? Math.max(
              1e-6,
              Math.min(...featureSizes) / (4 * Math.sqrt(renderPolicy(false).roughnessDetail)),
            )
          : length,
        segments = Math.max(
          1,
          Math.min(renderPolicy(false).sidewallSegments, Math.ceil(length / targetStep)),
        ),
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
        if (useIndexedSmooth) {
          // Same two triangles in identical order, with the four shared
          // vertices represented only once for GPU vertex reuse.
          appendIndexedSmoothWallQuad(
            positions,
            normals,
            indices,
            lower0,
            lower1,
            upper1,
            upper0,
          );
        } else {
          triangle(lower0, lower1, upper1, firstDepths);
          triangle(lower0, upper1, upper0, secondDepths);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    if (indices.length) geometry.setIndex(indices);
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
    const now = performance.now();
    if (
      !transparencyOrderDirty &&
      now - lastTransparencySort < renderPolicy().transparencySortInterval
    )
      return;
    lastTransparencySort = now;
    transparencyOrderDirty = false;
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

  function createSurfaceMaterial(layer, materialState, appearance = null, presentation = null) {
    const create = () => {
      // Large arrays can cover thousands of overlapping transparent faces.
      // Fast vertex-lit shading is materially cheaper on software WebGL than
      // per-fragment PBR, without weakening the two-pass DoubleSide depth and
      // transparency contract or changing any physical surface ownership.
      const arrayTransparency =
        !appearance &&
        presentationMode() === 'transparent' &&
        Number(host.dataset.arrayInstances || 0) >= 64;
      const material = arrayTransparency
        ? new THREE.MeshLambertMaterial({
            color: layer?.color || '#999',
            side: THREE.DoubleSide,
            ...materialState,
          })
        : new THREE.MeshStandardMaterial({
            color: layer?.color || '#999',
            roughness: appearance ? 0.84 : 0.78,
            metalness: 0.015,
            side: THREE.DoubleSide,
            ...materialState,
          });
      // All triangles in one smooth cap lie on one physical Z plane. Its
      // front/back faces cannot both contribute from the same camera pose,
      // so Three.js's second transparent DoubleSide pass is redundant.
      // Walls, rough faces and mixed-depth annotation volumes retain two passes.
      if (
        canRenderPlanarCapInSinglePass({
          transparentScene: presentationMode() === 'transparent',
          materialState,
          appearance,
          presentation,
        })
      ) {
        material.forceSinglePass = true;
        material.userData.waferCadSinglePassPlanarCap = true;
      }
      return material;
    };

    // Adaptive rough meshes and the transparent scene use private materials:
    // transparent sorting and WebGL program lifecycle must remain independent
    // per object (matching the last verified GPU-v3 transparency path).
    // Opaque smooth objects can share materials without that ordering pressure.
    if (appearance || !presentation?.kind || presentationMode() === 'transparent') return create();

    const key = JSON.stringify([
      presentation.kind,
      layer?.id || '',
      layer?.color || '#999',
      Number(appearance ? 0.84 : 0.78),
    ]);
    let material = surfaceMaterialPool.get(key);
    if (!material) {
      material = create();
      material.userData.waferCadPooledPresentationMaterial = true;
      surfaceMaterialPool.set(key, material);
    }
    return material;
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
    instanceTranslations = null,
    presentation = null,
  ) {
    if (!geometry.getAttribute('position')?.count) {
      geometry.dispose();
      if (!material?.userData?.waferCadPooledPresentationMaterial) material?.dispose?.();
      return null;
    }
    if (instanceTranslations)
      return (
        addInstancedSurfaceMeshes(geometry, material, instanceTranslations, {
          name: 'Array annotation',
          adaptiveRough: trackAdaptiveRough,
          appearance,
          presentation: presentation ? { ...presentation, sortBias } : null,
        })[0] || null
      );
    const mesh = new THREE.Mesh(geometry, material),
      center = geometryCenter(geometry);
    if (geometry.userData.roughGpuDisplacement) mesh.frustumCulled = false;
    mesh.renderOrder = materialState.transparent ? 100 : 0;
    group.add(mesh);
    trackZDisplayObject(mesh);
    registerPresentationObject(mesh, presentation ? { ...presentation, sortBias } : null);
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
    {
      name = '',
      maxInstancesPerMesh = 4096,
      adaptiveRough = false,
      appearance = null,
      presentation = null,
    } = {},
  ) {
    if (!geometry.getAttribute('position')?.count || !translations?.length) {
      geometry.dispose();
      if (!material?.userData?.waferCadPooledPresentationMaterial) material?.dispose?.();
      return [];
    }

    // A huge transparent instance batch cannot be depth-sorted or culled
    // locally. Preserve the spatial chunks used by the verified v3 renderer
    // for transparent rendering; opaque geometry keeps the larger GPU batch.
    const transparentBatch = presentationMode() === 'transparent',
      batchSize = transparentBatch ? Math.min(maxInstancesPerMesh, 256) : maxInstancesPerMesh,
      chunks = spatialInstanceChunks(translations, { maxInstances: batchSize }),
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
      if (chunkGeometry.userData.roughGpuDisplacement) mesh.frustumCulled = false;
      group.add(mesh);
      trackZDisplayObject(mesh);
      registerPresentationObject(mesh, presentation);
      if (adaptiveRough) {
        roughOwnedObjects.add(mesh);
        roughMeshes.push({
          mesh,
          material,
          appearance: { ...appearance },
          center: mesh.boundingSphere?.center?.clone() || new THREE.Vector3(),
        });
      }
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
      presentationObjects.delete(object);
      group?.remove(object);
      disposeObjectResources(object);
    }
    roughOwnedObjects.clear();
    roughMeshes = [];
  }

  function instanceBorderPositions(positions, translations) {
    if (!translations) return positions;
    return translations.flatMap(([x, y]) =>
      positions.map((v, i) => v + (i % 3 === 0 ? x : i % 3 === 1 ? y : 0)),
    );
  }
  function addBorderPositions(
    positions,
    { order = 100000, opacity = 1, adaptiveRough = false, presentation = { kind: 'border' } } = {},
  ) {
    if (!positions?.length) return null;
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x111820,
        transparent: opacity < 0.999,
        opacity: opacity < 0.999 ? 0.46 : 1,
        depthTest: true,
        depthFunc: THREE.LessEqualDepth,
        depthWrite: false,
      }),
      edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edges.renderOrder = order;
    edges.userData.waferCadBorderOrder = order;
    group.add(edges);
    trackZDisplayObject(edges);
    registerPresentationObject(edges, presentation);
    if (adaptiveRough) roughOwnedObjects.add(edges);
    return edges;
  }

  function roughSceneRoiFraction(model, clip) {
    const modelArea = Math.max(1e-12, Number(model.width) * Number(model.height)),
      visibleArea = Math.max(1e-12, boundsArea(visibleBounds(model, clip)));
    return Math.max(0, Math.min(1, visibleArea / modelArea));
  }

  function gpuRoughTask(task) {
    return canUseGpuRoughTask({
      appearance: task?.cap?.appearance,
      buried: task?.cap?.buried,
      implant: Boolean(task?.implant),
      zDisplay: currentZDisplay,
    });
  }

  function prepareAdaptiveRoughTasks({ interactive = false } = {}) {
    const context = roughRenderContext;
    if (!context || !roughTasks.length) return { tasks: [], sceneBudget: 0 };
    const policy = renderPolicy(interactive),
      focus = focusBounds(),
      requests = [],
      tasks = roughTasks.map((task) => {
        const gpuDisplacement = gpuRoughTask(task),
          gpuGeometryDetail = gpuDisplacement
            ? interactive
              ? 0.35
              : policy.mode === 'quality'
                ? 0.55
                : 0.45
            : 1,
          gpuMaxDepth = gpuDisplacement
            ? interactive
              ? 3
              : policy.mode === 'quality'
                ? 8
                : 6
            : policy.maxDepth,
          zones = prepareRoughSpatialZones(task).map((zone) => {
            const priority = roughZonePriority(zone.bounds, focus),
              roughnessDetail =
                policy.roughnessDetail *
                (task.cap.buried ? policy.interfaceDetail : 1) *
                gpuGeometryDetail,
              lodContext = lodContextFor(context.model, context.clip, null, task.cap.z, {
                visibleFraction: priority >= 0.9 ? 1 : priority >= 0.2 ? 0.2 : 0.04,
                screenPriority: priority,
                maxDepth: Math.min(
                  policy.maxDepth,
                  gpuMaxDepth,
                  priority >= 0.9 ? 10 : priority >= 0.2 ? 7 : 5,
                ),
                patchBounds: zone.bounds,
              }),
              preview = adaptiveRoughMeshLod({
                triangleCount: zone.baseTriangles.length,
                maxEdge: zone.maxEdge,
                featureSize: task.cap.appearance?.featureSize,
                ...lodContext,
                roughnessDetail,
              }),
              prepared = {
                ...zone,
                lodContext: {
                  ...lodContext,
                  roughnessDetail,
                },
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
        return { ...task, gpuDisplacement, zones };
      }),
      viewport = currentViewport(),
      qualitySceneBudget = roughSceneTriangleBudget({
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
        pixelRatio: viewport.pixelRatio,
        roiFraction: roughSceneRoiFraction(context.model, context.clip),
        hardCap: 900000,
      }),
      requestedSceneBudget = Math.max(1, Math.floor(qualitySceneBudget * policy.triangleBudget)),
      baseTriangleCount = requests.reduce((sum, request) => sum + request.baseTriangles, 0),
      sceneBudget = Math.max(requestedSceneBudget, baseTriangleCount),
      allocations = allocateRoughTriangleBudgets(requests, {
        totalBudget: sceneBudget,
      });

    requests.forEach((request, index) => {
      request.zone.triangleBudget = allocations[index];
    });
    return { tasks, sceneBudget, requestedSceneBudget, baseTriangleCount, policy };
  }

  function roughWorkerDiagnostics(prepared) {
    return {
      sceneBudget: prepared.sceneBudget,
      requestedSceneBudget: prepared.requestedSceneBudget,
      baseTriangleCount: prepared.baseTriangleCount,
      gpuTaskCount: prepared.tasks.filter((task) => task.gpuDisplacement).length,
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
      if (geometry.userData.roughGpuDisplacement && !task.implant) {
        decorateGpuRoughMaterial(material, cap.appearance, {
          profileNormal: cap.profileNormal ?? cap.normal,
          normalStrength: mode === 'interactive' ? 0.82 : 1,
        });
      }
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
        cap.instanceTranslations || task.implant?.instanceTranslations,
        task.presentation,
      );
      if (mesh) {
        roughOwnedObjects.add(mesh);
        if (task.name) mesh.name = task.name;
      }

      if (
        task.includeBorders !== false &&
        !cap.buried &&
        geometry.userData.roughBorderPositions?.length
      ) {
        addBorderPositions(
          instanceBorderPositions(geometry.userData.roughBorderPositions, cap.instanceTranslations),
          {
            order: 100010 + (cap.solidIndex || 0),
            opacity: context.opacity,
            adaptiveRough: true,
            presentation: { kind: 'border' },
          },
        );
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
      data.roughMeshBackend = diagnostics?.gpuTaskCount ? 'gpu-hybrid' : 'cpu-mesh';
      data.roughGpuTaskCount = String(diagnostics?.gpuTaskCount || 0);
      data.roughMeshWorker = 'true';
    }
    applyPresentationState({ profile: false, settle: false });
    updateRoughMaterialLod();
    updateRoughDiagnostics();
    if (mode === 'detailed') lastLodSignature = signature || adaptiveLodSignature();
    host.dataset.renderPhase = mode === 'interactive' ? 'preview' : 'complete';
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
          analyticNormals: task.gpuDisplacement ? false : prepared.policy.analyticNormals,
          gpuDisplacement: Boolean(task.gpuDisplacement),
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
      diagnostics = roughWorkerDiagnostics(prepared),
      rendererRoughStart = performance.now();
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
        if (host?.dataset) {
          host.dataset.rendererRoughMs = String(performance.now() - rendererRoughStart);
          const profileStart = roughRenderContext?.profileStart;
          if (Number.isFinite(profileStart)) {
            const total = performance.now() - profileStart;
            if (interactive) host.dataset.rendererPreviewReadyMs = String(total);
            else host.dataset.rendererFinalReadyMs = String(total);
          }
        }
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
          analyticNormals: task.gpuDisplacement ? false : prepared.policy.analyticNormals,
          gpuDisplacement: Boolean(task.gpuDisplacement),
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
        if (geometry.userData.roughGpuDisplacement && !task.implant) {
          decorateGpuRoughMaterial(material, cap.appearance, {
            profileNormal: cap.profileNormal ?? cap.normal,
            normalStrength: interactive ? 0.82 : 1,
          });
        }
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
          cap.instanceTranslations || task.implant?.instanceTranslations,
          task.presentation,
        );
        if (mesh) {
          roughOwnedObjects.add(mesh);
          if (task.name) mesh.name = task.name;
        }

        if (
          task.includeBorders !== false &&
          !cap.buried &&
          geometry.userData.roughBorderPositions?.length
        ) {
          addBorderPositions(
            instanceBorderPositions(
              geometry.userData.roughBorderPositions,
              cap.instanceTranslations,
            ),
            {
              order: 100010 + (cap.solidIndex || 0),
              opacity: context.opacity,
              adaptiveRough: true,
              presentation: { kind: 'border' },
            },
          );
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
        data.roughMeshBackend = prepared.tasks.some((task) => task.gpuDisplacement)
          ? 'gpu-hybrid'
          : 'cpu-mesh';
        data.roughGpuTaskCount = String(
          prepared.tasks.filter((task) => task.gpuDisplacement).length,
        );
        data.roughMeshWorker = 'false';
      }
      applyPresentationState({ profile: false, settle: false });
      updateRoughMaterialLod();
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
            syncRenderPolicy();
            const interactionPixelRatio = Math.min(
              preferredPixelRatio,
              renderPolicy().maxPixelRatio,
            );
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
            syncRenderPolicy();
            transparencyOrderDirty = true;
            updateTransparentOrder();
            host.dataset.interactionPixelRatio = String(renderer.getPixelRatio());
            scheduleDetailedRoughBuild();
            refreshCameraArrayLod();
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

  async function render() {
    if (!ready) return;
    if (rendering) {
      pendingRender = true;
      return;
    }
    const model = getModel();
    if (!model) return;
    const clip = getClipGeometry(),
      inspection = getInspection() || {},
      signature = sceneSignature(model, clip, inspection),
      targetVariant = presentationMode(inspection);
    let variantBuild = false;
    let buildStageStartedAt = 0;
    const recordVariantStage = (name) => {
      if (!variantBuild) return;
      const now = performance.now();
      host.dataset.rendererBuildPhase = name;
      host.dataset.rendererBuildPhaseElapsedMs = String(now - buildStageStartedAt);
      console.info('WAFERCAD_VARIANT_STAGE', name, Math.round(now - buildStageStartedAt));
      buildStageStartedAt = now;
    };

    if (
      physicalSceneModel === model &&
      physicalSceneSignature === signature &&
      presentationObjects.size
    ) {
      if (activeSceneVariant === targetVariant) {
        pendingRender = false;
        host.dataset.renderState = 'updating';
        host.dataset.rendererUpdateKind = 'presentation';
        stats.textContent = 'updating 3D…';
        syncRenderPolicy();
        applyPresentationState();
        return;
      }

      const cachedVariant = sceneVariantCache.get(targetVariant);
      if (cachedVariant && restoreSceneVariant(cachedVariant)) {
        pendingRender = false;
        host.dataset.renderState = 'updating';
        stats.textContent = 'updating 3D…';
        syncRenderPolicy();
        applyPresentationState({ updateKind: 'variant-swap' });
        return;
      }

      if (Number(host.dataset.arrayInstances || 0) >= 64 && !roughTasks.length) {
        variantBuild = true;
        startSceneVariantBuild(targetVariant);
      } else {
        pendingRender = false;
        host.dataset.renderState = 'updating';
        host.dataset.rendererUpdateKind = 'presentation';
        stats.textContent = 'updating 3D…';
        syncRenderPolicy();
        applyPresentationState();
        return;
      }
    }

    const renderGeneration = variantBuild ? sceneGeneration : ++sceneGeneration;
    pendingRender = false;
    host.dataset.renderState = 'building';
    host.dataset.sceneGeneration = String(renderGeneration);
    host.dataset.modelRevision = String(model.revision ?? 0);
    host.dataset.processRevision = String(model.processRevision ?? 0);
    host.dataset.rendererUpdateKind = variantBuild ? 'variant-build' : 'rebuild';
    stats.textContent = variantBuild ? 'preparing 3D transparency…' : 'rebuilding 3D…';
    const rendererProfileStart = performance.now();

    rendering = true;
    buildStageStartedAt = performance.now();
    recordVariantStage('begin');
    try {
      if (!variantBuild) disposeGroup();
      syncRenderPolicy();
      applyZDisplayState(model);

      const materialState = inspectionMaterialState(inspection.opacity),
        opacity = materialState.opacity,
        borders = Boolean(inspection.borders),
        plan =
          variantBuild && physicalSurfacePlan
            ? physicalSurfacePlan
            : buildRenderSurfacePlan(model, clip);
      if (!variantBuild) physicalSurfacePlan = plan;
      // Far-array presentation LOD is quantized by projected pixel footprint
      // and restored at zoom/ROI/Quality transitions. Physical geometry and
      // GLB export remain independent of these presentation-only meshes.
      const arrayLod =
          targetVariant === 'transparent'
            ? arrayViewLod(model, clip, inspection)
            : transparentArrayPresentationLod(),
        transparentArrayDisplayTolerance = arrayLod.displayTolerance;
      host.dataset.fullWaferTransparencyLod = String(arrayLod.tier !== 'exact');
      host.dataset.transparentArrayDisplayTolerance = String(transparentArrayDisplayTolerance);
      host.dataset.transparentArrayLodTier = arrayLod.tier;
      // V3 phase A is diagnostic only: estimate the strictly subpixel,
      // smooth, buried wall workload at a far Fast array camera. No mesh
      // reduction, change to opacity sorting or mutation of source geometry.
      const viewportForV3 = currentViewport(),
        distanceForV3 =
          camera && controls ? camera.position.distanceTo(controls.target) : 0,
        v3Budget = buriedInterfaceSubpixelBudget(plan.sidewalls, {
          farTier: targetVariant === 'transparent' && arrayLod.tier !== 'exact',
          clipped: Boolean(clip),
          // Use the EFFECTIVE Section display transform, including the
          // enabled default when the stored Section setting is null.
          zCollapsed: currentZDisplay?.enabled !== false,
          displayZScale: currentZDisplay?.scale,
          unitsPerPixel:
            camera && distanceForV3 > 0
              ? (2 * distanceForV3 * Math.tan((camera.fov * Math.PI) / 360)) /
                viewportForV3.height
              : 0,
          viewZFraction:
            camera && distanceForV3 > 0
              ? Math.abs(camera.position.z - controls.target.z) / distanceForV3
              : 0,
        });
      host.dataset.v3ScreenBudgetMode = v3Budget.mode;
      host.dataset.v3ScreenBudgetQualified = String(v3Budget.qualified);
      host.dataset.v3ScreenBudgetReason = v3Budget.exclusionReason || 'qualified';
      host.dataset.v3SubpixelWallCandidates = String(v3Budget.candidates);
      host.dataset.v3SubpixelWallInstances = String(v3Budget.instanceWallSegments);
      host.dataset.v3SubpixelRawTriangleEstimate = String(
        v3Budget.rawTwoPassTriangleEstimate,
      );
      host.dataset.v3SkippedTriangles = String(v3Budget.skippedTriangles);
      // Read-only sample of *actual perspective projection*, even when a
      // collapsed Section disqualifies every candidate from future culling.
      // Strictly bounded per owner/edge/instance to avoid adding GPU work.
      let v3Projected = null;
      if (targetVariant === 'transparent' && arrayLod.tier !== 'exact' && camera) {
        camera.updateMatrixWorld();
        const pointForProjection = new THREE.Vector3();
        v3Projected = sampleBuriedInterfaceProjection(plan.sidewalls, {
          viewportWidth: viewportForV3.width,
          viewportHeight: viewportForV3.height,
          displayZScale: currentZDisplay?.scale,
          mapZ: (z) => currentZDisplay?.mapZ?.(z) ?? z,
          visibleIntervals: (z0, z1) => visibleZIntervals(z0, z1, currentZDisplay),
          project: ([x, y, z]) => {
            pointForProjection.set(x, y, z).project(camera);
            if (
              ![pointForProjection.x, pointForProjection.y, pointForProjection.z].every(
                Number.isFinite,
              ) ||
              pointForProjection.z < -1 ||
              pointForProjection.z > 1
            ) return null;
            return [
              ((pointForProjection.x + 1) * viewportForV3.width) / 2,
              ((1 - pointForProjection.y) * viewportForV3.height) / 2,
            ];
          },
        });
      }
      host.dataset.v3ProjectionStatus = v3Projected?.reason || 'not-far';
      host.dataset.v3ProjectionOwners = String(v3Projected?.analyzedOwners || 0);
      host.dataset.v3ProjectionSampleQuads = String(v3Projected?.sampledQuads || 0);
      host.dataset.v3ProjectionVisibleQuads = String(v3Projected?.projectedQuads || 0);
      host.dataset.v3ProjectionSubpixelQuads = String(v3Projected?.subpixelQuads || 0);
      host.dataset.v3ProjectionOffscreenQuads = String(v3Projected?.offscreenQuads || 0);
      host.dataset.v3ProjectionRawTriangleUpperBound = String(
        v3Projected?.rawOwnerTriangleUpperBound || 0,
      );
      host.dataset.v3ProjectionTopOwners = JSON.stringify(v3Projected?.topOwners || []);
      // V3 owner/tile screen-space bounds are conservative and independent
      // of the random/representative quad samples above. Observe-only:
      // geometry and draw submissions must be bitwise unchanged.
      let v3Tiles = null,
        v3Edges = null,
        v3EdgesMs = 0;
      if (targetVariant === 'transparent' && arrayLod.tier !== 'exact' && camera) {
        const viewProjection = camera.projectionMatrix
          .clone()
          .multiply(camera.matrixWorldInverse);
        v3Tiles = buriedInterfaceTileBounds(plan.sidewalls, {
          viewProjectionMatrix: viewProjection.elements,
          viewportWidth: viewportForV3.width,
          viewportHeight: viewportForV3.height,
          displayZScale: currentZDisplay?.scale,
          mapZ: (z) => currentZDisplay?.mapZ?.(z) ?? z,
          visibleIntervals: (z0, z1) => visibleZIntervals(z0, z1, currentZDisplay),
          farTier: true,
          clipped: Boolean(clip),
          zCollapsed: currentZDisplay?.enabled !== false,
          nearEdgeOn:
            distanceForV3 <= 0 ||
            Math.abs(camera.position.z - controls.target.z) / distanceForV3 < 0.35,
        });
        const edgeStartedAt = performance.now();
        v3Edges = buriedInterfaceEdgeTileSurvey(plan.sidewalls, {
          viewProjectionMatrix: viewProjection.elements,
          viewportWidth: viewportForV3.width,
          viewportHeight: viewportForV3.height,
          displayZScale: currentZDisplay?.scale,
          mapZ: (z) => currentZDisplay?.mapZ?.(z) ?? z,
          visibleIntervals: (z0, z1) => visibleZIntervals(z0, z1, currentZDisplay),
          farTier: true,
          clipped: Boolean(clip),
          zCollapsed: currentZDisplay?.enabled !== false,
          edgeOn:
            distanceForV3 <= 0 ||
            Math.abs(camera.position.z - controls.target.z) / distanceForV3 < 0.35,
        });
        v3EdgesMs = performance.now() - edgeStartedAt;
      }
      host.dataset.v3TileBoundStatus = v3Tiles?.reason || 'not-far';
      host.dataset.v3TileReductionGate = v3Tiles?.reductionGate || 'not-far';
      host.dataset.v3TileBoundOwners = String(v3Tiles?.owners || 0);
      host.dataset.v3TileBoundTiles = String(v3Tiles?.tiles || 0);
      host.dataset.v3TileSubpixelBounds = String(v3Tiles?.subpixelBounds || 0);
      host.dataset.v3TileOffscreenBounds = String(v3Tiles?.offscreenBounds || 0);
      host.dataset.v3TileUncertainBounds = String(v3Tiles?.uncertainTiles || 0);
      host.dataset.v3TileOwnerOverflow = String(v3Tiles?.ownerOverflow || 0);
      host.dataset.v3TileBoundOverflow = String(v3Tiles?.tileOverflow || 0);
      host.dataset.v3TileBoundTopOwners = JSON.stringify(v3Tiles?.topOwners || []);
      host.dataset.v3EdgeSurveyStatus = v3Edges?.reason || 'not-far';
      host.dataset.v3EdgeSurveyGate = v3Edges?.reductionGate || 'not-far';
      host.dataset.v3EdgeSurveyOwners = String(v3Edges?.studiedOwners || 0);
      host.dataset.v3EdgeSurveyBounds = String(v3Edges?.projectedBounds || 0);
      host.dataset.v3EdgeSurveySubpixel = String(v3Edges?.subpixelBounds || 0);
      host.dataset.v3EdgeSurveyUncertain = String(v3Edges?.uncertainBounds || 0);
      host.dataset.v3EdgeSurveyOverflow = String(v3Edges?.workOverflow || 0);
      host.dataset.v3EdgeSurveyRawUpperBound = String(
        v3Edges?.representedRawTwoPassTriangles || 0,
      );
      host.dataset.v3EdgeSurveySubpixelRawUpperBound = String(
        v3Edges?.subpixelRawTwoPassUpperBound || 0,
      );
      host.dataset.v3EdgeSurveyMs = String(v3EdgesMs);
      host.dataset.v3EdgeSurveyTopOwners = JSON.stringify(v3Edges?.topOwners || []);
      const interfaceState = interfaceMaterialState(opacity),
        smoothCaps = new Map(),
        sidewalls = new Map(),
        rendererTopologyAt = performance.now();

      const cooperativeAssembly = Number(plan.arrayInstances || 0) >= 64;
      let sceneAssemblyYields = 0,
        nextAssemblyYieldAt = performance.now() + 32;
      const maybeYieldAssembly = async () => {
        if (!cooperativeAssembly || performance.now() < nextAssemblyYieldAt) return;
        sceneAssemblyYields++;
        if (variantBuild) {
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        } else {
          await yieldSceneAssembly();
        }
        nextAssemblyYieldAt = performance.now() + 32;
      };

      host.dataset.materialLayerIds = JSON.stringify(
        [...new Set([...plan.caps, ...plan.sidewalls].map((part) => part.layerId))].sort(),
      );
      host.dataset.surfaceTopology = JSON.stringify({
        caps: plan.caps.length,
        sidewalls: plan.sidewalls.length,
      });
      if (!variantBuild) surfacePlanBuildCount++;
      host.dataset.surfacePlanBuildCount = String(surfacePlanBuildCount);
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
        profileStart: rendererProfileStart,
      };

      const stateFor = (part) => (part.buried ? interfaceState : materialState),
        presentationFor = (part, sortBias = 0) => ({
          kind: part.buried ? 'material-interface' : 'material-exterior',
          sortBias,
        }),
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

      smoothCapInstanceGroupCount = 0;
      smoothCapInstanceCount = 0;
      smoothCapTemplateTriangleCount = 0;
      for (const cap of plan.caps) {
        await maybeYieldAssembly();
        if (!zIsVisible(cap.z)) continue;
        const state = stateFor(cap);
        if (!state) continue;
        const layer = layerById(model, cap.layerId);

        if (!cap.appearance && cap.instanceTranslations) {
          const geometry = geometryFromCachedArrayCap(
              cap,
              cap.buried ? transparentArrayDisplayTolerance : 0,
            ),
            presentation = { ...presentationFor(cap), planarCap: true },
            material = createSurfaceMaterial(layer, state, null, presentation);
          const meshes = addInstancedSurfaceMeshes(geometry, material, cap.instanceTranslations, {
            name: `${cap.layerId} array cap`,
            presentation,
          });
          smoothCapInstanceGroupCount += meshes.length;
          smoothCapInstanceCount += cap.instanceTranslations.length;
          smoothCapTemplateTriangleCount += geometry.getAttribute('position')?.count / 3 || 0;
          continue;
        }
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
          presentation: presentationFor(cap, cap.buried ? 12 : 0),
          closeToIdeal: !cap.buried,
          includeBorders: true,
        });
      }

      recordVariantStage('caps-buckets-ready');
      for (const bucket of smoothCaps.values()) {
        await maybeYieldAssembly();
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
                  presentation = {
                    ...presentationFor(bucket.part, bucket.part.buried ? 10 : 0),
                    planarCap: true,
                  },
                  material = createSurfaceMaterial(
                    layerById(model, bucket.part.layerId),
                    state,
                    null,
                    presentation,
                  ),
                  meshes = addInstancedSurfaceMeshes(geometry, material, instances.translations, {
                    name: `${bucket.part.layerId || 'material'} repeated cap`,
                    presentation,
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
                  presentation = {
                    ...presentationFor(bucket.part, bucket.part.buried ? 10 : 0),
                    planarCap: true,
                  },
                  material = createSurfaceMaterial(
                    layerById(model, bucket.part.layerId),
                    state,
                    null,
                    presentation,
                  );
                addSurfaceMesh(
                  geometry,
                  material,
                  state,
                  null,
                  bucket.part.buried ? 10 : 0,
                  false,
                  null,
                  presentation,
                );
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
          presentation = {
            ...presentationFor(bucket.part, bucket.part.buried ? 10 : 0),
            planarCap: true,
          },
          material = createSurfaceMaterial(
            layerById(model, bucket.part.layerId),
            state,
            null,
            presentation,
          );
        addSurfaceMesh(
          geometry,
          material,
          state,
          null,
          bucket.part.buried ? 10 : 0,
          false,
          null,
          presentation,
        );
      }
      recordVariantStage('caps-complete');
      host.dataset.smoothCapInstanceGroups = String(smoothCapInstanceGroupCount);
      host.dataset.smoothCapInstanceCount = String(smoothCapInstanceCount);
      host.dataset.smoothCapTemplateTriangles = String(Math.round(smoothCapTemplateTriangleCount));
      const rendererCapsAt = performance.now();

      const derivedCapStats = smoothCapDerivedDataCache.stats();
      host.dataset.derivedCapCacheHits = String(derivedCapStats.hits);
      host.dataset.derivedCapCacheMisses = String(derivedCapStats.misses);

      smoothSidewallInstanceGroupCount = 0;
      smoothSidewallInstanceCount = 0;
      smoothSidewallTemplateTriangleCount = 0;
      for (const sidewall of plan.sidewalls) {
        await maybeYieldAssembly();
        const state = stateFor(sidewall);
        if (!state) continue;
        if (sidewall.instanceTranslations) {
          const parts = displaySidewallParts(sidewall.parts || [sidewall]);
          const geometry = geometryFromSidewallParts(
              parts,
              sidewall.buried ? transparentArrayDisplayTolerance : 0,
              {
                // Presentation-only Fast array optimization. Quality, rough,
                // implant, non-instanced walls and GLB remain unchanged.
                indexedSmooth:
                  sidewall.buried &&
                  targetVariant === 'transparent' &&
                  inspection.fast !== false,
              },
            ),
            presentation = presentationFor(sidewall),
            material = createSurfaceMaterial(
              layerById(model, sidewall.layerId),
              state,
              null,
              presentation,
            );
          const meshes = addInstancedSurfaceMeshes(
            geometry,
            material,
            sidewall.instanceTranslations,
            {
              name: `${sidewall.layerId} array wall`,
              presentation,
            },
          );
          smoothSidewallInstanceGroupCount += meshes.length;
          smoothSidewallInstanceCount += sidewall.instanceTranslations.length;
          smoothSidewallTemplateTriangleCount +=
            (geometry.index?.count || geometry.getAttribute('position')?.count || 0) / 3;
          continue;
        }
        pushBucket(sidewalls, sidewall, state);
      }
      recordVariantStage('sidewalls-buckets-ready');
      for (const bucket of sidewalls.values()) {
        await maybeYieldAssembly();
        const state = stateFor(bucket.part),
          visibleParts = displaySidewallParts(bucket.items);
        if (!state || !visibleParts.length) continue;

        if (!state.transparent) {
          const instances = translatedSidewallInstanceGroups(visibleParts, { minInstances: 8 });
          if (instances.instanceCount > 0) {
            for (const groupInstances of instances.groups) {
              const geometry = geometryFromSidewallParts([groupInstances.template]),
                presentation = presentationFor(bucket.part, bucket.part.buried ? 11 : 0),
                material = createSurfaceMaterial(
                  layerById(model, bucket.part.layerId),
                  state,
                  null,
                  presentation,
                ),
                meshes = addInstancedSurfaceMeshes(
                  geometry,
                  material,
                  groupInstances.translations,
                  {
                    name: `${bucket.part.layerId || 'material'} repeated sidewall`,
                    presentation,
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
                presentation = presentationFor(bucket.part, bucket.part.buried ? 11 : 0),
                material = createSurfaceMaterial(
                  layerById(model, bucket.part.layerId),
                  state,
                  null,
                  presentation,
                );
              addSurfaceMesh(
                geometry,
                material,
                state,
                null,
                bucket.part.buried ? 11 : 0,
                false,
                null,
                presentation,
              );
            }
            continue;
          }
        }

        const geometry = geometryFromSidewallParts(
            visibleParts,
            bucket.part.buried ? transparentArrayDisplayTolerance : 0,
          ),
          presentation = presentationFor(bucket.part, bucket.part.buried ? 11 : 0),
          material = createSurfaceMaterial(
            layerById(model, bucket.part.layerId),
            state,
            null,
            presentation,
          );
        addSurfaceMesh(
          geometry,
          material,
          state,
          null,
          bucket.part.buried ? 11 : 0,
          false,
          null,
          presentation,
        );
      }
      recordVariantStage('sidewalls-complete');
      host.dataset.smoothSidewallInstanceGroups = String(smoothSidewallInstanceGroupCount);
      host.dataset.smoothSidewallInstanceCount = String(smoothSidewallInstanceCount);
      host.dataset.sidewallTriangleCount = String(
        group.children.reduce(
          (sum, object) => sum + (object.geometry?.getAttribute?.('position')?.count || 0) / 3,
          0,
        ),
      );
      host.dataset.smoothSidewallTemplateTriangles = String(
        Math.round(smoothSidewallTemplateTriangleCount),
      );
      const rendererSidewallsAt = performance.now();

      host.dataset.instanceChunkLimit = presentationMode() === 'transparent' ? '256' : '4096';
      host.dataset.cooperativeSceneAssembly = String(cooperativeAssembly);
      host.dataset.sceneAssemblyYields = String(sceneAssemblyYields);
      if (sceneAssemblyYields) host.dataset.renderPhase = 'assembling';

      addBorderPositions(displayBorderPositions(plan.borderLines.flat(2)), {
        order: 100000,
        opacity,
        presentation: { kind: 'border' },
      });

      // Implant and Electrical Region annotations are built as a persistent
      // superset. Presentation state decides which internal volumes are visible,
      // so opacity changes never need to recreate annotation geometry.
      let implantInternalCount = 0,
        implantSurfaceCount = 0,
        implantCutCount = 0,
        implantGradientMeshCount = 0;
      const annotationModel =
          isArrayModel(model) && clip ? resolveArrayModel(model, geometryBounds(clip)) : model,
        annotationSources =
          isArrayModel(model) && !clip
            ? [...new Set(arrayParts(model).map((p) => p.model))].map((leaf) => ({
                leaf,
                translations: arrayParts(model)
                  .filter((p) => p.model === leaf)
                  .map((p) => [p.x, p.y]),
              }))
            : [{ leaf: annotationModel, translations: null }],
        arrayAnnotations = (derive) =>
          annotationSources.flatMap(({ leaf, translations }) =>
            derive(leaf, clip).map((a) => ({ ...a, instanceTranslations: translations })),
          );

      host.dataset.arrayInstances = String(plan.arrayInstances || 0);
      host.dataset.arrayNeighborhoods = String(plan.arrayNeighborhoods || 0);

      for (const implant of arrayAnnotations(implantSolids)) {
        const inspectionSegments = annotationInspectionCutSegments(implant, clip),
          outerNormal = implant.face === 'front' ? 1 : -1,
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
          const presentation = { kind: 'implant-cut', sortBias: 46 },
            cutState = presentationState(presentation, inspection).materialState,
            cutGeometry = sidewallGeometry(clip),
            cutMaterial = createAnnotationGradientMaterial(implant, cutState, {
              roughness: appearance ? 0.8 : 0.72,
            });
          cutMaterial.polygonOffset = true;
          cutMaterial.polygonOffsetFactor = -2;
          cutMaterial.polygonOffsetUnits = -2;
          cutMaterial.depthFunc = THREE.LessEqualDepth;
          const cut = addSurfaceMesh(
            cutGeometry,
            cutMaterial,
            cutState,
            null,
            46,
            false,
            null,
            presentation,
          );
          if (cut) {
            cut.name = `${implant.name || implant.implantId || 'Implant'} ROI cut`;
            implantCutCount++;
            implantGradientMeshCount++;
          }
        }

        {
          const presentation = { kind: 'implant-internal', sortBias: 30 },
            implantState = presentationState(presentation, inspection).materialState;
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
            body = addSurfaceMesh(
              bodyGeometry,
              bodyMaterial,
              implantState,
              null,
              30,
              false,
              implant.instanceTranslations,
              presentation,
            );
          if (body) {
            body.name = implant.name || implant.implantId || 'Implant';
            implantInternalCount++;
            implantGradientMeshCount++;
          }

          if (followDepthProfile && zIsVisible(implant.innerZ)) {
            const depthPresentation = { kind: 'implant-depth', sortBias: 31 },
              depthState = presentationState(depthPresentation, inspection).materialState;
            roughTasks.push({
              kind: 'implant-depth',
              cap: {
                type: 'cap',
                instanceTranslations: implant.instanceTranslations,
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
              state: depthState,
              presentation: depthPresentation,
              sortBias: 31,
              closeToIdeal: false,
              includeBorders: false,
              implant,
              name: `${implant.name || implant.implantId || 'Implant'} depth boundary`,
            });
          }
        }

        if (!zIsVisible(implant.outerZ)) continue;
        implantSurfaceCount++;
        const surfacePresentation = {
            kind: 'implant-surface',
            exposed: Boolean(implant.surfaceExposed),
            sortBias: 40,
          },
          capState = presentationState(surfacePresentation, inspection).materialState,
          capName = `${implant.name || implant.implantId || 'Implant'} surface`;

        if (appearance) {
          roughTasks.push({
            kind: 'implant',
            cap: {
              type: 'cap',
              instanceTranslations: implant.instanceTranslations,
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
            presentation: surfacePresentation,
            sortBias: 40,
            closeToIdeal: false,
            includeBorders: false,
            implant,
            polygonOffset: true,
            name: capName,
          });
        } else {
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
          const cap = addSurfaceMesh(
            capGeometry,
            capMaterial,
            capState,
            null,
            40,
            false,
            implant.instanceTranslations,
            surfacePresentation,
          );
          if (cap) {
            cap.name = capName;
            implantGradientMeshCount++;
          }
        }
      }

      host.dataset.implantInternalBuiltCount = String(implantInternalCount);
      host.dataset.implantSurfaceBuiltCount = String(implantSurfaceCount);
      host.dataset.implantCutBuiltCount = String(implantCutCount);
      host.dataset.implantGradientMeshCount = String(implantGradientMeshCount);
      host.dataset.implantGradient = 'section-depth';

      let electricalRegionInternalCount = 0,
        electricalRegionSurfaceCount = 0,
        electricalFarLodBodyCount = 0;
      for (const electrical of arrayAnnotations(electricalRegionSolids)) {
        const outerNormal = electrical.face === 'front' ? 1 : -1,
          appearance =
            electrical.surfaceAppearance?.kind === 'rough' ? electrical.surfaceAppearance : null,
          followDepthProfile = Boolean(appearance && electrical.depthProfile !== 'smooth');

        {
          const presentation = { kind: 'electrical-internal', sortBias: 34 },
            electricalState = presentationState(presentation, inspection).materialState,
            visibleSolid = displaySolidForZCollapse(
              followDepthProfile ? { slabs: electrical.slabs, caps: [] } : electrical,
            ),
            displaySolid = electricalDisplaySolidForLod(electrical, visibleSolid, arrayLod),
            bodyGeometry = geometryFromSolid(displaySolid, transparentArrayDisplayTolerance),
            bodyMaterial = new THREE.MeshStandardMaterial({
              color: electrical.color || '#7A6FD0',
              roughness: 0.82,
              metalness: 0,
              side: THREE.DoubleSide,
              ...electricalState,
            }),
            body = addSurfaceMesh(
              bodyGeometry,
              bodyMaterial,
              electricalState,
              null,
              34,
              false,
              electrical.instanceTranslations,
              presentation,
            );
          if (body) {
            body.name = electrical.name || electrical.electricalRegionId || 'Electrical Region';
            electricalRegionInternalCount++;
            if (displaySolid !== visibleSolid) electricalFarLodBodyCount++;
          }

          if (followDepthProfile && zIsVisible(electrical.innerZ)) {
            const depthPresentation = { kind: 'electrical-depth', sortBias: 35 },
              depthState = presentationState(depthPresentation, inspection).materialState;
            roughTasks.push({
              kind: 'electrical-depth',
              cap: {
                type: 'cap',
                instanceTranslations: electrical.instanceTranslations,
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
              state: depthState,
              presentation: depthPresentation,
              sortBias: 35,
              closeToIdeal: false,
              includeBorders: false,
              name: `${electrical.name || electrical.electricalRegionId || 'Electrical Region'} depth boundary`,
            });
          }
        }

        if (!zIsVisible(electrical.outerZ)) continue;
        electricalRegionSurfaceCount++;
        const surfacePresentation = {
            kind: 'electrical-surface',
            exposed: Boolean(electrical.surfaceExposed),
            sortBias: 44,
          },
          capState = presentationState(surfacePresentation, inspection).materialState,
          capName = `${electrical.name || electrical.electricalRegionId || 'Electrical Region'} surface`;

        if (appearance) {
          roughTasks.push({
            kind: 'electrical',
            cap: {
              type: 'cap',
              instanceTranslations: electrical.instanceTranslations,
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
            presentation: surfacePresentation,
            sortBias: 44,
            closeToIdeal: false,
            includeBorders: false,
            polygonOffset: true,
            name: capName,
          });
        } else {
          const capGeometry = geometryFromSolid(
              {
                slabs: [],
                caps: [{ z: electrical.outerZ, normal: outerNormal, polys: electrical.polys }],
              },
              transparentArrayDisplayTolerance,
            ),
            capMaterial = createSurfaceMaterial(
              {
                id: electrical.layerId || electrical.electricalRegionId || 'electrical-region',
                color: electrical.color || '#7A6FD0',
              },
              capState,
              null,
              surfacePresentation,
            );
          capMaterial.polygonOffset = true;
          capMaterial.polygonOffsetFactor = -1;
          capMaterial.polygonOffsetUnits = -1;
          const cap = addSurfaceMesh(
            capGeometry,
            capMaterial,
            capState,
            null,
            44,
            false,
            electrical.instanceTranslations,
            surfacePresentation,
          );
          if (cap) cap.name = capName;
        }
      }

      host.dataset.electricalRegionInternalBuiltCount = String(electricalRegionInternalCount);
      host.dataset.electricalRegionSurfaceBuiltCount = String(electricalRegionSurfaceCount);
      host.dataset.electricalFarLodBodyCount = String(electricalFarLodBodyCount);
      recordVariantStage('annotations-complete');
      const rendererAssemblyAt = performance.now();
      host.dataset.rendererTopologyMs = String(rendererTopologyAt - rendererProfileStart);
      host.dataset.rendererSmoothCapsMs = String(rendererCapsAt - rendererTopologyAt);
      host.dataset.rendererSidewallsMs = String(rendererSidewallsAt - rendererCapsAt);
      host.dataset.rendererAnnotationsMs = String(rendererAssemblyAt - rendererSidewallsAt);
      host.dataset.rendererAssemblyMs = String(rendererAssemblyAt - rendererProfileStart);
      host.dataset.rendererPresentationMs = '0';
      host.dataset.presentationUpdateCount = String(presentationUpdateCount);
      physicalSceneModel = model;
      physicalSceneSignature = signature;
      physicalSurfacePlan = plan;
      activeSceneVariant = targetVariant;
      host.dataset.sceneVariant = targetVariant;
      group.visible = true;
      recordVariantStage('presentation-begin');
      applyPresentationState({ profile: false, settle: false });
      recordVariantStage('presentation-complete');
      cacheActiveSceneVariant();
      if (!roughTasks.length) {
        host.dataset.renderPhase = 'complete';
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
      host.dataset.renderPhase = 'rough-preview';
      host.dataset.renderState = 'refining';
      void requestRoughGeometry('interactive', { refineAfter: true });
    }
    scheduleFrame();
  }

  function fit({ notify = true, preserveOrientation = false } = {}) {
    if (!ready || !camera || !controls || !axesHelper) return;
    const model = getModel();
    if (!model) return;

    const zState = applyZDisplayState(model) || zDisplayState(model),
      zScale = zState.scale,
      zSpan = zState.displaySpan * zScale,
      fitBounds = visibleBounds(model, getClipGeometry()),
      spanX = fitBounds.maxX - fitBounds.minX,
      spanY = fitBounds.maxY - fitBounds.minY,
      centerX = (fitBounds.minX + fitBounds.maxX) / 2,
      centerY = (fitBounds.minY + fitBounds.maxY) / 2,
      size = Math.max(spanX, spanY, zSpan);

    const direction = preserveOrientation
      ? camera.position.clone().sub(controls.target).normalize()
      : new THREE.Vector3(1.05, -1.15, 0.82).normalize();
    const halfFov = (camera.fov * Math.PI) / 360;
    const limitingAngle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect));
    const radius = Math.max(1e-9, Math.hypot(spanX / 2, spanY / 2, zSpan / 2));
    const distance = (radius / Math.sin(limitingAngle)) * 1.12;
    camera.near = Math.max(1e-6, radius / 200);
    camera.far = Math.max(camera.near * 1000, distance + radius * 20);
    camera.updateProjectionMatrix();
    controls.target.set(centerX, centerY, ((zState.displayMin + zState.displayMax) / 2) * zScale);
    camera.position.copy(direction.multiplyScalar(distance).add(controls.target));
    controls.update();
    axesHelper.scale.setScalar(Math.max(0.6, size / 100));
    pendingViewState = getViewState();
    if (notify) onViewChanged(pendingViewState ? structuredClone(pendingViewState) : null);
    refreshCameraArrayLod();
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
      addExportMesh = (geometry, layerId, suffix = '', translations = null) => {
        if (!geometry?.getAttribute?.('position')?.count) {
          geometry?.dispose?.();
          return null;
        }
        const layer = layerById(model, layerId),
          material = exportMaterial(layer),
          mesh = translations
            ? new THREE.InstancedMesh(geometry, material, translations.length)
            : new THREE.Mesh(geometry, material);
        if (translations) {
          const matrix = new THREE.Matrix4();
          translations.forEach(([x, y], i) => {
            matrix.makeTranslation(x, y, 0);
            mesh.setMatrixAt(i, matrix);
          });
        }
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
            const mesh = addExportMesh(
              geometry,
              cap.layerId,
              ' · morphology',
              cap.instanceTranslations,
            );
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
            '',
            cap.instanceTranslations,
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
        if (sidewall.instanceTranslations) {
          addExportMesh(
            geometryFromSidewallParts(sidewall.parts || [sidewall]),
            sidewall.layerId,
            ' · sidewalls',
            sidewall.instanceTranslations,
          );
          continue;
        }
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
