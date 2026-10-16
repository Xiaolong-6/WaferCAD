// M2.5 presentation shell. Owns layout, navigation mode and stable hosts only.
// All domain lifecycle and visible business state arrive through an adapter/presentation API.
(() => {
  const { el, button, divider } = window.WaferCadV2Components;
  window.createWaferCadV2Workstation = ({
    root,
    state,
    getProjectName,
    homeUrl = 'index.html',
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
    // Standalone M2 prototypes still use their original mobile header switcher.
    // Production has exactly one contextual switcher in the bottom navigation.
    const standaloneMobileReturn = !document.body.hasAttribute('data-workstation')
      ? el(
          'div',
          { class: 'p-actions p-mobile-return' },
          button('Back to results', 'return-results', 'back'),
        )
      : null;
    const topbar = el(
      'header',
      { class: 'p-topbar' },
      el('a', { class: 'p-brand', href: homeUrl, 'aria-label': 'WaferCAD home' }, 'WaferCAD'),
      slot('topbar.project', 'p-project-title', 'span'),
      standaloneMobileReturn,
      el('span', { class: 'p-review-badge' }),
    );
    const navHost = slot('navigation.primary', 'p-nav', 'nav');
    navHost.setAttribute('aria-label', 'Workspaces');
    // Stable navigation controls: shell refreshes must not drop focus or scroll position.
    // Preserve shared tooltip ownership on persistent buttons.
    const navButtons = new Map(
      registry.primaryNav.map(({ key, label, icon }) => [
        key,
        button(label, `domain:${key}`, icon, {
          'data-help': 'shell.navigation',
          'aria-pressed': 'false',
        }),
      ]),
    );
    const navLabel = el('span', { class: 'p-nav-label' }, 'WORKSPACE');
    const hideEditor = button('', 'hide-editor', 'back', {
      'aria-label': 'Collapse workflow panel',
      'data-help': 'shell.navigation',
    });
    navHost.append(navLabel, ...navButtons.values(), hideEditor);
    // Mobile uses this exact navigation host as a fixed bottom dock. Reparent
    // stable buttons instead of creating duplicate actions or domain adapters.
    const mobileEdit = button('Edit', 'show-editor', 'switchMode', {
      'aria-label': 'Edit workspace',
      'data-help': 'shell.navigation',
    });
    const mobileView = button('View', 'return-results', 'switchMode', {
      'aria-label': 'View results',
      'data-help': 'shell.navigation',
    });
    const viewButtons = new Map(
      registry.views
        .filter(({ key }) => key !== 'section')
        .map(({ key, label, icon }) => [
          key,
          button(label, `view:${key}`, icon, {
            'aria-pressed': 'false',
            'data-help': `shell.view.${key}`,
          }),
        ]),
    );
    const mobileSection = button('Section', 'mobile-section', 'section', {
      'aria-pressed': 'false',
      'data-help': 'shell.section',
    });
    // Desktop controls are separate from the stable contextual mobile dock.
    const desktopOverview = button('Overview', 'dock:overview', null, {
      'aria-pressed': 'false',
      'data-help': 'shell.overview',
    });
    const desktopViewButtons = new Map(
      registry.views.map(({ key, label, icon }) => [
        key,
        button(label, `dock:view:${key}`, icon, {
          'aria-pressed': 'false',
          'data-help': `shell.view.${key}`,
        }),
      ]),
    );
    const desktopViewbar = el(
      'div',
      { class: 'p-actions p-desktop-dock-actions' },
      desktopOverview,
      el('span', { class: 'p-viewbar-divider', 'aria-hidden': 'true' }),
      ...desktopViewButtons.values(),
    );
    const inspector = el('aside', { class: 'p-inspector', 'aria-label': 'Workflow editor' });
    const editorContent = el('div', { class: 'p-panel-content' });
    inspector.append(editorContent);
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
    separator.dataset.help = 'shell.panel.resize';
    const canvases = el('div', { class: 'p-canvases' });
    const dockEmpty = el(
      'div',
      { class: 'p-dock-empty', hidden: true },
      el('p', {}, 'No views visible'),
      button('Restore Overview', 'dock:overview', null),
    );
    canvases.append(dockEmpty);
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
      el(
        'div',
        { class: 'p-status-secondary' },
        slot('status.save', '', 'span'),
        slot('status.version', '', 'span'),
        el(
          'a',
          {
            href: 'https://github.com/Xiaolong-6/WaferCAD',
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          'GitHub',
        ),
        el(
          'a',
          {
            href: 'https://github.com/Xiaolong-6/WaferCAD/wiki',
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          'Wiki',
        ),
      ),
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
    const syncKeyboard = () => {
      const active = document.activeElement;
      const editing = active?.matches('input, select, textarea, [contenteditable="true"]');
      const occluded = window.innerHeight - (window.visualViewport?.height || window.innerHeight);
      mounted.dataset.keyboard =
        narrow() && state.mobile === 'edit' && editing && occluded > 120 ? 'open' : 'closed';
    };
    document.addEventListener('focusin', syncKeyboard);
    document.addEventListener('focusout', syncKeyboard);
    window.visualViewport?.addEventListener('resize', syncKeyboard);
    const tooltips = window.WaferCadV2TooltipController?.create({ root: document });

    // Share one measured default between initial ARIA state, drag/keyboard
    // resizing and subsequent Shell renders.
    function panelWidth() {
      if (state.panelSize) return state.panelSize;
      const measured = inspector.getBoundingClientRect().width;
      if (measured) return Math.round(measured);
      return Math.round(Math.min(460, Math.max(320, window.innerWidth * 0.27)));
    }

    function bindDividers() {
      const horizontal = state.layout === 'c';
      separator.setAttribute('aria-orientation', horizontal ? 'horizontal' : 'vertical');
      separator.setAttribute(
        'aria-valuemax',
        String(horizontal ? 380 : Math.max(240, window.innerWidth - 320)),
      );
      separator.setAttribute(
        'aria-valuenow',
        String(horizontal ? state.bottomSize || 250 : panelWidth()),
      );
      const update = (delta) => {
        const current = horizontal ? state.bottomSize || 250 : panelWidth();
        const next = Math.round(
          Math.max(
            horizontal ? 180 : 240,
            Math.min(horizontal ? 380 : Math.max(240, window.innerWidth - 320), current + delta),
          ),
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
    // Primary navigation does not depend on view or project adapters. Display
    // it immediately, including during async example and Recovery loading.
    renderNav({ selectedNavigation: state.domain || registry.primaryNav[0]?.key });

    function renderNav(info) {
      for (const [key, control] of navButtons)
        control.setAttribute('aria-pressed', String(info.selectedNavigation === key));
      for (const [key, control] of viewButtons) {
        const selected = (narrow() || state.mode === 'single') && state.view === key;
        control.setAttribute('aria-pressed', String(selected));
      }
      mobileSection.setAttribute('aria-pressed', String(state.view === 'section'));
    }
    function renderMobileNav() {
      const compact = narrow();
      const desired = compact
        ? [
            state.mobile === 'edit' ? mobileView : mobileEdit,
            ...(state.mobile === 'edit'
              ? [...navButtons.values()]
              : [...viewButtons.values(), mobileSection]),
          ]
        : [navLabel, ...navButtons.values(), hideEditor];
      navHost.setAttribute(
        'aria-label',
        compact ? (state.mobile === 'edit' ? 'Edit workspaces' : 'Views') : 'Workspaces',
      );
      // Re-rendering a view must not detach the focused navigation control.
      if (
        navHost.childNodes.length !== desired.length ||
        desired.some((control, index) => navHost.childNodes[index] !== control)
      )
        navHost.replaceChildren(...desired);
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
      const docking = !narrow() ? info.desktopLayout : null;
      if (docking) {
        stage.dataset.viewMode = 'docking';
        canvases.dataset.mode = 'docking';
        canvases.dataset.desktopDocking = 'true';
        canvases.dataset.maximized = String(Boolean(docking.maximized));
        canvases.style.gridTemplateColumns = docking.columns
          .map((value) => `minmax(0, ${value}fr)`)
          .join(' ');
        canvases.style.gridTemplateRows = docking.rows
          .map((value) => `minmax(0, ${value}fr)`)
          .join(' ');
        desktopOverview.setAttribute('aria-pressed', String(docking.overviewPressed));
        for (const [key, control] of desktopViewButtons)
          control.setAttribute('aria-pressed', String(docking.highlighted.includes(key)));
        viewbar.replaceChildren(
          ...(state.editorHidden
            ? [
                el(
                  'div',
                  { class: 'p-actions' },
                  button('Restore panel', 'expand-empty', 'process'),
                ),
              ]
            : []),
          desktopViewbar,
        );
        dockEmpty.hidden = docking.displayed.length > 0;
        const placements = new Map(docking.placements.map((entry) => [entry.view, entry]));
        for (const { key, label } of registry.views) {
          const id = `view.${key}`;
          const panel = adapters.prepare(id, canvases);
          if (!panel) throw Error(`Missing view adapter ${id}`);
          if (panel.parentNode !== canvases) canvases.append(panel);
          const placement = placements.get(key);
          panel.hidden = !placement;
          panel.style.order = '';
          panel.style.gridColumn = placement
            ? `${placement.column + 1} / span ${placement.columnSpan}`
            : '';
          panel.style.gridRow = placement ? `${placement.row + 1} / span ${placement.rowSpan}` : '';
          window.WaferCadV2PanelChrome.prepareDesktop(panel, {
            key,
            label,
            icon: registry.views.find((view) => view.key === key)?.icon,
            maximized: docking.maximized === key,
            draggable: docking.displayed.length > 1,
          });
          // Layout only: active scientific renderers retain their DOM and camera.
          // Newly displayed views render via the existing adapter onShow hook.
          if (placement) adapters.show(id, canvases);
          else adapters.hide(id);
        }
        return;
      }
      delete canvases.dataset.desktopDocking;
      canvases.style.gridTemplateColumns = '';
      canvases.style.gridTemplateRows = '';
      dockEmpty.hidden = true;
      const { mode, names } = selectedViews(info);
      stage.dataset.viewMode = mode;
      stage.dataset.splitLeft = state.splitViews[0];
      stage.dataset.splitRight = state.splitViews[1];
      canvases.dataset.mode = mode;
      canvases.dataset.maximized = String(Boolean(state.maximize));
      const modeButton = (key) => {
        const entry = registry.viewModes.find((item) => item.key === key);
        return entry
          ? button(entry.label, `mode:${key}`, null, {
              disabled: narrow() && key !== 'single',
              'aria-pressed': String(mode === key),
              'data-help': `shell.${key}`,
            })
          : null;
      };
      const viewDivider = () => el('span', { class: 'p-viewbar-divider', 'aria-hidden': 'true' });
      viewbar.replaceChildren(
        el(
          'div',
          { class: 'p-actions' },
          state.editorHidden ? button('Restore panel', 'expand-empty', 'process') : null,
          modeButton('overview'),
          viewDivider(),
          modeButton('single'),
          narrow() ? [] : [...viewButtons.values()],
          viewDivider(),
          modeButton('split'),
        ),
        el(
          'div',
          { class: 'p-actions p-section-dock-actions' },
          narrow()
            ? null
            : button('Section dock', 'section', 'section', {
                'aria-pressed': String(state.section),
                'data-help': 'shell.section',
              }),
        ),
      );
      for (const { key } of registry.views) {
        const id = `view.${key}`;
        const visible = names.includes(key) && (!narrow() || state.mobile === 'view');
        const panel = adapters.prepare(id, canvases);
        if (!panel) throw Error(`Missing view adapter ${id}`);
        if (panel.parentNode !== canvases) canvases.append(panel);
        panel.hidden = !visible;
        panel.style.order = String(visible ? names.indexOf(key) : 99);
        panel.style.gridColumn = '';
        panel.style.gridRow = '';
        window.WaferCadV2PanelChrome?.restoreDesktop(panel, key);
        const maximizeButton = panel.querySelector(`[data-action="maximize:${key}"]`);
        if (maximizeButton) {
          const maximized = state.maximize === key;
          const label = registry.views.find((view) => view.key === key).label;
          if (!maximizeButton.hasAttribute('data-help'))
            maximizeButton.title = maximized ? 'Restore view' : 'Maximize view';
          maximizeButton.setAttribute(
            'aria-label',
            `${label} ${maximized ? 'restore' : 'maximize'}`,
          );
          maximizeButton
            .querySelector('use')
            ?.setAttribute('href', `#p-icon-${maximized ? 'restore' : 'maximize'}`);
        }
        if (info.splitChoices && key !== 'section') {
          const title = panel.querySelector(`[data-slot="view.${key}.header"]`);
          const index = state.splitViews.indexOf(key);
          if (mode === 'split' && index >= 0) {
            const select = el(
              'select',
              {
                class: 'v2-split-select',
                'aria-label': `${index === 0 ? 'Left' : 'Right'} Split view`,
                'data-help': 'shell.split',
              },
              registry.views
                .filter((v) => v.key !== 'section')
                .map((v) => el('option', { value: v.key, selected: v.key === key }, v.label)),
            );
            select.onchange = () => {
              state.splitViews = window.WaferCadV2ViewState.replaceSlot(
                state.splitViews,
                index,
                select.value,
              );
              render();
            };
            title.replaceChildren(select);
          } else
            title.replaceChildren(
              el('strong', {}, registry.views.find((v) => v.key === key).label),
            );
        }
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
      navHost.hidden = !narrow() && editorHidden;
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
        if (host) host.hidden = name !== registry.subpanelOwner || sub !== mode || editorHidden;
      }
      for (const [child, owner] of Object.entries(registry.nestedPanels || {})) {
        const id = `panel.${child}`;
        const visible =
          owner === name &&
          info.visibleNestedPanels?.includes(child) &&
          !editorHidden &&
          !info.emptyInspector;
        if (visible) {
          const active = adapters.isActive(id);
          adapters.show(id, slots.get(id));
          if (active) adapters.refresh(id);
        } else adapters.hide(id);
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
    function renderVersion(info = presentation()) {
      const host = slots.get('status.version');
      const commit = info.versionCommit;
      if (!commit) {
        host.textContent = info.version || '';
        return;
      }
      host.replaceChildren(
        el(
          'a',
          {
            href: `https://github.com/Xiaolong-6/WaferCAD/commit/${commit}`,
            target: '_blank',
            rel: 'noopener noreferrer',
            title: `Open deployed commit ${commit} on GitHub`,
          },
          `commit ${commit.slice(0, 7)}`,
        ),
      );
    }
    function render(focusAction) {
      tooltips?.hide();
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
      const horizontalDivider = state.layout === 'c';
      separator.setAttribute(
        'aria-valuemax',
        String(horizontalDivider ? 380 : Math.max(240, window.innerWidth - 320)),
      );
      separator.setAttribute(
        'aria-valuenow',
        String(horizontalDivider ? state.bottomSize || 250 : panelWidth()),
      );
      slots.get('topbar.project').textContent = getProjectName();
      slots.get('topbar.project').title = getProjectName();
      topbar.querySelector('.p-review-badge').textContent = info.badge || '';
      if (standaloneMobileReturn && standaloneMobileReturn.dataset.pane !== state.mobile) {
        standaloneMobileReturn.replaceChildren(
          button(
            state.mobile === 'edit' ? 'View results' : 'Edit workspace',
            state.mobile === 'edit' ? 'return-results' : 'show-editor',
            state.mobile === 'edit' ? 'back' : 'process',
          ),
        );
        standaloneMobileReturn.dataset.pane = state.mobile;
      }
      renderNav(info);
      renderPanel(info);
      renderStage(info);
      renderMobileNav();
      syncKeyboard();
      slots.get('status.message').textContent = info.message || '';
      slots.get('status.save').textContent = info.save || '';
      renderVersion(info);
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
      renderVersion,
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
        document.removeEventListener('focusin', syncKeyboard);
        document.removeEventListener('focusout', syncKeyboard);
        window.visualViewport?.removeEventListener('resize', syncKeyboard);
        tooltips?.destroy();
        overlays.destroy();
      },
    });
  };
})();
