// Separate opt-in direct-Bond draft UI. The standard Workstation Process and
// Recipe editors remain disabled; only this source-aware owner may add donors.
import { readProjectFile, downloadProject } from '../project-io.js';

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
    'Source projects remain independent. Before each Bond, a separate durable Recovery checkpoint ' +
    'is written. Export the full Assembly file after editing; autosave is disabled.';

  const form = document.createElement('form');
  form.className = 'assembly-bond-draft-form';
  const controls = [
    ...(editor.fullProduct().waferAssembly
      ? []
      : [['receiverId', 'Receiver ID', 'text', 'A']]),
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
  exportButton.textContent = 'Export full Assembly';
  const actions = document.createElement('div');
  actions.className = 'assembly-bond-draft-actions';
  actions.append(apply, exportButton);
  form.append(actions);
  const status = document.createElement('p');
  status.className = 'assembly-bond-draft-status';
  status.setAttribute('role', 'status');
  panel.append(header, description, form, status);
  root.append(panel);

  let busy = false;
  const sync = () => {
    const atHead = editor.currentIndex() === editor.maxIndex();
    apply.disabled = busy || !atHead || editor.maxIndex() >= 7;
    donorFile.disabled = busy || !atHead;
    exportButton.disabled = busy;
    panel.dataset.bondIndex = String(editor.currentIndex());
    if (!atHead) {
      status.textContent = 'Return to the Assembly HEAD before adding another donor.';
    }
  };

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
        ...(fields.has('receiverId')
          ? { receiverId: fields.get('receiverId').value.trim() }
          : {}),
        dx: Number(fields.get('dx').value),
        dy: Number(fields.get('dy').value),
        rotationDeg: Number(fields.get('rotationDeg').value),
        receiverFace: fields.get('receiverFace').value,
        donorFace: fields.get('donorFace').value,
      };
      status.textContent = 'Writing pre-Bond Recovery checkpoint…';
      const completed = await editor.bond(donor, request);
      status.textContent = `Bonded ${completed.operation.donorId}. Export the full Assembly to keep this edit.`;
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
      const project = editor.fullProduct();
      downloadProject(project, 'wafercad-bonded-assembly.wafercad');
      status.dataset.error = 'false';
      status.textContent = 'Full Assembly export initiated, including every source Recipe/History.';
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error?.message || String(error);
    }
  });
  sync();
  return { element: panel, sync };
}
