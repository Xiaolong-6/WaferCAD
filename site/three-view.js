import { hasMaterial, layerById, modelBoundsZ, zDisplayScale } from './model.js';
import {
  appearanceSurfaceGroups,
  implantSolids,
  materialSolids,
  solidBorders,
} from './model-view-geometry.js';
import { difference, intersection, isEmpty } from './vector-geometry.js';
import { roughLod, roughTextureValue } from './surface-rendering.js';

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
  let roughMeshes = [];
  let transparentMeshes = [];

  function updateRoughLod() {
    if (!camera || !renderer || !controls || !roughMeshes.length) return;
    const distance = Math.max(1e-9, camera.position.distanceTo(controls.target)),
      height = Math.max(2, renderer.domElement.clientHeight || host.clientHeight || 2),
      pxPerUm = height / (2 * distance * Math.tan((camera.fov * Math.PI) / 360));
    for (const entry of roughMeshes) {
      const featurePixels = entry.appearance.featureSize * pxPerUm,
        lod = roughLod(featurePixels),
        relief = Math.max(
          0,
          Number(
            entry.appearance.etchDepth ??
              entry.appearance.meanHeight ??
              entry.appearance.amplitude ??
              0,
          ) || 0,
        ),
        ratio = relief / Math.max(entry.appearance.featureSize, 1e-9);
      // Far views converge to the clean layer surface. Feature-scale relief
      // appears progressively as it becomes resolvable, without changing color.
      entry.material.roughness = 0.78 + 0.16 * lod.detail;
      entry.material.bumpScale =
        Math.min(2.2, ratio * 0.5) * (0.3 * lod.detail + 0.7 * lod.micro);
    }
  }

  function scheduleFrame() {
    if (!renderer || frame != null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const changed = controls?.update?.() || false;
      updateRoughLod();
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

  function roughTexture(appearance, size = 128) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const value = Math.round(255 * roughTextureValue(appearance, x, y, size)),
          offset = (y * size + x) * 4;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 255;
      }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    // Mirroring removes hard tile seams while preserving feature-scale detail
    // when the user zooms into a large rough surface.
    texture.wrapS = THREE.MirroredRepeatWrapping;
    texture.wrapT = THREE.MirroredRepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    if (renderer?.capabilities) {
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    texture.needsUpdate = true;
    return texture;
  }

  function addPlanarUv(geometry, featureSize) {
    const positions = geometry.getAttribute('position'),
      period = Math.max(1e-9, featureSize * 8),
      uv = new Float32Array(positions.count * 2);
    for (let index = 0; index < positions.count; index++) {
      uv[index * 2] = positions.getX(index) / period;
      uv[index * 2 + 1] = positions.getY(index) / period;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
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

  function geometryCenter(geometry) {
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox?.getCenter(center);
    return center;
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

  function geometryFromSidewallRing(closed, z0, z1, isHole = false) {
    const points = Array.isArray(closed) ? closed : [],
      isClosed =
        points.length > 1 &&
        points[0][0] === points.at(-1)[0] &&
        points[0][1] === points.at(-1)[1],
      ring = (isClosed ? points.slice(0, -1) : points.slice()).map(([x, y]) => [x, y]),
      positions = [],
      normals = [];
    if (ring.length < 2) return new THREE.BufferGeometry();

    const signedArea = ring.reduce((sum, point, index) => {
      const next = ring[(index + 1) % ring.length];
      return sum + point[0] * next[1] - point[1] * next[0];
    }, 0);
    if ((signedArea > 0) !== !isHole) ring.reverse();

    const triangle = (a, b, c, normal) => {
      positions.push(...a, ...b, ...c);
      normals.push(...normal, ...normal, ...normal);
    };
    for (let index = 0; index < ring.length; index++) {
      const p = ring[index],
        q = ring[(index + 1) % ring.length],
        dx = q[0] - p[0],
        dy = q[1] - p[1],
        length = Math.hypot(dx, dy);
      if (!length) continue;
      const normal = [dy / length, -dx / length, 0],
        a = [...p, z0],
        b = [...q, z0],
        c = [...q, z1],
        d = [...p, z1];
      triangle(a, b, c, normal);
      triangle(a, c, d, normal);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geometry;
  }

  function roughSurfaceKey(layerId, z, face) {
    return `${layerId}\u0000${Number(z).toPrecision(15)}\u0000${face}`;
  }

  function roughSurfaceMap(model, clip) {
    const map = new Map();
    for (const patch of appearanceSurfaceGroups(model, clip)) {
      const key = roughSurfaceKey(patch.layerId, patch.z, patch.face);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(patch);
    }
    return map;
  }

  function capRenderParts(item, cap, roughMap) {
    const face = cap.normal > 0 ? 'front' : 'back',
      patches = roughMap.get(roughSurfaceKey(item.layerId, cap.z, face)) || [],
      parts = [];
    let remaining = cap.polys;

    for (const patch of patches) {
      const roughPolys = intersection(remaining, patch.polys);
      if (!isEmpty(roughPolys)) {
        parts.push({
          z: cap.z,
          normal: cap.normal,
          polys: roughPolys,
          appearance: patch.appearance,
        });
      }
      remaining = difference(remaining, patch.polys);
      if (isEmpty(remaining)) break;
    }

    if (!isEmpty(remaining)) {
      parts.push({ z: cap.z, normal: cap.normal, polys: remaining, appearance: null });
    }
    return parts;
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
    transparentMeshes.sort((a, b) => a.depth - b.depth);
    transparentMeshes.forEach((entry, index) => {
      entry.mesh.renderOrder = 100 + index;
    });
  }

  function createSurfaceMaterial(layer, materialState, appearance = null, bias = 1) {
    const material = new THREE.MeshStandardMaterial({
      color: layer?.color || '#999',
      roughness: appearance ? 0.82 : 0.78,
      metalness: 0.015,
      side: THREE.DoubleSide,
      ...materialState,
      polygonOffset: true,
      polygonOffsetFactor: Math.min(8, Math.max(1, bias) * 0.35),
      polygonOffsetUnits: Math.min(12, Math.max(1, bias)),
    });
    if (appearance) {
      material.bumpMap = roughTexture(appearance);
      material.bumpScale = 0;
    }
    return material;
  }

  function addSurfaceMesh(geometry, material, materialState, appearance = null) {
    if (!geometry.getAttribute('position')?.count) {
      geometry.dispose();
      return null;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = materialState.transparent ? 100 : 0;
    group.add(mesh);
    if (materialState.transparent) {
      transparentMeshes.push({ mesh, center: geometryCenter(geometry), depth: 0 });
    }
    if (appearance) {
      mesh.userData.surfaceAppearance = { ...appearance };
      roughMeshes.push({ mesh, material, appearance: { ...appearance } });
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
      render();
      fit();
      scheduleFrame();
      return true;
    });

    return initPromise;
  }

  function render() {
    if (!ready) return;
    const model = getModel();
    if (!model) return;

    disposeGroup();
    group.scale.z = zDisplayScale(model);

    const clip = getClipGeometry(),
      inspection = getInspection() || {},
      materialState = inspectionMaterialState(inspection.opacity),
      opacity = materialState.opacity,
      borders = Boolean(inspection.borders),
      roughMap = roughSurfaceMap(model, clip),
      solids = materialSolids(model, clip),
      smoothMaterials = new Map();

    const smoothMaterial = (layer, bias) => {
      const key = layer?.id || '__fallback__';
      if (!smoothMaterials.has(key)) {
        smoothMaterials.set(key, createSurfaceMaterial(layer, materialState, null, bias));
      }
      return smoothMaterials.get(key);
    };

    for (let solidIndex = 0; solidIndex < solids.length; solidIndex++) {
      const item = solids[solidIndex],
        layer = layerById(model, item.layerId),
        layerHasRoughSurface = [...roughMap.keys()].some((key) =>
          key.startsWith(`${item.layerId}\u0000`),
        );

      // Keep the fast single-mesh path for ordinary opaque layers. Rough layers
      // and all translucent layers use face/ring chunks so surface appearance
      // and alpha ordering are explicit instead of relying on one giant mesh.
      if (!materialState.transparent && !layerHasRoughSurface) {
        const geometry = geometryFromSolid(item),
          material = smoothMaterial(layer, solidIndex + 1);
        addSurfaceMesh(geometry, material, materialState);
      } else {
        for (const cap of item.caps) {
          for (const part of capRenderParts(item, cap, roughMap)) {
            for (const poly of part.polys) {
              const geometry = geometryFromSolid({
                  slabs: [],
                  caps: [{ z: part.z, normal: part.normal, polys: [poly] }],
                }),
                material = part.appearance
                  ? createSurfaceMaterial(
                      layer,
                      materialState,
                      part.appearance,
                      solidIndex + 1,
                    )
                  : smoothMaterial(layer, solidIndex + 1);
              addPlanarUv(geometry, part.appearance?.featureSize || 1);
              addSurfaceMesh(geometry, material, materialState, part.appearance);
            }
          }
        }

        for (const slab of item.slabs) {
          for (const poly of slab.polys) {
            for (let ringIndex = 0; ringIndex < poly.length; ringIndex++) {
              const geometry = geometryFromSidewallRing(
                poly[ringIndex],
                slab.z0,
                slab.z1,
                ringIndex > 0,
              );
              addSurfaceMesh(
                geometry,
                smoothMaterial(layer, solidIndex + 1),
                materialState,
              );
            }
          }
        }
      }

      if (borders) {
        const edgeGeometry = new THREE.BufferGeometry();
        edgeGeometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(solidBorders(item).flat(2), 3),
        );
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: 0x111820,
          transparent: opacity < 0.999,
          opacity: opacity < 0.999 ? 0.66 : 1,
          depthTest: true,
          depthFunc: THREE.LessEqualDepth,
          depthWrite: false,
        });
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        edges.renderOrder = 100000 + solidIndex;
        group.add(edges);
      }
    }

    updateRoughLod();
    updateTransparentOrder();

    // Implant remains a non-material annotation, but it is rendered as the
    // surviving volume inside the current material geometry. Subsequent etches
    // therefore remove the overlay instead of leaving a historical surface cap.
    for (const implant of implantSolids(model, clip)) {
      const implantState = {
          opacity: 0.18,
          transparent: true,
          depthTest: false,
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
          depthTest: false,
          depthWrite: false,
        }),
        body = addSurfaceMesh(bodyGeometry, bodyMaterial, implantState);
      if (body) body.name = implant.name || implant.implantId || 'Implant';

      const outerNormal = implant.face === 'front' ? 1 : -1,
        capGeometry = shearImplantGeometry(
          geometryFromSolid({
            slabs: [],
            caps: [{ z: implant.outerZ, normal: outerNormal, polys: implant.polys }],
          }),
          implant,
        ),
        capState = {
          opacity: 0.3,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        },
        capMaterial = createSurfaceMaterial(
          { color: implant.color || '#D65A6F' },
          capState,
          implant.surfaceAppearance,
          1,
        );
      addPlanarUv(capGeometry, implant.surfaceAppearance?.featureSize || 1);
      const cap = addSurfaceMesh(
        capGeometry,
        capMaterial,
        capState,
        implant.surfaceAppearance,
      );
      if (cap) cap.name = `${implant.name || implant.implantId || 'Implant'} surface`;
    }

    stats.textContent = hasMaterial(model) ? (clip ? 'ROI' : 'full model') : 'no material';
    scheduleFrame();
  }

  function fit() {
    if (!ready || !camera || !controls || !axesHelper) return;
    const model = getModel();
    if (!model) return;

    const [lo, hi] = modelBoundsZ(model),
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
