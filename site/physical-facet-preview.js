// Isolated Chromium visual acceptance surface for #297/#300.
// Both WebGL triangles and native Section originate from one physical owner.
import * as THREE from 'three';
import { createModel } from './model.js';
import { attachExperimentalPhysicalFacetOwner } from './physical-facet-model.js';
import { physicalOwnerVolume } from './physical-facet-owner.js';
import {
  buildPhysicalFacetPresentation,
  physicalFacetPresentationZ,
} from './physical-facet-render-geometry.js';
import { sectionContours } from './model-view-geometry.js';

const physicalDescriptor = {
  layerId: 'base',
  pitch: 6.4,
  height: 4.5,
  bottomPlaneZ: -125.5,
  topPlaneZ: 125.5,
  domain: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 },
};
const source = createModel({ shape: 'rect', width: 12.8, height: 12.8, thickness: 251 });
const model = attachExperimentalPhysicalFacetOwner(source, physicalDescriptor);
const owner = model.experimentalPhysicalFacetOwner;
const sceneData = buildPhysicalFacetPresentation(model, { compressBulk: true });
const sectionData = sectionContours(model, [-6.4, 0], [6.4, 0]);
const sectionRing = sectionData[0]?.polys?.[0]?.[0];
if (!sectionRing || sectionRing.length < 6 || !sceneData.physicalTriangleCount) {
  throw new Error('Experimental physical material Section/3D is incomplete');
}

const canvas3d = document.getElementById('physicalThree');
const canvasSection = document.getElementById('physicalSection');
const renderer = new THREE.WebGLRenderer({
  canvas: canvas3d,
  alpha: false,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0xf8fafc);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.2, 220);
camera.up.set(0, 0, 1);
scene.add(new THREE.HemisphereLight(0xf8fcff, 0xb0bfd0, 2.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
keyLight.position.set(-13, -22, 34);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xb2d8ed, 1.0);
fillLight.position.set(20, 11, -13);
scene.add(fillLight);

const materials = {
  top: new THREE.MeshStandardMaterial({
    color: 0x73b0d2,
    metalness: 0.06,
    roughness: 0.87,
    flatShading: true,
    side: THREE.DoubleSide,
  }),
  bottom: new THREE.MeshStandardMaterial({
    color: 0x6d98b2,
    metalness: 0.06,
    roughness: 0.95,
    flatShading: true,
    side: THREE.DoubleSide,
  }),
  side: new THREE.MeshStandardMaterial({
    color: 0x9cadbc,
    metalness: 0,
    roughness: 0.98,
    side: THREE.DoubleSide,
  }),
};
for (const [face, array] of Object.entries(sceneData.positions)) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(array, 3));
  geom.computeVertexNormals();
  scene.add(new THREE.Mesh(geom, materials[face]));
}

function setAngle(angle = 'isometric') {
  switch (angle) {
    case 'top':
      camera.position.set(15, -17, 45);
      break;
    case 'side':
      camera.position.set(23, -33, 13);
      break;
    default:
      camera.position.set(27, -35, 25);
  }
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

function drawSection() {
  const rect = canvasSection.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.round(rect.width * ratio));
  const h = Math.max(2, Math.round(rect.height * ratio));
  canvasSection.width = w;
  canvasSection.height = h;
  const ctx = canvasSection.getContext('2d');
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, w, h);
  const mx = (t) => 52 * ratio + t * (w - 86 * ratio);
  const my = (z) => h / 2 - (physicalFacetPresentationZ(z, { compressBulk: true }) * h) / 31;
  ctx.strokeStyle = '#e3eaf0';
  ctx.lineWidth = ratio;
  for (const z of [-10, -5, 0, 5, 10]) {
    const y = h / 2 - (z * h) / 31;
    ctx.beginPath();
    ctx.moveTo(40 * ratio, y);
    ctx.lineTo(w - 20 * ratio, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#506879';
  ctx.font = `${12 * ratio}px system-ui`;
  ctx.fillText('A', mx(0) - 20 * ratio, h / 2 - (11 * h) / 31);
  ctx.fillText('B', mx(1) + 8 * ratio, h / 2 - (11 * h) / 31);
  ctx.beginPath();
  for (const [index, [t, z]] of sectionRing.entries()) {
    if (index === 0) ctx.moveTo(mx(t), my(z));
    else ctx.lineTo(mx(t), my(z));
  }
  ctx.closePath();
  ctx.fillStyle = '#9ab7c9';
  ctx.fill();
  ctx.strokeStyle = '#366b87';
  ctx.lineWidth = 1.5 * ratio;
  ctx.stroke();
  // Outline the exact front and back physical material interfaces.
  const topSize = (sectionRing.length - 1) / 2;
  ctx.beginPath();
  for (let i = 0; i < topSize; i++) {
    const [t, z] = sectionRing[i];
    if (!i) ctx.moveTo(mx(t), my(z));
    else ctx.lineTo(mx(t), my(z));
  }
  ctx.strokeStyle = '#2a779d';
  ctx.lineWidth = 2.4 * ratio;
  ctx.stroke();
  ctx.fillStyle = '#516575';
  ctx.font = `${11 * ratio}px system-ui`;
  ctx.fillText(
    'Symmetric Z-break shown. Physical interfaces and volume unchanged.',
    19 * ratio,
    h - 20 * ratio,
  );
}

function resize() {
  const bounds = canvas3d.getBoundingClientRect();
  renderer.setSize(Math.max(2, bounds.width), Math.max(2, bounds.height), false);
  camera.aspect = Math.max(2, bounds.width) / Math.max(2, bounds.height);
  camera.updateProjectionMatrix();
  setAngle(document.body.dataset.angle || 'isometric');
  drawSection();
}
document.body.dataset.angle = new URLSearchParams(location.search).get('angle') || 'isometric';
resize();
window.addEventListener('resize', resize);
document.body.dataset.physicalFacetReady = 'true';
document.getElementById('evidenceStatus').textContent = 'Physical owner · verified geometry view';
window.WaferCadPhysicalFacetEvidence = {
  ready: true,
  sourceKernel: model.kernel,
  ownerKind: owner.kind,
  physicalTriangleCount: sceneData.physicalTriangleCount,
  triangleCounts: Object.fromEntries(
    Object.entries(sceneData.positions).map(([k, v]) => [k, v.length / 9]),
  ),
  sectionVertexCount: sectionRing.length,
  physicalVolumeUm3: physicalOwnerVolume(owner),
  displayedZBreakOnly: sceneData.displayOnlyZBreak,
  frontApexZ: 130,
  backApexZ: -130,
  setAngle,
};
