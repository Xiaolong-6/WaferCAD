// Vector projection of the canonical 3D export meshes. This module never changes
// Process geometry, the interactive renderer, or the saved project.
export const SVG_TRIANGLE_BUDGETS = Object.freeze({
  standard: 60000,
  high: 140000,
  ultra: 350000,
});

export function normalizeSvgExportOptions({ mode = 'view', detail = 'high' } = {}) {
  return {
    mode: mode === 'physical' ? 'physical' : 'view',
    detail: Object.hasOwn(SVG_TRIANGLE_BUDGETS, detail) ? detail : 'high',
  };
}

function svgNumber(value) {
  return String(Math.round(value * 1000) / 1000);
}

function escapedAttribute(value) {
  return String(value ?? '').replace(/[&"<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]);
}

function svgVertex(THREE, vector, camera, width, height) {
  const projected = vector.clone().project(camera);
  if (![projected.x, projected.y, projected.z].every(Number.isFinite)) return null;
  return [(projected.x * 0.5 + 0.5) * width, (-projected.y * 0.5 + 0.5) * height];
}

function clipNear(vertices, near) {
  // In view space the camera looks towards negative Z. Clip before perspective
  // division, rather than producing invalid or inverted paths at the near plane.
  const result = [];
  for (let index = 0; index < vertices.length; index++) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const currentInside = current.z <= -near;
    const nextInside = next.z <= -near;
    if (currentInside) result.push(current);
    if (currentInside !== nextInside) {
      const mix = (-near - current.z) / (next.z - current.z);
      result.push(current.clone().lerp(next, mix));
    }
  }
  return result;
}

export function projectThreeMeshesToSvg(THREE, root, camera, {
  width,
  height,
  mode = 'view',
  detail = 'high',
  mapZ = (z) => z,
  zScale = 1,
  opacity = 1,
  signal = null,
  onProgress = null,
} = {}) {
  if (!THREE || !root || !camera) throw new Error('3D geometry and camera are required.');
  const options = normalizeSvgExportOptions({ mode, detail });
  const maximum = SVG_TRIANGLE_BUDGETS[options.detail];
  const w = Math.round(Number(width));
  const h = Math.round(Number(height));
  if (!(w >= 2 && h >= 2 && w <= 16384 && h <= 16384))
    throw new RangeError('Invalid SVG export dimensions.');
  if (typeof mapZ !== 'function') throw new TypeError('SVG Z mapping must be a function.');
  if (!(Number(zScale) > 0)) throw new RangeError('Invalid 3D display scale.');
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException('3D SVG export cancelled.', 'AbortError');
  };
  checkAbort();
  root.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const meshes = [];
  let estimatedTriangles = 0;
  root.traverse((mesh) => {
    if (!mesh.visible || !mesh.isMesh || !mesh.geometry) return;
    const position = mesh.geometry.getAttribute('position');
    if (!position?.count) return;
    const geometryTriangleCount = mesh.geometry.index
      ? Math.floor(mesh.geometry.index.count / 3)
      : Math.floor(position.count / 3);
    const instances = mesh.isInstancedMesh ? mesh.count : 1;
    estimatedTriangles += geometryTriangleCount * instances;
    meshes.push({ mesh, position, geometryTriangleCount, instances });
  });
  if (estimatedTriangles > maximum) {
    throw new RangeError(
      `SVG would require ${estimatedTriangles.toLocaleString()} triangles (limit ${maximum.toLocaleString()} for ${options.detail}). Choose a smaller 3D ROI or a lower detail level.`,
    );
  }

  const faces = [];
  const instanceMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  const viewVector = new THREE.Vector3();
  const light = new THREE.Vector3(-0.38, 0.62, 1).normalize();
  const normal = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const baseColor = new THREE.Color();
  const workColor = new THREE.Color();
  const colorCache = new Map();
  const alpha = Math.max(0.01, Math.min(1, Number(opacity) || 1));
  const near = Math.max(1e-8, Number(camera.near) || 1e-6);

  for (let meshIndex = 0; meshIndex < meshes.length; meshIndex++) {
    checkAbort();
    const { mesh, position, geometryTriangleCount, instances } = meshes[meshIndex];
    const indexAttribute = mesh.geometry.index;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    baseColor.copy(material?.color || new THREE.Color('#999999'));
    const layer = escapedAttribute(mesh.userData?.wafercadLayerId || mesh.name || 'material');
    for (let instance = 0; instance < instances; instance++) {
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(instance, instanceMatrix);
        worldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
      } else {
        worldMatrix.copy(mesh.matrixWorld);
      }
      for (let triangleIndex = 0; triangleIndex < geometryTriangleCount; triangleIndex++) {
        if (triangleIndex % 2048 === 0) checkAbort();
        const world = [];
        const view = [];
        for (let corner = 0; corner < 3; corner++) {
          const at = triangleIndex * 3 + corner;
          const index = indexAttribute ? indexAttribute.getX(at) : at;
          const vertex = new THREE.Vector3(
            position.getX(index),
            position.getY(index),
            position.getZ(index),
          ).applyMatrix4(worldMatrix);
          if (options.mode === 'view') vertex.z = mapZ(vertex.z) * zScale;
          world.push(vertex);
          view.push(vertex.clone().applyMatrix4(camera.matrixWorldInverse));
        }
        const clipped = clipNear(view, near);
        if (clipped.length < 3) continue;
        const projected = [];
        for (const vertex of clipped) {
          // A clipped vertex is already in camera/view coordinates. Convert
          // back to world space because Three.Vector3.project expects world.
          const point = svgVertex(
            THREE,
            vertex.clone().applyMatrix4(camera.matrixWorld),
            camera,
            w,
            h,
          );
          if (!point) break;
          projected.push(point);
        }
        if (projected.length !== clipped.length) continue;
        const left = Math.min(...projected.map((point) => point[0]));
        const right = Math.max(...projected.map((point) => point[0]));
        const top = Math.min(...projected.map((point) => point[1]));
        const bottom = Math.max(...projected.map((point) => point[1]));
        if (right < 0 || bottom < 0 || left > w || top > h) continue;
        const signedArea = projected.reduce((area, point, i) => {
          const next = projected[(i + 1) % projected.length];
          return area + point[0] * next[1] - next[0] * point[1];
        }, 0);
        if (Math.abs(signedArea) < 0.0001) continue;
        edgeA.subVectors(view[1], view[0]);
        edgeB.subVectors(view[2], view[0]);
        normal.crossVectors(edgeA, edgeB).normalize();
        // Camera-relative diffuse lighting makes real rough facets readable,
        // without any raster textures, noise overlays, or triangular strokes.
        const illumination = Math.round(
          (0.50 + 0.42 * Math.abs(normal.dot(light))) * 24,
        ) / 24;
        const cacheKey = `${baseColor.getHexString()}:${illumination}`;
        if (!colorCache.has(cacheKey))
          colorCache.set(
            cacheKey,
            `#${workColor.copy(baseColor).multiplyScalar(illumination).getHexString()}`,
          );
        const points = projected.map((point) =>
          `${svgNumber(point[0])} ${svgNumber(point[1])}`,
        );
        const path = `M${points.join('L')}Z`;
        const depth = clipped.reduce((sum, vertex) => sum - vertex.z, 0) / clipped.length;
        faces.push({ path, depth, fill: colorCache.get(cacheKey), layer });
      }
    }
    onProgress?.(0.92 + 0.07 * ((meshIndex + 1) / Math.max(1, meshes.length)), 'Projecting vector facets');
  }
  checkAbort();
  // Back-to-front compositing respects normal wafer stack occlusion. This is a
  // static vector projection, not a GLB/3D interchange format or a depth buffer.
  faces.sort((a, b) => b.depth - a.depth);
  const paths = faces.map(({ path, fill, layer }) =>
    `<path d="${path}" fill="${fill}" data-wafercad-layer="${layer}"/>`,
  );
  const transparency = alpha < 1 ? ` opacity="${svgNumber(alpha)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>WaferCAD 3D vector view</title><desc>Projected material geometry; rough and pyramid surfaces are CPU-tessellated vector facets. Near-plane clipped and camera-sorted. No embedded bitmap.</desc><rect width="${w}" height="${h}" fill="#f5f7f9"/><g shape-rendering="geometricPrecision"${transparency}>${paths.join('')}</g></svg>`;
}
