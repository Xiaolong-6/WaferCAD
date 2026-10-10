// Experimental M3 D1 bridge: one *real* app.js bootstrap, native view/canvas nodes.
// Does not replace the mock app-v2.html or claim product-domain migration.
// Remove this bridge only after the production route has its full controller adapter.
(() => {
  const root = document.getElementById('app-root');
  const contract = document.getElementById('v2-legacy-contract');
  const registry = window.WaferCadV2ShellRegistry.defaults;
  const viewState = window.WaferCadV2ViewState;
  const { el } = window.WaferCadV2Components;
  const nativeIds = Object.freeze({
    main: ['mainPanel', 'mainCanvas', 'mainCoords'],
    mask: ['maskPanel', 'maskCanvas', 'maskCoords'],
    three: ['threePanel', 'threeHost', 'threeStats'],
    section: ['sectionPanel', 'sectionCanvas', 'sectionRange'],
  });
  const state = {
    layout: 'a',
    font: 'inter',
    domain: 'project',
    mode: 'single',
    view: 'main',
    splitViews: viewState.readSplit(window),
    section: true,
    maximize: null,
    mobile: 'view',
  };
  const mode = viewState.preferredMode(viewState.viewportWidth(window), viewState.readMode(window));
  state.mode = ['overview', 'split'].includes(mode) ? mode : 'single';
  state.view = viewState.singles.includes(mode) ? mode : 'main';

  let shell;
  let renderSerial = 0;
  let destroyed = false;
  const nativeStages = new Map();
  const livePanels = new Map();

  const notifyResize = () => {
    const serial = ++renderSerial;
    requestAnimationFrame(() => {
      if (!destroyed && serial === renderSerial) {
        window.dispatchEvent(new Event('resize'));
      }
    });
  };

  function render() {
    shell.render();
    // Split selectors are view *layout* controls; they never create a second canvas.
    const bar = root.querySelector('.p-viewbar');
    bar?.querySelector('.v2-real-split')?.remove();
    if (state.mode === 'split' && !viewState.compact(window) && !state.maximize && bar) {
      const row = el('div', { class: 'p-actions v2-real-split' });
      for (const [index, label] of ['Left', 'Right'].entries()) {
        const select = el('select', {
          class: 'v2-real-split-select',
          'data-key': index === 0 ? 'split-left' : 'split-right',
          'aria-label': `${label} split view`,
        });
        for (const key of viewState.singles) {
          const option = el(
            'option',
            { value: key },
            key === 'three' ? '3D' : key[0].toUpperCase() + key.slice(1),
          );
          select.append(option);
        }
        select.value = state.splitViews[index];
        row.append(el('label', {}, label + ' ', select));
      }
      bar.append(row);
    }
    for (const [key, panel] of livePanels) {
      const button = panel.querySelector('.view-max-btn');
      if (!button) continue;
      const maximized = state.maximize === key;
      button.textContent = maximized ? 'Restore' : 'Max';
      button.setAttribute('aria-pressed', String(maximized));
      button.setAttribute(
        'aria-label',
        `${maximized ? 'Restore' : 'Maximize'} ${key === 'three' ? '3D' : key} view`,
      );
    }
    notifyResize();
  }

  function attachNativeContract(source) {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    if (!doc.querySelector('#mainCanvas') || !doc.querySelector('#threeHost')) {
      throw Error('Legacy view contract is missing real scientific hosts.');
    }
    // Parsing is inert; do not import legacy scripts, boot handlers or importmaps.
    for (const node of doc.body.children) {
      if (node.tagName === 'SCRIPT') continue;
      contract.append(document.importNode(node, true));
    }
    for (const [key, [panelId, stageId]] of Object.entries(nativeIds)) {
      const panel = document.getElementById(panelId);
      const stage = document.getElementById(stageId);
      if (!panel || !stage || !panel.contains(stage))
        throw Error(`Real ${key} view DOM contract is incomplete.`);
      nativeStages.set(key, stage);
      livePanels.set(key, panel);
    }
  }

  function buildShell() {
    window.WaferCadV2Icons.installSprite();
    const adapters = window.WaferCadV2DomainAdapters.create();
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
          if (content && !content.firstChild)
            content.append(el('p', { class: 'p-aux' }, 'This domain is not wired in D1.'));
        },
        onHide() {},
        destroy() {},
      });
    }
    for (const [key, [panelId, stageId, readoutId]] of Object.entries(nativeIds)) {
      adapters.register(`view.${key}`, {
        mount(host) {
          const panel = document.getElementById(panelId);
          const stage = document.getElementById(stageId);
          const header = panel.querySelector('.view-head');
          const tools = panel.querySelector('.view-tools');
          if (!header || !tools) throw Error(`Real ${key} toolbar missing.`);
          panel.classList.add('p-view', 'v2-real-view');
          panel.dataset.view = key;
          header.classList.add('p-panel-head', 'p-view-head');
          header
            .querySelector(':scope > div:first-child')
            ?.setAttribute('data-slot', `view.${key}.header`);
          tools.dataset.slot = `view.${key}.actions`;
          for (const control of header.querySelectorAll('.mini-btn')) {
            control.classList.add('wc-button');
            control.dataset.size = 'sm';
          }
          for (const details of header.querySelectorAll('details')) {
            const summary = details.querySelector(':scope > summary');
            if (!summary) continue;
            summary.setAttribute('aria-expanded', String(details.open));
            details.addEventListener('toggle', () =>
              summary.setAttribute('aria-expanded', String(details.open)),
            );
            summary.addEventListener('keydown', (event) => {
              if (event.key !== 'ArrowDown') return;
              event.preventDefault();
              details.open = true;
              queueMicrotask(() =>
                [...details.querySelectorAll('button, input, select, summary')]
                  .find((node) => node !== summary && node.checkVisibility() && !node.disabled)
                  ?.focus(),
              );
            });
            details.addEventListener('keydown', (event) => {
              if (event.key !== 'Escape') return;
              const owner = details.closest('.view-more-control') || details;
              owner.open = false;
              owner.querySelector(':scope > summary')?.focus({ preventScroll: true });
            });
          }
          stage.dataset.slot = `view.${key}.stage`;
          const readout = document.getElementById(readoutId);
          if (readout && panel.contains(readout)) readout.dataset.slot = `view.${key}.readout`;
          panel.append(
            el('div', {
              class: 'v2-real-overlays',
              'data-slot': `view.${key}.overlays`,
              hidden: true,
            }),
          );
          // Native Section and ROI overlays stay attached to their original view.
          host.append(panel);
          return panel;
        },
        onShow() {
          notifyResize();
        },
        onHide() {},
        destroy() {},
      });
    }
    shell = window.createWaferCadV2Workstation({
      root,
      state,
      registry,
      adapters,
      getProjectName: () => document.getElementById('projectNameInput')?.value || 'Untitled',
      homeUrl: './index.html',
      presentation: () => ({
        selectedNavigation: state.domain,
        selectedPanel: state.domain,
        selectedSubpanel: 'step',
        editorHidden: Boolean(state.editorHidden),
        message: 'Experimental D1 · real views',
        save: 'Other workspaces not connected',
      }),
    });
    render();
  }

  function verifyNativeIdentity() {
    return (
      nativeStages.size === 4 &&
      [...nativeStages].every(
        ([key, stage]) =>
          stage.isConnected &&
          document.getElementById(nativeIds[key][1]) === stage &&
          shell.getSlot(`view.${key}.stage`) === stage,
      ) &&
      new Set([...nativeStages.values()]).size === 4
    );
  }

  function handleClick(event) {
    const max = event.target.closest('.view-max-btn');
    if (max && root.contains(max)) {
      event.preventDefault();
      const key = Object.keys(nativeIds).find(
        (item) => nativeIds[item][0] === max.dataset.viewPanel,
      );
      if (!key) return;
      state.maximize = state.maximize === key ? null : key;
      render();
      return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const [kind, value] = action.split(':');
    if (kind === 'domain' && registry.primaryNav.some((item) => item.key === value)) {
      state.domain = value;
      state.editorHidden = false;
      state.mobile = 'edit';
    } else if (kind === 'view' && viewState.singles.includes(value)) {
      state.view = value;
      state.mode = 'single';
      state.maximize = null;
      viewState.remember(window, state.view, state.splitViews);
    } else if (kind === 'mode' && registry.viewModes.some((item) => item.key === value)) {
      state.mode = value;
      state.maximize = null;
      viewState.remember(window, value === 'single' ? state.view : value, state.splitViews);
    } else if (kind === 'section') state.section = !state.section;
    else if (kind === 'mobile-section') {
      state.view = 'section';
      state.mode = 'single';
      state.maximize = null;
    } else if (kind === 'hide-editor') state.editorHidden = true;
    else if (kind === 'expand-empty' || kind === 'show-editor') state.editorHidden = false;
    else if (kind === 'return-results') state.mobile = 'view';
    else return;
    render();
  }

  function handleChange(event) {
    if (!['split-left', 'split-right'].includes(event.target.dataset.key)) return;
    const slot = event.target.dataset.key.slice(6);
    state.splitViews = viewState.replaceSlot(state.splitViews, slot, event.target.value);
    viewState.remember(window, 'split', state.splitViews);
    render();
    root.querySelector(`[data-key="split-${slot}"]`)?.focus({ preventScroll: true });
  }

  async function loadLegacyModule() {
    // Keep the actual app.js dependency graph; no second science or IO implementation.
    const vendor = document.createElement('script');
    vendor.src = './vendor/polygon-clipping.umd.js';
    await new Promise((resolve, reject) => {
      vendor.onload = resolve;
      vendor.onerror = () => reject(Error('Failed to load polygon-clipping.'));
      document.head.append(vendor);
    });
    await import('../app.js');
    if (document.documentElement.dataset.appReady !== 'true')
      throw Error('Real application bootstrap never reached appReady.');
    if (!verifyNativeIdentity())
      throw Error('A native scientific stage was replaced during bootstrap.');
    document.body.dataset.ready = 'true';
    window.WaferCadV2RealBridge.ready = true;
    render();
  }

  async function start() {
    const response = await fetch('./app.html', { cache: 'no-store' });
    if (!response.ok) throw Error(`Unable to load real view contract: HTTP ${response.status}`);
    attachNativeContract(await response.text());
    buildShell();
    if (!verifyNativeIdentity())
      throw Error('Real view host identity failed before controller bind.');
    window.WaferCadV2RealBridge = {
      ready: false,
      workstationController: Object.freeze({ bind() {} }),
      openProcessPanel: () => {
        state.domain = 'process';
        render();
      },
      verifyNativeIdentity,
      getSlot: (name) => shell.getSlot(name),
      render,
      destroy: () => {
        destroyed = true;
        shell.destroy();
      },
    };
    root.addEventListener('click', handleClick);
    root.addEventListener('change', handleChange);
    let compactBefore = viewState.compact(window);
    window.addEventListener('resize', () => {
      // The bridge dispatches resize for the native renderer. Do not recurse.
      const compactAfter = viewState.compact(window);
      if (!destroyed && compactAfter !== compactBefore) {
        compactBefore = compactAfter;
        render();
      }
    });
    await loadLegacyModule();
  }

  start().catch((error) => {
    console.error('WaferCAD D1 real-view bootstrap:', error);
    document.body.dataset.ready = 'error';
    if (shell) shell.destroy();
    root.replaceChildren(
      el(
        'p',
        { role: 'alert', class: 'p-aux' },
        `D1 real views could not start: ${error.message}. Open app.html for the production workspace.`,
      ),
    );
  });
})();
