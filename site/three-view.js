import { layerById, modelBoundsZ, zDisplayScale } from './model.js';
import { materialSolids, solidBorders } from './model-view-geometry.js';

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

  function scheduleFrame() {
    if (!renderer || frame != null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const changed = controls?.update?.() || false;
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
      object.material?.dispose();
    }
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

    renderer = new THREE.WebGLRenderer({ antialias: true });
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
      opacity = Math.max(0.1, Math.min(1, Number(inspection.opacity) || 1)),
      borders = Boolean(inspection.borders);

    for (const item of materialSolids(model, clip)) {
      const geometry = geometryFromSolid(item);

      const layer = layerById(model, item.layerId);
      const material = new THREE.MeshStandardMaterial({
        color: layer?.color || '#999',
        roughness: 0.78,
        metalness: 0.015,
        side: THREE.DoubleSide,
        transparent: opacity < 0.999,
        opacity,
        depthWrite: opacity >= 0.999,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = opacity < 0.999 ? 1 : 0;

      let edges = null;
      if (borders) {
        const edgeGeometry = new THREE.BufferGeometry();
        edgeGeometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(solidBorders(item).flat(2), 3),
        );
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: 0x111820,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        });
        edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        // With transparent solids, render borders first and let every material
        // layer alpha-blend over the border segments it covers. Hidden borders
        // therefore respond continuously to Opacity instead of staying equally
        // dark at every setting. Opaque solids keep the normal depth-tested
        // mesh-then-border order.
        edges.renderOrder = opacity < 0.999 ? 0 : 1;
      }

      if (edges && opacity < 0.999) group.add(edges);
      group.add(mesh);
      if (edges && opacity >= 0.999) group.add(edges);
    }

    stats.textContent = clip ? 'ROI' : 'full model';
    scheduleFrame();
  }

  function fit() {
    if (!ready || !camera || !controls || !axesHelper) return;
    const model = getModel();
    if (!model) return;

    const [lo, hi] = modelBoundsZ(model),
      zScale = zDisplayScale(model),
      zSpan = (hi - lo) * zScale,
      size = Math.max(model.width, model.height, zSpan);

    camera.near = Math.max(0.1, size / 10000);
    camera.far = Math.max(1e6, size * 50);
    camera.updateProjectionMatrix();
    const halfFov = (camera.fov * Math.PI) / 360;
    const limitingAngle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect));
    const radius = Math.hypot(model.width / 2, model.height / 2, zSpan / 2);
    const distance = (radius / Math.sin(limitingAngle)) * 1.1;
    controls.target.set(0, 0, ((lo + hi) / 2) * zScale);
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
