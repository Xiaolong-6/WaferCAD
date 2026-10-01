export function createSectionControlsController({
  root = document,
  getSection,
  setSection,
  getSectionEditor,
  setSectionEditEnabledValue,
  closeRoiControls = () => {},
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

  function setCreateMode(enabled) {
    const active = Boolean(enabled);
    setSectionEditEnabledValue(active);
    $('mainCanvas').classList.toggle('section-editing', active);
    getSectionEditor()?.update();
  }

  function syncPanelState() {
    const panel = $('sectionCoordsPanel'),
      button = $('sectionControlsBtn'),
      visible = !panel.hidden;
    button.classList.toggle('active', visible);
    button.setAttribute('aria-expanded', String(visible));
    button.title = visible ? 'Close Slice controls' : 'Create or edit Slice';
  }

  function setPanelVisible(visible, { create = visible } = {}) {
    const panel = $('sectionCoordsPanel');
    if (visible) closeRoiControls();
    panel.hidden = !visible;
    setCreateMode(visible && create);
    syncPanelState();
    renderMain();
  }

  function setEditEnabled(enabled) {
    // Compatibility entry point used by project load/reset. Existing Slice
    // geometry remains editable even when the creation mode is off.
    if (enabled) setPanelVisible(true, { create: true });
    else setPanelVisible(false, { create: false });
  }

  function completeCreate() {
    setCreateMode(false);
    syncPanelState();
    renderMain();
    renderSection();
    status('Slice created. Drag A/B or the line itself to adjust it.');
  }

  function cancelCreate() {
    setCreateMode(false);
    syncPanelState();
    renderMain();
  }

  function bind() {
    $('sectionControlsBtn').onclick = () => {
      const panel = $('sectionCoordsPanel');
      setPanelVisible(panel.hidden, { create: panel.hidden });
    };
    for (const id of ['sectionAx', 'sectionAy', 'sectionBx', 'sectionBy']) {
      $(id).onchange = updateFromInputs;
    }
    syncPanelState();
  }

  return {
    bind,
    syncInputs,
    updateFromInputs,
    setEditEnabled,
    setPanelVisible,
    setCreateMode,
    completeCreate,
    cancelCreate,
  };
}
