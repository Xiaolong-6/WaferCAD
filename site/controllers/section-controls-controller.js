export function createSectionControlsController({
  root = document,
  getSection,
  setSection,
  getSectionEditor,
  setSectionEditEnabledValue,
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
    const panel = $('sectionCoordsPanel'),
      button = $('sectionControlsBtn');
    setSectionEditEnabledValue(active);
    panel.hidden = !active;
    button.classList.toggle('active', active);
    button.setAttribute('aria-expanded', String(active));
    button.title = active ? 'Close Slice controls' : 'Open Slice controls';
    $('mainCanvas').classList.toggle('section-editing', active);
    getSectionEditor()?.setEnabled(active);
    renderMain();
    status(active ? 'A–B endpoint dragging enabled.' : 'A–B endpoint dragging locked.');
  }

  function setPanelVisible(visible) {
    setEditEnabled(visible);
  }

  function bind() {
    $('sectionControlsBtn').onclick = () => setPanelVisible($('sectionCoordsPanel').hidden);
    for (const id of ['sectionAx', 'sectionAy', 'sectionBx', 'sectionBy']) {
      $(id).onchange = updateFromInputs;
    }
  }

  return { bind, syncInputs, updateFromInputs, setEditEnabled, setPanelVisible };
}
