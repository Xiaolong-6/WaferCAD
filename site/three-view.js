import { layerById, modelBoundsZ } from './model.js';
import { extrusionGroups } from './model-view-geometry.js';

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

  function zVisualScale(model) {
    return Math.max(model.width, model.height) / 100;
  }

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

  function shapeFromPolygon(poly) {
    if (!poly?.length) return null;
    const outer = poly[0].slice(0, -1);
    if (outer.length < 3) return null;

    const shape = new THREE.Shape();
    shape.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1]);
    shape.closePath();

    for (let r = 1; r < poly.length; r++) {
      const points = poly[r].slice(0, -1);
      if (points.length < 3) continue;
      const hole = new THREE.Path();
      hole.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) hole.lineTo(points[i][0], points[i][1]);
      hole.closePath();
      shape.holes.push(hole);
    }

    return shape;
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
    group.scale.z = zVisualScale(model);

    const clip = getClipGeometry(),
      inspection = getInspection() || {},
      opacity = Math.max(0.1, Math.min(1, Number(inspection.opacity) || 1)),
      borders = Boolean(inspection.borders);

    for (const item of extrusionGroups(model, clip)) {
      const shapes = item.polys.map(shapeFromPolygon).filter(Boolean);
      if (!shapes.length) continue;

      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: item.z1 - item.z0,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 2,
      });
      geometry.translate(0, 0, item.z0);

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
      group.add(new THREE.Mesh(geometry, material));

      if (borders) {
        const edgeGeometry = new THREE.EdgesGeometry(geometry, 20);
        const edgeMaterial = new THREE.LineBasicMaterial({
          color: 0x111820,
          transparent: true,
          opacity: 0.9,
        });
        group.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
      }
    }

    stats.textContent = clip ? 'ROI' : 'full model';
    scheduleFrame();
  }

  function fit() {
    if (!ready || !camera || !controls || !axesHelper) return;
    const model = getModel();
    if (!model) return;

    const [lo, hi] = modelBoundsZ(model),
      zScale = zVisualScale(model),
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

  return {
    init,
    render,
    fit,
    get ready() {
      return ready;
    },
  };
}
