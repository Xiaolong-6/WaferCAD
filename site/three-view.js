import { continuousRectRoiBounds } from './continuous-etch-roi.js';
import { clipContinuousSurfaceToRect } from './continuous-etch-roi-mesh.js';
import { buildContinuousRectMeshCaps } from './continuous-etch-roi-mesh-cap.js';
import { isArrayModel, resolveArrayModel, geometryBounds, arrayParts } from './model-array.js';
import { annotationDepthFraction, IMPLANT_DEPTH_GRADIENT } from './annotation-rendering.js';
import { threeRenderPolicy } from './render-quality-policy.js';
import {
  electricalDisplaySolidForLod,
  transparentArrayPresentationLod,
} from './transparent-array-lod.js';
import { canRenderPlanarCapInSinglePass } from './transparent-pass-policy.js';
import { disposeRendererSceneResources } from './renderer-v4-resource-lifetime.js';
import { runTemporaryRendererCapture } from './renderer-capture-transaction.js';
import { renderDepthAwareOutlines } from './three-outline-pass.js';
import {
  borderNeedsInternalGeometry,
  borderContourPresentationPlan,
  borderPresentationState,
} from './border-inspector.js';
import { shouldYieldDuringSceneAssembly } from './renderer-cooperative-assembly.js';
import { buildContinuousMaterialSurfaceMesh } from './continuous-etch-mesh.js';
import {
  buildExactFilmComponents,
  exactUnetchedFilmCandidates,
} from './continuous-exact-film-mesh.js';
import {
  buildContinuousSiHeightfieldMesh,
  canBuildContinuousSiHeightfield,
} from './continuous-heightfield-mesh.js';
import {
  CONTINUOUS_ETCH_MODEL_KERNEL,
  validateContinuousEtchModel,
  continuousEtchDisplayCollapse,
} from './continuous-etch-model.js';
import { hasMaterial, layerById, modelBoundsZ } from './model.js';
import { intersection, multiBounds } from './vector-geometry.js';
import {
  LAYER_INSPECTION_NEUTRAL,
  LAYER_INSPECTION_DIM,
  layerInspectionTone,
} from './layer-inspection-presentation.js';
import {
  annotationInspectionCutSegments,
  electricalRegionSolids,
  implantSolids,
} from './model-view-geometry.js';
import { buildPhysicalFacetPresentation } from './experimental/physical-facets/physical-facet-render-geometry.js';
import {
  PHYSICAL_FACET_MODEL_KERNEL,
  validateExperimentalPhysicalFacetModel,
} from './experimental/physical-facets/physical-facet-model.js';
import { buildRenderSurfacePlan } from './renderer-geometry.js';
import {
  ownedContourSegments,
  borderInspectorContours,
  unownedContourSegments,
  contoursToPositions,
  sectionCutContours,
} from './three-outline-geometry.js';
import { buildRenderSurfacePlanAsync } from './renderer-surface-plan-async.js';
import { appendSidewallTriangle } from './renderer-sidewall-triangle.js';
import { clipBorderPositions } from './renderer-border-position-clip.js';
import { createDerivedDataCache } from './renderer-derived-cache.js';
import {
  mergeCollinearSidewallParts,
  reduceCollinearClosedRing,
  simplifyDisplayPolygons,
  simplifyDisplaySidewallParts,
} from './renderer-line-reduction.js';
import {
  canUseGpuRoughTask,
  checkGpuRoughHeightParity,
  decorateGpuRoughMaterial,
  decorateRoughFarFieldMaterial,
  gpuRoughParitySamples,
  supportsPreciseGpuRoughDisplacement,
} from './gpu-rough-surface.js?v=rough-farfield-v1';
import { triangulatePolygon } from './polygon-triangulation.js';
import {
  spatialInstanceChunks,
  translatedPolygonInstanceGroups,
  translatedSidewallInstanceGroups,
} from './renderer-instancing.js';
import { createCollapsedZDisplayTransform, resolveSectionCollapse } from './section-z-collapse.js';
import {
  createThreeRoughReliefDisplayTransform,
  normalizeThreeRoughReliefFactor,
  normalizeThreeZDisplayFactor,
  threeRoughReliefBands,
  threeZDisplayScale,
  refreshThreeDashedBorderDistances,
  selectFrontmostRoughCutlineSample,
} from './three-z-display.js';
import { geometryFromRoughCap, geometryFromRoughMeshData } from './rough-mesh-geometry.js';
import {
  boundaryProfileFromPositions,
  boundaryProfileOverlapsEdge,
  shiftedBoundaryProfile,
  sidewallBoundarySamples,
} from './rough-boundary-profile.js';
import { buildRoughSpatialZones, prepareMorphologyExportTasks } from './morphology-mesh-policy.js';
import {
  adaptiveRoughMeshLod,
  roughDisplayHeightBlend,
  roughTaskDisplaySampling,
  trimSaturatedRoughLodBudgets,
  roughFarFieldContrast,
  allocateRoughTriangleBudgets,
  projectedPixelsPerUnit,
  roughProfileOffsetAtPixelFootprint,
  roughDisplayProfileOffsetAtPoint,
  roughSceneTriangleBudget,
  synchronizeConformalRoughLods,
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
  getZDisplayFactor = () => 1,
  getRoughReliefFactor = () => 1,
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
  let gestureMode = null;
  let gestureWheelZoom = null;
  let group = null;
  let axesHelper = null;
  let ready = false;
  let initPromise = null;
  let frame = null;
  let interacting = false;
  let rendering = false;
  let activeSurfaceAbort = null;
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
  let preciseGpuRoughDisplacement = true;
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
  // Focus is view-only: neutralize other materials without touching visibility,
  // opacity, depth ownership, geometry or persistent layer colors.
  let highlightedLayerId = null;
  const originalInspectionAppearance = new WeakMap();
  let inspectionNeutralColor = null;
  let surfaceMaterialPool = new Map();
  let presentationUpdateCount = 0;
  let physicalSceneModel = null;
  let continuousRoiCapObjects = [];
  let continuousRoiCapSignature = null;
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

  // Opt-in v2 policy; callers that never opt in retain legacy OrbitControls defaults.
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
      collapse = resolveSectionCollapse(
        continuousEtchDisplayCollapse(model, getZCollapse()),
        model,
        [lo, hi],
      ),
      transform = createCollapsedZDisplayTransform({
        zMin: lo,
        zMax: hi,
        collapse,
        breakFraction: 0,
      }),
      reliefFactor = normalizeThreeRoughReliefFactor(getRoughReliefFactor()),
      clip = reliefFactor > 1 ? getClipGeometry() : null,
      clipBounds = clip?.length ? multiBounds(clip) : null,
      display = createThreeRoughReliefDisplayTransform(
        transform,
        reliefFactor > 1
          ? threeRoughReliefBands(
              model,
              0.12,
              clipBounds
                ? (region) => {
                    const bounds = multiBounds(region.geom);
                    // Reject nonoverlapping owners without invoking the robust
                    // Boolean kernel. A bbox hit alone is insufficient for a
                    // clipped hole or disconnected polygon component.
                    if (
                      bounds.maxX <= clipBounds.minX ||
                      bounds.minX >= clipBounds.maxX ||
                      bounds.maxY <= clipBounds.minY ||
                      bounds.minY >= clipBounds.maxY
                    )
                      return false;
                    return intersection(region.geom, clip).length > 0;
                  }
                : null,
            )
          : [],
        reliefFactor,
      ),
      bounds = visibleBounds(model, getClipGeometry()),
      xySpan = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1e-12),
      baseScale = (xySpan * 0.12) / Math.max(display.displaySpan, 1e-12),
      // An opt-in, uniformly applied display multiplier. All mesh, border,
      // sidewall and conformal geometry shares group.scale.z; Process and GLB
      // export operate on the original unscaled physical model.
      displayFactor = normalizeThreeZDisplayFactor(getZDisplayFactor()),
      scale = threeZDisplayScale(baseScale, displayFactor);

    return {
      ...display,
      scale,
      displayFactor,
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
      canTranslateSide =
        !state.reliefActive && (fullyUpper || fullyLower) && Math.abs(sideScale - 1) <= 1e-12;

    object.visible = !fullyHidden;
    if (fullyHidden) return;

    if (canTranslateSide) {
      if (record.mode === 'mapped') {
        restoreCanonicalZ(record, positions);
        refreshGeometryBounds(object);
      }
      refreshThreeDashedBorderDistances(object, state.scale);
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
      // Preserve analytic normals in the native no-collapse renderer.
      if (!object.geometry.userData?.analyticSurfaceNormals || state.enabled !== false)
        object.geometry.computeVertexNormals();
    }
    refreshGeometryBounds(object);
    refreshThreeDashedBorderDistances(object, state.scale);
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
    host.dataset.zDisplayFactor = String(currentZDisplay.displayFactor);
    host.dataset.zDisplayOnly = 'true';
    host.dataset.zRoughReliefFactor = String(currentZDisplay.reliefFactor);
    host.dataset.zRoughReliefBands = String(currentZDisplay.reliefBands);
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
    return clipBorderPositions(positions, state);
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
      const farField =
        entry.material.userData?.waferCadRoughFarField?.uniforms?.waferCadRoughFarFieldContrast;
      // Pixel derivatives choose the actual per-fragment LOD. Supply only
      // material-wide statistical strength so instanced meshes may share it.
      if (farField) farField.value = roughFarFieldContrast(0, entry.appearance);
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
  function updateBorderDashScale() {
    if (!camera || !controls || !renderer) return;
    const viewport = currentViewport();
    const pixelsPerUnit = projectedPixelsPerUnit({
      distance: camera.position.distanceTo(controls.target),
      viewportHeight: viewport.height,
      fovDegrees: camera.fov,
      pixelRatio: viewport.pixelRatio,
    });
    // Keep dashes legible at the actual inspection zoom instead of sizing
    // them as a fraction of full-wafer width (which hides tiny via dashes).
    const dash = Math.max(1e-7, 6 / Math.max(1e-7, pixelsPerUnit));
    for (const object of presentationObjects) {
      if (!object?.isLineSegments || !object.material?.isLineDashedMaterial) continue;
      object.material.dashSize = dash;
      object.material.gapSize = dash * 0.65;
    }
  }

  function renderInspectionFrame(targetRenderer = renderer) {
    updateBorderDashScale();
    const occluders = [],
      outlines = [];
    scene.traverseVisible((object) => {
      if (object.userData?.waferCadOutlineRole) outlines.push(object);
      else if (object.isMesh && object.userData?.waferCadPresentation?.kind === 'material-exterior')
        occluders.push(object);
    });
    const classified = renderDepthAwareOutlines(targetRenderer, scene, camera, {
      occluders,
      outlines,
    });
    host.dataset.outlineVisibility = classified ? 'structural-depth' : 'off';
    host.dataset.outlineDepthMeshCount = String(classified ? occluders.length : 0);
  }

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
      if (gestureMode !== null && controls) controls.enableDamping = false;
      host.dataset.cameraDampingEnabled = String(Boolean(controls?.enableDamping));
      const changed = controls?.update?.() || false;
      updateRoughMaterialLod();
      updateTransparentOrder();
      const frameStartedAt = performance.now();
      renderInspectionFrame();
      // Ready/assembly flags can be set before the first WebGL frame. This
      // sequence is committed only after renderer.render actually returns.
      // CI additionally waits for compositor presentation when profiling.
      completedFrameSerial++;
      host.dataset.rendererFrameSerial = String(completedFrameSerial);
      // Snapshot the LOD tier of the frame that actually completed rendering.
      // renderState and transparentArrayLodTier can advance before the first
      // exact WebGL frame; consumers must not pair a new tier with old counters.
      host.dataset.rendererFrameArrayLodTier = host.dataset.transparentArrayLodTier || 'exact';
      host.dataset.rendererFrameSceneGeneration = host.dataset.sceneGeneration || '0';
      host.dataset.rendererFrameMs = String(performance.now() - frameStartedAt);
      host.dataset.rendererDrawCalls = String(renderer.info?.render?.calls || 0);
      host.dataset.rendererDrawTriangles = String(renderer.info?.render?.triangles || 0);
      if (interacting || changed) scheduleFrame();
    });
  }

  async function yieldSceneAssembly() {
    // Yield to Main/Mask/Section painting and input without submitting an
    // incomplete 3D scene to WebGL. A redraw per assembly slice can dominate
    // software-GPU startup; the last completed canvas remains visible.
    // Final scene commit, camera interaction and resize still schedule frames.
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
    disposeSceneResourcesSafely(group);
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
    continuousRoiCapObjects = [];
    continuousRoiCapSignature = null;
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
      model: physicalSceneModel,
      signature: physicalSceneSignature,
    };
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

  function disposeSceneGroup(targetGroup) {
    if (!targetGroup) return;
    disposeSceneResourcesSafely(targetGroup);
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
    updateLayerInspection();
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
    return true;
  }

  function startSceneVariantBuild(mode) {
    // Keep the last complete variant visible while preparing the replacement.
    // The incoming group remains hidden until its presentation is ready.
    cacheActiveSceneVariant();
    const previousGroup = group;
    host.dataset.rendererRetainedCompleteVisible = String(
      Boolean(previousGroup?.visible && previousGroup.parent === scene),
    );
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
    return previousGroup;
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
      case 'internal-border':
      case 'hidden-border':
        return borderPresentationState(
          descriptor,
          inspection.borderSettings,
          opacity,
          inspection.borders,
        );
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

  function applyLayerInspectionMaterial(material, tone) {
    if (!material?.color) return;
    if (!originalInspectionAppearance.has(material)) {
      originalInspectionAppearance.set(material, {
        color: material.color.clone(),
        emissive: material.emissive?.clone(),
        intensity: material.emissiveIntensity,
      });
    }
    const original = originalInspectionAppearance.get(material);
    material.color.copy(original.color);
    if (original.emissive && material.emissive) {
      material.emissive.copy(original.emissive);
      material.emissiveIntensity = original.intensity;
    }
    if (tone === 'deemphasized') {
      inspectionNeutralColor ||= new THREE.Color(LAYER_INSPECTION_NEUTRAL);
      material.color.lerp(inspectionNeutralColor, LAYER_INSPECTION_DIM);
    }
  }

  function isLayerInspectionMaterial(descriptor) {
    return descriptor?.kind === 'material-exterior' || descriptor?.kind === 'material-interface';
  }

  function updateLayerInspection() {
    const visited = new Set();
    for (const object of presentationObjects) {
      const descriptor = object.userData?.waferCadPresentation;
      if (!isLayerInspectionMaterial(descriptor)) continue;
      const tone = layerInspectionTone(descriptor.layerId, highlightedLayerId);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material || visited.has(material)) continue;
        visited.add(material);
        applyLayerInspectionMaterial(material, tone);
      }
    }
    host.dataset.highlightLayerId = highlightedLayerId ?? '';
  }

  function highlightLayer(id) {
    highlightedLayerId = id == null ? null : String(id);
    updateLayerInspection();
    scheduleFrame();
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
    if (isLayerInspectionMaterial(descriptor)) {
      const tone = layerInspectionTone(descriptor.layerId, highlightedLayerId);
      for (const material of materials) applyLayerInspectionMaterial(material, tone);
    }
    if (
      object.isLineSegments &&
      ['border', 'internal-border', 'hidden-border'].includes(descriptor.kind)
    ) {
      object.renderOrder = object.userData?.waferCadBorderOrder ?? object.renderOrder;
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
      if (
        object.isLineSegments &&
        ['border', 'internal-border', 'hidden-border'].includes(descriptor.kind)
      ) {
        object.renderOrder = object.userData?.waferCadBorderOrder ?? object.renderOrder;
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

  function displaySurfaceProfile(surface, appearanceByCapIndex = null) {
    if (surface?.appearance?.kind !== 'rough') return surface;
    const appearance = appearanceByCapIndex?.get(surface.capIndex);
    return appearance ? { ...surface, appearance } : surface;
  }

  function geometryFromSidewallParts(
    parts,
    displayTolerance = 0,
    boundaryProfiles = null,
    appearanceByCapIndex = null,
  ) {
    const positions = [],
      normals = [],
      annotationDepths = [];

    const displacedZ = (point, z, surface) =>
      surface?.appearance?.kind === 'rough'
        ? z +
          (Number(surface.profileNormal) || 1) *
            roughDisplayProfileOffsetAtPoint(point[0], point[1], surface.appearance)
        : z;
    const policy = renderPolicy(false);

    for (const part of displayTolerance > 0
      ? simplifyDisplaySidewallParts(parts, displayTolerance)
      : mergeCollinearSidewallParts(parts)) {
      const samplePart = {
          ...part,
          lowerSurface: displaySurfaceProfile(part.lowerSurface, appearanceByCapIndex),
          upperSurface: displaySurfaceProfile(part.upperSurface, appearanceByCapIndex),
        },
        p = part.p,
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
          ? Math.max(1e-6, Math.min(...featureSizes) / (4 * Math.sqrt(policy.roughnessDetail)))
          : length,
        segments = Math.max(1, Math.min(policy.sidewallSegments, Math.ceil(length / targetStep))),
        pointAt = (t) => [p[0] + dx * t, p[1] + dy * t],
        hasDepth =
          Number.isFinite(Number(part.lowerDepth)) && Number.isFinite(Number(part.upperDepth)),
        lowerDepth = hasDepth ? Math.max(0, Math.min(1, Number(part.lowerDepth))) : null,
        upperDepth = hasDepth ? Math.max(0, Math.min(1, Number(part.upperDepth))) : null;

      const lowerProfile = boundaryProfiles?.get(part.lowerSurface?.capIndex),
        upperProfile = boundaryProfiles?.get(part.upperSurface?.capIndex),
        samples =
          lowerProfile || upperProfile
            ? sidewallBoundarySamples(samplePart, {
                lowerProfile,
                upperProfile,
                fallbackSegments: segments,
              })
            : Array.from({ length: segments + 1 }, (_, index) => {
                const point = pointAt(index / segments);
                return {
                  point,
                  lowerZ: displacedZ(point, part.z0, samplePart.lowerSurface),
                  upperZ: displacedZ(point, part.z1, samplePart.upperSurface),
                };
              });
      for (let segment = 0; segment + 1 < samples.length; segment++) {
        const a = samples[segment],
          b = samples[segment + 1],
          lower0 = [...a.point, a.lowerZ],
          lower1 = [...b.point, b.lowerZ],
          upper1 = [...b.point, b.upperZ],
          upper0 = [...a.point, a.upperZ],
          firstDepths = hasDepth ? [lowerDepth, lowerDepth, upperDepth] : null,
          secondDepths = hasDepth ? [lowerDepth, upperDepth, upperDepth] : null;
        appendSidewallTriangle(
          positions,
          normals,
          annotationDepths,
          lower0,
          lower1,
          upper1,
          firstDepths,
        );
        appendSidewallTriangle(
          positions,
          normals,
          annotationDepths,
          lower0,
          upper1,
          upper0,
          secondDepths,
        );
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    if (
      parts.some(
        (part) => part.lowerSurface?.capIndex != null || part.upperSurface?.capIndex != null,
      )
    ) {
      geometry.userData.waferCadSidewallParts = parts;
      geometry.userData.waferCadSidewallTolerance = displayTolerance;
    }
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
    {
      order = 100000,
      opacity = 1,
      adaptiveRough = false,
      planContours = false,
      dashed = false,
      includeHidden = true,
      dashSize = 1,
      presentation = { kind: 'border' },
    } = {},
  ) {
    if (!positions?.length) return null;
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const materialOptions = {
      color: dashed ? 0x263d57 : 0x111820,
      transparent: dashed || opacity < 0.999,
      opacity: dashed ? 0.25 : opacity < 0.999 ? 0.85 : 1,
      depthTest: true,
      depthFunc: presentation?.kind === 'hidden-border' ? THREE.GreaterDepth : THREE.LessEqualDepth,
      depthWrite: false,
    };
    const edgeMaterial = dashed
        ? new THREE.LineDashedMaterial({
            ...materialOptions,
            dashSize: Math.max(1e-5, dashSize),
            gapSize: Math.max(1e-5, dashSize * 0.7),
          })
        : new THREE.LineBasicMaterial(materialOptions),
      edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    if (dashed) edges.computeLineDistances();
    edges.renderOrder = order;
    edges.userData.waferCadBorderOrder = order;
    edges.userData.waferCadOutlineRole =
      presentation?.kind === 'hidden-border' ? 'hidden' : 'visible';
    edges.userData.waferCadPlanContours = planContours;
    group.add(edges);
    trackZDisplayObject(edges);
    registerPresentationObject(edges, presentation);
    if (adaptiveRough) roughOwnedObjects.add(edges);
    if (!dashed && includeHidden) {
      addBorderPositions(positions, {
        order: order - 2,
        opacity,
        adaptiveRough,
        planContours,
        dashed: true,
        dashSize,
        includeHidden: false,
        presentation: { ...presentation, lineStyle: 'dashed' },
      });
      addBorderPositions(positions, {
        order: order - 1,
        opacity,
        adaptiveRough,
        planContours,
        dashed: true,
        dashSize,
        presentation: { kind: 'hidden-border', category: 'occluded', lineStyle: 'dashed' },
      });
      addBorderPositions(positions, {
        order: order - 1,
        opacity,
        adaptiveRough,
        planContours,
        dashed: false,
        includeHidden: false,
        presentation: { kind: 'hidden-border', category: 'occluded', lineStyle: 'solid' },
      });
    }
    return edges;
  }

  // Add real, owned internal outlines lazily to an already-built scene.
  // Keep per-group ownership so cached opaque/transparent variants can restore
  // their own overlays without forcing another Process surface-plan build.
  function ensureInternalBorderContours(plan = null, { refresh = false } = {}) {
    if (!group) return false;
    const activePlan = plan || group.userData.waferCadSurfacePlan || physicalSurfacePlan;
    if (!activePlan) return false;
    const inspection = getInspection() || {};
    if (
      !borderNeedsInternalGeometry(
        inspection.borderSettings,
        inspection.opacity,
        inspection.borders,
      )
    )
      return false;
    if (group.userData.waferCadInternalContoursPrepared && !refresh) return false;

    if (refresh) {
      for (const object of [...presentationObjects]) {
        if (!object.userData?.waferCadInternalContourOverlay) continue;
        presentationObjects.delete(object);
        zDisplayObjects.delete(object);
        object.parent?.remove(object);
        disposeObjectResources(object);
      }
    }
    const profiles = group.userData.waferCadRoughBoundaryProfiles || null;
    const scoped = borderContourPresentationPlan(activePlan, {
      hasRoi: Boolean(getClipGeometry()),
    });
    // Explicitly expose overview LOD; selected ROIs retain exact internal lines.
    host.dataset.internalBorderDetail = scoped.mode;
    const contours = borderInspectorContours(scoped.plan, { boundaryProfiles: profiles });
    const model = getModel();
    const opacity = Number(inspection.opacity ?? 1);
    for (const [category, lines] of [
      ['interface', contours.interface],
      ['buried', contours.buried],
    ]) {
      const positions = displayBorderPositions(contoursToPositions(lines));
      for (const dashed of [false, true]) {
        const edge = addBorderPositions(positions, {
          order: 100006,
          opacity,
          dashed,
          includeHidden: false,
          dashSize: Math.max(
            1e-5,
            Math.min(Number(model.width) || 1, Number(model.height) || 1) * 0.006,
          ),
          presentation: {
            kind: 'internal-border',
            category,
            lineStyle: dashed ? 'dashed' : 'solid',
          },
        });
        if (edge) edge.userData.waferCadInternalContourOverlay = true;
      }
    }
    group.userData.waferCadInternalContoursPrepared = true;
    host.dataset.internalInterfaceBorderCount = String(contours.interface.length);
    host.dataset.internalBuriedBorderCount = String(contours.buried.length);
    return true;
  }

  function rebuildInspectionContours(
    boundaryProfiles = null,
    appearanceByCapIndex = null,
    outlinedRoughCapIndices = null,
  ) {
    if (!physicalSurfacePlan) return;
    for (const object of [...presentationObjects]) {
      if (!object.userData?.waferCadPlanContours) continue;
      presentationObjects.delete(object);
      zDisplayObjects.delete(object);
      object.parent?.remove(object);
      disposeObjectResources(object);
    }
    const plan = physicalSurfacePlan,
      clip = getClipGeometry(),
      exposedBorders = ownedContourSegments(plan.borderLines),
      // A cut alone may introduce additional edges. Keep full-wafer scenes
      // free of per-rough-cap outline collection and extra geometry.
      roughBorders = clip
        ? [...(boundaryProfiles?.entries() || [])].flatMap(([index, profile]) =>
            plan.caps[index]?.buried || plan.caps[index]?.appearance?.kind !== 'rough'
              ? []
              : profile.segments.map(({ p, q }) => [p, q]),
          )
        : [],
      // Only the cut face introduces new structural borders. Buried cap
      // perimeters are not exposed outlines: drawing them as solid black
      // produces false internal lines across translucent materials.
      sectionSidewalls = plan.sidewalls.map((part) => ({
        ...part,
        lowerSurface: displaySurfaceProfile(part.lowerSurface, appearanceByCapIndex),
        upperSurface: displaySurfaceProfile(part.upperSurface, appearanceByCapIndex),
      })),
      sectionLines = unownedContourSegments(
        sectionCutContours(sectionSidewalls, clip, {
          boundaryProfiles,
          ownedCapBorderIndices: outlinedRoughCapIndices,
        }),
        [...exposedBorders, ...roughBorders],
      ),
      model = getModel();
    host.dataset.hiddenBorderSegmentCount = String(exposedBorders.length + sectionLines.length);
    host.dataset.buriedContourSegmentCount = '0';
    host.dataset.sectionContourSegmentCount = String(sectionLines.length);
    const cutPositions = displayBorderPositions(contoursToPositions(sectionLines));
    for (const dashed of [false, true]) {
      addBorderPositions(cutPositions, {
        order: 100005,
        opacity: Number(getInspection()?.opacity ?? 1),
        dashed,
        dashSize: Math.max(
          1e-5,
          Math.min(Number(model.width) || 1, Number(model.height) || 1) * 0.006,
        ),
        planContours: true,
        includeHidden: false,
        presentation: { kind: 'border', category: 'roi', lineStyle: dashed ? 'dashed' : 'solid' },
      });
    }
  }

  function matchImplantCutToRoughCaps(implant, parts, profiles, appearances) {
    const surfaceKey = implant.face === 'back' ? 'lowerSurface' : 'upperSurface';
    const outside = Number(implant.outerZ);
    const direction = implant.face === 'back' ? -1 : 1;
    const source = implant.surfaceAppearance;
    if (source?.kind !== 'rough' || !Number.isFinite(outside)) {
      return { parts, profiles, appearances, matched: 0 };
    }
    const physicalCaps = physicalSurfacePlan?.caps || [];
    const candidates = [...profiles].flatMap(([capIndex, profile]) => {
      const cap = physicalCaps[capIndex];
      if (!cap || cap.appearance?.kind !== 'rough') return [];
      if (cap.buried) return [];
      if (Number(cap.profileNormal ?? cap.normal) !== direction) return [];
      if ((Number(cap.z) - outside) * direction < -2e-5) return [];
      // Display-only LOD is not a physical profile characteristic.
      const same = [
        'profileId',
        'seed',
        'morphology',
        'polarity',
        'featureSize',
        'meanHeight',
        'etchDepth',
        'featureCv',
        'heightCv',
      ].every((key) => cap.appearance[key] === source[key]);
      return same ? [{ capIndex, cap, profile }] : [];
    });
    if (!candidates.length) return { parts, profiles, appearances, matched: 0 };
    const matchedProfiles = new Map(profiles);
    const matchedAppearances = new Map(appearances);
    const resolvedParts = [];
    let matched = 0;
    for (const part of parts) {
      const selected = candidates
        .filter(({ profile }) => boundaryProfileOverlapsEdge(profile, part.p, part.q))
        .sort((a, b) => Math.abs(a.cap.z - outside) - Math.abs(b.cap.z - outside))[0];
      if (!selected) {
        resolvedParts.push(part);
        continue;
      }
      const syntheticCapIndex = -(matched + 1);
      const shifted = shiftedBoundaryProfile(selected.profile, outside - selected.cap.z);
      matchedProfiles.set(syntheticCapIndex, shifted);
      matchedAppearances.set(
        syntheticCapIndex,
        appearances.get(selected.capIndex) || selected.cap.appearance,
      );
      resolvedParts.push({
        ...part,
        [surfaceKey]: { ...part[surfaceKey], capIndex: syntheticCapIndex },
      });
      matched++;
    }
    return {
      parts: resolvedParts,
      profiles: matchedProfiles,
      appearances: matchedAppearances,
      matched,
    };
  }

  function installRoughBoundaryProfiles(boundaryProfiles, outlinedRoughCapIndices = null) {
    const appearanceByCapIndex = new Map();
    for (const task of roughTasks) {
      const index = physicalSurfacePlan?.caps?.indexOf(task.cap) ?? -1;
      if (index >= 0 && task.visualAppearance?.kind === 'rough') {
        appearanceByCapIndex.set(index, task.visualAppearance);
      }
    }
    // A conformal upper cap and the buried lower cap may use independently
    // tessellated XY footprints (including the physical lateral film offset).
    // For an ROI cut, derive the material sidewall's shared rough boundary from
    // one real Float32 cap and shift only by the physical film thickness.
    // This does not change the buried cap mesh, Kernel or saved layer geometry.
    const wallProfiles = new Map(boundaryProfiles);
    const profileCapsForWalls = [...boundaryProfiles].map(([index, profile]) => ({
      index,
      profile,
      cap: physicalSurfacePlan?.caps?.[index],
    }));
    const clipEdges = [];
    for (const polygon of getClipGeometry() || []) {
      for (const ring of polygon || []) {
        for (let index = 1; index < ring.length; index++) {
          clipEdges.push([ring[index - 1], ring[index]]);
        }
      }
    }
    const profileFields = [
      'kind',
      'profileId',
      'seed',
      'morphology',
      'polarity',
      'featureSize',
      'meanHeight',
      'etchDepth',
      'featureCv',
      'heightCv',
    ];
    const regions = getModel()?.regions || [];
    const isContiguousFilm = (lower, upper) => {
      for (const region of regions) {
        let substrate = false;
        let coating = false;
        for (const layer of region.stack || []) {
          if (layer.layerId === lower.layerId) {
            substrate ||= Math.abs(layer.z1 - lower.z) < 2e-5;
          }
          if (layer.layerId === upper.layerId) {
            coating ||= Math.abs(layer.z0 - lower.z) < 2e-5 && Math.abs(layer.z1 - upper.z) < 2e-5;
          }
        }
        if (substrate && coating) return true;
      }
      return false;
    };
    let alignedConformalCutPairs = 0;
    if (clipEdges.length) {
      for (const lower of profileCapsForWalls) {
        if (!lower.cap?.buried || lower.cap.appearance?.kind !== 'rough') continue;
        let matchingUpper = null;
        for (const upper of profileCapsForWalls) {
          const coat = upper.cap;
          if (!coat || coat.buried || coat.appearance?.kind !== 'rough') continue;
          if (!(coat.z > lower.cap.z)) continue;
          const normal = Number(coat.profileNormal ?? coat.normal);
          const substrateNormal = Number(lower.cap.profileNormal ?? lower.cap.normal);
          if (normal !== substrateNormal) continue;
          let sameProfile = true;
          for (const field of profileFields) {
            if (lower.cap.appearance[field] !== coat.appearance[field]) {
              sameProfile = false;
              break;
            }
          }
          if (!sameProfile || !isContiguousFilm(lower.cap, coat)) continue;
          let overlapping = false;
          for (const [p, q] of clipEdges) {
            if (
              boundaryProfileOverlapsEdge(lower.profile, p, q) &&
              boundaryProfileOverlapsEdge(upper.profile, p, q)
            ) {
              overlapping = true;
              break;
            }
          }
          if (overlapping) {
            matchingUpper = upper;
            break;
          }
        }
        if (!matchingUpper) continue;
        const dz = lower.cap.z - matchingUpper.cap.z;
        wallProfiles.set(lower.index, shiftedBoundaryProfile(matchingUpper.profile, dz));
        alignedConformalCutPairs++;
      }
    }
    host.dataset.roughConformalCutAlignedPairs = String(alignedConformalCutPairs);
    let rebuilt = 0;
    let matchedImplantCuts = 0;
    for (const object of presentationObjects) {
      const previous = object.geometry;
      const implant = object.userData?.waferCadImplantCut;
      const parts = implant
        ? displaySidewallParts(annotationSidewallParts(implant, getClipGeometry()))
        : previous?.userData?.waferCadSidewallParts;
      if (!parts) continue;
      const aligned = implant
        ? matchImplantCutToRoughCaps(implant, parts, wallProfiles, appearanceByCapIndex)
        : null;
      const geometry = geometryFromSidewallParts(
        aligned?.parts || parts,
        previous.userData.waferCadSidewallTolerance || 0,
        aligned?.profiles || wallProfiles,
        aligned?.appearances || appearanceByCapIndex,
      );
      object.geometry = implant ? shearImplantGeometry(geometry, implant) : geometry;
      matchedImplantCuts += aligned?.matched || 0;
      previous.dispose();
      object.position.z = 0;
      trackZDisplayObject(object);
      if (object.isInstancedMesh) {
        object.computeBoundingBox?.();
        object.computeBoundingSphere?.();
      }
      rebuilt++;
    }
    host.dataset.roughImplantCutProfileMatches = String(matchedImplantCuts);
    host.dataset.roughBoundaryProfileCount = String(boundaryProfiles.size);
    host.dataset.roughBoundarySidewallObjects = String(rebuilt);
    group.userData.waferCadRoughBoundaryProfiles = wallProfiles;
    if (group.userData.waferCadInternalContoursPrepared) {
      ensureInternalBorderContours(null, { refresh: true });
    }
    rebuildInspectionContours(wallProfiles, appearanceByCapIndex, outlinedRoughCapIndices);
  }

  function roughSceneRoiFraction(model, clip) {
    const modelArea = Math.max(1e-12, Number(model.width) * Number(model.height)),
      visibleArea = Math.max(1e-12, boundsArea(visibleBounds(model, clip)));
    return Math.max(0, Math.min(1, visibleArea / modelArea));
  }

  function gpuRoughTask(task, zones) {
    delete task.gpuHeightParity;
    const candidate =
      preciseGpuRoughDisplacement &&
      canUseGpuRoughTask({
        appearance: task?.cap?.appearance,
        buried: task?.cap?.buried,
        implant: Boolean(task?.implant),
        instanceTranslations: task?.cap?.instanceTranslations,
        zDisplay: currentZDisplay,
      });
    if (!candidate) return false;
    task.gpuHeightParity = checkGpuRoughHeightParity(
      THREE,
      renderer,
      task.cap.appearance,
      gpuRoughParitySamples(zones),
    );
    return task.gpuHeightParity.eligible;
  }

  function prepareAdaptiveRoughTasks({ interactive = false } = {}) {
    const context = roughRenderContext;
    if (!context || !roughTasks.length) return { tasks: [], sceneBudget: 0 };
    const policy = renderPolicy(interactive),
      focus = focusBounds(),
      requests = [],
      tasks = roughTasks.map((task) => {
        const sourceZones = prepareRoughSpatialZones(task),
          gpuDisplacement = gpuRoughTask(task, sourceZones),
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
          zones = sourceZones.map((zone) => {
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
                morphology: task.cap.appearance?.morphology,
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
              cap: task.cap,
              zone: prepared,
              appearance: task.cap.appearance,
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
    // Equal seeded rough surfaces need identical display tessellation to
    // preserve thin conformal spacing between their independent layer caps.
    const conformalLodPairs = synchronizeConformalRoughLods(requests, allocations);
    // Avoid spending a 4x Quality subdivision on a field that is already
    // visually saturated at the same 0.12 blend in both modes. Reuse the
    // normal Section sampler/LOD blend calculation to reject unsafe trims.
    const saturatedLodTrim =
      !interactive && policy.mode === 'quality' && trimSaturatedRoughLodBudgets(tasks);
    host.dataset.roughSaturatedLodTrim = String(saturatedLodTrim);
    host.dataset.roughConformalLodPairs = String(conformalLodPairs);
    const parity = tasks.map((task) => task.gpuHeightParity).filter(Boolean);
    host.dataset.roughGpuParityCheckedTasks = String(parity.length);
    host.dataset.roughGpuParityFallbackTasks = String(
      parity.filter((probe) => !probe.eligible).length,
    );
    host.dataset.roughGpuParityMaximumErrorUm = String(
      Math.max(0, ...parity.map((probe) => probe.maximumErrorUm || 0)),
    );
    // Anti-alias unresolved features in the *displayed* stochastic heightfield
    // without increasing the scene triangle budget or changing stored geometry.
    const sampling = roughTaskDisplaySampling(tasks);
    tasks.forEach((task, index) => {
      const appearance = task.cap.appearance,
        blend =
          appearance?.kind === 'rough' &&
          ['stochastic', 'stochastic-v2'].includes(appearance.morphology)
            ? roughDisplayHeightBlend(appearance.featureSize, sampling[index].pitch)
            : 1;
      task.visualAppearance = blend < 1 ? { ...appearance, displayRoughBlend: blend } : appearance;
      roughTasks[index].visualAppearance = task.visualAppearance;
    });
    host.dataset.roughDisplaySamplePitchUm = String(
      Math.max(0, ...sampling.map((item) => item.pitch)),
    );
    host.dataset.roughDisplayBlendMin = String(
      Math.min(1, ...tasks.map((task) => task.visualAppearance?.displayRoughBlend ?? 1)),
    );
    host.dataset.roughImplantDisplayBlendMin = String(
      Math.min(
        1,
        ...tasks
          .filter((task) => task.implant && task.cap.appearance?.kind === 'rough')
          .map((task) => task.visualAppearance?.displayRoughBlend ?? 1),
      ),
    );
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
    const boundaryProfiles = new Map();
    const outlinedRoughCapIndices = new Set();
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
      const capIndex = physicalSurfacePlan?.caps?.indexOf(cap) ?? -1;
      if (capIndex >= 0 && geometry.userData.roughBoundaryPositions?.length) {
        boundaryProfiles.set(
          capIndex,
          boundaryProfileFromPositions(geometry.userData.roughBoundaryPositions),
        );
      }
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
        : createSurfaceMaterial(task.layer, task.state, task.visualAppearance || cap.appearance);
      if (geometry.userData.roughGpuDisplacement && !task.implant) {
        decorateGpuRoughMaterial(material, task.visualAppearance || cap.appearance, {
          profileNormal: cap.profileNormal ?? cap.normal,
          normalStrength: mode === 'interactive' ? 0.82 : 1,
        });
      } else if (!task.implant && !cap.buried && roughFarFieldContrast(0, cap.appearance) > 0) {
        decorateRoughFarFieldMaterial(material, task.visualAppearance || cap.appearance);
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
        // The diagnostic observes real CPU mesh geometry without editing the model.
        mesh.userData.waferCadRoughCutline = {
          layerId: cap.layerId,
          z: cap.z,
          profileNormal: cap.profileNormal ?? cap.normal,
          appearance: cap.appearance,
          displayAppearance: task.visualAppearance || cap.appearance,
        };
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
        if (capIndex >= 0) outlinedRoughCapIndices.add(capIndex);
      }
    }
    installRoughBoundaryProfiles(boundaryProfiles, outlinedRoughCapIndices);
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
          appearance: task.visualAppearance || cap.appearance,
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

  // If the Worker cannot run, finish the real detailed geometry in the main
  // thread and settle the same readiness contract as the Worker completion.
  // Do not synchronously build a preview followed by another detailed build.
  function completeSynchronousRoughFallback(sceneToken, startedAt, preparedTasks = null) {
    const applied = rebuildAdaptiveRoughGeometrySync({ sceneToken, preparedTasks });
    if (!applied) return false;
    host.dataset.rendererRoughMs = String(performance.now() - startedAt);
    const profileStart = roughRenderContext?.profileStart;
    if (Number.isFinite(profileStart)) {
      host.dataset.rendererFinalReadyMs = String(performance.now() - profileStart);
    }
    roughInteractionCache = null;
    host.dataset.renderPhase = 'complete';
    host.dataset.renderState = 'ready';
    stats.textContent = hasMaterial(roughRenderContext.model)
      ? roughRenderContext.clip
        ? 'ROI'
        : 'full model'
      : 'no material';
    scheduleFrame();
    return true;
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
      return Promise.resolve(
        completeSynchronousRoughFallback(
          sceneToken,
          rendererRoughStart,
          interactive ? null : prepared,
        ),
      );
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
          resolve(completeSynchronousRoughFallback(sceneToken, rendererRoughStart));
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
        resolve(completeSynchronousRoughFallback(sceneToken, rendererRoughStart));
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
        resolve(
          completeSynchronousRoughFallback(
            sceneToken,
            rendererRoughStart,
            interactive ? null : prepared,
          ),
        );
      }
    });
  }

  function rebuildAdaptiveRoughGeometrySync({
    interactive = false,
    sceneToken = roughRenderContext?.sceneGeneration ?? null,
    preparedTasks = null,
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
      // Worker construction/postMessage failure is synchronous: its detailed
      // LOD allocation is still valid. Reuse it rather than triangulating and
      // budgeting the same scene a second time. A failed interactive request
      // deliberately falls back to a freshly prepared detailed build.
      const prepared = preparedTasks || prepareAdaptiveRoughTasks({ interactive }),
        boundaryProfiles = new Map(),
        outlinedRoughCapIndices = new Set();
      host.dataset.roughFallbackReusedPreparation = String(Boolean(preparedTasks));
      for (const task of prepared.tasks) {
        const cap = task.cap;
        let geometry = geometryFromRoughCap(THREE, {
          z: cap.z,
          normal: cap.normal,
          polys: cap.polys,
          appearance: task.visualAppearance || cap.appearance,
          closeToIdeal: task.closeToIdeal ?? !cap.buried,
          sidewallBoundaryIntervals: cap.sidewallBoundaryIntervals,
          profileNormal: cap.profileNormal,
          lodContext: lodContextFor(context.model, context.clip, cap.polys, cap.z),
          lodZones: task.zones,
          analyticNormals: task.gpuDisplacement ? false : prepared.policy.analyticNormals,
          gpuDisplacement: Boolean(task.gpuDisplacement),
        });
        const capIndex = physicalSurfacePlan?.caps?.indexOf(cap) ?? -1;
        if (capIndex >= 0 && geometry.userData.roughBoundaryPositions?.length) {
          boundaryProfiles.set(
            capIndex,
            boundaryProfileFromPositions(geometry.userData.roughBoundaryPositions),
          );
        }
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
          : createSurfaceMaterial(task.layer, task.state, task.visualAppearance || cap.appearance);
        if (geometry.userData.roughGpuDisplacement && !task.implant) {
          decorateGpuRoughMaterial(material, task.visualAppearance || cap.appearance, {
            profileNormal: cap.profileNormal ?? cap.normal,
            normalStrength: interactive ? 0.82 : 1,
          });
        } else if (!task.implant && !cap.buried && roughFarFieldContrast(0, cap.appearance) > 0) {
          decorateRoughFarFieldMaterial(material, task.visualAppearance || cap.appearance);
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
          // The diagnostic observes real CPU mesh geometry without editing the model.
          mesh.userData.waferCadRoughCutline = {
            layerId: cap.layerId,
            z: cap.z,
            profileNormal: cap.profileNormal ?? cap.normal,
            appearance: cap.appearance,
            displayAppearance: task.visualAppearance || cap.appearance,
          };
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
          if (capIndex >= 0) outlinedRoughCapIndices.add(capIndex);
        }
      }

      installRoughBoundaryProfiles(boundaryProfiles, outlinedRoughCapIndices);
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
          preciseGpuRoughDisplacement = supportsPreciseGpuRoughDisplacement(renderer);
          host.dataset.roughDisplacementBackend = preciseGpuRoughDisplacement
            ? 'gpu-vertex'
            : 'cpu-software-parity';

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

  // Experimental physical facet Model uses actual owner triangles. This is an
  // opt-in production ThreeView path; old vector models never enter it.
  function renderExperimentalPhysicalFacet(model, clip, inspection, signature) {
    if (clip) throw new RangeError('Experimental physical facets do not support ROI clipping yet');
    const owner = validateExperimentalPhysicalFacetModel(model);
    if (!owner) throw new RangeError('Missing experimental physical facet owner');
    // The global XYZ helper crosses a locally collapsed Si sheet and reads
    // visually as an erroneous vertical material edge in this inspection.
    if (axesHelper) axesHelper.visible = false;
    host.dataset.physicalFacetAxesHidden = 'true';
    if (
      physicalSceneModel === model &&
      physicalSceneSignature === signature &&
      presentationObjects.size
    ) {
      applyPresentationState();
      host.dataset.physicalFacetOwner = owner.kind;
      return;
    }

    // Never route a real faceted owner into the flat Process topology plan.
    // Group disposal also drops any stale surface variants and GPU resources.
    disposeGroup();
    const data = buildPhysicalFacetPresentation(model);
    const exterior = { kind: 'material-exterior', layerId: owner.layerId };
    const materialState = presentationState(exterior, inspection).materialState;
    let built = 0;
    for (const face of ['top', 'bottom', 'side']) {
      const vertices = data.positions[face];
      if (!vertices.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      const material = createSurfaceMaterial(
        layerById(model, owner.layerId),
        materialState,
        null,
        exterior,
      );
      material.flatShading = true;
      const mesh = addSurfaceMesh(
        geometry,
        material,
        materialState,
        null,
        0,
        false,
        null,
        exterior,
      );
      if (mesh) {
        mesh.name = `physical-${face}-${owner.layerId}`;
        built++;
      }
    }
    if (built !== 3) throw new RangeError('Incomplete physical facet 3D surface faces');
    if (data.oxideTriangleCount) {
      // Only the exact owner classifies Si versus oxide. The closed display
      // envelope is a tessellated approximation; never export it as Process.
      const physicalOxideLayer = {
        id: data.oxideLayerId,
        name: 'Experimental physical SiO2',
        color: '#d88b37',
      };
      const oxideExterior = { kind: 'material-exterior', layerId: data.oxideLayerId };
      let builtOxideFaces = 0;
      for (const face of ['top', 'bottom', 'side']) {
        const positions = data.oxidePositions[face];
        if (!positions?.length) continue;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        const material = createSurfaceMaterial(
          physicalOxideLayer,
          materialState,
          null,
          oxideExterior,
        );
        material.flatShading = true;
        const mesh = addSurfaceMesh(
          geometry,
          material,
          materialState,
          null,
          0,
          false,
          null,
          oxideExterior,
        );
        if (mesh) {
          mesh.name = `physical-${face}-${data.oxideLayerId}`;
          builtOxideFaces++;
        }
      }
      if (builtOxideFaces !== 3) {
        throw new RangeError('Incomplete exterior physical oxide surface');
      }
    }
    physicalSceneModel = model;
    physicalSceneSignature = signature;
    activeSceneVariant = null;
    physicalSurfacePlan = null;
    host.dataset.physicalFacetOwner = owner.kind;
    host.dataset.physicalFacetTriangles = String(data.physicalTriangleCount);
    host.dataset.physicalFacetOxideTriangles = String(data.oxideTriangleCount);
    host.dataset.physicalFacetSourceCells = String(data.sourceCells);
    host.dataset.surfaceTopology = JSON.stringify({
      physicalTriangles: data.physicalTriangleCount,
      physicalOxideTriangles: data.oxideTriangleCount,
      sourceCells: data.sourceCells,
    });
    host.dataset.rendererUpdateKind = 'physical-facet-geometry';
    applyZDisplayState(model);
    applyPresentationState({ profile: false, settle: true });
    host.dataset.sceneVariant = 'physical-facet';
    stats.textContent = data.oxideTriangleCount
      ? 'physical Si + SiO2 (experimental tessellation)'
      : 'physical Si (experimental)';
  }

  // Experimental native ThreeView path for exact continuous material. The
  // displayed triangles are derived: the persisted owner remains analytic.
  async function renderContinuousEtch(model) {
    const clip = getClipGeometry();
    const roiBounds = continuousRectRoiBounds(clip);
    const owner = validateContinuousEtchModel(model);
    if (!owner) throw new RangeError('Missing or invalid continuous material owner');
    const updateRoiCaps = () => {
      const signature = JSON.stringify(roiBounds);
      if (continuousRoiCapSignature === signature) return false;
      for (const mesh of continuousRoiCapObjects) {
        group.remove(mesh);
        presentationObjects.delete(mesh);
        zDisplayObjects.delete(mesh);
        mesh.geometry?.dispose?.();
        mesh.material?.dispose?.();
      }
      continuousRoiCapObjects = [];
      continuousRoiCapSignature = signature;
      if (!roiBounds) {
        host.dataset.continuousEtchRoiCapTriangles = '0';
        return true;
      }
      const exterior = { kind: 'material-exterior' };
      const state = presentationState(exterior, getInspection() || {}).materialState;
      const clippedParts = [...presentationObjects]
        .map((mesh) => mesh.userData?.continuousCroppedPart)
        .filter(Boolean);
      for (const part of buildContinuousRectMeshCaps(THREE, clippedParts, roiBounds)) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
        let material = createSurfaceMaterial(layerById(model, part.layerId), state, null, exterior);
        if (material.userData?.waferCadPooledPresentationMaterial) {
          material = material.clone();
          material.userData.waferCadPooledPresentationMaterial = false;
        }
        material.side = THREE.DoubleSide;
        const mesh = addSurfaceMesh(geometry, material, state, null, 0, false, null, exterior);
        if (mesh) {
          mesh.userData.continuousLayerId = part.layerId;
          mesh.userData.continuousRoiCap = true;
          continuousRoiCapObjects.push(mesh);
        }
      }
      // New cut faces need the same physical Z transform as the original mesh.
      applyZDisplayState(model);
      host.dataset.continuousEtchRoiCapTriangles = String(
        continuousRoiCapObjects.reduce(
          (total, m) => total + m.geometry.getAttribute('position').count / 3,
          0,
        ),
      );
      return true;
    };
    // Rebuild only display triangles on an ROI change. The original native
    // meshes are retained as immutable typed arrays, so zoom, color changes
    // and Undo/Redo never mutate or resample the analytical material owner.
    const cropMaterialMeshes = () => {
      const signature = JSON.stringify(roiBounds);
      let changed = false;
      for (const mesh of presentationObjects) {
        const source = mesh.userData?.continuousFullPart;
        if (!source || mesh.userData.continuousMeshCropSignature === signature) continue;
        const cropped = clipContinuousSurfaceToRect(source, roiBounds);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(cropped.positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(cropped.normals, 3));
        geometry.userData.analyticSurfaceNormals = true;
        const oldGeometry = mesh.geometry;
        mesh.geometry = geometry;
        mesh.userData.continuousMeshCropSignature = signature;
        mesh.userData.continuousCroppedPart = cropped;
        mesh.userData.continuousRoiEmpty = cropped.triangles === 0;
        trackZDisplayObject(mesh);
        oldGeometry?.dispose?.();
        changed = true;
      }
      if (changed) applyZDisplayState(model);
      host.dataset.continuousEtchRoiMeshMode = roiBounds ? 'geometry-clipped' : 'full-mesh';
      host.dataset.continuousEtchRoiMeshTriangles = String(
        [...presentationObjects].reduce((count, mesh) => {
          if (!mesh.userData?.continuousFullPart) return count;
          return count + (mesh.geometry.getAttribute('position')?.count || 0) / 3;
        }, 0),
      );
      return changed;
    };
    const updateMaterialAppearance = () => {
      for (const mesh of presentationObjects) {
        const layerId = mesh.userData?.continuousLayerId;
        if (!layerId) continue;
        const layer = layerById(model, layerId);
        mesh.visible = layer?.visible !== false && !mesh.userData.continuousRoiEmpty;
        mesh.material?.color?.set(layer?.color || '#999');
      }
      if (renderer) renderer.localClippingEnabled = false;
      host.dataset.continuousEtchRoi = roiBounds ? 'rect-clipped' : 'full-model';
      scheduleFrame();
    };
    if (
      physicalSceneModel === model &&
      physicalSceneSignature === 'continuous-etch-v1' &&
      presentationObjects.size
    ) {
      applyPresentationState();
      cropMaterialMeshes();
      const roiChanged = updateRoiCaps();
      updateMaterialAppearance();
      // The default camera still targets the full wafer after an ROI change.
      // Reframe only when the actual rectangle changes; ordinary orbit/pan and
      // layer restyling must not reset the user's view.
      if (roiChanged) fit({ notify: false, preserveOrientation: true });
      return;
    }

    disposeGroup();
    const { edgeTable, triTable } = await import('three/addons/objects/MarchingCubes.js');
    // Exact continuous Si topography replaces full-volume voxelization only
    // for a fully covered, non-through-etched rectangular substrate. Other
    // materials and unsupported morphologies retain the generic extractor.
    const silicon = canBuildContinuousSiHeightfield(owner)
      ? buildContinuousSiHeightfieldMesh(owner, { xyStepUm: 1 })
      : null;
    // Only the validated shallow-release fast path substitutes exact unetched
    // film shells. Generic non-rectangular and multilayer stacks keep the
    // standard implicit extractor and preserve their existing behavior.
    const exactFilms = silicon ? exactUnetchedFilmCandidates(owner) : new Map();
    const skipped = [...exactFilms.keys(), ...(silicon ? ['base'] : [])];
    const materialIds = new Set(
      owner.sourceModel.regions.flatMap((region) => region.stack.map((part) => part.layerId)),
    );
    const allExact = [...materialIds].every((id) => skipped.includes(id));
    const data = allExact
      ? {
          kind: 'hybrid-continuous-analytic-surface-v1',
          layers: [],
          triangles: 0,
          sourceRevision: owner.sourceModel.revision,
        }
      : buildContinuousMaterialSurfaceMesh(owner, {
          cubeTables: { edgeTable, triTable },
          xyStepUm: 1.75,
          excludeLayerIds: skipped,
        });
    if (silicon) {
      data.layers.unshift(silicon);
      data.triangles += silicon.triangles;
    }
    for (const [layerId, { geom, z0, z1 }] of exactFilms) {
      const film = buildExactFilmComponents(THREE, geom, z0, z1);
      for (const part of film.parts) {
        data.layers.push({ ...part, layerId, exactFlat: true });
        data.triangles += part.triangles;
      }
    }
    if (data.triangles > 1500000)
      throw new RangeError('Continuous hybrid mesh exceeds triangle budget');
    const represented = new Set(data.layers.map((part) => part.layerId));
    for (const layerId of materialIds)
      if (!represented.has(layerId))
        throw new RangeError('Continuous display omitted physical material ' + layerId);
    if (!data.layers.length) throw new RangeError('Continuous Etch has no visible solid');
    const exterior = { kind: 'material-exterior' };
    const materialState = presentationState(exterior, getInspection() || {}).materialState;
    for (const part of data.layers) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
      geometry.userData.analyticSurfaceNormals = true;
      let material = createSurfaceMaterial(
        layerById(model, part.layerId),
        materialState,
        null,
        exterior,
      );
      // Continuous meshes can restyle without a multi-second geometry rebuild.
      // Keep their material private rather than mutating the pooled material
      // shared with other scenes or display variants.
      if (material.userData?.waferCadPooledPresentationMaterial) {
        material = material.clone();
        material.userData.waferCadPooledPresentationMaterial = false;
      }
      const mesh = addSurfaceMesh(
        geometry,
        material,
        materialState,
        null,
        0,
        false,
        null,
        exterior,
      );
      if (mesh) {
        mesh.name = 'continuous-etch-' + part.layerId;
        mesh.userData.continuousLayerId = part.layerId;
        mesh.userData.continuousFullPart = {
          layerId: part.layerId,
          positions: part.positions.slice(),
          normals: part.normals.slice(),
        };
      }
    }
    physicalSceneModel = model;
    physicalSceneSignature = 'continuous-etch-v1';
    activeSceneVariant = null;
    physicalSurfacePlan = null;
    host.dataset.continuousEtchTriangles = String(data.triangles);
    host.dataset.continuousEtchLayers = String(data.layers.length);
    host.dataset.rendererUpdateKind = 'continuous-etch-surface';
    host.dataset.surfaceTopology = JSON.stringify({
      continuousTriangles: data.triangles,
      sourceRevision: data.sourceRevision,
    });
    delete host.dataset.rendererBuildFailure;
    applyZDisplayState(model);
    applyPresentationState({ profile: false, settle: true });
    cropMaterialMeshes();
    updateRoiCaps();
    updateMaterialAppearance();
    host.dataset.renderState = 'ready';
    stats.textContent = 'Continuous Etch · analytic material, sampled display mesh';
    fit({ notify: false });
    scheduleFrame();
  }

  async function render() {
    if (!ready) return;
    if (rendering) {
      pendingRender = true;
      activeSurfaceAbort?.abort();
      return;
    }
    const model = getModel();
    if (!model) return;
    if (model.kernel === CONTINUOUS_ETCH_MODEL_KERNEL || model.continuousEtchOwner != null) {
      try {
        await renderContinuousEtch(model);
      } catch (error) {
        disposeGroup();
        host.dataset.renderState = 'error';
        host.dataset.renderPhase = 'build-failed';
        host.dataset.rendererBuildFailure = error?.message || String(error);
        stats.textContent = 'Continuous Etch 3D unavailable';
        console.error('Continuous Etch native 3D build failed:', error);
      }
      return;
    }
    if (model.kernel === PHYSICAL_FACET_MODEL_KERNEL) {
      try {
        renderExperimentalPhysicalFacet(
          model,
          getClipGeometry(),
          getInspection() || {},
          sceneSignature(model, getClipGeometry(), getInspection() || {}),
        );
      } catch (error) {
        host.dataset.renderState = 'error';
        host.dataset.renderPhase = 'build-failed';
        host.dataset.rendererBuildFailure = error?.message || String(error);
        stats.textContent = 'Experimental physical 3D unavailable';
        console.error('Physical facet 3D build failed:', error);
      }
      return;
    }
    if (axesHelper) axesHelper.visible = true;
    delete host.dataset.physicalFacetAxesHidden;
    delete host.dataset.physicalFacetOwner;
    delete host.dataset.physicalFacetTriangles;
    delete host.dataset.physicalFacetOxideTriangles;
    delete host.dataset.physicalFacetSourceCells;
    const clip = getClipGeometry(),
      inspection = getInspection() || {},
      signature = sceneSignature(model, clip, inspection),
      targetVariant = presentationMode(inspection);
    let variantBuild = false;
    let previousVariantGroup = null;
    let rebuildAborted = false;
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
        ensureInternalBorderContours();
        applyPresentationState();
        return;
      }

      const cachedVariant = sceneVariantCache.get(targetVariant);
      if (cachedVariant && restoreSceneVariant(cachedVariant)) {
        pendingRender = false;
        host.dataset.renderState = 'updating';
        stats.textContent = 'updating 3D…';
        syncRenderPolicy();
        ensureInternalBorderContours();
        applyPresentationState({ updateKind: 'variant-swap' });
        return;
      }

      if (Number(host.dataset.arrayInstances || 0) >= 64 && !roughTasks.length) {
        variantBuild = true;
        previousVariantGroup = startSceneVariantBuild(targetVariant);
      } else {
        pendingRender = false;
        host.dataset.renderState = 'updating';
        host.dataset.rendererUpdateKind = 'presentation';
        stats.textContent = 'updating 3D…';
        syncRenderPolicy();
        ensureInternalBorderContours();
        applyPresentationState();
        return;
      }
    }

    const renderGeneration = variantBuild ? sceneGeneration : ++sceneGeneration;
    pendingRender = false;
    delete host.dataset.rendererBuildFailure;
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
      // Keep the previous complete scene visible while exact topology is
      // built off-thread. Do not dispose it until a usable plan is available.
      syncRenderPolicy();

      const materialState = inspectionMaterialState(inspection.opacity),
        opacity = materialState.opacity,
        borders = Boolean(inspection.borders),
        plan =
          variantBuild && physicalSurfacePlan
            ? physicalSurfacePlan
            : await (async () => {
                const controller = new AbortController();
                activeSurfaceAbort = controller;
                try {
                  return await buildRenderSurfacePlanAsync(model, clip, {
                    signal: controller.signal,
                  });
                } finally {
                  if (activeSurfaceAbort === controller) activeSurfaceAbort = null;
                }
              })();
      if (!variantBuild && pendingRender) {
        // While exact topology was built in the worker, a newer request may
        // have superseded the model/ROI. Never commit that stale scene.
        const superseded = new Error('Superseded during background surface ownership');
        superseded.name = 'SceneVariantSuperseded';
        throw superseded;
      }
      if (!variantBuild) {
        disposeGroup();
        physicalSurfacePlan = plan;
      }
      group.userData.waferCadSurfacePlan = plan;
      applyZDisplayState(model);
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
      const interfaceState = interfaceMaterialState(opacity),
        smoothCaps = new Map(),
        sidewalls = new Map(),
        rendererTopologyAt = performance.now();

      const polygonCount = plan.caps.reduce((sum, cap) => sum + (cap.polys?.length || 0), 0);
      const cooperativeAssembly = shouldYieldDuringSceneAssembly({
        polygonCount,
        arrayInstances: Number(plan.arrayInstances || 0),
        capCount: plan.caps.length,
        sidewallCount: plan.sidewalls.length,
        annotationCount: (model.implants?.length || 0) + (model.electricalRegions?.length || 0),
      });
      let sceneAssemblyYields = 0,
        nextAssemblyYieldAt = performance.now() + 8;
      const cancelSupersededVariant = () => {
        if (!variantBuild || !pendingRender) return;
        const error = new Error('Superseded by a newer 3D presentation request');
        error.name = 'SceneVariantSuperseded';
        throw error;
      };
      const maybeYieldAssembly = async () => {
        cancelSupersededVariant();
        if (!cooperativeAssembly || performance.now() < nextAssemblyYieldAt) return;
        sceneAssemblyYields++;
        // A frame callback can resume in a microtask before the browser paints.
        // Yield a macrotask so input and other viewports get a chance to run.
        if (!variantBuild) await yieldSceneAssembly();
        await new Promise((resolve) => setTimeout(resolve, 0));
        nextAssemblyYieldAt = performance.now() + 8;
        cancelSupersededVariant();
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
          layerId: part.layerId,
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
            await maybeYieldAssembly();
            const key = `${Number(part.z).toPrecision(15)}|${part.normal}`;
            if (!planes.has(key)) {
              planes.set(key, { z: part.z, normal: part.normal, polys: [] });
            }
            planes.get(key).polys.push(...(part.polys || []));
          }
          const preparedPlanes = [];
          for (const plane of planes.values()) {
            await maybeYieldAssembly();
            preparedPlanes.push({
              ...plane,
              instances: translatedPolygonInstanceGroups(plane.polys, { minInstances: 8 }),
            });
          }
          const totalInstances = preparedPlanes.reduce(
            (sum, plane) => sum + plane.instances.instanceCount,
            0,
          );

          if (totalInstances > 0) {
            for (const plane of preparedPlanes) {
              await maybeYieldAssembly();
              for (const instances of plane.instances.groups) {
                await maybeYieldAssembly();
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
          smoothSidewallTemplateTriangleCount += geometry.getAttribute('position')?.count / 3 || 0;
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
              await maybeYieldAssembly();
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
        presentation: { kind: 'border', category: 'exterior' },
      });
      // Internal outline geometry is a cached view overlay, not a new
      // physical scene signature or a second Process ownership calculation.
      group.userData.waferCadSurfacePlan = plan;
      ensureInternalBorderContours(plan);
      if (!group.userData.waferCadInternalContoursPrepared) {
        host.dataset.internalInterfaceBorderCount = '0';
        host.dataset.internalBuriedBorderCount = '0';
      }
      host.dataset.hiddenBorderSegmentCount = '0';
      host.dataset.buriedContourSegmentCount = '0';
      host.dataset.sectionContourSegmentCount = '0';
      // Small scenes and rough scenes can switch opaque <-> transparent
      // through a presentation-only update without rebuilding the scene.
      // Prepare their dormant hidden lines once, regardless of initial opacity.
      // Large smooth arrays get a dedicated transparent scene variant instead,
      // so their opaque startup remains free of hidden-contour allocations.
      const needsHiddenContourSuperset =
        targetVariant === 'transparent' ||
        Number(plan.arrayInstances || 0) < 64 ||
        roughTasks.length > 0;
      if (needsHiddenContourSuperset) {
        rebuildInspectionContours();
      }

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
        await maybeYieldAssembly();
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
            // Rebuild its visual cut only after the actual conformal rough
            // caps are prepared; canonical implant depth/dose stay unchanged.
            if (appearance) cut.userData.waferCadImplantCut = implant;
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
        await maybeYieldAssembly();
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
      cancelSupersededVariant();
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
      // The next frame must contain exactly one presentation variant.
      // Keep the retired group cached but detached for fast future switches.
      if (previousVariantGroup && previousVariantGroup !== group) {
        scene.remove(previousVariantGroup);
        host.dataset.rendererRetainedCompleteVisible = 'false';
        host.dataset.rendererCommittedVariantSwaps = String(
          Number(host.dataset.rendererCommittedVariantSwaps || 0) + 1,
        );
      }
      recordVariantStage('presentation-complete');
      cacheActiveSceneVariant();
      if (!roughTasks.length) {
        host.dataset.renderPhase = 'complete';
        host.dataset.renderState = 'ready';
        stats.textContent = hasMaterial(model) ? (clip ? 'ROI' : 'full model') : 'no material';
      }
    } catch (error) {
      rebuildAborted = true;
      const superseded = error?.name === 'SceneVariantSuperseded' || error?.name === 'AbortError';
      if (previousVariantGroup) {
        // Never strand the viewport with a partially constructed, hidden group.
        const failedGroup = group;
        scene.remove(failedGroup);
        disposeSceneGroup(failedGroup);
        const cached = [...sceneVariantCache.values()].find(
          (entry) => entry.group === previousVariantGroup,
        );
        if (cached) restoreSceneVariant(cached);
        else {
          group = previousVariantGroup;
          if (group.parent !== scene) scene.add(group);
        }
        host.dataset.renderState = 'ready';
        host.dataset.rendererRetainedCompleteVisible = 'false';
        host.dataset.rendererVariantRollbacks = String(
          Number(host.dataset.rendererVariantRollbacks || 0) + 1,
        );
      }
      if (superseded) {
        host.dataset.rendererSupersededBuilds = String(
          Number(host.dataset.rendererSupersededBuilds || 0) + 1,
        );
        host.dataset.renderPhase = 'superseded';
        stats.textContent = 'updating 3D…';
      } else {
        console.error('3D scene rebuild failed:', error);
        host.dataset.renderPhase = previousVariantGroup ? 'variant-build-failed' : 'build-failed';
        host.dataset.rendererBuildFailure = error?.message || String(error);
        if (!previousVariantGroup) {
          host.dataset.renderState = 'error';
        }
        stats.textContent = previousVariantGroup
          ? '3D update failed; previous view retained'
          : '3D build failed';
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

    // Failed or superseded candidates must never trigger a fresh rough task
    // against the previous committed scene before the latest request settles.
    if (!rebuildAborted && host.dataset.renderState !== 'error' && roughTasks.length) {
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
        geometry.userData = {};
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
        capCount = Math.max(1, surfacePlan.caps.length),
        exportBoundaryProfiles = new Map();
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
            exportBoundaryProfiles.set(
              capIndex,
              boundaryProfileFromPositions(geometry.userData.roughBoundaryPositions),
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
            geometryFromSidewallParts(sidewall.parts || [sidewall], 0, exportBoundaryProfiles),
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
        addExportMesh(
          geometryFromSidewallParts(parts, 0, exportBoundaryProfiles),
          layerId,
          ' · sidewalls',
        );
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
        renderInspectionFrame(captureRenderer);
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

  // Read-only acceptance probe: actual CPU rough triangles versus Section's physical sampler.
  // GPU vertex displacement, array instances and synced Section raster are out of scope.
  function sampleRoughCutline({
    xMin,
    xMax,
    y,
    samples = 65,
    pixelsPerUm = 100,
    layerId = null,
  } = {}) {
    if (!ready || !THREE || !group || !currentZDisplay || currentRoughMode !== 'detailed') {
      throw new Error('Detailed native rough mesh must finish before cutline sampling');
    }
    if (
      ![xMin, xMax, y, pixelsPerUm].every(Number.isFinite) ||
      !(xMax > xMin) ||
      !(pixelsPerUm > 0) ||
      !Number.isInteger(samples) ||
      samples < 2 ||
      samples > 2048
    ) {
      throw new Error('Invalid physical rough cutline or Section pixel calibration');
    }
    const candidates = roughMeshes
      .map(({ mesh }) => mesh)
      .filter((mesh) => mesh?.visible && mesh.userData.waferCadRoughCutline);
    // The highest rough layer in the whole scene may not exist at this XY.
    // Unless explicitly constrained, select the frontmost cap per sample.
    const targetLayer = layerId || null;
    const meshes = candidates.filter(
      (mesh) => !targetLayer || mesh.userData.waferCadRoughCutline.layerId === targetLayer,
    );
    if (!meshes.length) throw new Error('No visible rough mesh for requested material layer');
    if (
      meshes.some((mesh) => mesh.isInstancedMesh || mesh.geometry?.userData?.roughGpuDisplacement)
    ) {
      throw new Error('CPU raycast cannot qualify GPU/instanced rough meshes');
    }
    group.updateMatrixWorld(true);
    const scale = Number(currentZDisplay.scale);
    if (!(scale > 0)) throw new Error('Invalid rendered Z scale');
    // Limit the raycast to triangles that can intersect the requested line.
    // The full-area Quality geometry can have >100k triangles: 65 full mesh
    // raycasts can dominate the actual render and hang the acceptance runner.
    // This temporary probe mesh reuses the *actual* BufferGeometry vertices and
    // original material facing, but never changes a production mesh/drawRange.
    const probeMeshes = [];
    for (const mesh of meshes) {
      const source = mesh.geometry;
      const position = source.getAttribute('position');
      const indices = source.getIndex();
      if (!position) continue;
      const picked = [];
      const a = new THREE.Vector3(),
        b = new THREE.Vector3(),
        c = new THREE.Vector3();
      const triangles = indices ? indices.count / 3 : position.count / 3;
      for (let t = 0; t < triangles; t++) {
        const i = t * 3;
        const ai = indices ? indices.getX(i) : i;
        const bi = indices ? indices.getX(i + 1) : i + 1;
        const ci = indices ? indices.getX(i + 2) : i + 2;
        a.fromBufferAttribute(position, ai).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(position, bi).applyMatrix4(mesh.matrixWorld);
        c.fromBufferAttribute(position, ci).applyMatrix4(mesh.matrixWorld);
        if (
          Math.min(a.y, b.y, c.y) > y ||
          Math.max(a.y, b.y, c.y) < y ||
          Math.min(a.x, b.x, c.x) > xMax ||
          Math.max(a.x, b.x, c.x) < xMin
        )
          continue;
        // Store the original local-space Float32 vertices: the Raycaster uses
        // precisely the same transformed coordinates as the production mesh.
        for (const vertex of [ai, bi, ci]) {
          picked.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
        }
      }
      if (!picked.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(picked, 3));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const probe = new THREE.Mesh(geometry, mesh.material);
      probe.matrixAutoUpdate = false;
      probe.matrixWorld.copy(mesh.matrixWorld);
      probe.userData = mesh.userData;
      probeMeshes.push({
        mesh: probe,
        bounds: new THREE.Box3().setFromObject(mesh),
        triangles: picked.length / 9,
      });
    }
    const ray = new THREE.Raycaster(),
      points = [];
    for (let index = 0; index < samples; index++) {
      const x = xMin + ((xMax - xMin) * (index + 0.5)) / samples;
      const hits = [];
      for (const { mesh, bounds } of probeMeshes) {
        if (x < bounds.min.x || x > bounds.max.x || y < bounds.min.y || y > bounds.max.y) continue;
        ray.set(
          new THREE.Vector3(x, y, bounds.max.z + Math.max(1, bounds.max.z - bounds.min.z + 1)),
          new THREE.Vector3(0, 0, -1),
        );
        const hit = ray.intersectObject(mesh, false)[0];
        if (!hit) continue;
        const info = mesh.userData.waferCadRoughCutline;
        const height = roughProfileOffsetAtPixelFootprint(x, y, info.appearance, {
          pixelsPerUm,
          unitX: 1,
          unitY: 0,
        });
        const physicalZ = info.z + (Number(info.profileNormal) || 1) * height;
        const expectedZ = currentZDisplay.mapZ(physicalZ) * scale;
        const displayHeight = roughDisplayProfileOffsetAtPoint(x, y, info.displayAppearance);
        const visualZ = info.z + (Number(info.profileNormal) || 1) * displayHeight;
        const visualExpectedZ = currentZDisplay.mapZ(visualZ) * scale;
        const dz = Math.max(1e-5, Math.abs(physicalZ) * 1e-9);
        const derivative =
          (currentZDisplay.mapZ(physicalZ + dz) - currentZDisplay.mapZ(physicalZ - dz)) / (2 * dz);
        if (!(derivative > 1e-9)) continue;
        const result = {
          xUm: x,
          yUm: y,
          layerId: info.layerId,
          expectedPhysicalZUm: physicalZ,
          expectedDisplayZ: expectedZ,
          actualDisplayZ: hit.point.z,
          errorUm: (hit.point.z - expectedZ) / (scale * derivative),
          meshInterpolationErrorUm: (hit.point.z - visualExpectedZ) / (scale * derivative),
          displayAttenuationErrorUm: (visualExpectedZ - expectedZ) / (scale * derivative),
          displayHeightBlend: info.displayAppearance?.displayRoughBlend ?? 1,
        };
        hits.push(result);
      }
      const selected = selectFrontmostRoughCutlineSample(hits);
      points.push(
        selected.point || {
          xUm: x,
          yUm: y,
          missing: true,
          reason: selected.ambiguous ? 'ambiguous-rough-ownership' : 'no-rough-intersection',
          ambiguous: selected.ambiguous,
        },
      );
    }
    const clippedTriangleCount = probeMeshes.reduce((sum, p) => sum + p.triangles, 0);
    for (const { mesh } of probeMeshes) mesh.geometry.dispose();
    const valid = points.filter((p) => Number.isFinite(p.errorUm));
    const sampledLayerIds = [...new Set(valid.map((point) => point.layerId))];
    return {
      layerId: targetLayer || (sampledLayerIds.length === 1 ? sampledLayerIds[0] : null),
      sampledLayerIds,
      ambiguousCount: points.filter((point) => point.ambiguous).length,
      sampleCount: samples,
      hitCount: valid.length,
      missingCount: samples - valid.length,
      rmsErrorUm: valid.length
        ? Math.sqrt(valid.reduce((sum, p) => sum + p.errorUm ** 2, 0) / valid.length)
        : null,
      maximumErrorUm: valid.length ? Math.max(...valid.map((p) => Math.abs(p.errorUm))) : null,
      sectionPixelsPerUm: pixelsPerUm,
      displayScale: scale,
      roiLine: [xMin, xMax, y],
      clippedTriangleCount,
      meshInterpolationRmsUm: valid.length
        ? Math.sqrt(
            valid.reduce((sum, p) => sum + p.meshInterpolationErrorUm ** 2, 0) / valid.length,
          )
        : null,
      displayAttenuationRmsUm: valid.length
        ? Math.sqrt(
            valid.reduce((sum, p) => sum + p.displayAttenuationErrorUm ** 2, 0) / valid.length,
          )
        : null,
      points,
    };
  }

  return {
    init,
    render,
    fit,
    highlightLayer,
    sampleRoughCutline,
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
