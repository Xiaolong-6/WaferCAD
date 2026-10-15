// Shared presentation frame. Owns named view hosts and preserves their DOM identity.
// Scientific scene contents belong exclusively to the mounted view adapter, never this shell.
(() => {
  const { el } = window.WaferCadV2Components;
  window.createWaferCadV2ViewPanels = () => {
    const panels = new Map(),
      slots = new Map();
    function update(key, attributes, ...parts) {
      let panel = panels.get(key);
      const incomingHeader = parts[0];
      const incomingStage = parts[1];
      const incomingReadout = parts[2];
      if (!panel) {
        panel = el('section', attributes);
        const header = el('header', { class: 'p-panel-head p-view-head' });
        const title = el('div', { class: 'v2-view-title', 'data-slot': `view.${key}.header` });
        const actions = el('div', { class: 'v2-view-actions', 'data-slot': `view.${key}.actions` });
        header.append(title, actions);
        const holder = incomingStage;
        const stage = holder.hasAttribute('data-v2-stage-host')
          ? holder
          : holder.querySelector('[data-v2-stage-host]');
        if (!stage) throw Error(`View ${key} must supply its scientific host`);
        stage.setAttribute('data-slot', `view.${key}.stage`);
        const overlay = el('div', {
          class: 'v2-view-overlays',
          'data-slot': `view.${key}.overlays`,
        });
        // Overlays are a sibling and cannot capture renderer pointer events unless opted in.
        overlay.hidden = true;
        const readout = el('div', { class: 'p-readout', 'data-slot': `view.${key}.readout` });
        const stageContainer = holder.hasAttribute('data-v2-stage-host')
          ? el('div', { class: 'v2-view-stage-container' }, holder, overlay)
          : holder;
        if (stageContainer === holder) stageContainer.append(overlay);
        panel.append(header, stageContainer, readout);
        panels.set(key, panel);
        slots.set(`view.${key}.header`, title);
        slots.set(`view.${key}.actions`, actions);
        slots.set(`view.${key}.stage`, stage);
        slots.set(`view.${key}.readout`, readout);
        slots.set(`view.${key}.overlays`, overlay);
      }
      for (const [name, value] of Object.entries(attributes)) panel.setAttribute(name, value);
      const headerTitle = incomingHeader?.querySelector('strong,select');
      const headerTools = incomingHeader?.querySelector('.p-toolbar');
      const titleSlot = slots.get(`view.${key}.header`);
      const actionSlot = slots.get(`view.${key}.actions`);
      const readoutSlot = slots.get(`view.${key}.readout`);
      if (headerTitle) titleSlot.replaceChildren(headerTitle);
      if (headerTools) {
        actionSlot.querySelector('.p-toolbar')?.dispatchEvent(new Event('dispose-toolbar'));
        actionSlot.replaceChildren(headerTools);
      }
      readoutSlot.textContent = incomingReadout?.textContent || '';
      return panel;
    }
    return Object.freeze({
      update,
      get: (key) => panels.get(key),
      getSlot: (name) => slots.get(name),
      getCanvas: (key) => slots.get(`view.${key}.stage`),
      entries: () => new Map(slots),
    });
  };
  // The desktop workstation owns layout decisions; shared Panel Chrome owns
  // how its titlebar represents them. Standalone and compact shells opt out.
  function prepareDesktopChrome(panel, { key, label, maximized = false, draggable = false }) {
    const title = panel.querySelector('[data-slot="view.' + key + '.header"]');
    const actions = panel.querySelector('[data-slot="view.' + key + '.actions"]');
    if (!title || !actions) return;
    title.tabIndex = draggable ? 0 : -1;
    title.setAttribute('aria-label', label + ' layout titlebar; Alt+Enter to choose Snap Layout');
    const maximize = panel.querySelector('[data-action="maximize:' + key + '"]');
    if (maximize) {
      maximize.setAttribute('aria-label', label + (maximized ? ' restore' : ' maximize'));
      maximize.querySelector('use')?.setAttribute(
        'href', '#p-icon-' + (maximized ? 'restore' : 'maximize'),
      );
      maximize.classList.add('v2-dock-maximize');
    }
    let close = actions.querySelector('[data-action="dock:close:' + key + '"]');
    if (!close) {
      close = window.WaferCadV2Components.button('', 'dock:close:' + key, 'close', {
        'aria-label': 'Close ' + label + ' view',
        title: 'Close ' + label + ' view',
      });
      close.classList.add('v2-dock-close');
      actions.append(close);
    }
    if (maximize) close.before(maximize);
  }
  function restoreDesktopChrome(panel, key) {
    const title = panel.querySelector('[data-slot="view.' + key + '.header"]');
    title?.removeAttribute('tabindex');
    title?.removeAttribute('aria-label');
    const actions = panel.querySelector('[data-slot="view.' + key + '.actions"]');
    const maximize = panel.querySelector('[data-action="maximize:' + key + '"]');
    const toolbar = actions?.querySelector('.p-toolbar');
    if (maximize && toolbar && maximize.parentNode !== toolbar) toolbar.append(maximize);
    maximize?.classList.remove('v2-dock-maximize');
  }
  window.WaferCadV2PanelChrome = Object.freeze({
    prepareDesktop: prepareDesktopChrome,
    restoreDesktop: restoreDesktopChrome,
  });
})();
