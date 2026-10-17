// Physical shell material evidence: no appearance offset and no 2D-only oracle.
import { makePhysicalPyramidOwner } from './physical-facet-owner.js';
import { createPhysicalFacetShellQuery, makePhysicalFacetShell } from './physical-facet-shell-owner.js';

const silicon = makePhysicalPyramidOwner({
  layerId: 'base',
  pitch: 6.4,
  height: 4.5,
  bottomPlaneZ: -125.5,
  topPlaneZ: 125.5,
  domain: { minX: -6.4, maxX: 6.4, minY: -6.4, maxY: 6.4 },
});
const shell = createPhysicalFacetShellQuery(
  makePhysicalFacetShell({ silicon, layerId: 'oxide', thicknessUm: 0.05 }),
);
const views = [
  { id: 'shellFront', face: 'front', minX: -6.2, maxX: 6.2, minZ: 125, maxZ: 130.6, steps: 54 },
  { id: 'shellRoi', face: 'front', minX: -0.55, maxX: 0.55, minZ: 129, maxZ: 130.18, steps: 30 },
  { id: 'shellBack', face: 'back', minX: -6.2, maxX: 6.2, minZ: -130.6, maxZ: -125, steps: 54 },
];
const evidence = { kind: shell.descriptor.kind, sourceTriangleCount: shell.sourceTriangleCount, views: [] };

function render(view) {
  const canvas = document.getElementById(view.id);
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(10, Math.round(canvas.getBoundingClientRect().width * scale));
  const height = Math.round(290 * scale);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const m = { left: 54 * scale, right: 17 * scale, top: 20 * scale, bottom: 36 * scale };
  const sx = (x) => m.left + ((x - view.minX) / (view.maxX - view.minX)) * (width - m.left - m.right);
  const sy = (z) => height - m.bottom - ((z - view.minZ) / (view.maxZ - view.minZ)) * (height - m.top - m.bottom);
  const columns = Array.from({ length: view.steps + 1 }, (_, index) =>
    shell.column(view.minX + (index * (view.maxX - view.minX)) / view.steps, 0),
  );
  const inner = columns.map((c) => [c.x, view.face === 'front' ? c.siliconZ1 : c.siliconZ0]);
  const outer = columns.map((c) => [c.x, view.face === 'front' ? c.frontOuterZ : c.backOuterZ]);
  const base = view.face === 'front' ? view.minZ : view.maxZ;
  const drawPath = (points, append = false) => {
    points.forEach(([x, z], index) => {
      if (!index && !append) ctx.moveTo(sx(x), sy(z));
      else ctx.lineTo(sx(x), sy(z));
    });
  };
  ctx.fillStyle = '#f9fbfe';
  ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = scale;
  ctx.strokeStyle = '#e2eaf2';
  for (let i = 0; i < 5; i++) {
    const z = view.minZ + ((view.maxZ - view.minZ) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(m.left, sy(z));
    ctx.lineTo(width - m.right, sy(z));
    ctx.stroke();
    ctx.fillStyle = '#64778a';
    ctx.font = `${10 * scale}px system-ui`;
    ctx.fillText(z.toFixed(2), 5 * scale, sy(z) + 3 * scale);
  }
  ctx.beginPath();
  drawPath(inner);
  ctx.lineTo(sx(view.maxX), sy(base));
  ctx.lineTo(sx(view.minX), sy(base));
  ctx.closePath();
  ctx.fillStyle = '#8eaec3';
  ctx.fill();
  ctx.beginPath();
  drawPath(inner);
  drawPath(outer.toReversed(), true);
  ctx.closePath();
  ctx.fillStyle = '#e9a85c';
  ctx.fill();
  for (const [points, color, lineWidth] of [
    [inner, '#355979', 1.7],
    [outer, '#c07828', 2],
  ]) {
    ctx.beginPath();
    drawPath(points);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth * scale;
    ctx.stroke();
  }
  ctx.fillStyle = '#496377';
  ctx.font = `${11 * scale}px system-ui`;
  for (let i = 0; i <= 4; i++) {
    const x = view.minX + ((view.maxX - view.minX) * i) / 4;
    ctx.fillText(x.toFixed(2), sx(x) - 15 * scale, height - 11 * scale);
  }
  let coatingValidated = 0;
  for (const c of columns) {
    const middleZ = view.face === 'front'
      ? (c.siliconZ1 + c.frontOuterZ) / 2
      : (c.siliconZ0 + c.backOuterZ) / 2;
    if (shell.sample([c.x, c.y, middleZ]).materialLayerId !== 'oxide') {
      throw new Error('Displayed oxide does not match the canonical volumetric material owner');
    }
    coatingValidated++;
  }
  return {
    id: view.id,
    samples: columns.length,
    coatingValidated,
    physicalZMin: view.minZ,
    physicalZMax: view.maxZ,
    apexColumn: view.id === 'shellRoi'
      ? columns[Math.floor(columns.length / 2)]
      : null,
  };
}

for (const view of views) evidence.views.push(render(view));
const face = shell.sample([1.5, 0, 127.4]);
const apex = shell.sample([0, 0, 130.02]);
const corner = shell.sample([6.42, 6.42, 0]);
const inside = shell.sample([0, 0, 0]);
if (apex.materialLayerId !== 'oxide' || corner.materialLayerId !== 'oxide' ||
    inside.materialLayerId !== 'base') {
  throw new Error('3D apex/corner/interior material classification failed');
}
evidence.apex = apex.materialLayerId;
evidence.corner = corner.materialLayerId;
evidence.silicon = inside.materialLayerId;
evidence.exampleFaceQuery = face.materialLayerId;
window.WaferCADShellEvidence = evidence;
document.body.dataset.shellReady = 'true';
document.getElementById('shellStatus').textContent = '3D material owner · 2D ROI verified';
