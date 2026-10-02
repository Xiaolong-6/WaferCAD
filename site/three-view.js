import { hasMaterial, layerById, modelBoundsZ, zDisplayScale } from './model.js';
import { implantSolids, materialSolids } from './model-view-geometry.js';
import { buildRenderSurfacePlan } from './renderer-geometry.js';
import { difference, intersection, isEmpty } from './vector-geometry.js';
import {
  adaptiveRoughMeshLod,
  projectedPixelsPerUnit,
  roughLod,
  roughProfileOffsetAtPoint,
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
  let transparentMeshes = [];

  function currentViewport() {
    return {
      width: Math.max(2, renderer?.domElement?.clientWidth || host.clientWidth || 2),
      height: Math.max(2, renderer?.domElement?.clientHeight || host.clientHeight || 2),
      pixelRatio: Math.max(0.25, renderer?.getPixelRatio?.() || 1),
    };
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
    { visibleFraction = null, screenPriority = 1, maxDepth = 10 } = {},
  ) {
    const viewport = currentViewport(),
      patchBounds = xyBounds(polys),
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

  function focusGeometry() {
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
      ys = corners.map((point) => point.y),
      minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    return [
      [
        [
          [minX, minY],
          [maxX, minY],
          [maxX, maxY],
          [minX, maxY],
          [minX, minY],
        ],
      ],
    ];
  }

  function roughLodZones(model, clip, polys, z) {
    const focus = focusGeometry(),
      focused = intersection(polys, focus);
    if (isEmpty(focused)) {
      return [
        {
          polys,
          lodContext: lodContextFor(model, clip, polys, z, {
            visibleFraction: 0.04,
            screenPriority: 0.06,
            maxDepth: 5,
          }),
        },
      ];
    }

    const zones = [
        {
          polys: focused,
          lodContext: lodContextFor(model, clip, focused, z, {
            visibleFraction: 1,
            screenPriority: 1,
            maxDepth: 10,
          }),
        },
      ],
      background = difference(polys, focus);
    if (!isEmpty(background)) {
      zones.push({
        polys: background,
        lodContext: lodContextFor(model, clip, background, z, {
          visibleFraction: 0.04,
          screenPriority: 0.06,
          maxDepth: 5,
        }),
      });
    }
    return zones;
  }

  function adaptiveLodSignature() {
    if (!camera || !renderer || !controls || !roughMeshes.length) return null;
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
      const point = entry.center.clone();
      point.z *= group?.scale?.z || 1;
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
      delete data.roughLodZones;
      delete data.roughLodStitches;
      return;
    }
    data.roughLodDepthMin = String(Math.min(...depths));
    data.roughLodDepthMax = String(Math.max(...depths));
    data.roughTriangleCount = String(Math.round(triangles));
    data.roughLodZones = String(zones);
    data.roughLodStitches = String(stitches);
  }

  function maybeRebuildAdaptiveGeometry() {
    if (rendering || !roughMeshes.length) return false;
    const signature = adaptiveLodSignature();
    if (!signature || signature === lastLodSignature) return false;
    render();
    return true;
  }

  function scheduleFrame() {
    if (!renderer || frame != null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const changed = controls?.update?.() || false,
        rebuilt = maybeRebuildAdaptiveGeometry();
      if (!rebuilt) updateRoughMaterialLod();
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
    scheduleFrame();
  }

  function disposeGroup() {
    if (!group) return;
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
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    roughMeshes = [];
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

  function triangleNormal(a, b, c) {
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2],
      vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2],
      nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx,
      length = Math.hypot(nx, ny, nz) || 1;
    return [nx / length, ny / length, nz / length];
  }

  function roughCapBaseTriangles(z, normal, polys) {
    const triangles = [];
    let maxEdge = 0;
    for (const poly of polys || []) {
      const rings = poly.map((ring) =>
          ring.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y)),
        ),
        points = rings.flat();
      if (!rings[0]?.length) continue;
      for (const indices of THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1))) {
        let [a, b, c] = indices.map((index) => [points[index].x, points[index].y, z]);
        const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (cross * normal < 0) [b, c] = [c, b];
        triangles.push([a, b, c]);
        maxEdge = Math.max(
          maxEdge,
          Math.hypot(a[0] - b[0], a[1] - b[1]),
          Math.hypot(b[0] - c[0], b[1] - c[1]),
          Math.hypot(c[0] - a[0], c[1] - a[1]),
        );
      }
    }
    return { triangles, maxEdge };
  }

  function subdivideTriangles(triangles, depth) {
    let current = triangles;
    for (let level = 0; level < depth; level++) {
      const next = [];
      for (const [a, b, c] of current) {
        const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2]],
          bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, b[2]],
          ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2, c[2]];
        next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      }
      current = next;
    }
    return current;
  }

  function roughPoint(point, z, profileNormal, appearance) {
    return [
      point[0],
      point[1],
      z + profileNormal * roughProfileOffsetAtPoint(point[0], point[1], appearance),
    ];
  }

  function roughPointNormal(point, normal, profileNormal, appearance) {
    const feature = Math.max(1e-9, Number(appearance?.featureSize) || 1),
      step = Math.max(1e-6, feature * 0.08),
      dx =
        (roughProfileOffsetAtPoint(point[0] + step, point[1], appearance) -
          roughProfileOffsetAtPoint(point[0] - step, point[1], appearance)) /
        (2 * step),
      dy =
        (roughProfileOffsetAtPoint(point[0], point[1] + step, appearance) -
          roughProfileOffsetAtPoint(point[0], point[1] - step, appearance)) /
        (2 * step),
      length = Math.hypot(dx, dy, 1) || 1,
      slopeSign = normal * profileNormal;
    return [(-slopeSign * dx) / length, (-slopeSign * dy) / length, normal / length];
  }

  function geometryFromRoughCap({
    z,
    normal,
    polys,
    appearance,
    closeToIdeal = true,
    lodContext = {},
    lodZones = null,
    profileNormal = normal,
  }) {
    const zones = Array.isArray(lodZones) && lodZones.length ? lodZones : [{ polys, lodContext }],
      positions = [],
      normals = [],
      roughBorderPositions = [],
      zoneResults = [];
    let maxDepth = 0;

    const edgeKey = (p, q) => {
        const keyPoint = (point) =>
          `${Number(point[0]).toPrecision(13)},${Number(point[1]).toPrecision(13)}`,
          a = keyPoint(p),
          b = keyPoint(q);
        return a < b ? `${a}|${b}` : `${b}|${a}`;
      },
      polygonEdges = (zonePolys) => {
        const edges = [];
        for (const poly of zonePolys || []) {
          for (const closed of poly || []) {
            const ring =
              closed.length > 1 &&
              closed[0][0] === closed.at(-1)[0] &&
              closed[0][1] === closed.at(-1)[1]
                ? closed.slice(0, -1)
                : closed.slice();
            for (let index = 0; index < ring.length; index++) {
              const p = ring[index],
                q = ring[(index + 1) % ring.length];
              if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= 1e-12) continue;
              edges.push({ p, q, key: edgeKey(p, q) });
            }
          }
        }
        return edges;
      },
      pushTriangle = (a, b, c) => {
        const faceNormal = triangleNormal(a, b, c);
        positions.push(...a, ...b, ...c);
        normals.push(...faceNormal, ...faceNormal, ...faceNormal);
      },
      pushRoughTriangle = (a, b, c) => {
        positions.push(...a, ...b, ...c);
        normals.push(
          ...roughPointNormal(a, normal, profileNormal, appearance),
          ...roughPointNormal(b, normal, profileNormal, appearance),
          ...roughPointNormal(c, normal, profileNormal, appearance),
        );
      },
      pointAlongEdge = (p, q, t) => [
        p[0] + (q[0] - p[0]) * t,
        p[1] + (q[1] - p[1]) * t,
        z,
      ],
      roughAlongEdge = (p, q, t) =>
        roughPoint(pointAlongEdge(p, q, t), z, profileNormal, appearance),
      coarseApproxAlongEdge = (p, q, t, coarseDepth) => {
        const segments = 2 ** coarseDepth,
          scaled = Math.max(0, Math.min(segments, t * segments)),
          index = Math.min(segments - 1, Math.floor(scaled)),
          local = Math.max(0, Math.min(1, scaled - index)),
          a = roughAlongEdge(p, q, index / segments),
          b = roughAlongEdge(p, q, (index + 1) / segments);
        return [
          a[0] + (b[0] - a[0]) * local,
          a[1] + (b[1] - a[1]) * local,
          a[2] + (b[2] - a[2]) * local,
        ];
      };

    for (const zone of zones) {
      if (isEmpty(zone.polys)) continue;
      const { triangles: baseTriangles, maxEdge } = roughCapBaseTriangles(z, normal, zone.polys),
        lod = adaptiveRoughMeshLod({
          triangleCount: baseTriangles.length,
          maxEdge,
          featureSize: appearance?.featureSize,
          ...(zone.lodContext || lodContext),
        }),
        depth = lod.depth,
        triangles = subdivideTriangles(baseTriangles, depth),
        edges = polygonEdges(zone.polys);
      maxDepth = Math.max(maxDepth, depth);
      zoneResults.push({ ...zone, depth, lod, edges });

      for (const [a, b, c] of triangles) {
        pushRoughTriangle(
          roughPoint(a, z, profileNormal, appearance),
          roughPoint(b, z, profileNormal, appearance),
          roughPoint(c, z, profileNormal, appearance),
        );
      }
    }

    const edgeOwners = new Map();
    zoneResults.forEach((zone, zoneIndex) => {
      for (const edge of zone.edges) {
        if (!edgeOwners.has(edge.key)) edgeOwners.set(edge.key, []);
        edgeOwners.get(edge.key).push({ zoneIndex, edge });
      }
    });

    const internalEdges = new Set(
      [...edgeOwners]
        .filter(([, owners]) => new Set(owners.map((owner) => owner.zoneIndex)).size > 1)
        .map(([key]) => key),
    );

    // Close only true physical cap boundaries back to the ideal process plane.
    // Internal camera-LOD boundaries are stitched below and never become skirts.
    if (closeToIdeal) {
      zoneResults.forEach((zone) => {
        const edgeSegments = 2 ** zone.depth;
        for (const edge of zone.edges) {
          if (internalEdges.has(edge.key)) continue;
          for (let step = 0; step < edgeSegments; step++) {
            const t0 = step / edgeSegments,
              t1 = (step + 1) / edgeSegments,
              base0 = pointAlongEdge(edge.p, edge.q, t0),
              base1 = pointAlongEdge(edge.p, edge.q, t1),
              top0 = roughAlongEdge(edge.p, edge.q, t0),
              top1 = roughAlongEdge(edge.p, edge.q, t1);
            pushTriangle(base0, base1, top1);
            pushTriangle(base0, top1, top0);
            roughBorderPositions.push(...top0, ...top1);
          }
        }
      });
    }

    // Stitch mismatched LOD boundaries by connecting the fine sampled heightfield
    // to the piecewise-linear coarse edge. This removes T-junction cracks without
    // introducing an ideal-plane curtain at the camera-focus boundary.
    for (const [key, owners] of edgeOwners) {
      if (!internalEdges.has(key) || owners.length < 2) continue;
      const uniqueOwners = owners.filter(
        (owner, index) => owners.findIndex((entry) => entry.zoneIndex === owner.zoneIndex) === index,
      );
      if (uniqueOwners.length < 2) continue;

      const sorted = uniqueOwners.sort(
          (a, b) => zoneResults[b.zoneIndex].depth - zoneResults[a.zoneIndex].depth,
        ),
        fine = sorted[0],
        coarse = sorted.at(-1),
        fineDepth = zoneResults[fine.zoneIndex].depth,
        coarseDepth = zoneResults[coarse.zoneIndex].depth;
      if (fineDepth <= coarseDepth) continue;

      const p = fine.edge.p,
        q = fine.edge.q,
        fineSegments = 2 ** fineDepth;
      for (let step = 0; step < fineSegments; step++) {
        const t0 = step / fineSegments,
          t1 = (step + 1) / fineSegments,
          fine0 = roughAlongEdge(p, q, t0),
          fine1 = roughAlongEdge(p, q, t1),
          coarse0 = coarseApproxAlongEdge(p, q, t0, coarseDepth),
          coarse1 = coarseApproxAlongEdge(p, q, t1, coarseDepth);
        pushTriangle(coarse0, coarse1, fine1);
        pushTriangle(coarse0, fine1, fine0);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.userData.roughSubdivisionDepth = maxDepth;
    geometry.userData.roughLod = zoneResults.map((zone) => zone.lod);
    geometry.userData.roughBorderPositions = roughBorderPositions;
    geometry.userData.roughLodZoneCount = zoneResults.length;
    geometry.userData.roughLodStitchCount = internalEdges.size;
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
    const zScale = group.scale.z || 1;
    for (const entry of transparentMeshes) {
      const point = entry.center.clone();
      point.z *= zScale;
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
  ) {
    if (!geometry.getAttribute('position')?.count) {
      geometry.dispose();
      return null;
    }
    const mesh = new THREE.Mesh(geometry, material),
      center = geometryCenter(geometry);
    mesh.renderOrder = materialState.transparent ? 100 : 0;
    group.add(mesh);
    if (materialState.transparent) {
      transparentMeshes.push({
        mesh,
        center,
        depth: 0,
        sortBias,
        sequence: transparentMeshes.length,
      });
    }
    if (appearance) {
      mesh.userData.surfaceAppearance = { ...appearance };
      roughMeshes.push({
        mesh,
        material,
        appearance: { ...appearance },
        center,
      });
    }
    return mesh;
  }

  function init() {
    if (ready) return Promise.resolve(true);
    if (initPromise) return initPromise;

    host.classList.add('three-loading');
    stats.textContent = 'loading 3D…';

    initPromise = loadDependencies().then((available) => {
      host.classList.remove('three-loading');
      if (!available || !THREE || !OrbitControls) {
        console.warn('3D dependencies unavailable; continuing without the 3D view.', dependencyError);
        host.classList.add('three-unavailable');
        host.textContent = '3D unavailable';
        stats.textContent = 'dependency unavailable';
        return false;
      }

      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
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
        scheduleFrame();
      });
      controls.addEventListener('change', scheduleFrame);
      controls.addEventListener('end', () => {
        interacting = false;
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

      host.prepend(renderer.domElement);
      new ResizeObserver(resize).observe(host);
      ready = true;
      resize();
      fit();
      render();
      scheduleFrame();
      return true;
    });

    return initPromise;
  }

  function render() {
    if (!ready || rendering) return;
    const model = getModel();
    if (!model) return;

    rendering = true;
    try {
      disposeGroup();
      group.scale.z = zDisplayScale(model);

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
        },
        addBorderPositions = (positions, order = 100000) => {
          if (!positions?.length) return;
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
          });
          const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
          edges.renderOrder = order;
          group.add(edges);
        };

      for (const cap of plan.caps) {
        const state = stateFor(cap);
        if (!state) continue;
        const layer = layerById(model, cap.layerId);

        if (!cap.appearance) {
          pushBucket(smoothCaps, cap, state);
          continue;
        }

        const geometry = geometryFromRoughCap({
            z: cap.z,
            normal: cap.normal,
            polys: cap.polys,
            appearance: cap.appearance,
            closeToIdeal: !cap.buried,
            profileNormal: cap.profileNormal,
            lodContext: lodContextFor(model, clip, cap.polys, cap.z),
            lodZones: roughLodZones(model, clip, cap.polys, cap.z),
          }),
          material = createSurfaceMaterial(layer, state, cap.appearance);
        addSurfaceMesh(geometry, material, state, cap.appearance, cap.buried ? 12 : 0);

        if (borders && !cap.buried && geometry.userData.roughBorderPositions?.length) {
          addBorderPositions(geometry.userData.roughBorderPositions, 100010 + cap.solidIndex);
        }
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

      if (borders) addBorderPositions(plan.borderLines.flat(2), 100000);

      // Implant remains a non-material annotation. Opaque host material writes
      // depth and occludes buried Implant; translucent host surfaces intentionally
      // stop writing depth so the surviving volume can be inspected.
      for (const implant of implantSolids(model, clip)) {
        const implantState = {
            opacity: opacity * 0.18,
            transparent: true,
            depthTest: true,
            depthWrite: false,
          },
          bodyGeometry = shearImplantGeometry(geometryFromSolid(implant), implant),
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
        if (body) body.name = implant.name || implant.implantId || 'Implant';

        const outerNormal = implant.face === 'front' ? 1 : -1,
          appearance =
            implant.surfaceAppearance?.kind === 'rough' ? implant.surfaceAppearance : null,
          capGeometry = shearImplantGeometry(
            appearance
              ? geometryFromRoughCap({
                  z: implant.outerZ,
                  normal: outerNormal,
                  polys: implant.polys,
                  appearance,
                  closeToIdeal: false,
                  profileNormal: outerNormal,
                  lodContext: lodContextFor(model, clip, implant.polys, implant.outerZ),
                  lodZones: roughLodZones(model, clip, implant.polys, implant.outerZ),
                })
              : geometryFromSolid({
                  slabs: [],
                  caps: [{ z: implant.outerZ, normal: outerNormal, polys: implant.polys }],
                }),
            implant,
          ),
          capState = {
            opacity: opacity * 0.3,
            transparent: true,
            depthTest: true,
            depthWrite: false,
          },
          capMaterial = createSurfaceMaterial(
            { color: implant.color || '#D65A6F' },
            capState,
            appearance,
          );
        capMaterial.polygonOffset = true;
        capMaterial.polygonOffsetFactor = -1;
        capMaterial.polygonOffsetUnits = -1;
        const cap = addSurfaceMesh(capGeometry, capMaterial, capState, appearance, 40);
        if (cap) cap.name = `${implant.name || implant.implantId || 'Implant'} surface`;
      }

      updateRoughMaterialLod();
      updateTransparentOrder();
      updateRoughDiagnostics();
      lastLodSignature = roughMeshes.length ? adaptiveLodSignature() : null;
      stats.textContent = hasMaterial(model) ? (clip ? 'ROI' : 'full model') : 'no material';
    } finally {
      rendering = false;
    }
    scheduleFrame();
  }

  function fit() {
    if (!ready || !camera || !controls || !axesHelper) return;
    const model = getModel();
    if (!model) return;

    const [idealLo, idealHi] = modelBoundsZ(model),
      [lo, hi] = roughVisualBoundsZ(model, [idealLo, idealHi]),
      zScale = zDisplayScale(model),
      zSpan = (hi - lo) * zScale,
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
    controls.target.set(centerX, centerY, ((lo + hi) / 2) * zScale);
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
      multiplier = Math.max(1, Math.min(4, Number(scale) || 3));

    renderer.setPixelRatio(multiplier);
    renderer.setSize(Math.max(2, rect.width), Math.max(2, rect.height), false);
    renderer.render(scene, camera);
    try {
      const blob = await new Promise((resolve, reject) =>
        renderer.domElement.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('PNG capture failed.'))),
          'image/png',
        ),
      );
      return blob;
    } finally {
      renderer.setPixelRatio(oldPixelRatio);
      renderer.setSize(Math.max(2, rect.width), Math.max(2, rect.height), false);
      camera.aspect = Math.max(2, rect.width) / Math.max(2, rect.height);
      camera.updateProjectionMatrix();
      scheduleFrame();
    }
  }

  return {
    init,
    render,
    fit,
    exportGlb,
    capturePng,
    get ready() {
      return ready;
    },
  };
}
