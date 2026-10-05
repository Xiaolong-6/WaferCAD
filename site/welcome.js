import { BUNDLED_EXAMPLES } from './bundled-examples.js';
import { MAX_LAYOUT_FILE_BYTES } from './layout-io.js';
import { MAX_PROJECT_FILE_BYTES } from './project-io.js';
import { stageStartupFile } from './startup-file.js';

const $ = (id) => document.getElementById(id);
const projectPreviewFrames = new Set();
let autoProjectPreviewAssigned = false;

function status(message) {
  $('welcomeStatus').textContent = message;
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

  const badge = document.createElement('span');
  badge.className = 'welcome-example-project-badge';
  badge.textContent = 'Project preview';
  stage.append(badge);

  if (example.preview?.path) stage.append(createImagePreview(example, { fallback: true }));

  const loading = document.createElement('div');
  loading.className = 'welcome-example-project-loading';
  loading.textContent = 'Interactive preview · choose a view to load';
  stage.append(loading);

  const frame = document.createElement('iframe');
  frame.className = 'welcome-example-project-frame';
  frame.title = `${example.title} interactive WaferCAD preview`;
  frame.loading = 'lazy';
  frame.dataset.previewSrc = previewUrl(example);
  frame.setAttribute('aria-label', frame.title);
  stage.append(frame);
  projectPreviewFrames.add(frame);

  const activatePreview = () => {
    if (frame.getAttribute('src')) return;
    loading.textContent = 'Loading project preview…';
    frame.src = frame.dataset.previewSrc;
  };

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
      activatePreview();
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
  if (!autoProjectPreviewAssigned) {
    autoProjectPreviewAssigned = true;
    requestAnimationFrame(activatePreview);
  }
  return host;
}

function createSourceList(example) {
  if (!example.sources?.length) return null;
  const host = document.createElement('div');
  host.className = 'welcome-example-sources';

  const label = document.createElement('strong');
  label.textContent = example.sources.length > 1 ? 'Sources:' : 'Source:';
  host.append(label);

  for (const source of example.sources) {
    const row = document.createElement('div');
    row.className = 'welcome-example-source-row';
    const citation = document.createElement('span');
    citation.textContent = source.citation;
    row.append(citation);

    if (source.href) {
      const link = document.createElement('a');
      link.href = source.href;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = source.doi || 'Source';
      row.append(document.createTextNode(' · '), link);
    }
    host.append(row);
  }
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
    action.textContent = 'Open example →';
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
document.documentElement.dataset.welcomeReady = 'true';

globalThis.addEventListener('message', (event) => {
  if (event.origin !== globalThis.location.origin) return;
  const frame = [...projectPreviewFrames].find((candidate) => candidate.contentWindow === event.source);
  if (!frame) return;

  const host = frame.closest('.welcome-example-project-preview');
  if (event.data?.type === 'wafercad-preview-ready') {
    host?.classList.add('ready');
    host?.classList.remove('error');
    frame.contentWindow?.postMessage(
      { type: 'wafercad-preview-view', view: host?.dataset.view || 'main' },
      globalThis.location.origin,
    );
  } else if (event.data?.type === 'wafercad-preview-error') {
    host?.classList.add('error');
    host?.classList.remove('ready');
  }
});


