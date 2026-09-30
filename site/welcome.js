import { createVisualizationLayout } from './welcome-example.js';
import { stageStartupFile } from './startup-file.js';

const $ = (id) => document.getElementById(id);
let previewLayout = null;

function status(message) {
  $('welcomeStatus').textContent = message;
}

function drawPreview() {
  const canvas = $('welcomePreview');
  if (!canvas?.isConnected) return;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return;

  previewLayout ||= createVisualizationLayout();
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = '#f7f9fb';
  ctx.fillRect(0, 0, rect.width, rect.height);

  const bounds = previewLayout.bounds;
  const scale = Math.min(
    (rect.width * 0.84) / Math.max(bounds.width, 1),
    (rect.height * 0.84) / Math.max(bounds.height, 1),
  );
  const cx = rect.width / 2,
    cy = rect.height / 2,
    layerStyle = {
      1: ['rgba(92, 112, 137, 0.10)', 'rgba(92, 112, 137, 0.26)'],
      2: ['rgba(203, 119, 108, 0.46)', 'rgba(173, 91, 80, 0.66)'],
      3: ['rgba(123, 213, 160, 0.42)', 'rgba(77, 169, 116, 0.66)'],
      4: ['rgba(104, 178, 207, 0.46)', 'rgba(67, 139, 168, 0.70)'],
    },
    point = ([x, y]) => [cx + x * scale, cy - y * scale];

  for (const element of previewLayout.elements) {
    if (!element.points?.length) continue;
    const style = layerStyle[element.layer] || layerStyle[1];
    ctx.beginPath();
    element.points.forEach((p, index) => {
      const [x, y] = point(p);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();

    if (element.sourceCell === '50mm') {
      ctx.strokeStyle = '#87939f';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      continue;
    }

    ctx.fillStyle = style[0];
    ctx.strokeStyle = style[1];
    ctx.lineWidth = element.layer === 1 ? 0.45 : 0.7;
    ctx.fill();
    ctx.stroke();
  }
}

async function stageAndOpen(file, kind) {
  if (!file) return;
  try {
    status(`Preparing ${file.name}…`);
    await stageStartupFile(file, kind);
    globalThis.location.href = './app.html?start=staged';
  } catch (error) {
    console.error(error);
    status(`Could not prepare ${file.name}: ${error.message}`);
  }
}

$('welcomeImportBtn').onclick = () => $('welcomeLayoutInput').click();
$('welcomeProjectBtn').onclick = () => $('welcomeProjectInput').click();
$('welcomeExampleBtn').onclick = () => {
  globalThis.location.href = './app.html?start=example';
};
$('welcomeLayoutInput').onchange = (event) => stageAndOpen(event.target.files?.[0], 'layout');
$('welcomeProjectInput').onchange = (event) => stageAndOpen(event.target.files?.[0], 'project');

drawPreview();
new ResizeObserver(drawPreview).observe($('welcomePreview'));
