import { BUNDLED_EXAMPLES } from './bundled-examples.js';
import { MAX_LAYOUT_FILE_BYTES } from './layout-io.js';
import { MAX_PROJECT_FILE_BYTES } from './project-io.js';
import { createVisualizationLayout } from './welcome-example.js';
import { stageStartupFile } from './startup-file.js';

const $ = (id) => document.getElementById(id);
let previewLayout = null;
const previewCanvases = new Set();
let previewResizeTimer = 0;

function status(message) {
  $('welcomeStatus').textContent = message;
}

function drawVisualizationPreview(canvas) {
  if (!canvas?.isConnected) return;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return;

  previewLayout ||= createVisualizationLayout();
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(rect.width * dpr)),
    pixelHeight = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = '#f7f9fb';
  ctx.fillRect(0, 0, rect.width, rect.height);

  const bounds = previewLayout.bounds;
  const scale = Math.min(
    (rect.width * 0.82) / Math.max(bounds.width, 1),
    (rect.height * 0.82) / Math.max(bounds.height, 1),
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
      ctx.lineWidth = 1.1;
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

function createProjectVariantPreview(example) {
  const host = document.createElement('div');
  host.className = 'welcome-family-preview';
  const root = document.createElement('div');
  root.className = 'welcome-family-root';
  root.textContent = 'Photodetector family';
  host.append(root);

  const branches = document.createElement('div');
  branches.className = 'welcome-family-branches';
  for (const line of example.variants || []) {
    const branch = document.createElement('div');
    branch.className = 'welcome-family-branch';
    const marker = document.createElement('span');
    marker.setAttribute('aria-hidden', 'true');
    const label = document.createElement('strong');
    label.textContent = line;
    branch.append(marker, label);
    branches.append(branch);
  }
  host.append(branches);
  return host;
}

function openExample(exampleId) {
  globalThis.location.href =
    './app.html?start=example&example=' + encodeURIComponent(exampleId);
}

function renderExampleCards() {
  const grid = $('welcomeExampleGrid');
  grid.innerHTML = '';

  for (const example of BUNDLED_EXAMPLES) {
    const card = document.createElement('article');
    card.className = 'welcome-example-card';
    card.dataset.exampleId = example.id;

    const visual = document.createElement('div');
    visual.className = 'welcome-example-visual';
    if (example.kind === 'generated') {
      const canvas = document.createElement('canvas');
      canvas.className = 'welcome-example-canvas';
      canvas.setAttribute('aria-label', example.title + ' preview');
      visual.append(canvas);
      previewCanvases.add(canvas);
      requestAnimationFrame(() => drawVisualizationPreview(canvas));
    } else {
      visual.append(createProjectVariantPreview(example));
    }

    const body = document.createElement('div');
    body.className = 'welcome-example-body';

    const meta = document.createElement('div');
    meta.className = 'welcome-example-meta';
    const level = document.createElement('span');
    level.textContent = example.level || 'Example';
    const figure = document.createElement('span');
    figure.textContent = example.figure;
    meta.append(level, figure);

    const title = document.createElement('h3');
    title.textContent = example.title;

    const summary = document.createElement('p');
    summary.textContent = example.summary;

    const tags = document.createElement('div');
    tags.className = 'welcome-example-tags';
    for (const tag of example.tags || []) {
      const chip = document.createElement('span');
      chip.textContent = tag;
      tags.append(chip);
    }

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'welcome-example-open';
    action.textContent = 'Open example';
    action.onclick = () => openExample(example.id);

    body.append(meta, title, summary, tags, action);
    card.append(visual, body);
    grid.append(card);
  }
}

async function stageAndOpen(file, kind) {
  if (!file) return;
  try {
    const maxBytes = kind === 'project' ? MAX_PROJECT_FILE_BYTES : MAX_LAYOUT_FILE_BYTES;
    if (file.size > maxBytes) {
      throw new Error(
        `${kind === 'project' ? 'Project' : 'Layout'} file is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB safety limit.`,
      );
    }
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
$('welcomeLayoutInput').onchange = (event) => stageAndOpen(event.target.files?.[0], 'layout');
$('welcomeProjectInput').onchange = (event) => stageAndOpen(event.target.files?.[0], 'project');

renderExampleCards();

globalThis.addEventListener('resize', () => {
  clearTimeout(previewResizeTimer);
  previewResizeTimer = setTimeout(() => {
    for (const canvas of previewCanvases) drawVisualizationPreview(canvas);
  }, 80);
});
