// Isolated Chromium visual acceptance surface for #297/#300.
// Both WebGL triangles and native Section originate from one physical owner.
import { createThreeView } from './three-view.js';
import { createModel } from './model.js';
import {
  attachExperimentalPhysicalFacetOwner,
  attachExperimentalPhysicalFacetShell,
} from './physical-facet-model.js';
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
const siliconModel = attachExperimentalPhysicalFacetOwner(source, physicalDescriptor);
const oxideEnabled = new URLSearchParams(location.search).get('oxide') === '1';
const model = oxideEnabled
  ? attachExperimentalPhysicalFacetShell(siliconModel, {
      layerId: 'oxide',
      thicknessUm: 0.05,
    })
  : siliconModel;
const owner = model.experimentalPhysicalFacetOwner;
const sceneData = buildPhysicalFacetPresentation(model, { compressBulk: true });
const sectionData = sectionContours(model, [-6.4, 0], [6.4, 0]);
const sectionRing = sectionData[0]?.polys?.[0]?.[0];
if (!sectionRing || sectionRing.length < 6 || !sceneData.physicalTriangleCount) {
  throw new Error('Experimental physical material Section/3D is incomplete');
}

const canvas3d = document.getElementById('physicalThree');
const canvasSection = document.getElementById('physicalSection');
// This acceptance page exercises the actual production createThreeView path.
// Do not instantiate a separate Three.js mesh/renderer here.
const threeView = createThreeView({
  host: canvas3d,
  stats: document.getElementById('physicalThreeStats'),
  getModel: () => model,
  getClipGeometry: () => null,
  getInspection: () => ({ opacity: 1, borders: false, fast: false }),
  getZCollapse: () => ({ top: 118, bottom: -118, enabled: true }),
});
const initialized = await threeView.init();
if (!initialized) throw new Error('Production ThreeView failed to initialize for physical owner');
await threeView.render();
if (canvas3d.dataset.renderState !== 'ready' || !canvas3d.dataset.physicalFacetOwner) {
  throw new Error('Production ThreeView did not commit physical owner geometry');
}
const originalView = threeView.getViewState();
if (!originalView) throw new Error('Production ThreeView did not initialize camera controls');

function setAngle(angle = 'isometric') {
  const target = originalView.target;
  const span = Math.hypot(
    originalView.position[0] - target[0],
    originalView.position[1] - target[1],
    originalView.position[2] - target[2],
  );
  const directions = {
    isometric: [0.65, -0.75, 0.72],
    top: [0.08, -0.16, 1],
    side: [0.6, -1, 0.2],
  };
  const direction = directions[angle] || directions.isometric;
  const n = Math.hypot(...direction);
  const position = target.map((component, index) => component + (direction[index] * span) / n);
  threeView.setViewState({ ...originalView, position, target });
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
  if (oxideEnabled) {
    const oxide = sectionData.find((part) => part.layerId === 'oxide');
    if (!oxide || oxide.polys.length !== 2) {
      throw new Error('Physical oxide has no native front/back Section evidence');
    }
    for (const polygon of oxide.polys) {
      const ring = polygon[0];
      ctx.beginPath();
      for (const [index, [t, z]] of ring.entries()) {
        if (!index) ctx.moveTo(mx(t), my(z));
        else ctx.lineTo(mx(t), my(z));
      }
      ctx.closePath();
      ctx.strokeStyle = '#d88b37';
      ctx.lineWidth = 2.4 * ratio;
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#516575';
  ctx.font = `${11 * ratio}px system-ui`;
  ctx.fillText(
    'Symmetric Z-break shown. Physical interfaces and volume unchanged.',
    19 * ratio,
    h - 20 * ratio,
  );
}

document.body.dataset.angle = new URLSearchParams(location.search).get('angle') || 'isometric';
setAngle(document.body.dataset.angle);
drawSection();
window.addEventListener('resize', drawSection);
document.body.dataset.physicalFacetReady = 'true';
document.getElementById('evidenceStatus').textContent = oxideEnabled
  ? 'Physical Si + oxide · experimental mesh evidence'
  : 'Physical owner · verified geometry view';
window.WaferCadPhysicalFacetEvidence = {
  ready: true,
  sourceKernel: model.kernel,
  ownerKind: owner.kind,
  physicalTriangleCount: sceneData.physicalTriangleCount,
  physicalOxideTriangles: sceneData.oxideTriangleCount,
  oxideSectionRegions: sectionData.find((part) => part.layerId === 'oxide')?.polys.length || 0,
  triangleCounts: Object.fromEntries(
    Object.entries(sceneData.positions).map(([k, v]) => [k, v.length / 9]),
  ),
  sectionVertexCount: sectionRing.length,
  physicalVolumeUm3: physicalOwnerVolume(owner),
  displayedZBreakOnly: sceneData.displayOnlyZBreak,
  frontApexZ: 130,
  backApexZ: -130,
  rendererKind: 'production-createThreeView',
  productionHost: {
    rendererPhase: canvas3d.dataset.renderPhase,
    rendererState: canvas3d.dataset.renderState,
    owner: canvas3d.dataset.physicalFacetOwner,
    triangleCount: Number(canvas3d.dataset.physicalFacetTriangles),
    oxideTriangleCount: Number(canvas3d.dataset.physicalFacetOxideTriangles || 0),
    axesHelperHidden: canvas3d.dataset.physicalFacetAxesHidden === 'true',
  },
  setAngle,
};
