// Isolated v15 Assembly preview: no normal editor import and no writer lease.
import { readProjectFile, MAX_PROJECT_FILE_BYTES } from '../project-io.js';
import { validateBondedAssemblyProject } from '../wafer-assembly.js';

export async function readAssemblyPreviewFile(file, readProject = readProjectFile) {
  if (!file || typeof file.name !== 'string' || !/\.wafercad$/i.test(file.name)) {
    throw new Error('Select a .wafercad Assembly project.');
  }
  if (!Number.isFinite(file.size) || file.size > MAX_PROJECT_FILE_BYTES) {
    throw new Error('Assembly project exceeds the supported project-file size limit.');
  }
  const data = await readProject(file);
  if (!data?.waferAssembly || !Array.isArray(data.waferAssembly.sources)) {
    throw new Error('The selected file does not contain a bonded v15 Assembly.');
  }
  validateBondedAssemblyProject(data);
  if (data.waferAssembly.bonds.length < 1) {
    throw new Error('Assembly preview requires at least one Bond.');
  }
  return { source: file.name, hash: '', data };
}

export function chooseAssemblyPreviewFile(root, { load = readAssemblyPreviewFile } = {}) {
  if (!root || typeof root.replaceChildren !== 'function') {
    throw new Error('Assembly preview requires a document root.');
  }
  const title = document.createElement('h1');
  title.textContent = 'Assembly Preview';
  const description = document.createElement('p');
  description.textContent =
    'Inspect an existing bonded .wafercad file and its original wafers. Read-only: ' +
    'no edits, workspace takeover, or autosave.';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.wafercad';
  input.setAttribute('aria-label', 'Open bonded Assembly project');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const panel = document.createElement('section');
  panel.className = 'assembly-preview-file-picker';
  panel.append(title, description, input, status);
  root.replaceChildren(panel);

  return new Promise((resolve) => {
    let opening = false;
    input.addEventListener('change', async () => {
      if (opening || !input.files?.length) return;
      opening = true;
      input.disabled = true;
      status.textContent = 'Validating material and all donor sources…';
      try {
        const project = await load(input.files[0]);
        resolve(project);
      } catch (error) {
        status.textContent = error?.message || String(error);
        status.dataset.error = 'true';
      } finally {
        opening = false;
        input.value = '';
        input.disabled = false;
      }
    });
  });
}

export function mountAssemblyPreviewControls({
  root = document.body,
  currentIndex,
  maxIndex,
  restoreIndex,
  selectView,
  initialView = 'three',
}) {
  const nav = document.createElement('nav');
  nav.className = 'assembly-preview-controls';
  nav.setAttribute('aria-label', 'Read-only Assembly preview navigation');
  const title = document.createElement('strong');
  title.textContent = 'Assembly · Read-only';
  const backward = document.createElement('button');
  const forward = document.createElement('button');
  backward.type = forward.type = 'button';
  backward.textContent = '← Bond';
  forward.textContent = 'Bond →';
  const stage = document.createElement('span');
  stage.className = 'assembly-preview-stage';
  stage.setAttribute('aria-live', 'polite');

  const sync = () => {
    const index = currentIndex();
    stage.textContent = index === 0
      ? `Original wafer · 0 / ${maxIndex()}`
      : `Bond ${index} / ${maxIndex()}`;
    backward.disabled = index === 0;
    forward.disabled = index === maxIndex();
    nav.dataset.bondIndex = String(index);
  };
  const navigate = (delta) => {
    restoreIndex(currentIndex() + delta);
    sync();
  };
  backward.addEventListener('click', () => navigate(-1));
  forward.addEventListener('click', () => navigate(1));
  const views = document.createElement('div');
  views.className = 'assembly-preview-views';
  for (const [key, label] of [
    ['main', 'Main'],
    ['mask', 'Mask'],
    ['three', '3D'],
    ['section', 'Section'],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.view = key;
    button.setAttribute('aria-pressed', key === initialView ? 'true' : 'false');
    button.addEventListener('click', () => {
      for (const node of views.children) {
        node.setAttribute('aria-pressed', node === button ? 'true' : 'false');
      }
      selectView(key);
    });
    views.append(button);
  }
  nav.append(title, backward, stage, forward, views);
  root.append(nav);
  sync();
  return { element: nav, sync };
}
