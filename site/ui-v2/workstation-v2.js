// M2.5 presentation shell. Owns layout, navigation mode and stable hosts only.
// All domain lifecycle and visible business state arrive through an adapter/presentation API.
(() => {
  const { el, button, divider } = window.WaferCadV2Components;
  window.createWaferCadV2Workstation = ({
    root,
    state,
    getProjectName,
    registry = window.WaferCadV2ShellRegistry.defaults,
    adapters = window.WaferCadV2DomainAdapters.create(),
    presentation = () => ({}),
  }) => {
    const slots = new Map();
    const narrow = () => window.WaferCadV2ViewState.compact(window);
    const slot = (name, cls = '', tag = 'div') => {
      const node = el(tag, { class: cls, 'data-slot': name });
      slots.set(name, node);
      return node;
    };
    let mounted,
      activeAdapter = null;
    const topbar = el(
      'header',
      { class: 'p-topbar' },
      el('span', { class: 'p-brand' }, 'WaferCAD'),
      slot('topbar.project', 'p-project-title', 'span'),
      el(
        'div',
        { class: 'p-actions p-mobile-return' },
        button('Back to results', 'return-results', 'back'),
      ),
      el('span', { class: 'p-review-badge' }),
    );
    const navHost = slot('navigation.primary', 'p-nav', 'nav');
    navHost.setAttribute('aria-label', 'Workspaces');
    const inspector = el('aside', { class: 'p-inspector', 'aria-label': 'Workflow editor' });
    const inspectorTitle = el('div', { class: 'p-panel-shell-header p-panel-head' });
    const editorContent = el('div', { class: 'p-panel-content' });
    inspector.append(inspectorTitle, editorContent);
    for (const id of registry.panels) {
      const host = slot(`panel.${id}`, 'v2-panel-host', 'section');
      const content = el('div', { 'data-slot-content': '' });
      host.append(content);
      if (id === 'process') {
        for (const mode of registry.processModes) {
          const nested = slot(`panel.process.${mode}`, 'v2-panel-subhost', 'section');
          nested.append(el('div', { 'data-slot-content': '' }));
          host.append(nested);
        }
      }
      editorContent.append(host);
    }
    // A base editor is a second-level named host under Project, not a fifth primary nav item.
    for (const [child, parent] of Object.entries(registry.nestedPanels || {})) {
      const nested = slots.get(`panel.${child}`),
        owner = slots.get(`panel.${parent}`);
      if (nested && owner) owner.append(nested);
    }
    const emptyStrip = el(
      'div',
      { class: 'p-empty-strip', hidden: true },
      el('span', { class: 'p-aux' }, 'No items to inspect'),
      button('Inspect', 'expand-empty', 'process'),
    );
    const separator = divider(false);
    const canvases = el('div', { class: 'p-canvases' });
    const viewbar = el('div', { class: 'p-viewbar' });
    const stage = el(
      'main',
      { class: 'p-stage', 'aria-label': 'Results canvas' },
      viewbar,
      canvases,
    );
    const body = el('div', { class: 'p-body' }, navHost, inspector, emptyStrip, separator, stage);
    const status = el(
      'footer',
      { class: 'p-status', role: 'status', 'aria-live': 'polite' },
      slot('status.message', '', 'span'),
      slot('status.save', '', 'span'),
      slot('status.version', '', 'span'),
    );
    const portals = {
      popover: slot('portal.popover', 'v2-popover-portal'),
      dialog: slot('portal.dialog', 'v2-dialog-portal'),
      toast: slot('portal.toast', 'v2-toast-portal'),
    };
    const overlays = window.WaferCadV2Overlays.create({ root, portals });
    window.WaferCadV2ActiveOverlays = overlays;
    const workbench = el(
      'div',
      { class: 'p-workbench', 'data-layout': state.layout },
      topbar,
      body,
      status,
      ...Object.values(portals),
    );
    root.replaceChildren(workbench);
    mounted = workbench;

    function bindDividers() {
      const horizontal = state.layout === 'c';
      separator.setAttribute('aria-orientation', horizontal ? 'horizontal' : 'vertical');
      const update = (delta) => {
        const current = horizontal
          ? state.bottomSize || 250
          : state.panelSize || (window.innerWidth <= 1180 ? 270 : 300);
        const next = Math.round(
          Math.max(horizontal ? 180 : 240, Math.min(horizontal ? 380 : 400, current + delta)),
        );
        if (horizontal) state.bottomSize = next;
        else state.panelSize = next;
        mounted.style.setProperty(horizontal ? '--p-bottom' : '--p-panel', `${next}px`);
        separator.setAttribute('aria-valuenow', String(next));
      };
      let previous;
      separator.addEventListener('pointerdown', (event) => {
        previous = horizontal ? event.clientY : event.clientX;
        separator.setPointerCapture(event.pointerId);
      });
      separator.addEventListener('pointermove', (event) => {
        if (previous == null) return;
        const next = horizontal ? event.clientY : event.clientX;
        update((next - previous) * (horizontal || state.layout === 'b' ? -1 : 1));
        previous = next;
      });
      const release = () => {
        previous = null;
      };
      separator.addEventListener('pointerup', release);
      separator.addEventListener('pointercancel', release);
      separator.addEventListener('keydown', (event) => {
        const dir = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[event.key];
        if (dir) {
          event.preventDefault();
          update(dir * 8);
        }
      });
    }
    bindDividers();

    function renderNav(info) {
      navHost.replaceChildren(
        el('span', { class: 'p-nav-label' }, 'WORKSPACE'),
        ...registry.primaryNav.map(({ key, label, icon }) =>
          button(label, `domain:${key}`, icon, {
            'aria-pressed': String(info.selectedNavigation === key),
          }),
        ),
        button('', 'hide-editor', 'close', {
          'aria-label': 'Hide navigation and workflow editor',
        }),
      );
    }
    function selectedViews(info) {
      const mode = narrow() ? 'single' : state.mode;
      let names =
        mode === 'overview'
          ? registry.views
              .map((item) => item.key)
              .filter((key) => key !== 'section' || state.section)
          : mode === 'split'
            ? [...state.splitViews, ...(state.section ? ['section'] : [])]
            : [state.view];
      if (mode === 'single' && state.section && !narrow()) names.push('section');
      if (state.maximize) names = [state.maximize];
      return { mode, names: [...new Set(names)] };
    }
    function renderStage(info) {
      const { mode, names } = selectedViews(info);
      stage.dataset.viewMode = mode;
      stage.dataset.splitLeft = state.splitViews[0];
      stage.dataset.splitRight = state.splitViews[1];
      canvases.dataset.mode = mode;
      canvases.dataset.maximized = String(Boolean(state.maximize));
      viewbar.replaceChildren(
        el(
          'div',
          { class: 'p-actions' },
          state.editorHidden ? button('Restore panel', 'expand-empty', 'process') : null,
          registry.viewModes.map(({ key, label }) =>
            button(label, `mode:${key}`, null, {
              disabled: narrow() && key !== 'single',
              'aria-pressed': String(mode === key),
              title: narrow() ? 'Tablet / phone use Single' : '',
            }),
          ),
        ),
        el(
          'div',
          { class: 'p-actions' },
          registry.views
            .filter(({ key }) => key !== 'section')
            .map(({ key, label, icon }) =>
              button(label, `view:${key}`, icon, {
                'aria-pressed': String(mode === 'single' && state.view === key),
              }),
            ),
          narrow()
            ? button('Section', 'mobile-section', 'section', {
                'aria-pressed': String(state.view === 'section'),
              })
            : button('Section dock', 'section', 'section', {
                'aria-pressed': String(state.section),
              }),
        ),
      );
      for (const { key } of registry.views) {
        const id = `view.${key}`;
        const visible = names.includes(key);
        const panel = adapters.prepare(id, canvases);
        if (!panel) throw Error(`Missing view adapter ${id}`);
        if (panel.parentNode !== canvases) canvases.append(panel);
        panel.hidden = !visible;
        panel.style.order = String(visible ? names.indexOf(key) : 99);
        if (visible) {
          const active = adapters.isActive(id);
          adapters.show(id, canvases);
          if (active) adapters.refresh(id);
        } else adapters.hide(id);
      }
    }
    function renderPanel(info) {
      const name = info.selectedPanel || registry.primaryNav[0]?.panel;
      const mode = info.selectedSubpanel || registry.processModes[0];
      const editorHidden = Boolean(info.editorHidden);
      navHost.hidden = editorHidden;
      inspector.hidden = editorHidden || Boolean(info.emptyInspector);
      separator.hidden = inspector.hidden;
      emptyStrip.hidden = !info.emptyInspector || editorHidden;
      for (const panel of registry.panels) {
        const host = slots.get(`panel.${panel}`);
        if (host) host.hidden = panel !== name || editorHidden;
        if (host && registry.nestedPanels?.[panel] === name)
          host.hidden = !info.visibleNestedPanels?.includes(panel);
      }
      for (const sub of registry.processModes) {
        const host = slots.get(`panel.process.${sub}`);
        if (host) host.hidden = sub !== mode;
      }
      if (info.emptyInspector || editorHidden) {
        if (activeAdapter) adapters.hide(activeAdapter);
        activeAdapter = null;
        return;
      }
      const adapterKey =
        name === registry.subpanelOwner
          ? `panel.${registry.subpanelOwner}.${mode}`
          : `panel.${name}`;
      const switched = adapterKey !== activeAdapter;
      if (switched) {
        if (activeAdapter) adapters.hide(activeAdapter);
        adapters.show(adapterKey, slots.get(adapterKey));
        activeAdapter = adapterKey;
      } else adapters.refresh(adapterKey);
    }
    function render(focusAction) {
      const info = presentation();
      const preserve = Boolean(info.preserveScroll);
      const selectors = info.scrollSelectors || ['.p-panel-content'];
      const scroll = preserve
        ? selectors.map((selector) => {
            const node = root.querySelector(selector);
            return [selector, node?.scrollTop || 0, node?.scrollLeft || 0];
          })
        : [];
      document.documentElement.dataset.font = state.font;
      mounted.dataset.layout = state.layout;
      mounted.dataset.empty = String(Boolean(info.emptyInspector));
      mounted.dataset.hidden = String(Boolean(info.editorHidden));
      mounted.dataset.mobile = state.mobile;
      if (state.panelSize) mounted.style.setProperty('--p-panel', `${state.panelSize}px`);
      if (state.bottomSize) mounted.style.setProperty('--p-bottom', `${state.bottomSize}px`);
      slots.get('topbar.project').textContent = getProjectName();
      slots.get('topbar.project').title = getProjectName();
      topbar.querySelector('.p-review-badge').textContent = info.badge || '';
      const mobile = topbar.querySelector('.p-mobile-return');
      mobile.replaceChildren(
        button(
          state.mobile === 'edit' ? 'Back to results' : 'Edit workspace',
          state.mobile === 'edit' ? 'return-results' : 'show-editor',
          state.mobile === 'edit' ? 'back' : 'process',
        ),
      );
      renderNav(info);
      renderPanel(info);
      renderStage(info);
      slots.get('status.message').textContent = info.message || '';
      slots.get('status.save').textContent = info.save || '';
      slots.get('status.version').textContent = info.version || '';
      if (focusAction)
        [...root.querySelectorAll('[data-action]')]
          .find((node) => node.dataset.action === focusAction)
          ?.focus({ preventScroll: true });
      for (const [selector, top, left] of scroll) {
        const node = root.querySelector(selector);
        if (node) {
          node.scrollTop = top;
          node.scrollLeft = left;
        }
      }
    }
    return Object.freeze({
      render,
      overlays,
      adapters,
      getRoot: () => mounted,
      getSlot: (name) => slots.get(name) || root.querySelector(`[data-slot="${name}"]`),
      slots: () =>
        new Map([
          ...slots,
          ...[...root.querySelectorAll('[data-slot]')].map((node) => [node.dataset.slot, node]),
        ]),
      destroy: () => {
        adapters.destroy();
        overlays.destroy();
      },
    });
  };
})();
