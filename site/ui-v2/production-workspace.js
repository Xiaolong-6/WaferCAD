// Production-safe M2.5 shell preview. No fixtures, mock data, transactions or controllers.
// M3 will mount real domain and renderer adapters into the already stable named slots.
(() => {
  window.WaferCadV2Icons.installSprite();
  const root = document.getElementById('app-root');
  const { el } = window.WaferCadV2Components;
  const viewState = window.WaferCadV2ViewState;
  const registry = window.WaferCadV2ShellRegistry.defaults;
  const remembered = viewState.preferredMode(
    viewState.viewportWidth(window),
    viewState.readMode(window),
  );
  const state = {
    layout: 'a',
    font: 'inter',
    domain: 'project',
    mode: ['overview', 'split'].includes(remembered) ? remembered : 'single',
    view: viewState.singles.includes(remembered) ? remembered : 'main',
    splitViews: viewState.readSplit(window),
    section: true,
    maximize: null,
    mobile: 'edit',
  };
  const views = window.createWaferCadV2ViewPanels();
  const adapters = window.WaferCadV2DomainAdapters.create();
  // The shell registers stable slots. These adapters are placeholders, explicitly not product features.
  for (const id of registry.panels
    .map((key) => `panel.${key}`)
    .concat(registry.processModes.map((key) => `panel.process.${key}`))) {
    adapters.register(id, {
      mount(host) {
        host.dataset.adapter = 'unconnected';
        return host;
      },
      onShow(host) {
        const content = host.querySelector(':scope > [data-slot-content]');
        if (content && !content.childNodes.length)
          content.append(el('p', { class: 'p-aux' }, 'This workspace is not available yet.'));
      },
      onHide() {},
      destroy() {},
    });
  }
  for (const { key } of registry.views) {
    adapters.register(`view.${key}`, {
      mount(host) {
        const panel = views.update(
          key,
          {
            class: 'p-view',
            id: `${key}Panel`,
            'data-view': key,
          },
          el(
            'header',
            { class: 'p-panel-head' },
            el('strong', {}, key),
            el('div', { class: 'p-toolbar' }),
          ),
          el(
            'div',
            { class: 'p-science', 'data-science': key, 'data-v2-stage-host': '' },
            el('span', { class: 'p-aux' }, 'This view is not available yet.'),
          ),
          el('div', { class: 'p-readout' }, ''),
        );
        host.append(panel);
        return panel;
      },
      onShow() {},
      onHide() {},
      destroy() {},
    });
  }
  const shell = window.createWaferCadV2Workstation({
    root,
    state,
    registry,
    adapters,
    getProjectName: () => 'Untitled',
    homeUrl: '../index.html',
    presentation: () => ({
      selectedNavigation: state.domain,
      selectedPanel: state.domain,
      selectedSubpanel: 'step',
      editorHidden: Boolean(state.editorHidden),
      message: 'Preview',
      save: 'Autosave off',
      version: '',
    }),
  });
  function render() {
    shell.render();
  }
  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const [kind, value] = action.split(':');
    if (kind === 'domain' && registry.primaryNav.some((item) => item.key === value)) {
      state.domain = value;
      state.editorHidden = false;
      state.mobile = 'edit';
    } else if (kind === 'view') {
      state.view = value;
      state.mode = 'single';
      viewState.remember(window, value, state.splitViews);
    } else if (kind === 'mode') {
      state.mode = value;
      viewState.remember(window, value, state.splitViews);
    } else if (kind === 'section') state.section = !state.section;
    else if (kind === 'mobile-section') state.view = 'section';
    else if (kind === 'hide-editor') state.editorHidden = true;
    else if (kind === 'expand-empty' || kind === 'show-editor') state.editorHidden = false;
    else if (kind === 'return-results') state.mobile = 'view';
    render();
  });
  render();
  window.WaferCadV2ProductionShell = Object.freeze({
    getSlot: shell.getSlot,
    adapters,
    render,
    destroy: shell.destroy,
  });
})();
