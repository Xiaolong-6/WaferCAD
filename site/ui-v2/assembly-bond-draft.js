// Separate opt-in direct-Bond draft UI. The standard Workstation Process and
// Recipe editors remain disabled; only this source-aware owner may add donors.
import { readProjectFile, downloadProject } from '../project-io.js';
import { downloadAssemblyWorkspace } from '../wafer-assembly-workspace-file.js';

export function mountAssemblyBondDraftControls({
  editor,
  root = document.body,
  onChanged = () => {},
}) {
  const panel = document.createElement('details');
  panel.className = 'assembly-bond-draft-tools';
  panel.setAttribute('aria-label', 'Experimental Assembly Bond editor');

  const header = document.createElement('summary');
  header.textContent = 'Add donor · Direct Bond';
  const description = document.createElement('p');
  description.textContent =
    'Sources remain independent and each Bond has a durable pre-Bond Recovery checkpoint. ' +
    'Autosave is disabled: export the complete Assembly Workspace .wafercad to preserve every Bond, Process, source and Variant.';

  const form = document.createElement('form');
  form.className = 'assembly-bond-draft-form';
  const controls = [
    ...(editor.fullProduct().waferAssembly ? [] : [['receiverId', 'Receiver ID', 'text', 'A']]),
    ['donorId', 'Donor ID', 'text', editor.fullProduct().waferAssembly ? 'C' : 'B'],
    ['dx', 'X offset (µm)', 'number', '0'],
    ['dy', 'Y offset (µm)', 'number', '0'],
    ['rotationDeg', 'Rotation (°)', 'number', '0'],
  ];
  const fields = new Map();
  for (const [name, title, type, value] of controls) {
    const label = document.createElement('label');
    label.textContent = title;
    const input = document.createElement('input');
    input.name = name;
    input.type = type;
    input.value = value;
    if (type === 'number') input.step = 'any';
    if (name === 'donorId' || name === 'receiverId') {
      input.maxLength = 64;
      input.required = true;
      input.pattern = '[A-Za-z0-9][A-Za-z0-9_.-]{0,63}';
    }
    label.append(input);
    fields.set(name, input);
    form.append(label);
  }
  for (const [name, labelText] of [
    ['receiverFace', 'Receiver face'],
    ['donorFace', 'Donor face'],
  ]) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const select = document.createElement('select');
    select.name = name;
    for (const face of ['front', 'back']) {
      const option = document.createElement('option');
      option.value = face;
      option.textContent = face === 'front' ? 'Front' : 'Back';
      select.append(option);
    }
    label.append(select);
    form.append(label);
    fields.set(name, select);
  }
  const donorFileLabel = document.createElement('label');
  donorFileLabel.textContent = 'Independent donor .wafercad';
  const donorFile = document.createElement('input');
  donorFile.type = 'file';
  donorFile.accept = '.wafercad';
  donorFile.required = true;
  donorFile.setAttribute('aria-label', 'Select independent donor wafer');
  donorFileLabel.append(donorFile);
  form.append(donorFileLabel);

  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.textContent = 'Validate and Bond';
  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.textContent = 'Export Assembly .wafercad';
  const actions = document.createElement('div');
  actions.className = 'assembly-bond-draft-actions';
  const exportBaseline = document.createElement('button');
  exportBaseline.type = 'button';
  exportBaseline.textContent = 'Bond baseline only';
  actions.append(apply, exportButton, exportBaseline);
  form.append(actions);
  const status = document.createElement('p');
  status.className = 'assembly-bond-draft-status';
  status.setAttribute('role', 'status');
  const variants = document.createElement('section');
  variants.className = 'assembly-bond-variants';
  const variantsTitle = document.createElement('strong');
  variantsTitle.textContent = 'Bond Variants';
  const variantSelect = document.createElement('select');
  variantSelect.setAttribute('aria-label', 'Bond Variant');
  const variantName = document.createElement('input');
  variantName.type = 'text';
  variantName.placeholder = 'Alternative route';
  variantName.maxLength = 120;
  variantName.setAttribute('aria-label', 'New Bond Variant name');
  const forkButton = document.createElement('button');
  forkButton.type = 'button';
  forkButton.textContent = 'Fork from current Bond';
  const variantExport = document.createElement('button');
  variantExport.type = 'button';
  variantExport.textContent = 'Export all Variants';
  variants.append(variantsTitle, variantSelect, variantName, forkButton, variantExport);
  const timeline = document.createElement('section');
  timeline.className = 'assembly-bond-workstation-history';
  const timelineTitle = document.createElement('strong');
  timelineTitle.textContent = 'Assembly History · committed';
  const timelineStatus = document.createElement('span');
  timelineStatus.className = 'assembly-bond-workstation-history-status';
  const undoAssembly = document.createElement('button');
  undoAssembly.type = 'button';
  undoAssembly.textContent = 'Undo';
  undoAssembly.setAttribute('aria-label', 'Undo Assembly history');
  const redoAssembly = document.createElement('button');
  redoAssembly.type = 'button';
  redoAssembly.textContent = 'Redo';
  redoAssembly.setAttribute('aria-label', 'Redo Assembly history');
  timeline.append(timelineTitle, timelineStatus, undoAssembly, redoAssembly);
  const process = document.createElement('section');
  process.className = 'assembly-bond-post-process';
  const processTitle = document.createElement('strong');
  processTitle.textContent = 'Post-Bond Process · geometric preview';
  const processInfo = document.createElement('p');
  processInfo.textContent =
    'Supported: full-face directional Deposit or Etch. New films are pink for display only ' +
    '(physical thickness unchanged). Export Assembly .wafercad retains every Process and Variant; ' +
    'the separate Bond baseline export intentionally omits post-Bond Process.';
  const processType = document.createElement('select');
  processType.setAttribute('aria-label', 'Post-Bond Process operation');
  for (const [value, label] of [
    ['deposit', 'Deposit'],
    ['etch', 'Etch'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    processType.append(option);
  }
  const processMaterial = document.createElement('input');
  processMaterial.value = 'SiO2';
  processMaterial.setAttribute('aria-label', 'Post-Bond Process material');
  const processThickness = document.createElement('input');
  processThickness.type = 'number';
  processThickness.step = 'any';
  processThickness.min = '0';
  processThickness.value = '1.8';
  processThickness.setAttribute('aria-label', 'Post-Bond Process thickness µm');
  const processFace = document.createElement('select');
  processFace.setAttribute('aria-label', 'Post-Bond Process face');
  for (const value of ['front', 'back']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === 'front' ? 'Front' : 'Back';
    processFace.append(option);
  }
  const processButton = document.createElement('button');
  processButton.type = 'button';
  processButton.textContent = 'Apply Process preview';
  const processCount = document.createElement('span');
  processCount.className = 'assembly-bond-post-process-count';
  const processUndo = document.createElement('button');
  processUndo.type = 'button';
  processUndo.textContent = '← Process';
  const processRedo = document.createElement('button');
  processRedo.type = 'button';
  processRedo.textContent = 'Process →';
  process.append(
    processTitle,
    processInfo,
    processType,
    processMaterial,
    processThickness,
    processFace,
    processButton,
    processCount,
    processUndo,
    processRedo,
  );
  panel.append(header, description, timeline, form, variants, process, status);
  root.append(panel);

  let busy = false;
  const sync = () => {
    const all = editor.listVariants();
    const navigation = editor.workstationHistoryNavigation();
    timelineStatus.textContent = [
      `Bond ${navigation.bondIndex} / ${navigation.bondLength}`,
      `Process ${navigation.processIndex} / ${navigation.processLength}`,
    ].join(' · ');
    undoAssembly.disabled = busy || !navigation.canUndo;
    redoAssembly.disabled = busy || !navigation.canRedo;
    undoAssembly.title = navigation.undoKind
      ? `Undo last ${navigation.undoKind === 'bond' ? 'Bond' : 'Process'} stage`
      : 'At source History start';
    redoAssembly.title = navigation.redoKind
      ? `Redo ${navigation.redoKind === 'bond' ? 'Bond' : 'Process'} stage`
      : 'At active Variant HEAD';
    variantSelect.replaceChildren();
    for (const branch of all) {
      const option = document.createElement('option');
      option.value = branch.id;
      option.textContent = `${branch.name} · ${branch.headIndex} Bonds`;
      variantSelect.append(option);
      if (branch.active) variantSelect.value = branch.id;
    }
    const atHead = editor.currentIndex() === editor.maxIndex();
    const graph = editor.exportVariantGraph();
    const activeBranch = graph.branches.find((branch) => branch.id === graph.activeBranchId);
    const processSteps = activeBranch?.postBondSteps?.length || 0;
    const processIndex = activeBranch?.postBondCursor ?? processSteps;
    processCount.textContent = `Process ${processIndex} / ${processSteps} · full Recipe retained`;
    processUndo.disabled = busy || !atHead || processIndex === 0;
    processRedo.disabled = busy || !atHead || processIndex === processSteps;
    processButton.disabled =
      busy ||
      !atHead ||
      editor.maxIndex() < 1 ||
      processSteps >= 16 ||
      processIndex !== processSteps;
    processMaterial.disabled = processType.value !== 'deposit';
    apply.disabled = busy || !atHead || editor.maxIndex() >= 7;
    donorFile.disabled = busy || !atHead;
    exportButton.disabled = busy || editor.maxIndex() === 0;
    exportButton.textContent = 'Export Assembly .wafercad';
    exportBaseline.disabled = busy || editor.maxIndex() === 0;
    const processForkAvailable = atHead && processIndex < processSteps;
    forkButton.disabled = busy || (atHead && !processForkAvailable);
    forkButton.textContent = processForkAvailable
      ? 'Fork Process Variant'
      : 'Fork from current Bond';
    variantSelect.disabled = busy || all.length < 2;
    variantExport.disabled = busy;
    panel.dataset.bondIndex = String(editor.currentIndex());
    if (!atHead) {
      status.textContent = 'Return to the Assembly HEAD before adding another donor.';
    }
  };

  const navigateProcess = async (delta) => {
    if (busy) return;
    const { index, length, available } = editor.processTimeline();
    const next = index + delta;
    if (!available || next < 0 || next > length) return;
    busy = true;
    sync();
    try {
      await editor.restorePostBondStepDurable(next);
      status.dataset.error = 'false';
      status.textContent = `Restored Process ${next} / ${length}. Recipe HEAD retained.`;
      onChanged();
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error?.message || String(error);
      onChanged();
    } finally {
      busy = false;
      sync();
    }
  };
  const navigateAssembly = async (direction) => {
    if (busy) return;
    const before = editor.workstationHistoryNavigation();
    const kind = direction === 'undo' ? before.undoKind : before.redoKind;
    if (!kind) return;
    busy = true;
    sync();
    try {
      if (direction === 'undo') await editor.undoWorkstationDurable();
      else await editor.redoWorkstationDurable();
      status.dataset.error = 'false';
      const verb = direction === 'undo' ? 'Undid' : 'Redid';
      status.textContent = `${verb} ${kind} stage. Durable Assembly revision saved.`;
      onChanged();
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error?.message || String(error);
      onChanged();
    } finally {
      busy = false;
      sync();
    }
  };
  undoAssembly.addEventListener('click', () => void navigateAssembly('undo'));
  redoAssembly.addEventListener('click', () => void navigateAssembly('redo'));
  processUndo.addEventListener('click', () => void navigateProcess(-1));
  processRedo.addEventListener('click', () => void navigateProcess(1));

  processType.addEventListener('change', sync);
  processButton.addEventListener('click', async () => {
    if (busy || processButton.disabled) return;
    busy = true;
    status.dataset.error = 'false';
    status.textContent = 'Validating geometry and publishing post-Bond Process…';
    sync();
    try {
      const input = {
        command: processType.value,
        params: {
          ...(processType.value === 'deposit'
            ? { material: processMaterial.value.trim(), coverage: 'direct' }
            : { profile: 'directional' }),
          thicknessUm: Number(processThickness.value),
          area: 'full',
          face: processFace.value,
        },
      };
      await editor.appendPostBondStepDurable(input);
      status.textContent = 'Post-Bond Process saved. Export Assembly .wafercad to retain the full timeline.';
      onChanged();
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error?.message || String(error);
      onChanged();
    } finally {
      busy = false;
      sync();
    }
  });

  forkButton.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    sync();
    try {
      const ids = new Set(editor.listVariants().map((item) => item.id));
      let number = 1;
      while (ids.has(`variant-${number}`)) number++;
      const id = `variant-${number}`;
      await editor.createVariantDurable(id, variantName.value || id);
      variantName.value = '';
      status.dataset.error = 'false';
      status.textContent = `Created ${id}. Export all Variants to preserve both routes.`;
      sync();
      onChanged();
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error?.message || String(error);
    } finally {
      busy = false;
      sync();
    }
  });
  variantSelect.addEventListener('change', async () => {
    if (busy) return;
    const selectedId = variantSelect.value;
    busy = true;
    sync();
    try {
      await editor.switchVariantDurable(selectedId);
      status.dataset.error = 'false';
      status.textContent = `Switched to ${selectedId}.`;
      onChanged();
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error?.message || String(error);
    } finally {
      busy = false;
      sync();
    }
  });
  variantExport.addEventListener('click', () => {
    try {
      const graph = editor.exportVariantGraph();
      const blob = new Blob([JSON.stringify(graph)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'wafercad-bond-variants.wafercad-variants.json';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      status.dataset.error = 'false';
      status.textContent =
        'Exported all source-shared Variants. Import this sidecar to reopen the complete branch graph.';
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error?.message || String(error);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || apply.disabled || !donorFile.files?.length) return;
    busy = true;
    status.dataset.error = 'false';
    status.textContent = 'Validating independent donor and source geometry…';
    sync();
    try {
      const file = donorFile.files[0];
      if (!/\.wafercad$/i.test(file.name)) throw new Error('Donor must be a .wafercad file.');
      const donor = await readProjectFile(file);
      if (donor?.waferAssembly) {
        throw new Error('Nested Assembly donors are not supported; select a standalone wafer.');
      }
      const request = {
        donorId: fields.get('donorId').value.trim(),
        ...(fields.has('receiverId') ? { receiverId: fields.get('receiverId').value.trim() } : {}),
        dx: Number(fields.get('dx').value),
        dy: Number(fields.get('dy').value),
        rotationDeg: Number(fields.get('rotationDeg').value),
        receiverFace: fields.get('receiverFace').value,
        donorFace: fields.get('donorFace').value,
      };
      status.textContent = 'Writing pre-Bond Recovery and committed Variant revision…';
      const completed = await editor.bond(donor, request);
      status.textContent =
        editor.listVariants().length > 1
          ? `Bonded ${completed.operation.donorId}. Export all Variants to retain every branch.`
          : `Bonded ${completed.operation.donorId}. Export the full Assembly to keep this edit.`;
      donorFile.value = '';
      onChanged();
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error?.message || String(error);
    } finally {
      busy = false;
      sync();
    }
  });
  exportButton.addEventListener('click', () => {
    try {
      downloadAssemblyWorkspace(editor.exportVariantGraph());
      status.dataset.error = 'false';
      status.textContent =
        'Full Assembly Workspace exported: source wafers, every Bond, Process Recipe and Variant.';
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error?.message || String(error);
    }
  });
  exportBaseline.addEventListener('click', () => {
    try {
      downloadProject(editor.fullProduct(), 'wafercad-bond-baseline-only.wafercad');
      status.dataset.error = 'false';
      status.textContent =
        'Exported Bond baseline only. Post-Bond Process and alternative Variants are omitted.';
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error?.message || String(error);
    }
  });
  sync();
  return { element: panel, sync };
}
