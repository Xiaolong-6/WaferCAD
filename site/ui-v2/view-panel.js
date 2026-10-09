// Shared presentation frame. Owns named view hosts and preserves their DOM identity.
// Scientific scene contents belong exclusively to the mounted view adapter, never this shell.
(() => {
  const { el } = window.WaferCadV2Components;
  window.createWaferCadV2ViewPanels = () => {
    const panels = new Map(), slots = new Map();
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
        const stage = holder.classList.contains('p-science')
          ? holder : holder.querySelector('.p-science');
        if (!stage) throw Error(`View ${key} must supply its scientific host`);
        stage.setAttribute('data-slot', `view.${key}.stage`);
        const overlay = el('div', { class: 'v2-view-overlays', 'data-slot': `view.${key}.overlays` });
        // Overlays are a sibling and cannot capture renderer pointer events unless opted in.
        overlay.hidden = true;
        const readout = el('div', { class: 'p-readout', 'data-slot': `view.${key}.readout` });
        const stageContainer = holder.classList.contains('p-science')
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
      if (headerTools) actionSlot.replaceChildren(headerTools);
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
})();
