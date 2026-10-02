import { hasMaterial, layerById, modelBoundsZ, zDisplayScale } from './model.js';
import { appearanceSurfaceGroups, materialSolids, solidBorders } from './model-view-geometry.js';
import { roughLod, roughTextureValue } from './surface-rendering.js';

let THREE = null;
let OrbitControls = null;
let dependencyError = null;

try {
  THREE = await import('three');
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
} catch (error) {
  dependencyError = error;
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
  let frame = null;
  let interacting = false;
  let roughMeshes = [];

  function updateRoughLod() {
    if (!camera || !renderer || !controls || !roughMeshes.length) return;
    const distance = Math.max(1e-9, camera.position.distanceTo(controls.target)),
      height = Math.max(2, renderer.domElement.clientHeight || host.clientHeight || 2),
      pxPerUm = height / (2 * distance * Math.tan((camera.fov * Math.PI) / 360));
    for (const entry of roughMeshes) {
      const featurePixels = entry.appearance.featureSize * pxPerUm,
        lod = roughLod(featurePixels),
        ratio = entry.appearance.amplitude / Math.max(entry.appearance.featureSize, 1e-9);
      // Match Section semantics: roughness changes the surface response, never
      // the material identity or layer color.
      entry.material.roughness = 0.78 + 0.18 * lod.detail;
      entry.material.bumpScale =
        Math.min(2.4, ratio * 0.55) * (0.18 * lod.detail + 0.82 * lod.micro);
    }
  }

  function scheduleFrame() {
    if (!renderer || frame != null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const changed = controls?.update?.() || false;
      updateRoughLod();
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
    while (group?.children.length) {
      const object = group.children.pop();
      object.geometry?.dispose();
      object.material?.bumpMap?.dispose();
      object.material?.dispose();
    }
    roughMeshes = [];
  }

  function roughTexture(seed, size = 64) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const value = Math.round(255 * roughTextureValue(seed, x, y)),
          offset = (y * size + x) * 4;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 255;
      }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
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
    // Screen-door transparency avoids whole-mesh alpha sorting failures on
    // stacked/overlapping CAD solids while keeping each surviving sample at
    // the layer's true color.
    return {
      opacity,
      transparent: false,
      alphaHash: translucent,
      depthWrite: true,
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

  function init() {
    if (!THREE || !OrbitControls) {
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
    scheduleFrame();
    return true;
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
      borders = Boolean(inspection.borders);

    const solids = materialSolids(model, clip);
    for (let index = 0; index < solids.length; index++) {
      const item = solids[index];
      const geometry = geometryFromSolid(item);

      const layer = layerById(model, item.layerId);
      const material = new THREE.MeshStandardMaterial({
        color: layer?.color || '#999',
        roughness: 0.78,
        metalness: 0.015,
        side: THREE.DoubleSide,
        ...materialState,
        polygonOffset: true,
        // Push filled surfaces slightly behind their true geometry. This keeps
        // the wire overlay visible even at 100% opacity while retaining a
        // stable bias between coplanar material surfaces.
        polygonOffsetFactor: Math.min(8, (index + 1) * 0.35),
        polygonOffsetUnits: Math.min(12, index + 1),
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 0;
      group.add(mesh);

      if (borders) {
        const edgeGeometry = new THREE.BufferGeometry();
        edgeGeometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(solidBorders(item).flat(2), 3),
        );
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: 0x111820,
          transparent: opacity < 0.999,
          opacity: opacity < 0.999 ? 0.72 : 1,
          depthTest: true,
          depthFunc: THREE.LessEqualDepth,
          depthWrite: false,
        });
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        // Filled opaque surfaces are depth-biased slightly backwards, so these
        // true-geometry borders remain crisp at 100% opacity. Transparent
        // surfaces still draw borders last because they do not write depth.
        edges.renderOrder = 1000 + index;
        group.add(edges);
      }
    }

    for (const patch of appearanceSurfaceGroups(model, clip)) {
      const normal = patch.face === 'front' ? 1 : -1,
        geometry = geometryFromSolid({
          slabs: [],
          caps: [{ z: patch.z, normal, polys: patch.polys }],
        });
      addPlanarUv(geometry, patch.appearance.featureSize);
      const layer = layerById(model, patch.layerId),
        material = new THREE.MeshStandardMaterial({
          color: layer?.color || '#666',
          roughness: 0.78,
          metalness: 0.015,
          bumpMap: roughTexture(patch.appearance.seed),
          bumpScale: 0,
          side: THREE.DoubleSide,
          ...materialState,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.surfaceAppearance = { ...patch.appearance };
      mesh.renderOrder = 10;
      group.add(mesh);
      roughMeshes.push({
        mesh,
        material,
        appearance: { ...patch.appearance },
      });
    }
    updateRoughLod();

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
