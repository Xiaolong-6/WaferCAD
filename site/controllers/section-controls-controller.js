export function createSectionControlsController({
  root = document,
  getSection,
  setSection,
  getSectionEditor,
  getSectionEditEnabled,
  setSectionEditEnabledValue,
  getModel,
  xyUnitLabel,
  formatLengthField,
  manualMicron,
  renderMain,
  renderSection,
  status,
}) {
  const $ = (id) => root.getElementById(id);

  function syncInputs() {
    const unit = $('sectionCoordUnit');
    if (!unit) return;
    const section = getSection();
    unit.textContent = xyUnitLabel();
    $('sectionAx').value = formatLengthField(section.a[0]);
    $('sectionAy').value = formatLengthField(section.a[1]);
    $('sectionBx').value = formatLengthField(section.b[0]);
    $('sectionBy').value = formatLengthField(section.b[1]);
  }

  function updateFromInputs() {
    getSectionEditor()?.cancel();
    const values = ['sectionAx', 'sectionAy', 'sectionBx', 'sectionBy'].map((id) =>
      Number($(id).value),
    );
    if (values.some((value) => !Number.isFinite(value))) {
      syncInputs();
      status('A–B coordinates must be finite numbers.');
      return;
    }
    setSection({
      a: [manualMicron(values[0]), manualMicron(values[1])],
      b: [manualMicron(values[2]), manualMicron(values[3])],
    });
    renderMain();
    renderSection();
  }

  function setEditEnabled(enabled) {
    const active = Boolean(enabled);
    setSectionEditEnabledValue(active);
    const button = $('sectionEditBtn');
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    $('mainCanvas').classList.toggle('section-editing', active);
    button.textContent = active ? 'Done' : 'Drag A/B';
    button.title = active ? 'Finish editing A and B' : 'Edit existing A and B endpoints';
    getSectionEditor()?.setEnabled(active);
    renderMain();
    status(active ? 'A–B endpoint dragging enabled.' : 'A–B endpoint dragging locked.');
  }

  function setPanelVisible(visible) {
    const panel = $('sectionCoordsPanel'),
      button = $('sectionControlsBtn');
    panel.hidden = !visible;
    button.classList.toggle('active', visible);
    button.setAttribute('aria-expanded', String(visible));
    button.title = visible ? 'Close A–B controls' : 'Open A–B controls';
    if (!visible && getSectionEditEnabled()) setEditEnabled(false);
    renderMain();
  }

  function resetSection() {
    getSectionEditor()?.cancel();
    const model = getModel();
    setSection({ a: [-model.width * 0.42, 0], b: [model.width * 0.42, 0] });
    renderMain();
    renderSection();
  }

  function bind() {
    $('sectionControlsBtn').onclick = () => setPanelVisible($('sectionCoordsPanel').hidden);
    $('sectionEditBtn').onclick = () => setEditEnabled(!getSectionEditEnabled());
    for (const id of ['sectionAx', 'sectionAy', 'sectionBx', 'sectionBy']) {
      $(id).onchange = updateFromInputs;
    }
    $('resetSectionBtn').onclick = resetSection;
  }

  return { bind, syncInputs, updateFromInputs, setEditEnabled, setPanelVisible, resetSection };
}
