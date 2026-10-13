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
import { observeAdaptiveArrayTiles } from './renderer-v4-adaptive-tiles.js';
import { shouldDisableV4HeavyCameraDamping } from './renderer-v4-interaction-policy.js';
import {
  INTERACTIVE_ASSEMBLY_SLICE_MS,
  shouldYieldRendererAssembly,
  yieldRendererAssembly,
} from './renderer-interaction-scheduler.js';
import {
  SupersededRendererBuild,
  isRendererBuildSuperseded,
  shouldStageRendererScene,
  shouldHideRendererPreviewMesh,
} from './renderer-responsive-staging.js';
import { surveyV4FeatureFootprints } from './renderer-v4-feature-footprints.js';
import { censusV4SceneResources } from './renderer-v4-resource-census.js';
import { disposeRendererSceneResources } from './renderer-v4-resource-lifetime.js';
import { runTemporaryRendererCapture } from './renderer-capture-transaction.js';
import {
  sharedFlatCapZ,
  mappedFlatCapTranslation,
  detachV4SharedFlatCap,
} from './renderer-v4-flat-geometry-sharing.js';
import {
  createAdaptiveTilePlanCache,
  observePreparedAdaptiveTiles,
} from './renderer-v4-tile-plan.js';
import { canIndexSmoothWalls, pushIndexedSmoothWall } from './renderer-quality-index-experiment.js';
import { canPrepareSmoothSidewallsInWorker } from './renderer-v4-smooth-sidewall-data.js';
import { runRendererUnitsInSlices } from './renderer-responsive-budget.js';
import { createRendererLatencyTracker } from './renderer-responsive-latency.js';
import { createRendererLongTaskSampler } from './renderer-responsive-jank.js';
import { createRendererGpuTimer } from './renderer-responsive-gpu-timer.js';
import { hasMaterial, layerById, modelBoundsZ } from './model.js';
import {
  annotationInspectionCutSegments,
  electricalRegionSolids,
  implantSolids,
} from './model-view-geometry.js';
import { buildRenderSurfacePlan } from './renderer-geometry.js';
import { clearRendererBuildFailure, setRendererBuildFailure } from './renderer-rebuild-status.js';
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
  // Expensive V3 profiling is explicitly opt-in for benchmark runs.
  const rendererParams = new URLSearchParams(
    host.ownerDocument?.defaultView?.location?.search || '',
  );
  const v3DiagnosticsEnabled = rendererParams.get('rendererV3Diagnostics') === '1';
  const v3RoiTraceEnabled = rendererParams.get('rendererV3RoiTrace') === '1';
  const v3QualityIndexExperiment = rendererParams.get('rendererV3QualityIndex') === '1';
  const v3FinalFrameOnlyExperiment = rendererParams.get('rendererV3FinalFrameOnly') === '1';
  const v3ElectricalPlanarSinglePassExperiment =
    rendererParams.get('rendererV3ElectricalPlanarSinglePass') === '1';
  // Experimental P0: retain the last committed scene during a new model/ROI build.
  // No default change until full-wafer, rejection, and revision-supersession gates pass.
  const responsiveModelStaging = rendererParams.get('rendererResponsiveModelStage') === '1';
  const responsiveInteractionPreview = rendererParams.get('rendererResponsiveInteraction') === '1';
  const responsiveSmoothSidewallWorker =
    rendererParams.get('rendererResponsiveSmoothWorker') === '1';
  const responsiveRoughBudget = rendererParams.get('rendererResponsiveRoughBudget') === '1';
  const responsiveInputMetrics = rendererParams.get('rendererResponsiveMetrics') === '1';
  const responsiveGpuMetrics = rendererParams.get('rendererResponsiveGpuTimer') === '1';
  const responsiveLatency = createRendererLatencyTracker();
  const responsiveLongTasks = createRendererLongTaskSampler();
  // LongTask entries represent event-loop blocking, not GPU/compositor work.
  // Only observe when profiling was explicitly requested.
  if (responsiveInputMetrics) {
    const Observer = host.ownerDocument?.defaultView?.PerformanceObserver;
    const supported = Boolean(Observer?.supportedEntryTypes?.includes('longtask'));
    host.dataset.rendererLongTaskSupported = String(supported);
    if (supported) {
      try {
        const observer = new Observer((list) => {
          for (const entry of list.getEntries()) responsiveLongTasks.record(entry.duration);
          const summary = responsiveLongTasks.snapshot();
          host.dataset.rendererLongTaskCount = String(summary.count);
          host.dataset.rendererLongTaskP95Ms = String(summary.p95Ms ?? '');
          host.dataset.rendererLongTaskMaxMs = String(summary.maxMs ?? '');
          host.dataset.rendererMainThreadBlockingMs = String(summary.blockingMs);
        });
        observer.observe({ type: 'longtask' });
      } catch (error) {
        host.dataset.rendererLongTaskSupported = 'false';
        console.info('Renderer long-task observer unavailable:', error);
      }
    }
  }
  const v4TileCacheEnabled = rendererParams.get('rendererV4TileCache') === '1';
  const v4FeatureSurveyEnabled = rendererParams.get('rendererV4FeatureSurvey') === '1';
  const v4FastSmoothIndex = rendererParams.get('rendererV4FastSmoothIndex') === '1';
  const v4SharedFlatCapEnabled = rendererParams.get('rendererV4SharedFlatCaps') === '1';
  const v4GpuCensusEnabled = rendererParams.get('rendererV4GpuCensus') === '1';
  const v4HeavyCameraNoDamping = rendererParams.get('rendererV4HeavyCameraNoDamping') === '1';
  const v4TileProbeEnabled =
    rendererParams.get('rendererV4TileProbe') === '1' || v4TileCacheEnabled;
  const v4TilePlanCache = createAdaptiveTilePlanCache();
  let v4PreviousTiers = new Map();
  let v4ObservedModel = null;
  let v4ObservedRevision = null;
  let v4ObservedPlan = null;
  let v4CameraProbe = null;
  let v4CameraProbeSamples = 0;
  let v4CameraProbeLastAt = 0;
  let suppressAssemblyFrames = false;
  let assemblySkippedFrames = 0;

  let renderer = null;
  let gpuTimer = null;
  function resetGpuTimer({ contextLost = false } = {}) {
    gpuTimer?.dispose({ contextLost });
    gpuTimer = null;
  }
  function initializeGpuTimer() {
    if (!responsiveGpuMetrics || !renderer) return;
    resetGpuTimer();
    gpuTimer = createRendererGpuTimer(renderer.getContext(), {
      onUpdate: (metrics) => {
        host.dataset.rendererGpuTimerSupported = String(metrics.supported);
        host.dataset.rendererGpuSamples = String(metrics.samples);
        host.dataset.rendererGpuPendingQueries = String(metrics.pending);
        host.dataset.rendererGpuP95Ms = String(metrics.p95Ms ?? '');
        host.dataset.rendererGpuMaxMs = String(metrics.maxMs ?? '');
        host.dataset.rendererGpuDroppedQueries = String(metrics.dropped);
        host.dataset.rendererGpuDisjointCount = String(metrics.disjointCount);
      },
    });
  }
  let webglContextStatus = 'uninitialized';
  let webglContextLossCount = 0;
  let webglContextRestoreCount = 0;
  let scene = null;
  let camera = null;
  let controls = null;
  let gestureMode = null;
  let gestureWheelZoom = null;
  let group = null;
  let axesHelper = null;
  let ready = false;
  let initPromise = null;
  let frame = null;
  let interacting = false;
  let cameraDampingPending = false;
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
  let v4SharedFlatTemplates = 0;
  let v4SharedFlatMeshes = 0;
  let v4SharedFlatClonesAvoided = 0;
  let v4SharedFlatDetachCount = 0;
  let v4R5DisposedGroups = 0;
  let v4R5DisposedGeometries = 0;
  let v4R5DisposedMaterials = 0;
  let v4R5RetiredFlatTemplates = 0;
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
  let previewRestoreTimer = null;
  const previewHiddenMeshes = new Map();

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

  // PR177's UI v2 uses the existing OrbitControls instance.
  // Legacy callers never opt in and retain the original interaction policy.
  function setGestureMode(mode, { wheelZoom = null } = {}) {
    if (!['rotate', 'pan', 'zoom', 'none'].includes(mode)) return false;
    gestureMode = mode;
    gestureWheelZoom = wheelZoom;
    if (!controls || !THREE) return true;
    controls.mouseButtons.LEFT =
      mode === 'rotate'
        ? THREE.MOUSE.ROTATE
        : mode === 'pan'
          ? THREE.MOUSE.PAN
          : mode === 'zoom'
            ? THREE.MOUSE.DOLLY
            : null;
    controls.touches.ONE =
      mode === 'rotate' ? THREE.TOUCH.ROTATE : mode === 'pan' ? THREE.TOUCH.PAN : null;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    return true;
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

    resetGpuTimer();
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
      flatReadOnly:
        typeof object.geometry.userData?.waferCadV4ReadOnlyFlatZ === 'number' &&
        object.geometry.userData.waferCadV4ReadOnlyFlatZ === minZ &&
        minZ === maxZ,
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
    const record = objectZRecord(object);
    let positions = object?.geometry?.getAttribute?.('position');
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

    // A non-unit Section scale originally rewrites Float32 position buffers.
    // Transforming one shared plane as a mesh translation can differ by a
    // Float32 rounding unit (visible as pixel differences in the 625-site
    // multiview A/B). Detach on first write and preserve the baseline path.
    if (record.flatReadOnly && !canTranslateSide) {
      detachV4SharedFlatCap(object, record, group);
      positions = object.geometry.getAttribute('position');
      v4SharedFlatDetachCount++;
      publishV4SharedFlatCounts();
    }
    // Unit-scale planes can safely translate without any buffer mutation.
    const flatTranslation = mappedFlatCapTranslation(record, state);
    if (canTranslateSide || flatTranslation !== null) {
      if (record.mode === 'mapped') {
        restoreCanonicalZ(record, positions);
        refreshGeometryBounds(object);
      }
      const sample = fullyUpper ? record.minZ : record.maxZ;
      object.position.z = flatTranslation ?? state.mapZ(sample) - sample;
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
    const detachesBefore = v4SharedFlatDetachCount;
    for (const object of zDisplayObjects) applyZDisplayToObject(object, currentZDisplay);
    if (v4GpuCensusEnabled && v4SharedFlatDetachCount !== detachesBefore) {
      writeV4GpuResourceCensus();
    }

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
  // Experimental R2: refresh the screen-space *diagnostic* during camera
  // interactions. The prepared CPU partition is reused; WebGL submissions,
  // visibility, alpha ordering and stored physical Z remain unchanged.
  function refreshV4CameraTileProbe(changed) {
    if (
      !v4TileCacheEnabled ||
      !v4CameraProbe ||
      (!changed && !interacting) ||
      rendering ||
      host.dataset.sceneVariant !== 'transparent' ||
      !camera ||
      !controls
    )
      return;
    const now = performance.now();
    if (now - v4CameraProbeLastAt < 250) return;
    const model = getModel();
    const revision = String(model?.revision ?? 0) + ':' + String(model?.processRevision ?? 0);
    if (
      model !== v4ObservedModel ||
      revision !== v4ObservedRevision ||
      v4CameraProbe.sidewalls !== v4ObservedPlan
    ) {
      v4CameraProbe = null;
      return;
    }
    v4CameraProbeLastAt = now;
    const started = performance.now();
    camera.updateMatrixWorld();
    const viewProjection = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
    const viewport = currentViewport();
    const distance = camera.position.distanceTo(controls.target);
    const { plan, hit } = v4TilePlanCache.get(v4CameraProbe.sidewalls, revision);
    const observed = observePreparedAdaptiveTiles(plan, {
      viewProjectionMatrix: viewProjection.elements,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      displayZScale: currentZDisplay?.scale,
      mapZ: (z) => currentZDisplay?.mapZ?.(z) ?? z,
      visibleIntervals: (z0, z1) => visibleZIntervals(z0, z1, currentZDisplay),
      farTier: v4CameraProbe.farTier,
      clipped: v4CameraProbe.clipped,
      zCollapsed: currentZDisplay?.enabled !== false,
      nearEdgeOn:
        distance <= 0 || Math.abs(camera.position.z - controls.target.z) / distance < 0.35,
      previousTiers: v4PreviousTiers,
    });
    v4PreviousTiers = observed.valid ? observed.nextTiers : new Map();
    const cache = v4TilePlanCache.stats();
    host.dataset.v4TileCacheHit = String(hit);
    host.dataset.v4TileCacheHits = String(cache.hits);
    host.dataset.v4TileCacheMisses = String(cache.misses);
    host.dataset.v4TileCacheRetainedTiles = String(cache.retainedTiles);
    host.dataset.v4TileCacheCameraSamples = String(++v4CameraProbeSamples);
    host.dataset.v4TileProbeMs = String(performance.now() - started);
    host.dataset.v4TileProbeStatus = observed.reason;
    host.dataset.v4TileReductionGate = observed.reductionGate;
    host.dataset.v4TileTotal = String(observed.tiles);
    host.dataset.v4TileNear = String(observed.nearTiles);
    host.dataset.v4TileMid = String(observed.midTiles);
    host.dataset.v4TileFar = String(observed.farTiles);
    host.dataset.v4TileOffscreen = String(observed.offscreenTiles);
    host.dataset.v4TileUncertain = String(observed.uncertainTiles);
    host.dataset.v4TileSkippedTriangles = '0';
  }
  function scheduleFrame() {
    if (!renderer || frame != null || webglContextStatus === 'lost') return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (webglContextStatus === 'lost') return;
      // Experimental large-array loading policy: assembly still yields to UI
      // animation frames, but does not repeatedly submit incomplete meshes.
      // The final exact scene is submitted after the build's finally block.
      if (suppressAssemblyFrames) {
        host.dataset.rendererAssemblySkippedFrames = String(++assemblySkippedFrames);
        return;
      }
      // OrbitControls damping keeps scheduling frames after pointer-up.
      // A full-wafer exact transparent array can cost tens of seconds per
      // software-WebGL frame; repeating these frames starves input handling.
      // Retain drag interaction but stop inertial redraws at this costly tier.
      const heavyExactTransparency =
        host.dataset.sceneVariant === 'transparent' &&
        host.dataset.transparentArrayLodTier === 'exact' &&
        Number(host.dataset.arrayInstances || 0) >= 64;
      // Opt-in V4 interaction pilot: damped inertia can queue many costly
      // full-wafer frames after pointer-up, even with a cached CPU tile plan.
      // This only changes camera easing; no mesh/alpha/draw policy is altered.
      const heavyV4TransparentFrame = shouldDisableV4HeavyCameraDamping({
        enabled: v4HeavyCameraNoDamping,
        sceneVariant: host.dataset.sceneVariant,
        arrayInstances: host.dataset.arrayInstances,
        drawTriangles: host.dataset.rendererDrawTriangles,
      });
      if (controls)
        controls.enableDamping =
          gestureMode === null && !heavyExactTransparency && !heavyV4TransparentFrame;
      host.dataset.cameraDampingEnabled = String(Boolean(controls?.enableDamping));
      host.dataset.v4HeavyCameraNoDampingActive = String(heavyV4TransparentFrame);
      // Preserve the exact completed camera pose on idle frames across both
      // opaque and transparent variants. Repeated OrbitControls.update()
      // calls in an idle damped camera can introduce floating-point drift
      // even without a new pointer event or camera movement.
      // Only active interaction or still-settling inertia may update it.
      const needsCameraUpdate = interacting || cameraDampingPending;
      const changed = needsCameraUpdate ? controls?.update?.() || false : false;
      if (!interacting && !changed) cameraDampingPending = false;
      refreshV4CameraTileProbe(changed);
      updateRoughMaterialLod();
      updateTransparentOrder();
      const frameStartedAt = performance.now();
      gpuTimer?.beginFrame();
      try {
        renderer.render(scene, camera);
      } catch (error) {
        resetGpuTimer({ contextLost: webglContextStatus === 'lost' });
        webglContextStatus = 'error';
        host.dataset.rendererWebglContext = 'error';
        host.dataset.renderState = 'error';
        host.dataset.renderError = error?.message || 'WebGL frame submission failed.';
        stats.textContent = '3D render failed';
        console.warn('3D WebGL frame failed:', error);
        return;
      }
      gpuTimer?.endFrame();
      // Opt-in camera evidence is sampled after the completed GL frame.
      if (v3RoiTraceEnabled) {
        host.dataset.rendererCameraWorld = JSON.stringify(camera.matrixWorld.elements);
        host.dataset.rendererCameraProjection = JSON.stringify(camera.projectionMatrix.elements);
      }
      // Ready/assembly flags can be set before the first WebGL frame. This
      // sequence is committed only after renderer.render actually returns.
      // CI additionally waits for compositor presentation when profiling.
      completedFrameSerial++;
      if (webglContextStatus === 'restoring') {
        webglContextStatus = 'ready';
        host.dataset.rendererWebglContext = 'ready';
        host.dataset.renderState = 'ready';
        host.dataset.rendererWebglRecoveryFrame = String(completedFrameSerial);
        stats.textContent = '3D restored';
      }
      host.dataset.rendererFrameSerial = String(completedFrameSerial);
      const frameCompletedAt = performance.now();
      const submitDurationMs = frameCompletedAt - frameStartedAt;
      host.dataset.rendererFrameMs = String(submitDurationMs);
      if (responsiveInputMetrics) {
        const inputToSubmitMs = responsiveLatency.completeFrame(frameCompletedAt, submitDurationMs);
        const measures = responsiveLatency.snapshot();
        host.dataset.rendererInputSamples = String(measures.inputSamples);
        host.dataset.rendererInputToSubmitP95Ms = String(measures.inputToSubmitP95Ms ?? '');
        host.dataset.rendererInputToSubmitMaxMs = String(measures.inputToSubmitMaxMs ?? '');
        host.dataset.rendererFrameSubmitP95Ms = String(measures.frameSubmitP95Ms ?? '');
        host.dataset.rendererFrameSubmitMaxMs = String(measures.frameSubmitMaxMs ?? '');
        if (inputToSubmitMs !== null)
          host.dataset.rendererInputToSubmitLastMs = String(inputToSubmitMs);
      }
      host.dataset.rendererDrawCalls = String(renderer.info?.render?.calls || 0);
      host.dataset.rendererDrawTriangles = String(renderer.info?.render?.triangles || 0);
      if (interacting || changed) scheduleFrame();
    });
  }

  async function yieldSceneAssembly() {
    scheduleFrame();
    await yieldRendererAssembly({
      requestFrame: requestAnimationFrame,
      postTask: (resume) => setTimeout(resume, 0),
    });
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

  function publishV4SharedFlatCounts() {
    host.dataset.v4SharedFlatTemplates = String(v4SharedFlatTemplates);
    host.dataset.v4SharedFlatMeshes = String(v4SharedFlatMeshes);
    host.dataset.v4SharedFlatClonesAvoided = String(v4SharedFlatClonesAvoided);
    host.dataset.v4SharedFlatDetachCount = String(v4SharedFlatDetachCount);
  }

  function writeV4GpuResourceCensus() {
    if (!v4GpuCensusEnabled) return;
    const groups = [
      ...new Set(
        [
          ...[...sceneVariantCache.values()].map((entry) => entry?.group).filter(Boolean),
          group,
        ].filter(Boolean),
      ),
    ];
    const result = censusV4SceneResources(groups);
    host.dataset.v4GpuResourceStatus = result.reason;
    host.dataset.v4GpuResourceSceneGroups = String(result.groupCount);
    host.dataset.v4GpuResourceMeshes = String(result.meshCount);
    host.dataset.v4GpuResourceGeometries = String(result.geometryCount);
    host.dataset.v4GpuResourceMaterials = String(result.materialCount);
    host.dataset.v4GpuResourceInstancedMeshes = String(result.instancedMeshCount);
    host.dataset.v4GpuResourceRetiredFlatGeometries = String(result.retiredFlatGeometries);
    host.dataset.v4GpuResourceEstimatedBufferBytes = String(result.estimatedBufferBytes);
    host.dataset.v4GpuResourceCrossVariantGeometries = String(result.crossGroupGeometries);
    host.dataset.v4GpuResourceCrossVariantMaterials = String(result.crossGroupMaterials);
    host.dataset.v4GpuResourceComplete = String(result.complete);
  }

  function disposeSceneResourcesSafely(targetGroup) {
    return disposeRendererSceneResources(targetGroup, {
      onError: (error) => {
        const failures = Number(host.dataset.rendererDisposalFailures || 0);
        host.dataset.rendererDisposalFailures = String(failures + error.errors.length);
        console.warn('3D scene resource disposal failed; continuing cleanup:', error);
      },
    });
  }

  function disposeGroup() {
    if (!group) return;
    if (previewRestoreTimer != null) clearTimeout(previewRestoreTimer);
    previewRestoreTimer = null;
    previewHiddenMeshes.clear();
    delete host.dataset.rendererInteractionPreview;
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
    recordV4R5Disposal(disposeSceneResourcesSafely(group));
    zDisplayObjects = new Set();
    currentZDisplay = null;
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
      v4SharedFlatTemplates,
      v4SharedFlatMeshes,
      v4SharedFlatClonesAvoided,
      v4SharedFlatDetachCount,
      arrayLodTier: host.dataset.transparentArrayLodTier || 'exact',
      arrayLodTolerance: host.dataset.transparentArrayDisplayTolerance || '0',
      electricalFarLodBodyCount: host.dataset.electricalFarLodBodyCount || '0',
      v3QualityIndexedVertices: host.dataset.v3QualityIndexedVertices || '0',
      v3QualityOriginalVertices: host.dataset.v3QualityOriginalVertices || '0',
      v3QualityIndexedTriangles: host.dataset.v3QualityIndexedTriangles || '0',
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

  function recordV4R5Disposal(report) {
    if (!report) return;
    v4R5DisposedGroups++;
    v4R5DisposedGeometries += report.geometries;
    v4R5DisposedMaterials += report.materials;
    v4R5RetiredFlatTemplates += report.retiredFlatTemplates;
    host.dataset.v4R5DisposedGroups = String(v4R5DisposedGroups);
    host.dataset.v4R5DisposedGeometries = String(v4R5DisposedGeometries);
    host.dataset.v4R5DisposedMaterials = String(v4R5DisposedMaterials);
    host.dataset.v4R5RetiredFlatTemplates = String(v4R5RetiredFlatTemplates);
  }

  function disposeSceneGroup(targetGroup) {
    if (!targetGroup) return;
    recordV4R5Disposal(disposeSceneResourcesSafely(targetGroup));
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
    v4SharedFlatTemplates = entry.v4SharedFlatTemplates || 0;
    v4SharedFlatMeshes = entry.v4SharedFlatMeshes || 0;
    v4SharedFlatClonesAvoided = entry.v4SharedFlatClonesAvoided || 0;
    v4SharedFlatDetachCount = entry.v4SharedFlatDetachCount || 0;
    publishV4SharedFlatCounts();
    physicalSceneModel = entry.model;
    physicalSceneSignature = entry.signature;
    activeSceneVariant = entry.mode;
    host.dataset.sceneVariant = entry.mode;
    host.dataset.transparentArrayLodTier = entry.arrayLodTier || 'exact';
    host.dataset.transparentArrayDisplayTolerance = entry.arrayLodTolerance || '0';
    host.dataset.fullWaferTransparencyLod = String(entry.arrayLodTier !== 'exact');
    host.dataset.electricalFarLodBodyCount = entry.electricalFarLodBodyCount || '0';
    host.dataset.v3QualityIndexedVertices = entry.v3QualityIndexedVertices || '0';
    host.dataset.v3QualityOriginalVertices = entry.v3QualityOriginalVertices || '0';
    host.dataset.v3QualityIndexedTriangles = entry.v3QualityIndexedTriangles || '0';
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
    host.dataset.v3ProjectionRawTriangleUpperBound = entry.v3ProjectionProbe?.rawTriangles || '0';
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
    writeV4GpuResourceCensus();
    return true;
  }

  function startSceneVariantBuild(mode, { countVariant = true } = {}) {
    cacheActiveSceneVariant();
    // #186 production P0 diagnostics: the previous committed group must stay
    // attached while the replacement variant is built without partial frames.
    if (countVariant)
      host.dataset.rendererRetainedCompleteVisible = String(
        Boolean(group?.visible && group?.parent === scene),
      );
    if (countVariant)
      host.dataset.rendererRetainedVariantBuilds = String(
        Number(host.dataset.rendererRetainedVariantBuilds || 0) + 1,
      );
    // Keep the previous committed variant attached until the replacement is complete.
    // The building group stays invisible, so no partial transparent scene is shown.
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
    v4SharedFlatTemplates = 0;
    v4SharedFlatMeshes = 0;
    v4SharedFlatClonesAvoided = 0;
    v4SharedFlatDetachCount = 0;
    publishV4SharedFlatCounts();
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

  // For an actively manipulated heavy transparent wafer, draw exposed geometry
  // first and defer costly *internal display-only* surfaces until pointer-up.
  // The authoritative model and every mesh stay allocated and unchanged.
  function enterInteractionPreview() {
    if (previewRestoreTimer != null) clearTimeout(previewRestoreTimer);
    previewRestoreTimer = null;
    if (previewHiddenMeshes.size) return true;
    if (!responsiveInteractionPreview || !presentationObjects.size) return false;
    const hasRoi = Boolean(getClipGeometry());
    for (const object of presentationObjects) {
      if (
        shouldHideRendererPreviewMesh({
          enabled: responsiveInteractionPreview,
          sceneVariant: activeSceneVariant,
          arrayInstances: host.dataset.arrayInstances,
          kind: object.userData?.waferCadPresentation?.kind,
          visible: object.visible === true,
          hasRoi,
        })
      ) {
        previewHiddenMeshes.set(object, true);
        object.visible = false;
      }
    }
    if (!previewHiddenMeshes.size) return false;
    host.dataset.rendererInteractionPreview = 'active';
    host.dataset.rendererPreviewHiddenMeshes = String(previewHiddenMeshes.size);
    host.dataset.renderPhase = 'interactive-preview';
    stats.textContent = '3D interactive preview · internal details deferred';
    refreshTransparentRegistry();
    return true;
  }

  function leaveInteractionPreview() {
    if (previewRestoreTimer != null) clearTimeout(previewRestoreTimer);
    previewRestoreTimer = null;
    if (!previewHiddenMeshes.size) return false;
    for (const [object, priorVisibility] of previewHiddenMeshes) object.visible = priorVisibility;
    previewHiddenMeshes.clear();
    delete host.dataset.rendererInteractionPreview;
    host.dataset.rendererPreviewHiddenMeshes = '0';
    refreshTransparentRegistry();
    return true;
  }

  function scheduleInteractionDetail() {
    if (!previewHiddenMeshes.size) return false;
    if (previewRestoreTimer != null) clearTimeout(previewRestoreTimer);
    previewRestoreTimer = setTimeout(() => {
      previewRestoreTimer = null;
      if (interacting || rendering) {
        scheduleInteractionDetail();
        return;
      }
      if (!leaveInteractionPreview()) return;
      syncRenderPolicy();
      transparencyOrderDirty = true;
      updateTransparentOrder();
      scheduleDetailedRoughBuild();
      refreshCameraArrayLod();
      host.dataset.renderPhase = 'complete';
      stats.textContent = hasMaterial(getModel())
        ? getClipGeometry()
          ? 'ROI'
          : 'full model'
        : 'no material';
      scheduleFrame();
    }, 180);
    return true;
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
      preparedParts =
        displayTolerance > 0
          ? simplifyDisplaySidewallParts(parts, displayTolerance)
          : mergeCollinearSidewallParts(parts),
      useIndex = indexedSmooth && canIndexSmoothWalls(preparedParts);

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
        if (useIndex) {
          pushIndexedSmoothWall(positions, normals, indices, lower0, lower1, upper1, upper0);
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
      shareFlatGeometry = false,
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
    const flatShared =
      shareFlatGeometry && chunks.length > 1
        ? sharedFlatCapZ(geometry, {
            enabled: v4SharedFlatCapEnabled,
            planarCap: true,
            adaptiveRough,
            appearance,
          })
        : null;
    if (flatShared) {
      geometry.userData.waferCadV4ReadOnlyFlatZ = flatShared.z;
      v4SharedFlatTemplates++;
      v4SharedFlatMeshes += chunks.length;
      v4SharedFlatClonesAvoided += chunks.length - 1;
      publishV4SharedFlatCounts();
    }
    chunks.forEach((chunk, chunkIndex) => {
      // Z-collapse can remap vertex Z coordinates in place. Give each spatial
      // chunk its own tiny template geometry so one chunk cannot mutate the
      // canonical coordinates observed by another chunk.
      const chunkGeometry = flatShared || chunkIndex === 0 ? geometry : geometry.clone(),
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

  function releaseAdaptiveRoughSubset(objects) {
    const owned = new Set([...objects].filter((object) => roughOwnedObjects.has(object)));
    if (!owned.size) return;
    transparentMeshes = transparentMeshes.filter((entry) => !owned.has(entry.mesh));
    for (const object of owned) {
      zDisplayObjects.delete(object);
      presentationObjects.delete(object);
      object.parent?.remove(object);
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        // Non-rough scene objects may share pooled opaque materials.
        if (!material || material.userData?.waferCadPooledPresentationMaterial) continue;
        material.bumpMap?.dispose?.();
        material.dispose?.();
      }
      roughOwnedObjects.delete(object);
    }
    roughMeshes = roughMeshes.filter((entry) => !owned.has(entry.mesh));
  }

  function clearAdaptiveRoughObjects() {
    releaseAdaptiveRoughSubset(roughOwnedObjects);
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

  // Share exact mesh creation between the existing synchronous commit and an
  // optional cooperative path. Hidden staged objects become visible atomically
  // only when applyPresentationState runs after the final geometry unit.
  function appendRoughMeshResult(result, context, mode, { hidden = false } = {}) {
    const task = roughTasks[result.taskId];
    if (!task || !result.data) return;
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
      if (hidden) mesh.visible = false;
    }

    if (
      task.includeBorders !== false &&
      !cap.buried &&
      geometry.userData.roughBorderPositions?.length
    ) {
      const border = addBorderPositions(
        instanceBorderPositions(geometry.userData.roughBorderPositions, cap.instanceTranslations),
        {
          order: 100010 + (cap.solidIndex || 0),
          opacity: context.opacity,
          adaptiveRough: true,
          presentation: { kind: 'border' },
        },
      );
      if (hidden && border) border.visible = false;
    }
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

    for (const result of results || []) appendRoughMeshResult(result, context, mode);

    return finalizeRoughMeshResults(diagnostics, mode, signature, context);
  }

  function finalizeRoughMeshResults(diagnostics, mode, signature, context) {
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

  // P2.2 opt-in: assemble each Worker result in small main-thread slices.
  // Each geometry/mesh is individually atomic; WebGL draw/upload is NOT
  // preemptible. Foreground pointer activity takes precedence between units.
  async function applyRoughMeshResultsBudgeted(
    results,
    diagnostics,
    mode,
    signature,
    sceneToken,
    generation,
  ) {
    const context = roughRenderContext;
    const current = () =>
      roughRenderContext === context &&
      context?.sceneGeneration === sceneToken &&
      sceneGeneration === sceneToken &&
      generation === roughWorkerGeneration;
    if (!current()) return false;
    // Transactional refinement: retain the complete interactive representation
    // while new detailed meshes are assembled invisibly in bounded slices.
    const retained = new Set(roughOwnedObjects);
    const staged = new Set();
    const sceneGroup = group;
    host.dataset.rendererRoughRetainedPreviewMeshes = String(retained.size);
    host.dataset.rendererRoughStagedMeshes = '0';
    host.dataset.renderState = 'refining';
    host.dataset.renderPhase = 'assembling-rough';
    const started = performance.now();
    let applied;
    try {
      applied = await runRendererUnitsInSlices(
        results || [],
        (result) => {
          appendRoughMeshResult(result, context, mode, { hidden: true });
          for (const object of roughOwnedObjects) {
            if (!retained.has(object)) staged.add(object);
          }
          host.dataset.rendererRoughStagedMeshes = String(staged.size);
        },
        {
          now: () => performance.now(),
          yieldControl: () =>
            yieldRendererAssembly({
              requestFrame: requestAnimationFrame,
              postTask: (resume) => setTimeout(resume, 0),
            }),
          isCurrent: () => current() && group === sceneGroup,
          foregroundBusy: () => interacting || rendering,
          budgetMs: INTERACTIVE_ASSEMBLY_SLICE_MS,
          maxUnitsPerSlice: 8,
        },
      );
    } catch (error) {
      releaseAdaptiveRoughSubset(staged);
      host.dataset.rendererRoughAssemblyCancelled = 'true';
      throw error;
    }
    host.dataset.rendererRoughAssemblyYields = String(applied.yields);
    host.dataset.rendererRoughAssemblyUnits = String(applied.processed);
    host.dataset.rendererRoughAssemblyWallMs = String(performance.now() - started);
    host.dataset.rendererRoughAssemblyMaxUnitMs = String(applied.maxUnitMs);
    if (!applied.completed || !current() || group !== sceneGroup) {
      // Clean ONLY our staging objects. Another input or model revision may
      // have already committed a new interactive scene in the meantime.
      releaseAdaptiveRoughSubset(staged);
      host.dataset.rendererRoughAssemblyCancelled = 'true';
      return false;
    }
    // The old representation is retired only once the new exact mesh set is
    // complete. applyPresentationState makes the staged set visible at commit.
    releaseAdaptiveRoughSubset(retained);
    host.dataset.rendererRoughAssemblyCancelled = 'false';
    host.dataset.rendererRoughRefinementSwaps = String(
      Number(host.dataset.rendererRoughRefinementSwaps || 0) + 1,
    );
    return finalizeRoughMeshResults(diagnostics, mode, signature, context);
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

      worker.onmessage = async (event) => {
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
        let applied = false;
        try {
          applied =
            responsiveRoughBudget && !interactive && message.results.length >= 8
              ? await applyRoughMeshResultsBudgeted(
                  message.results,
                  diagnostics,
                  mode,
                  signature,
                  sceneToken,
                  generation,
                )
              : applyRoughMeshResults(
                  message.results,
                  diagnostics,
                  mode,
                  interactive ? null : signature,
                  sceneToken,
                );
        } catch (error) {
          console.warn('Budgeted rough scene application failed.', error);
          // Do not misrepresent partially staged geometry as a final scene.
          if (generation === roughWorkerGeneration && sceneGeneration === sceneToken) {
            // The transactional detailed path already removed its partial
            // meshes. Keep the previous preview available for recovery.
            host.dataset.renderState = 'error';
            host.dataset.renderPhase = 'failed';
            stats.textContent = '3D rough geometry failed; previous preview retained';
          }
        }
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
          webglContextStatus = 'ready';
          host.dataset.rendererWebglContext = 'ready';
          renderer.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            resetGpuTimer({ contextLost: true });
            webglContextStatus = 'lost';
            host.dataset.rendererWebglContext = 'lost';
            host.dataset.rendererWebglContextLosses = String(++webglContextLossCount);
            host.dataset.renderState = 'context-lost';
            stats.textContent = '3D WebGL context lost';
            if (frame != null) {
              cancelAnimationFrame(frame);
              frame = null;
            }
          });
          renderer.domElement.addEventListener('webglcontextrestored', () => {
            if (webglContextStatus !== 'lost') return;
            webglContextStatus = 'restoring';
            host.dataset.rendererWebglContext = 'restoring';
            host.dataset.rendererWebglContextRestores = String(++webglContextRestoreCount);
            host.dataset.renderState = 'restoring';
            stats.textContent = 'restoring 3D…';
            // Three recreates context-owned state internally. Reapply the
            // canvas/background state on its new GL context before drawing.
            renderer.setClearColor(0xf5f7f9);
            initializeGpuTimer();
            // Match resize(): clientHeight rounds fractional CSS pixels, which
            // changed a 273px framebuffer into 274px after WebGL recovery.
            // Even one pixel changes geometry rasterization and breaks parity.
            const rect = host.getBoundingClientRect();
            renderer.setSize(Math.max(2, rect.width), Math.max(2, rect.height), false);
            if (pendingRender && !rendering) void render();
            scheduleFrame();
          });
          initializeGpuTimer();
          preferredPixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
          renderer.setPixelRatio(preferredPixelRatio);
          renderer.setClearColor(0xf5f7f9);

          scene = new THREE.Scene();
          camera = new THREE.PerspectiveCamera(34, 1, 1, 1e9);
          camera.up.set(0, 0, 1);
          camera.position.set(115, -125, 95);

          renderer.domElement.addEventListener(
            'wheel',
            (event) => {
              if (gestureMode !== null && !(gestureWheelZoom ?? gestureMode === 'zoom')) {
                event.preventDefault();
                event.stopImmediatePropagation();
              }
            },
            { capture: true, passive: false },
          );
          controls = new OrbitControls(camera, renderer.domElement);
          if (gestureMode !== null) setGestureMode(gestureMode, { wheelZoom: gestureWheelZoom });
          controls.target.set(0, 0, 0);
          controls.enableDamping = true;
          controls.addEventListener('start', () => {
            if (responsiveInputMetrics) responsiveLatency.markInput(performance.now());
            interacting = true;
            cameraDampingPending = true;
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
            enterInteractionPreview();
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
            if (responsiveInputMetrics && interacting)
              responsiveLatency.markInput(performance.now());
            if (!interacting) scheduleDetailedRoughBuild();
            scheduleFrame();
          });
          controls.addEventListener('end', () => {
            if (responsiveInputMetrics) responsiveLatency.markInput(performance.now());
            interacting = false;
            host.dataset.interactionPixelRatio = String(renderer.getPixelRatio());
            pendingViewState = getViewState();
            onViewChanged(pendingViewState ? structuredClone(pendingViewState) : null);
            if (scheduleInteractionDetail()) {
              // Keep the lightweight preview for a short quiet period; restore
              // exact transparency and full DPR before any final inspection.
              scheduleFrame();
              return;
            }
            syncRenderPolicy();
            transparencyOrderDirty = true;
            updateTransparentOrder();
            scheduleDetailedRoughBuild();
            refreshCameraArrayLod();
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
    if (webglContextStatus === 'lost') {
      pendingRender = true;
      host.dataset.renderState = 'context-lost';
      return;
    }
    if (rendering) {
      pendingRender = true;
      return;
    }
    // Never cache a display-only interaction preview as a committed scientific
    // scene when Process, ROI, opacity or Quality changes during a gesture.
    if (previewHiddenMeshes.size) leaveInteractionPreview();
    clearRendererBuildFailure(host);
    const model = getModel();
    if (!model) return;
    const clip = getClipGeometry(),
      inspection = getInspection() || {},
      signature = sceneSignature(model, clip, inspection),
      targetVariant = presentationMode(inspection);
    let variantBuild = false;
    const previousVariant = activeSceneVariant;
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
        // A rejected ROI may have hidden the retained, otherwise valid scene.
        group.visible = true;
        delete host.dataset.rendererDisplayedState;
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
        delete host.dataset.rendererDisplayedState;
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

    const previousSceneGeneration = sceneGeneration;
    const renderGeneration = variantBuild ? sceneGeneration : ++sceneGeneration;
    let sceneReplaced = false;
    let rebuildFailed = false;
    let stagedPreviousScene = null;
    let smoothSidewallWorker = null;
    let smoothSidewallWorkerJobs = 0;
    let smoothSidewallWorkerFallbacks = 0;
    let smoothSidewallWorkerWallMs = 0;
    pendingRender = false;
    const rejectSupersededBuild = () => {
      if (!pendingRender) return;
      const currentModel = getModel();
      if (
        isRendererBuildSuperseded({
          pending: true,
          originalModel: model,
          currentModel,
          originalSignature: signature,
          currentSignature: currentModel
            ? sceneSignature(currentModel, getClipGeometry(), getInspection() || {})
            : '',
          originalVariant: targetVariant,
          currentVariant: presentationMode(),
        })
      )
        throw new SupersededRendererBuild();
    };
    host.dataset.renderState = 'building';
    host.dataset.sceneGeneration = String(renderGeneration);
    host.dataset.modelRevision = String(model.revision ?? 0);
    host.dataset.processRevision = String(model.processRevision ?? 0);
    host.dataset.rendererUpdateKind = variantBuild ? 'variant-build' : 'rebuild';
    stats.textContent = variantBuild ? 'preparing 3D transparency…' : 'rebuilding 3D…';
    const rendererProfileStart = performance.now();
    // Opt-in CPU-only worker: no new WebGL context or change to scientific
    // geometry, sorting, material policy, or final GPU renderer.
    const prepareSidewallGeometry = async (parts, tolerance = 0, options = {}) => {
      if (
        !responsiveSmoothSidewallWorker ||
        !canPrepareSmoothSidewallsInWorker(parts, {
          displayTolerance: tolerance,
          indexedSmooth: options.indexedSmooth === true,
        })
      ) {
        return geometryFromSidewallParts(parts, tolerance, options);
      }
      const startedAt = performance.now();
      try {
        if (!smoothSidewallWorker) {
          const url = new URL('./renderer-v4-smooth-sidewall-worker.js', import.meta.url);
          url.search = new URL(import.meta.url).search;
          smoothSidewallWorker = new Worker(url);
        }
        const id = ++smoothSidewallWorkerJobs;
        const result = await new Promise((resolve, reject) => {
          smoothSidewallWorker.onmessage = ({ data }) => {
            if (data?.id !== id) return;
            if (data.type === 'done') resolve(data);
            else if (data.type === 'error') reject(new Error(data.message));
          };
          smoothSidewallWorker.onerror = (event) => {
            reject(new Error(event.message || 'Smooth-sidewall worker failed'));
          };
          smoothSidewallWorker.postMessage({ id, parts });
        });
        rejectSupersededBuild();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(result.positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(result.normals, 3));
        smoothSidewallWorkerWallMs += performance.now() - startedAt;
        return geometry;
      } catch (error) {
        if (error instanceof SupersededRendererBuild) throw error;
        smoothSidewallWorkerFallbacks++;
        smoothSidewallWorker?.terminate();
        smoothSidewallWorker = null;
        console.warn('Smooth-sidewall worker unavailable; using original exact builder.', error);
        return geometryFromSidewallParts(parts, tolerance, options);
      }
    };
    // Manual-only ROI performance breadcrumbs. No geometry or presentation changes.
    const recordRoiStage = (name) => {
      if (!v3RoiTraceEnabled || !clip) return;
      const elapsedMs = performance.now() - rendererProfileStart;
      host.dataset.rendererRoiStage = name;
      host.dataset.rendererRoiStageElapsedMs = String(elapsedMs);
      console.info(
        'WAFERCAD_ROI_STAGE',
        JSON.stringify({ name, elapsedMs, sceneGeneration: renderGeneration }),
      );
    };
    recordRoiStage('begin');

    rendering = true;
    buildStageStartedAt = performance.now();
    recordVariantStage('begin');
    try {
      // Resolve bounded clipped topology BEFORE disposing the last valid scene.
      // In particular, a 625-site ROI can hit the three-million-point guard.
      // This is a controlled rejection, not a long-running WebGL build.
      recordRoiStage('surface-plan-start');
      const plan =
        variantBuild && physicalSurfacePlan
          ? physicalSurfacePlan
          : buildRenderSurfacePlan(model, clip);
      recordRoiStage('surface-plan-complete');
      if (!variantBuild) {
        sceneReplaced = true;
        if (
          shouldStageRendererScene({
            enabled: responsiveModelStaging,
            hasCommittedGroup: Boolean(group?.visible && group?.parent === scene),
            hasPresentation: presentationObjects.size > 0,
            variant: activeSceneVariant,
          })
        ) {
          stagedPreviousScene = {
            snapshot: snapshotSceneVariant(),
            cachedVariants: sceneVariantCache,
            physicalSurfacePlan,
          };
          clearRoughRefineTimer();
          terminateRoughWorker({ invalidate: true });
          // New revision must never inherit cached presentation groups from
          // the previous model. Keep them separately until commit/rollback.
          sceneVariantCache = new Map();
          startSceneVariantBuild(targetVariant, { countVariant: false });
          sceneVariantCache = new Map();
          host.dataset.rendererDisplayedState = 'stale';
          host.dataset.rendererStagedModelBuilds = String(
            Number(host.dataset.rendererStagedModelBuilds || 0) + 1,
          );
          stats.textContent = 'Building 3D · previous model shown (outdated)…';
        } else {
          disposeGroup();
        }
      }
      syncRenderPolicy();
      applyZDisplayState(model);

      const materialState = inspectionMaterialState(inspection.opacity),
        opacity = materialState.opacity,
        borders = Boolean(inspection.borders);
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
        distanceForV3 = camera && controls ? camera.position.distanceTo(controls.target) : 0,
        v3Budget = v3DiagnosticsEnabled
          ? buriedInterfaceSubpixelBudget(plan.sidewalls, {
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
            })
          : {
              mode: 'observe-only',
              qualified: false,
              exclusionReason: 'diagnostics-disabled',
              candidates: 0,
              instanceWallSegments: 0,
              rawTwoPassTriangleEstimate: 0,
              skippedTriangles: 0,
            };
      host.dataset.v3ScreenBudgetMode = v3Budget.mode;
      host.dataset.v3ScreenBudgetQualified = String(v3Budget.qualified);
      host.dataset.v3ScreenBudgetReason = v3Budget.exclusionReason || 'qualified';
      host.dataset.v3SubpixelWallCandidates = String(v3Budget.candidates);
      host.dataset.v3SubpixelWallInstances = String(v3Budget.instanceWallSegments);
      host.dataset.v3SubpixelRawTriangleEstimate = String(v3Budget.rawTwoPassTriangleEstimate);
      host.dataset.v3SkippedTriangles = String(v3Budget.skippedTriangles);
      // Read-only sample of *actual perspective projection*, even when a
      // collapsed Section disqualifies every candidate from future culling.
      // Strictly bounded per owner/edge/instance to avoid adding GPU work.
      let v3Projected = null;
      if (
        v3DiagnosticsEnabled &&
        targetVariant === 'transparent' &&
        arrayLod.tier !== 'exact' &&
        camera
      ) {
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
            )
              return null;
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
      if (
        v3DiagnosticsEnabled &&
        targetVariant === 'transparent' &&
        arrayLod.tier !== 'exact' &&
        camera
      ) {
        const viewProjection = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
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
      host.dataset.v3EdgeSurveyRawUpperBound = String(v3Edges?.representedRawTwoPassTriangles || 0);
      host.dataset.v3EdgeSurveySubpixelRawUpperBound = String(
        v3Edges?.subpixelRawTwoPassUpperBound || 0,
      );
      host.dataset.v3EdgeSurveyMs = String(v3EdgesMs);
      host.dataset.v3EdgeSurveyTopOwners = JSON.stringify(v3Edges?.topOwners || []);
      // V4 R1 remains purely observational. Never omit transparent surfaces
      // based on a pixel footprint: alpha/occlusion parity is unproven.
      const v4Revision = String(model.revision ?? 0) + ':' + String(model.processRevision ?? 0);
      if (
        v4ObservedModel !== model ||
        v4ObservedRevision !== v4Revision ||
        v4ObservedPlan !== plan.sidewalls
      ) {
        v4PreviousTiers = new Map();
        v4TilePlanCache.clear();
        v4ObservedModel = model;
        v4ObservedRevision = v4Revision;
        v4ObservedPlan = plan.sidewalls;
        v4CameraProbe = null;
      }
      let v4Tiles = null;
      let v4ProbeMs = 0;
      let v4CacheHit = false;
      if (v4TileProbeEnabled && targetVariant === 'transparent' && camera) {
        const probeStartedAt = performance.now();
        camera.updateMatrixWorld();
        const viewProjection = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
        const v4Projection = {
          viewProjectionMatrix: viewProjection.elements,
          viewportWidth: viewportForV3.width,
          viewportHeight: viewportForV3.height,
          displayZScale: currentZDisplay?.scale,
          mapZ: (z) => currentZDisplay?.mapZ?.(z) ?? z,
          visibleIntervals: (z0, z1) => visibleZIntervals(z0, z1, currentZDisplay),
          farTier: arrayLod.tier !== 'exact',
          clipped: Boolean(clip),
          zCollapsed: currentZDisplay?.enabled !== false,
          nearEdgeOn:
            distanceForV3 <= 0 ||
            Math.abs(camera.position.z - controls.target.z) / distanceForV3 < 0.35,
          previousTiers: v4PreviousTiers,
        };
        if (v4TileCacheEnabled) {
          const cached = v4TilePlanCache.get(plan.sidewalls, v4Revision);
          v4CacheHit = cached.hit;
          v4Tiles = observePreparedAdaptiveTiles(cached.plan, v4Projection);
        } else {
          v4Tiles = observeAdaptiveArrayTiles(plan.sidewalls, v4Projection);
        }
        v4PreviousTiers = v4Tiles.valid ? v4Tiles.nextTiers : new Map();
        v4ProbeMs = performance.now() - probeStartedAt;
        v4CameraProbeLastAt = performance.now();
      }
      v4CameraProbe =
        v4TileCacheEnabled && targetVariant === 'transparent'
          ? {
              sidewalls: plan.sidewalls,
              farTier: arrayLod.tier !== 'exact',
              clipped: Boolean(clip),
            }
          : null;
      const v4CacheStats = v4TilePlanCache.stats();
      host.dataset.v4TileCacheMode = v4TileCacheEnabled ? 'cpu-plan' : 'off';
      host.dataset.v4TileCacheHit = String(v4CacheHit);
      host.dataset.v4TileCacheHits = String(v4CacheStats.hits);
      host.dataset.v4TileCacheMisses = String(v4CacheStats.misses);
      host.dataset.v4TileCacheEvictions = String(v4CacheStats.evictions);
      host.dataset.v4TileCacheRetainedTiles = String(v4CacheStats.retainedTiles);
      host.dataset.v4TileCacheCameraSamples = String(v4CameraProbeSamples);
      host.dataset.v4TileProbeStatus = v4Tiles?.reason || 'disabled';
      host.dataset.v4TileReductionGate = v4Tiles?.reductionGate || 'probe-disabled';
      host.dataset.v4TileProbeMs = String(v4ProbeMs);
      host.dataset.v4TileTotal = String(v4Tiles?.tiles || 0);
      host.dataset.v4TileNear = String(v4Tiles?.nearTiles || 0);
      host.dataset.v4TileMid = String(v4Tiles?.midTiles || 0);
      host.dataset.v4TileFar = String(v4Tiles?.farTiles || 0);
      host.dataset.v4TileOffscreen = String(v4Tiles?.offscreenTiles || 0);
      host.dataset.v4TileUncertain = String(v4Tiles?.uncertainTiles || 0);
      host.dataset.v4TileOwnerOverflow = String(v4Tiles?.ownerOverflow || 0);
      host.dataset.v4TileOverflow = String(v4Tiles?.tileOverflow || 0);
      host.dataset.v4TileSkippedTriangles = '0';
      host.dataset.v4TileSample = JSON.stringify(v4Tiles?.sample || []);
      // R3 feature-level projection is much finer than tile bounding
      // volumes; it remains a bounded read-only probe, not an alpha gate.
      let v4Features = null;
      let v4FeatureProbeMs = 0;
      if (v4FeatureSurveyEnabled && targetVariant === 'transparent' && camera) {
        const started = performance.now();
        camera.updateMatrixWorld();
        const viewProjection = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
        v4Features = surveyV4FeatureFootprints(plan.sidewalls, {
          viewProjectionMatrix: viewProjection.elements,
          viewportWidth: viewportForV3.width,
          viewportHeight: viewportForV3.height,
          displayZScale: currentZDisplay?.scale,
          mapZ: (z) => currentZDisplay?.mapZ?.(z) ?? z,
          visibleIntervals: (z0, z1) => visibleZIntervals(z0, z1, currentZDisplay),
          farTier: arrayLod.tier !== 'exact',
          clipped: Boolean(clip),
          zCollapsed: currentZDisplay?.enabled !== false,
          edgeOn:
            distanceForV3 <= 0 ||
            Math.abs(camera.position.z - controls.target.z) / distanceForV3 < 0.35,
        });
        v4FeatureProbeMs = performance.now() - started;
      }
      host.dataset.v4FeatureStatus = v4Features?.reason || 'disabled';
      host.dataset.v4FeatureGate = v4Features?.reductionGate || 'probe-disabled';
      host.dataset.v4FeatureOwners = String(v4Features?.owners || 0);
      host.dataset.v4FeatureSampledOwners = String(v4Features?.sampledOwners || 0);
      host.dataset.v4FeatureMeasuredQuads = String(v4Features?.measuredQuads || 0);
      host.dataset.v4FeatureRepresentedQuads = String(v4Features?.representedQuads || 0);
      host.dataset.v4FeatureSubpixelQuads = String(v4Features?.subpixelQuads || 0);
      host.dataset.v4FeatureNearUncertain = String(v4Features?.nearPlaneUncertainQuads || 0);
      host.dataset.v4FeatureOverflow = String(v4Features?.workOverflow || 0);
      host.dataset.v4FeatureCandidateRawTriangles = String(v4Features?.rawTriangleCandidates || 0);
      host.dataset.v4FeatureSkippedTriangles = '0';
      host.dataset.v4FeatureProbeMs = String(v4FeatureProbeMs);
      const interfaceState = interfaceMaterialState(opacity),
        smoothCaps = new Map(),
        sidewalls = new Map(),
        rendererTopologyAt = performance.now();
      recordRoiStage('topology-complete');

      const cooperativeAssembly = Number(plan.arrayInstances || 0) >= 64;
      // Building a new opacity variant must not draw a half-assembled 3D scene.
      // Leave the last committed canvas frame visible until the atomic swap.
      suppressAssemblyFrames =
        Boolean(stagedPreviousScene) ||
        variantBuild ||
        (v3FinalFrameOnlyExperiment && cooperativeAssembly);
      assemblySkippedFrames = 0;
      host.dataset.rendererAssemblyFramePolicy = suppressAssemblyFrames ? 'final-only' : 'preview';
      host.dataset.rendererAssemblySkippedFrames = '0';
      let sceneAssemblyYields = 0,
        nextAssemblyYieldAt = performance.now() + INTERACTIVE_ASSEMBLY_SLICE_MS;
      const maybeYieldAssembly = async () => {
        if (
          !shouldYieldRendererAssembly(performance.now(), nextAssemblyYieldAt, {
            heavy: cooperativeAssembly,
          })
        )
          return;
        sceneAssemblyYields++;
        if (variantBuild) {
          await yieldRendererAssembly({
            requestFrame: requestAnimationFrame,
            postTask: (resume) => setTimeout(resume, 0),
          });
        } else {
          await yieldSceneAssembly();
        }
        rejectSupersededBuild();
        nextAssemblyYieldAt = performance.now() + INTERACTIVE_ASSEMBLY_SLICE_MS;
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
            shareFlatGeometry: true,
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
                    shareFlatGeometry: true,
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
      recordRoiStage('caps-complete');
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
      let qualityIndexedSubmittedVertices = 0,
        qualityOriginalSubmittedVertices = 0,
        qualityIndexedTriangles = 0,
        v4FastIndexedVertices = 0,
        v4FastOriginalVertices = 0;
      for (const sidewall of plan.sidewalls) {
        await maybeYieldAssembly();
        const state = stateFor(sidewall);
        if (!state) continue;
        if (sidewall.instanceTranslations) {
          const parts = displaySidewallParts(sidewall.parts || [sidewall]);
          const geometry = await prepareSidewallGeometry(
              parts,
              sidewall.buried ? transparentArrayDisplayTolerance : 0,
              {
                indexedSmooth:
                  targetVariant === 'transparent' &&
                  sidewall.buried === true &&
                  ((v3QualityIndexExperiment && inspection.fast === false) ||
                    (v4FastSmoothIndex && inspection.fast !== false)),
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
          if (geometry.index?.count && meshes.length) {
            const instances = sidewall.instanceTranslations.length;
            if (v4FastSmoothIndex && inspection.fast !== false) {
              v4FastIndexedVertices += geometry.getAttribute('position').count * instances;
              v4FastOriginalVertices += geometry.index.count * instances;
            } else {
              qualityIndexedSubmittedVertices +=
                geometry.getAttribute('position').count * instances;
              qualityOriginalSubmittedVertices += geometry.index.count * instances;
              qualityIndexedTriangles += (geometry.index.count / 3) * instances;
            }
          }
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
              const geometry = await prepareSidewallGeometry([groupInstances.template]),
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
              const geometry = await prepareSidewallGeometry(instances.leftovers),
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

        const geometry = await prepareSidewallGeometry(
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
      host.dataset.rendererSmoothWorkerJobs = String(smoothSidewallWorkerJobs);
      host.dataset.rendererSmoothWorkerFallbacks = String(smoothSidewallWorkerFallbacks);
      host.dataset.rendererSmoothWorkerWallMs = String(smoothSidewallWorkerWallMs);
      recordVariantStage('sidewalls-complete');
      recordRoiStage('sidewalls-complete');
      host.dataset.smoothSidewallInstanceGroups = String(smoothSidewallInstanceGroupCount);
      host.dataset.smoothSidewallInstanceCount = String(smoothSidewallInstanceCount);
      host.dataset.sidewallTriangleCount = String(
        group.children.reduce(
          (sum, object) =>
            sum +
            (object.geometry?.index?.count ||
              object.geometry?.getAttribute?.('position')?.count ||
              0) /
              3,
          0,
        ),
      );
      host.dataset.smoothSidewallTemplateTriangles = String(
        Math.round(smoothSidewallTemplateTriangleCount),
      );
      host.dataset.v4FastIndexedVertices = String(v4FastIndexedVertices);
      host.dataset.v4FastOriginalVertices = String(v4FastOriginalVertices);
      host.dataset.v3QualityIndexedVertices = String(qualityIndexedSubmittedVertices);
      host.dataset.v3QualityOriginalVertices = String(qualityOriginalSubmittedVertices);
      host.dataset.v3QualityIndexedTriangles = String(qualityIndexedTriangles);
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
            // All vertices of this smooth cap lie on one Z plane.
            // Keep the experimental presentation optimization strictly
            // outside rough, clipped, Fast and non-array Quality scenes.
            ...(v3ElectricalPlanarSinglePassExperiment &&
            targetVariant === 'transparent' &&
            inspection.fast === false &&
            !clip &&
            Number(plan.arrayInstances || 0) >= 64 &&
            !appearance
              ? { planarCap: true, experimentalElectricalPlanarSinglePass: true }
              : {}),
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
      recordRoiStage('annotations-complete');
      const rendererAssemblyAt = performance.now();
      host.dataset.rendererTopologyMs = String(rendererTopologyAt - rendererProfileStart);
      host.dataset.rendererSmoothCapsMs = String(rendererCapsAt - rendererTopologyAt);
      host.dataset.rendererSidewallsMs = String(rendererSidewallsAt - rendererCapsAt);
      host.dataset.rendererAnnotationsMs = String(rendererAssemblyAt - rendererSidewallsAt);
      host.dataset.rendererAssemblyMs = String(rendererAssemblyAt - rendererProfileStart);
      host.dataset.rendererPresentationMs = '0';
      host.dataset.presentationUpdateCount = String(presentationUpdateCount);
      rejectSupersededBuild();
      physicalSceneModel = model;
      physicalSceneSignature = signature;
      physicalSurfacePlan = plan;
      activeSceneVariant = targetVariant;
      host.dataset.sceneVariant = targetVariant;
      // The previous cached group stays resident for fast reverse switching,
      // but must be detached before the new transparent scene becomes visible.
      if (variantBuild) {
        const previous = sceneVariantCache.get(previousVariant);
        if (previous?.group && previous.group !== group) scene.remove(previous.group);
        delete host.dataset.rendererRetainedCompleteVisible;
        host.dataset.rendererCommittedVariantSwaps = String(
          Number(host.dataset.rendererCommittedVariantSwaps || 0) + 1,
        );
      }
      if (stagedPreviousScene) {
        const retired = new Set([
          stagedPreviousScene.snapshot.group,
          ...[...stagedPreviousScene.cachedVariants.values()].map((entry) => entry?.group),
        ]);
        for (const oldGroup of retired) {
          if (!oldGroup || oldGroup === group) continue;
          if (oldGroup.parent) oldGroup.parent.remove(oldGroup);
          disposeSceneGroup(oldGroup);
        }
        delete host.dataset.rendererDisplayedState;
        host.dataset.rendererCommittedModelSwaps = String(
          Number(host.dataset.rendererCommittedModelSwaps || 0) + 1,
        );
      }
      group.visible = true;
      if (!stagedPreviousScene) delete host.dataset.rendererDisplayedState;
      recordVariantStage('presentation-begin');
      applyPresentationState({ profile: false, settle: false });
      recordVariantStage('presentation-complete');
      recordRoiStage('presentation-complete');
      cacheActiveSceneVariant();
      writeV4GpuResourceCensus();
      if (!roughTasks.length) {
        host.dataset.renderPhase = 'complete';
        host.dataset.renderState = 'ready';
        stats.textContent = hasMaterial(model) ? (clip ? 'ROI' : 'full model') : 'no material';
      }
    } catch (error) {
      rebuildFailed = true;
      const superseded = error instanceof SupersededRendererBuild;
      recordRoiStage(superseded ? 'build-superseded' : 'build-failed');
      // Keep the last good geometry for a subsequent ROI clear, but never
      // display it as though it were the failed clipped geometry.
      try {
        if (stagedPreviousScene) {
          const failedGroup = group;
          if (failedGroup.parent) failedGroup.parent.remove(failedGroup);
          disposeSceneGroup(failedGroup);
          sceneVariantCache = stagedPreviousScene.cachedVariants;
          restoreSceneVariant(stagedPreviousScene.snapshot);
          physicalSurfacePlan = stagedPreviousScene.physicalSurfacePlan;
          sceneGeneration = previousSceneGeneration;
          host.dataset.sceneGeneration = String(sceneGeneration);
          host.dataset.modelRevision = String(physicalSceneModel?.revision ?? 0);
          host.dataset.processRevision = String(physicalSceneModel?.processRevision ?? 0);
          host.dataset.rendererDisplayedState = 'stale';
        } else if (variantBuild) {
          const previous = sceneVariantCache.get(previousVariant);
          if (previous) {
            const failedGroup = group;
            scene.remove(failedGroup);
            disposeSceneGroup(failedGroup);
            restoreSceneVariant(previous);
          } else {
            disposeGroup();
          }
        } else if (sceneReplaced) {
          disposeGroup();
        } else {
          sceneGeneration = previousSceneGeneration;
          host.dataset.sceneGeneration = String(sceneGeneration);
        }
      } catch (cleanupError) {
        console.warn('3D rebuild cleanup failed:', cleanupError);
      }
      if (variantBuild) {
        delete host.dataset.rendererRetainedCompleteVisible;
        host.dataset.rendererVariantRollbacks = String(
          Number(host.dataset.rendererVariantRollbacks || 0) + 1,
        );
      }
      if (superseded) {
        host.dataset.rendererSupersededBuilds = String(
          Number(host.dataset.rendererSupersededBuilds || 0) + 1,
        );
      }
      // An ordinary failed rebuild remains fail-closed. For a variant-only
      // failure, restore the committed group, without claiming the new mode rendered.
      if (group && !variantBuild && !stagedPreviousScene) group.visible = false;
      if (variantBuild && group?.visible) host.dataset.rendererDisplayedState = 'stale';
      if (superseded) {
        host.dataset.renderState = 'building';
        host.dataset.renderPhase = 'superseded';
        stats.textContent = '3D update superseded · preparing latest revision…';
      } else {
        const failure = setRendererBuildFailure(host, stats, error, { roi: Boolean(clip) });
        if (stagedPreviousScene) stats.textContent += ' · previous image is outdated';
        console.warn('3D rebuild rejected:', failure.code, failure.detail);
      }
    } finally {
      smoothSidewallWorker?.terminate();
      recordRoiStage('build-exited');
      suppressAssemblyFrames = false;
      rendering = false;
    }

    if (pendingRender) {
      queueMicrotask(() => {
        if (!rendering && pendingRender) void render();
      });
      scheduleFrame();
      return;
    }

    if (rebuildFailed) {
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
    if (interacting) throw new Error('Finish camera interaction before capturing an exact 3D PNG.');
    if (previewHiddenMeshes.size) {
      leaveInteractionPreview();
      syncRenderPolicy();
      transparencyOrderDirty = true;
      updateTransparentOrder();
    }
    if (host.dataset.rendererDisplayedState === 'stale')
      throw new Error(
        'Current 3D model is still building or failed; outdated preview cannot be exported.',
      );
    const rect = host.getBoundingClientRect(),
      multiplier = Math.max(1, Math.min(4, Number(scale) || 3)),
      width = Math.max(2, rect.width),
      height = Math.max(2, rect.height);

    // Temporary pixel ratio and camera state also affect rough-mesh LOD.
    // Guard the *preparation* and capture setup, not just PNG encoding:
    // a rejected rough build must restore the interactive renderer as well.
    return runTemporaryRendererCapture({
      mainRenderer: renderer,
      camera,
      pixelRatio: multiplier,
      aspect: width / height,
      createRenderer: () =>
        new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }),
      configureRenderer: (captureRenderer) => {
        captureRenderer.setPixelRatio(multiplier);
        captureRenderer.setSize(width, height, false);
        captureRenderer.setClearColor(0xf5f7f9);
        captureRenderer.outputColorSpace = renderer.outputColorSpace;
        captureRenderer.toneMapping = renderer.toneMapping;
        captureRenderer.toneMappingExposure = renderer.toneMappingExposure;
      },
      prepareScene: () => requestRoughGeometry('detailed', { force: true }),
      capture: (captureRenderer) => {
        captureRenderer.render(scene, camera);
        return new Promise((resolve, reject) =>
          captureRenderer.domElement.toBlob(
            (value) => (value ? resolve(value) : reject(new Error('PNG capture failed.'))),
            'image/png',
          ),
        );
      },
      restoreScene: () => requestRoughGeometry('detailed', { force: true }),
      scheduleFrame,
    });
  }

  return {
    init,
    render,
    fit,
    getViewState,
    setViewState,
    setGestureMode,
    updateZCollapse,
    exportGlb,
    capturePng,
    get ready() {
      return ready;
    },
  };
}
