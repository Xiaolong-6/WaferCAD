// Isolated v15 Assembly preview: no normal editor import and no writer lease.
import { readProjectFile, MAX_PROJECT_FILE_BYTES } from '../project-io.js';
import { ASSEMBLY_WORKSPACE_FORMAT, parseAssemblyWorkspace } from '../wafer-assembly-workspace-file.js';
import { validateBondedAssemblyProject } from '../wafer-assembly.js';
import { validateProjectFile } from '../project-schema.js';
import {
  validateAssemblyVariantGraph,
  activateAssemblyVariant,
  assemblyVariantProject,
} from '../wafer-assembly-variants.js';

// Display-only source palette. Material identity and persisted layer colors
// remain unchanged; it is the wafer of origin that is being highlighted.
export const ASSEMBLY_ORIGIN_COLORS = [
  '#91A5B8',
  '#4C9CB3',
  '#D2A05B',
  '#9B86C6',
  '#60A996',
  '#D48291',
  '#A4A354',
  '#6C83C5',
];

export function assemblyPreviewOriginModel(model, assembly) {
  if (!assembly?.bonds?.length) return model;
  const origin = new Map();
  for (const layer of assembly.sources[0]?.project?.model?.layers || []) {
    origin.set(layer.id, 0);
  }
  for (const [index, bond] of assembly.bonds.entries()) {
    for (const donorLayerId of Object.values(bond.donorLayerIds || {})) {
      origin.set(donorLayerId, index + 1);
    }
  }
  return {
    ...model,
    layers: (model.layers || []).map((layer) => {
      const waferIndex = origin.get(layer.id);
      return waferIndex == null
        ? layer
        : { ...layer, color: ASSEMBLY_ORIGIN_COLORS[waferIndex % ASSEMBLY_ORIGIN_COLORS.length] };
    }),
  };
}

/** Physical Z span across all material stacks; preview-only, no model changes. */
export function assemblyPreviewZExtent(model) {
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const region of model?.regions || []) {
    for (const segment of region?.stack || []) {
      if (!Number.isFinite(segment.z0) || !Number.isFinite(segment.z1)) continue;
      minZ = Math.min(minZ, segment.z0);
      maxZ = Math.max(maxZ, segment.z1);
    }
  }
  if (!Number.isFinite(minZ) || !Number.isFinite(maxZ) || maxZ <= minZ) {
    throw new Error('Assembly preview cannot derive a physical Z extent.');
  }
  return { minZ, maxZ, thicknessUm: Number((maxZ - minZ).toPrecision(10)) };
}

export async function readAssemblyPreviewFile(
  file,
  readProject = readProjectFile,
  { allowStandalone = false } = {},
) {
  if (allowStandalone && /\.wafercad-variants\.json$/i.test(file?.name)) {
    if (!Number.isFinite(file.size) || file.size > MAX_PROJECT_FILE_BYTES) {
      throw new Error('Assembly Variant source registry exceeds the supported file limit.');
    }
    const decoded = JSON.parse(await file.text());
    const graph = activateAssemblyVariant(
      validateAssemblyVariantGraph(decoded),
      decoded.activeBranchId,
    );
    return {
      source: file.name,
      hash: '',
      data: assemblyVariantProject(graph),
      variantGraph: graph,
    };
  }
  if (!file || typeof file.name !== 'string' || !/\.wafercad$/i.test(file.name)) {
    throw new Error('Select a .wafercad Assembly project.');
  }
  if (!Number.isFinite(file.size) || file.size > MAX_PROJECT_FILE_BYTES) {
    throw new Error('Assembly project exceeds the supported project-file size limit.');
  }
  // A portable Assembly Workspace keeps Process and Variant provenance.
  // Ordinary bonded v15 files remain readable as immutable baselines.
  let decoded = null;
  try {
    decoded = JSON.parse(await file.text());
  } catch {
    // Preserve the normal project's dedicated JSON error handling.
  }
  if (decoded?.format === ASSEMBLY_WORKSPACE_FORMAT) {
    const { project: data, graph } = parseAssemblyWorkspace(decoded);
    if (!allowStandalone && !data.waferAssembly) {
      throw new Error('Assembly preview requires at least one Bond.');
    }
    return { source: file.name, hash: '', data, variantGraph: graph };
  }
  const data = await readProject(file);
  if (!data?.waferAssembly || !Array.isArray(data.waferAssembly.sources)) {
    if (!allowStandalone) {
      throw new Error('The selected file does not contain a bonded v15 Assembly.');
    }
    validateProjectFile(data);
    if (data.waferAssembly != null) {
      throw new Error('The selected file contains an incomplete Assembly.');
    }
    return { source: file.name, hash: '', data };
  }
  validateBondedAssemblyProject(data);
  if (data.waferAssembly.bonds.length < 1) {
    throw new Error('Assembly preview requires at least one Bond.');
  }
  return { source: file.name, hash: '', data };
}

export function chooseAssemblyPreviewFile(
  root,
  { load = readAssemblyPreviewFile, recovery = null, allowStandalone = false } = {},
) {
  if (!root || typeof root.replaceChildren !== 'function') {
    throw new Error('Assembly preview requires a document root.');
  }
  const title = document.createElement('h1');
  title.textContent = allowStandalone ? 'Assembly · Direct Bond draft' : 'Assembly Preview';
  const description = document.createElement('p');
  description.textContent = allowStandalone
    ? 'Open a wafer, a complete Assembly Workspace .wafercad, a Bond baseline, or an older Variants sidecar. All source Recipes and branch geometry are validated before editing.'
    : 'Inspect a bonded .wafercad baseline or full Assembly Workspace with its original wafers. Read-only: no edits, workspace takeover, or autosave.';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = allowStandalone ? '.wafercad,.wafercad-variants.json' : '.wafercad';
  input.setAttribute('aria-label', 'Open bonded Assembly project');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const panel = document.createElement('section');
  panel.className = 'assembly-preview-file-picker';
  panel.append(title, description, input, status);
  const recoveryControls = recovery ? document.createElement('div') : null;
  let recoverySelect = null;
  let recoveryButton = null;
  if (recoveryControls) {
    recoveryControls.className = 'assembly-preview-recovery';
    recoverySelect = document.createElement('select');
    recoverySelect.setAttribute('aria-label', 'Assembly Bond Recovery checkpoint');
    recoveryButton = document.createElement('button');
    recoveryButton.type = 'button';
    recoveryButton.textContent = 'Restore Assembly Recovery';
    recoverySelect.disabled = true;
    recoveryButton.disabled = true;
    recoveryControls.append(recoverySelect, recoveryButton);
    panel.append(recoveryControls);
  }
  root.replaceChildren(panel);
  if (recoveryControls) {
    void Promise.all([recovery.list(), recovery.listWorkspaceGraphs()])
      .then(([checkpoints, workspaces]) => {
        const records = [
          ...workspaces.map((record) => ({
            key: `workspace:${record.id}`,
            updatedAt: record.updatedAt,
            label: `Committed · revision ${record.revision} · ${record.branches} Variants`,
          })),
          ...checkpoints.map((record) => ({
            key: `checkpoint:${record.key}`,
            updatedAt: record.updatedAt,
            label: `Pre-Bond · ${record.sourceCount} wafers`,
          })),
        ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        for (const record of records) {
          const option = document.createElement('option');
          option.value = record.key;
          option.textContent = `${record.updatedAt} · ${record.label}`;
          recoverySelect.append(option);
        }
        recoverySelect.disabled = records.length === 0;
        recoveryButton.disabled = records.length === 0;
      })
      .catch((error) => {
        status.dataset.error = 'true';
        status.textContent = `Could not list Assembly Recovery: ${error.message}`;
      });
  }

  return new Promise((resolve) => {
    let opening = false;
    if (recoveryButton) {
      recoveryButton.addEventListener('click', async () => {
        if (opening || recoveryButton.disabled || !recoverySelect.value) return;
        opening = true;
        recoveryButton.disabled = true;
        status.dataset.error = 'false';
        status.textContent = 'Validating committed or pre-Bond Recovery…';
        try {
          if (recoverySelect.value.startsWith('workspace:')) {
            const recovered = await recovery.loadWorkspaceGraph(
              recoverySelect.value.slice('workspace:'.length),
            );
            resolve({
              source: 'assembly-committed-recovery',
              hash: '',
              data: recovered.project,
              variantGraph: recovered.graph,
              workspaceId: recovered.id,
              workspaceRevision: recovered.revision,
            });
          } else {
            const key = recoverySelect.value.replace(/^checkpoint:/, '');
            const recovered = await recovery.load(key);
            resolve({ source: 'assembly-prebond-recovery', hash: '', data: recovered });
          }
        } catch (error) {
          status.dataset.error = 'true';
          status.textContent = error?.message || String(error);
        } finally {
          opening = false;
          recoveryButton.disabled = false;
        }
      });
    }
    input.addEventListener('change', async () => {
      if (opening || !input.files?.length) return;
      opening = true;
      input.disabled = true;
      status.textContent = 'Validating material and all donor sources…';
      try {
        const project = await load(input.files[0], readProjectFile, { allowStandalone });
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
  stageDetail = () => '',
  restoreIndex,
  selectView,
  initialView = 'three',
  editableBondDraft = false,
}) {
  const nav = document.createElement('nav');
  nav.className = 'assembly-preview-controls';
  nav.setAttribute('aria-label', 'Read-only Assembly preview navigation');
  const title = document.createElement('strong');
  title.textContent = editableBondDraft ? 'Assembly · Bond draft' : 'Assembly · Read-only';
  title.title = 'Wafer-origin colors change the rendering only, not physical materials.';
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
    const phase = index === 0 ? 'Original wafer' : `Bond ${index}`;
    stage.textContent = `${phase} · ${index} / ${maxIndex()}${stageDetail()}`;
    backward.disabled = index === 0;
    forward.disabled = index === maxIndex();
    nav.dataset.bondIndex = String(index);
  };
  let navigating = false;
  const navigate = async (delta) => {
    if (navigating) return;
    navigating = true;
    backward.disabled = true;
    forward.disabled = true;
    try {
      await restoreIndex(currentIndex() + delta);
      stage.dataset.error = 'false';
      sync();
    } catch (error) {
      stage.dataset.error = 'true';
      stage.textContent = error?.message || String(error);
    } finally {
      navigating = false;
      if (stage.dataset.error !== 'true') sync();
      else {
        backward.disabled = currentIndex() === 0;
        forward.disabled = currentIndex() === maxIndex();
      }
    }
  };
  backward.addEventListener('click', () => navigate(-1));
  forward.addEventListener('click', () => navigate(1));
  const colorNote = document.createElement('span');
  colorNote.className = 'assembly-preview-origin-note';
  colorNote.textContent = 'Origin colors · display only';
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
  nav.append(title, backward, stage, forward, colorNote, views);
  root.append(nav);
  sync();
  return { element: nav, sync };
}
