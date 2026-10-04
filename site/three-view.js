import { hasMaterial, layerById, modelBoundsZ } from './model.js';
import { electricalRegionSolids, implantSolids, materialSolids } from './model-view-geometry.js';
import { buildRenderSurfacePlan } from './renderer-geometry.js';
import {
  createCollapsedZDisplayTransform,
  resolveSectionCollapse,
} from './section-z-collapse.js';
import {
  geometryFromRoughCap,
  geometryFromRoughMeshData,
  roughBoundaryEdgesFromTriangles,
  roughCapBaseTriangles,
  subdivideRoughBaseTriangles,
} from './rough-mesh-geometry.js';
import {
  adaptiveRoughMeshLod,
  allocateRoughTriangleBudgets,
  projectedPixelsPerUnit,
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
  let transparentMeshes = [];
  let roughWorker = null;
  let roughWorkerResolve = null;
  let roughWorkerGeneration = 0;
  let roughRefineTimer = null;
  let roughInteractionCache = null;
  let currentRoughMode = 'none';
  let sceneGeneration = 0;
  let pendingRender = false;
  let zDisplayObjects = new Set();
  let currentZDisplay = null;

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

    const fullyUpper = record.minZ >= state.top,
      fullyLower = record.maxZ <= state.bottom;

    if (fullyUpper || fullyLower) {
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
    host.dataset.zCollapseTopUm = String(currentZDisplay.top);
    host.dataset.zCollapseBottomUm = String(currentZDisplay.bottom);
    host.dataset.zCollapseGapUm = String(currentZDisplay.gap);
    host.dataset.zDisplayScale = String(currentZDisplay.scale);

    updateTransparentOrder();
    updateRoughMaterialLod();
    scheduleFrame();
    return currentZDisplay;
  }

  function updateZCollapse() {
    if (!ready || !group) return false;
    return Boolean(applyZDisplayState());
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
            z * (group?.scale?.z || 1),
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

  function roughAxisDivisions(span, featureSize) {
    const features = Math.max(0, Number(span) || 0) / Math.max(1e-9, Number(featureSize) || 1);
    if (features >= 16) return 4;
    if (features >= 8) return 3;
    if (features >= 4) return 2;
    return 1;
  }

  function triangleSetBounds(triangles) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const triangle of triangles || []) {
      for (const point of triangle || []) {
        minX = Math.min(minX, Number(point?.[0]));
        minY = Math.min(minY, Number(point?.[1]));
        maxX = Math.max(maxX, Number(point?.[0]));
        maxY = Math.max(maxY, Number(point?.[1]));
      }
    }
    return [minX, minY, maxX, maxY].every(Number.isFinite)
      ? { minX, minY, maxX, maxY }
      : null;
  }

  function triangleSetMaxEdge(triangles) {
    let maxEdge = 0;
    for (const triangle of triangles || []) {
      for (const [a, b] of [
        [triangle[0], triangle[1]],
        [triangle[1], triangle[2]],
        [triangle[2], triangle[0]],
      ]) {
        maxEdge = Math.max(maxEdge, Math.hypot(a[0] - b[0], a[1] - b[1]));
      }
    }
    return maxEdge;
  }

  function spatialBaseDepth(base, bounds, columns, rows) {
    const cellSpan = Math.max(
        (bounds.maxX - bounds.minX) / Math.max(1, columns),
        (bounds.maxY - bounds.minY) / Math.max(1, rows),
        1e-9,
      ),
      desired = base.maxEdge > cellSpan ? Math.ceil(Math.log2(base.maxEdge / cellSpan)) : 0;
    let depth = Math.min(2, Math.max(0, desired));
    while (depth > 0 && base.triangles.length * 4 ** depth > 8192) depth--;
    return depth;
  }

  function prepareRoughSpatialZones(task) {
    if (task.spatialZones !== undefined) return task.spatialZones;
    const cap = task.cap,
      bounds = xyBounds(cap.polys),
      featureSize = cap.appearance?.featureSize;
    if (!bounds) {
      task.spatialZones = [];
      return task.spatialZones;
    }

    const base = roughCapBaseTriangles(THREE, cap.z, cap.normal, cap.polys);
    roughBaseTriangulationCount++;
    if (!base.triangles.length) {
      task.spatialZones = [];
      roughSpatialZoneBuildCount++;
      return task.spatialZones;
    }

    const columns = roughAxisDivisions(bounds.maxX - bounds.minX, featureSize),
      rows = roughAxisDivisions(bounds.maxY - bounds.minY, featureSize),
      depth = spatialBaseDepth(base, bounds, columns, rows),
      spatialTriangles = subdivideRoughBaseTriangles(base.triangles, depth),
      spanX = Math.max(1e-12, bounds.maxX - bounds.minX),
      spanY = Math.max(1e-12, bounds.maxY - bounds.minY),
      buckets = new Map();

    for (const triangle of spatialTriangles) {
      const cx = (triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3,
        cy = (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3,
        column = Math.max(
          0,
          Math.min(columns - 1, Math.floor(((cx - bounds.minX) / spanX) * columns)),
        ),
        row = Math.max(
          0,
          Math.min(rows - 1, Math.floor(((cy - bounds.minY) / spanY) * rows)),
        ),
        key = `${row}|${column}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(triangle);
    }

    task.spatialZones = [...buckets.values()].map((baseTriangles) => ({
      polys: null,
      bounds: triangleSetBounds(baseTriangles),
      baseTriangles,
      maxEdge: triangleSetMaxEdge(baseTriangles),
      edges: roughBoundaryEdgesFromTriangles(baseTriangles),
    }));
    roughSpatialZoneBuildCount++;
    return task.spatialZones;
  }

  function boundsOverlap(a, b) {
    return Boolean(
      a &&
        b &&
        a.maxX >= b.minX &&
        a.minX <= b.maxX &&
        a.maxY >= b.minY &&
        a.minY <= b.maxY,
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
    roughRefineTimer = setTimeout(() => {
      roughRefineTimer = null;
      if (!interacting) void requestRoughGeometry('detailed');
    }, Math.max(0, Number(delay) || 0));
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
    return [minX, minY, maxX, maxY].every(Number.isFinite)
      ? { minX, minY, maxX, maxY }
      : null;
  }

  function geometryFromSolid({ slabs, caps }) {
    const positions = [],
      normals = [];
    const triangle = (a, b, c, normal) => {
      positions.push(...a, ...b, ...c);
      normals.push(...normal, ...normal, ...normal);
    };
    for (const { z, normal, polys } of caps)
      for (const poly of polys) {
        const rings = poly.map((ring) =>
          ring.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)),
        );
        const points = rings.flat();
        for (const indices of THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1))) {
          let [a, b, c] = indices.map((i) => [points[i].x, points[i].y, z]);
          const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
          if (cross * normal < 0) [b, c] = [c, b];
          triangle(a, b, c, [0, 0, normal]);
        }
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
        depth = Math.max(
          0,
          implant.face === 'front' ? implant.sourceZ - z : z - implant.sourceZ,
        );
      positions.setX(index, positions.getX(index) + tangent * depth);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function geometryCenter(geometry) {
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox?.getCenter(center);
    return center;
  }

  function geometryFromSidewallParts(parts) {
    const positions = [],
      normals = [];

    const triangle = (a, b, c, normal) => {
      positions.push(...a, ...b, ...c);
      normals.push(...normal, ...normal, ...normal);
    };

    for (const part of parts || []) {
      const p = part.p,
        q = part.q,
        dx = q[0] - p[0],
        dy = q[1] - p[1],
        length = Math.hypot(dx, dy);
      if (!length) continue;
      const normal = [dy / length, -dx / length, 0],
        a = [...p, part.z0],
        b = [...q, part.z0],
        c = [...q, part.z1],
        d = [...p, part.z1];
      triangle(a, b, c, normal);
      triangle(a, c, d, normal);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
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
    edgeGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
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
      if (task.implant) geometry = shearImplantGeometry(geometry, task.implant);

      const material = createSurfaceMaterial(task.layer, task.state, cap.appearance);
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
    stats.textContent = hasMaterial(context.model) ? (context.clip ? 'ROI' : 'full model') : 'no material';
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

  function requestRoughGeometry(
    mode = 'detailed',
    { force = false, refineAfter = false } = {},
  ) {
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
          profileNormal: cap.profileNormal,
          lodContext: lodContextFor(context.model, context.clip, cap.polys, cap.z),
          lodZones: task.zones,
        });
        if (task.implant) geometry = shearImplantGeometry(geometry, task.implant);

        const material = createSurfaceMaterial(task.layer, task.state, cap.appearance);
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
            detail: 'Three.js resources could not be loaded. Main, Mask, and Section remain available.',
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
          renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
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
            scheduleDetailedRoughBuild();
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
          fit();
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

      for (const bucket of smoothCaps.values()) {
        const state = stateFor(bucket.part);
        if (!state) continue;
        const geometry = geometryFromSolid({
            slabs: [],
            caps: bucket.items.map((part) => ({
              z: part.z,
              normal: part.normal,
              polys: part.polys,
            })),
          }),
          material = createSurfaceMaterial(layerById(model, bucket.part.layerId), state);
        addSurfaceMesh(geometry, material, state, null, bucket.part.buried ? 10 : 0);
      }

      for (const sidewall of plan.sidewalls) {
        const state = stateFor(sidewall);
        if (!state) continue;
        pushBucket(sidewalls, sidewall, state);
      }
      for (const bucket of sidewalls.values()) {
        const state = stateFor(bucket.part);
        if (!state) continue;
        const geometry = geometryFromSidewallParts(bucket.items),
          material = createSurfaceMaterial(layerById(model, bucket.part.layerId), state);
        addSurfaceMesh(geometry, material, state, null, bucket.part.buried ? 11 : 0);
      }

      if (borders) {
        addBorderPositions(plan.borderLines.flat(2), {
          order: 100000,
          opacity,
        });
      }

      // Implant is a non-material annotation volume. In opaque inspection,
      // internal fragments are not added to the scene at all; only a fragment
      // whose surviving outer face coincides with the current material surface
      // receives a surface overlay. Transparent inspection adds the clipped
      // internal body and its outer cap for volume inspection.
      const showInternalImplants = materialState.transparent;
      let implantInternalCount = 0,
        implantSurfaceCount = 0;
      for (const implant of implantSolids(model, clip)) {
        if (!showInternalImplants && !implant.surfaceExposed) continue;

        const outerNormal = implant.face === 'front' ? 1 : -1,
          appearance =
            implant.surfaceAppearance?.kind === 'rough' ? implant.surfaceAppearance : null,
          followDepthProfile = Boolean(
            appearance && implant.depthProfile !== 'smooth',
          );

        if (showInternalImplants) {
          const implantState = {
              opacity: opacity * 0.18,
              transparent: true,
              depthTest: true,
              depthWrite: false,
            },
            bodyGeometry = shearImplantGeometry(
              geometryFromSolid(
                followDepthProfile
                  ? { slabs: implant.slabs, caps: [] }
                  : implant,
              ),
              implant,
            ),
            bodyMaterial = new THREE.MeshStandardMaterial({
              color: implant.color || '#D65A6F',
              roughness: 0.7,
              metalness: 0,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: implantState.opacity,
              depthTest: true,
              depthWrite: false,
            }),
            body = addSurfaceMesh(bodyGeometry, bodyMaterial, implantState, null, 30);
          if (body) {
            body.name = implant.name || implant.implantId || 'Implant';
            implantInternalCount++;
          }

          if (followDepthProfile) {
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

        implantSurfaceCount++;
        const capState = {
            opacity: opacity * 0.3,
            transparent: true,
            depthTest: true,
            depthWrite: false,
          },
          capName = `${implant.name || implant.implantId || 'Implant'} surface`;

        if (appearance) {
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
          const capGeometry = shearImplantGeometry(
              geometryFromSolid({
                slabs: [],
                caps: [{ z: implant.outerZ, normal: outerNormal, polys: implant.polys }],
              }),
              implant,
            ),
            capMaterial = createSurfaceMaterial(
              { color: implant.color || '#D65A6F' },
              capState,
            );
          capMaterial.polygonOffset = true;
          capMaterial.polygonOffsetFactor = -1;
          capMaterial.polygonOffsetUnits = -1;
          const cap = addSurfaceMesh(capGeometry, capMaterial, capState, null, 40);
          if (cap) cap.name = capName;
        }
      }

      host.dataset.implantInternalCount = String(implantInternalCount);
      host.dataset.implantSurfaceCount = String(implantSurfaceCount);

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
            electrical.surfaceAppearance?.kind === 'rough'
              ? electrical.surfaceAppearance
              : null,
          followDepthProfile = Boolean(
            appearance && electrical.depthProfile !== 'smooth',
          );

        if (showInternalElectrical) {
          const electricalState = {
              opacity: opacity * 0.14,
              transparent: true,
              depthTest: true,
              depthWrite: false,
            },
            bodyGeometry = geometryFromSolid(
              followDepthProfile
                ? { slabs: electrical.slabs, caps: [] }
                : electrical,
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
            body.name =
              electrical.name || electrical.electricalRegionId || 'Electrical Region';
            electricalRegionInternalCount++;
          }

          if (followDepthProfile) {
            roughTasks.push({
              kind: 'electrical-depth',
              cap: {
                type: 'cap',
                layerId:
                  electrical.layerId ||
                  electrical.electricalRegionId ||
                  'electrical-region',
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
              name:
                `${electrical.name || electrical.electricalRegionId || 'Electrical Region'} depth boundary`,
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
          capName =
            `${electrical.name || electrical.electricalRegionId || 'Electrical Region'} surface`;

        if (appearance) {
          roughTasks.push({
            kind: 'electrical',
            cap: {
              type: 'cap',
              layerId:
                electrical.layerId ||
                electrical.electricalRegionId ||
                'electrical-region',
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
          const capGeometry = geometryFromSolid({
              slabs: [],
              caps: [{ z: electrical.outerZ, normal: outerNormal, polys: electrical.polys }],
            }),
            capMaterial = createSurfaceMaterial(
              { color: electrical.color || '#7A6FD0' },
              capState,
            );
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

  function fit() {
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
    controls.target.set(
      centerX,
      centerY,
      ((zState.displayMin + zState.displayMax) / 2) * zScale,
    );
    camera.position.copy(
      new THREE.Vector3(1.05, -1.15, 0.82)
        .normalize()
        .multiplyScalar(distance)
        .add(controls.target),
    );
    controls.update();
    axesHelper.scale.setScalar(Math.max(0.6, size / 100));
    scheduleFrame();
  }

  async function exportGlb() {
    if (!ready || !THREE) throw new Error('3D view is unavailable.');
    const model = getModel();
    if (!model) throw new Error('No model to export.');

    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const exportGroup = new THREE.Group();
    exportGroup.name = 'WaferCAD';
    // glTF uses metres. Canonical WaferCAD geometry is stored in micrometres.
    exportGroup.scale.setScalar(1e-6);

    const clip = getClipGeometry();
    for (const item of materialSolids(model, clip)) {
      const geometry = geometryFromSolid(item);
      const layer = layerById(model, item.layerId);
      const material = new THREE.MeshStandardMaterial({
        color: layer?.color || '#999',
        roughness: 0.78,
        metalness: 0.015,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = layer?.name || item.layerId || 'Layer';
      exportGroup.add(mesh);
    }

    try {
      const exporter = new GLTFExporter();
      const result = await new Promise((resolve, reject) =>
        exporter.parse(exportGroup, resolve, reject, {
          binary: true,
          onlyVisible: true,
          trs: false,
        }),
      );
      return new Blob([result], { type: 'model/gltf-binary' });
    } finally {
      for (const object of exportGroup.children) {
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
    updateZCollapse,
    exportGlb,
    capturePng,
    get ready() {
      return ready;
    },
  };
}
