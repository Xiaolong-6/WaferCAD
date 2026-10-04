import { BUNDLED_EXAMPLES } from './bundled-examples.js';
import { MAX_LAYOUT_FILE_BYTES } from './layout-io.js';
import { MAX_PROJECT_FILE_BYTES } from './project-io.js';
import { createVisualizationLayout } from './welcome-example.js';
import { stageStartupFile } from './startup-file.js';

const $ = (id) => document.getElementById(id);
let previewLayout = null;
const previewCanvases = new Set();
const projectPreviewFrames = new Set();
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

function createImagePreview(example, { fallback = false } = {}) {
  const image = document.createElement('img');
  image.className = fallback
    ? 'welcome-example-image welcome-example-project-fallback'
    : 'welcome-example-image';
  image.src = example.preview.path;
  image.alt = example.preview.alt || `${example.title} WaferCAD screenshot`;
  image.loading = 'lazy';
  image.decoding = 'async';
  if (example.preview.position) image.style.objectPosition = example.preview.position;

  const fragment = document.createDocumentFragment();
  fragment.append(image);
  if (!fallback) {
    const caption = document.createElement('span');
    caption.className = 'welcome-example-image-caption';
    caption.textContent = example.preview.label || 'WaferCAD screenshot';
    fragment.append(caption);
  }
  return fragment;
}

function previewUrl(example, view = 'main') {
  const params = new URLSearchParams({
    preview: '1',
    start: 'example',
    example: example.id,
    view,
  });
  return `./app.html?${params.toString()}`;
}

function createProjectPreview(example) {
  const host = document.createElement('div');
  host.className = 'welcome-example-project-preview';
  host.dataset.view = 'main';

  const stage = document.createElement('div');
  stage.className = 'welcome-example-project-stage';

  if (example.preview?.path) stage.append(createImagePreview(example, { fallback: true }));

  const loading = document.createElement('div');
  loading.className = 'welcome-example-project-loading';
  loading.textContent = 'Loading project preview…';
  stage.append(loading);

  const frame = document.createElement('iframe');
  frame.className = 'welcome-example-project-frame';
  frame.title = `${example.title} interactive WaferCAD preview`;
  frame.loading = 'lazy';
  frame.src = previewUrl(example);
  frame.setAttribute('aria-label', frame.title);
  stage.append(frame);
  projectPreviewFrames.add(frame);

  const tabs = document.createElement('div');
  tabs.className = 'welcome-example-view-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', `${example.title} preview views`);

  for (const [view, label] of [
    ['main', 'Main'],
    ['mask', 'Mask'],
    ['three', '3D'],
    ['section', 'Section'],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'welcome-example-view-tab';
    button.dataset.previewView = view;
    button.textContent = label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(view === 'main'));
    button.addEventListener('click', () => {
      host.dataset.view = view;
      for (const sibling of tabs.querySelectorAll('.welcome-example-view-tab')) {
        const active = sibling.dataset.previewView === view;
        sibling.classList.toggle('active', active);
        sibling.setAttribute('aria-selected', String(active));
      }
      frame.contentWindow?.postMessage(
        { type: 'wafercad-preview-view', view },
        globalThis.location.origin,
      );
    });
    if (view === 'main') button.classList.add('active');
    tabs.append(button);
  }

  host.append(stage, tabs);
  return host;
}

function createSourceList(example) {
  if (!example.sources?.length) return null;
  const host = document.createElement('div');
  host.className = 'welcome-example-sources';

  const label = document.createElement('strong');
  label.textContent = example.sources.length > 1 ? 'Sources' : 'Source';
  host.append(label);

  const list = document.createElement('ol');
  for (const source of example.sources) {
    const item = document.createElement('li');
    const citation = document.createElement('span');
    citation.textContent = source.citation;
    item.append(citation);

    if (source.href) {
      const link = document.createElement('a');
      link.href = source.href;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = source.doi ? `DOI ${source.doi}` : 'Source';
      item.append(link);
    }
    list.append(item);
  }
  host.append(list);
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
    if (example.kind === 'project') {
      visual.classList.add('has-project-preview');
      visual.append(createProjectPreview(example));
    } else if (example.preview?.path) {
      visual.classList.add('has-image');
      visual.append(createImagePreview(example));
    } else if (example.kind === 'generated') {
      const canvas = document.createElement('canvas');
      canvas.className = 'welcome-example-canvas';
      canvas.setAttribute('aria-label', example.title + ' preview');
      visual.append(canvas);
      previewCanvases.add(canvas);
      requestAnimationFrame(() => drawVisualizationPreview(canvas));
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

    const sources = createSourceList(example);

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

    body.append(meta, title, summary);
    if (sources) body.append(sources);
    body.append(tags, action);
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

globalThis.addEventListener('message', (event) => {
  if (event.origin !== globalThis.location.origin) return;
  const frame = [...projectPreviewFrames].find((candidate) => candidate.contentWindow === event.source);
  if (!frame) return;

  const host = frame.closest('.welcome-example-project-preview');
  if (event.data?.type === 'wafercad-preview-ready') {
    host?.classList.add('ready');
    host?.classList.remove('error');
  } else if (event.data?.type === 'wafercad-preview-error') {
    host?.classList.add('error');
    host?.classList.remove('ready');
  }
});

globalThis.addEventListener('resize', () => {
  clearTimeout(previewResizeTimer);
  previewResizeTimer = setTimeout(() => {
    for (const canvas of previewCanvases) drawVisualizationPreview(canvas);
  }, 80);
});
