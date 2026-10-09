// UI-only assembly owner. Domain UI and view content enter through explicit slots.
// Does not read fixtures, Recipe, History, workers, or project storage.
(() => {
  const { el, button, divider } = window.WaferCadV2Components;
  window.createWaferCadV2Workstation = ({
    root,
    state,
    getProjectName,
    renderEditor,
    renderView,
    renderGlobalControls = () => null,
  }) => {
    const narrow = () => window.WaferCadV2ViewState.compact(window);
    let mounted;
    function nav() {
      const domains = ['project', 'mask', 'process', 'history'];
      return el(
        'nav',
        { class: 'p-nav', 'aria-label': 'Workspaces' },
        el('span', { class: 'p-nav-label' }, 'WORKSPACE'),
        domains.map((name) =>
          button(name[0].toUpperCase() + name.slice(1), `domain:${name}`, name, {
            'aria-pressed': String(
              state.domain === name ||
                (name === 'process' &&
                  state.placement === 'process' &&
                  ['recipe', 'code'].includes(state.domain)),
            ),
          }),
        ),
        button('Hide', 'hide-editor', 'close', {
          'aria-label': 'Hide navigation and workflow editor',
        }),
        el('span', { class: 'p-nav-label' }, 'Text labels stay visible'),
      );
    }
    function stage() {
      const mode = narrow() ? 'single' : state.mode;
      let names =
        mode === 'overview'
          ? ['main', 'mask', 'three', ...(state.section ? ['section'] : [])]
          : mode === 'split'
            ? [...state.splitViews, ...(state.section ? ['section'] : [])]
            : [state.view];
      if (mode === 'single' && state.section && !narrow()) names.push('section');
      if (state.maximize) names = [state.maximize];
      return el(
        'main',
        {
          class: 'p-stage',
          'aria-label': 'Results canvas',
          'data-view-mode': mode,
          'data-split-left': state.splitViews[0],
          'data-split-right': state.splitViews[1],
        },
        el(
          'div',
          { class: 'p-viewbar' },
          el(
            'div',
            { class: 'p-actions' },
            state.editorHidden ? button('Restore panel', 'expand-empty', 'history') : null,
            ['single', 'overview', 'split'].map((m) =>
              button(m[0].toUpperCase() + m.slice(1), `mode:${m}`, null, {
                disabled: narrow() && m !== 'single',
                'aria-pressed': String(mode === m),
                title: narrow() ? 'Tablet / phone use Single' : '',
              }),
            ),
          ),
          el(
            'div',
            { class: 'p-actions' },
            ['main', 'mask', 'three'].map((v) =>
              button(
                v === 'three' ? '3D' : v[0].toUpperCase() + v.slice(1),
                `view:${v}`,
                v === 'three' ? 'cube' : v,
                { 'aria-pressed': String(mode === 'single' && state.view === v) },
              ),
            ),
            ...(!narrow()
              ? [
                  button('Section dock', 'section', 'section', {
                    'aria-pressed': String(state.section),
                  }),
                ]
              : []),
            ...(narrow()
              ? [
                  button('Section', 'mobile-section', 'section', {
                    'aria-pressed': String(state.view === 'section'),
                  }),
                ]
              : []),
          ),
        ),
        el(
          'div',
          {
            class: 'p-canvases',
            'data-mode': mode,
            'data-maximized': String(Boolean(state.maximize)),
          },
          names.map(renderView),
        ),
      );
    }
    function bindDividers() {
      const node = root.querySelector('.p-divider');
      if (!node) return;
      const horizontal = state.layout === 'c';
      const update = (delta) => {
        const current = horizontal
          ? state.bottomSize || 250
          : state.panelSize || (window.innerWidth <= 1180 ? 270 : 300);
        const next = Math.round(
          Math.max(horizontal ? 180 : 240, Math.min(horizontal ? 380 : 400, current + delta)),
        );
        if (horizontal) state.bottomSize = next;
        else state.panelSize = next;
        root
          .querySelector('.p-workbench')
          .style.setProperty(horizontal ? '--p-bottom' : '--p-panel', `${next}px`);
        node.setAttribute('aria-valuenow', String(next));
      };
      let previous;
      node.addEventListener('pointerdown', (event) => {
        previous = horizontal ? event.clientY : event.clientX;
        node.setPointerCapture(event.pointerId);
      });
      node.addEventListener('pointermove', (event) => {
        if (previous == null) return;
        const next = horizontal ? event.clientY : event.clientX;
        update((next - previous) * (horizontal || state.layout === 'b' ? -1 : 1));
        previous = next;
      });
      const release = () => {
        previous = null;
      };
      node.addEventListener('pointerup', release);
      node.addEventListener('pointercancel', release);
      node.addEventListener('keydown', (event) => {
        const direction = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 1, ArrowDown: -1 }[event.key];
        if (direction) {
          event.preventDefault();
          update(direction * 8);
        }
      });
    }
    function render(focusAction) {
      const keepHistoryScroll = focusAction?.startsWith('history:');
      const scrollPositions = keepHistoryScroll
        ? ['.p-panel-content', '[data-history-list]', '[data-variant-list]'].map((selector) => {
            const node = root.querySelector(selector);
            return { selector, top: node?.scrollTop ?? 0, left: node?.scrollLeft ?? 0 };
          })
        : [];
      const pageScroll = { x: window.scrollX, y: window.scrollY };
      document.documentElement.dataset.font = state.font;
      const emptyHistory = state.domain === 'history' && state.empty && !state.emptyExpanded;
      const isEmpty = emptyHistory || state.editorHidden;
      const body = el(
        'div',
        { class: 'p-body' },
        state.editorHidden ? null : nav(),
        state.editorHidden
          ? null
          : isEmpty
            ? el(
                'div',
                { class: 'p-empty-strip' },
                state.editorHidden
                  ? null
                  : el(
                      'span',
                      { class: 'p-aux' },
                      emptyHistory
                        ? 'History empty · real model retained. No blank inspector column.'
                        : 'Workflow hidden · draft retained.',
                    ),
                button(state.editorHidden ? 'Restore panel' : 'Inspect', 'expand-empty', 'history'),
              )
            : renderEditor(),
        isEmpty ? null : divider(state.layout === 'c'),
        stage(),
      );
      const workbench = el(
        'div',
        {
          class: 'p-workbench',
          'data-layout': state.layout,
          'data-empty': String(isEmpty),
          'data-hidden': String(Boolean(state.editorHidden)),
          'data-mobile': state.mobile,
        },
        el(
          'header',
          { class: 'p-topbar' },
          el('span', { class: 'p-brand' }, 'WaferCAD'),
          el('span', { class: 'p-project-title', title: getProjectName() }, getProjectName()),
          renderGlobalControls(),
          el(
            'div',
            { class: 'p-actions p-mobile-return' },
            button(
              state.mobile === 'edit' ? 'Back to results' : 'Edit workspace',
              state.mobile === 'edit' ? 'return-results' : 'show-editor',
              state.mobile === 'edit' ? 'back' : 'process',
            ),
          ),
          el(
            'span',
            { class: 'p-review-badge' },
            state.dirty ? 'DRAFT · source unchanged' : 'READ-ONLY SOURCE',
          ),
        ),
        body,
        el('footer', { class: 'p-status', role: 'status', 'aria-live': 'polite' }, state.message),
      );
      if (state.panelSize) workbench.style.setProperty('--p-panel', `${state.panelSize}px`);
      if (state.bottomSize) workbench.style.setProperty('--p-bottom', `${state.bottomSize}px`);
      if (!mounted) {
        mounted = workbench;
        root.replaceChildren(mounted);
      } else {
        for (const [name, value] of Object.entries(workbench.dataset))
          mounted.dataset[name] = value;
        mounted
          .querySelector('.p-topbar')
          .replaceChildren(...workbench.querySelector('.p-topbar').childNodes);
        mounted.querySelector('.p-body').replaceChildren(...body.childNodes);
        mounted.querySelector('.p-status').textContent = state.message;
        mounted.style.cssText = workbench.style.cssText;
      }
      if (state.task) {
        root
          .querySelectorAll(
            '.p-panel-content input, .p-panel-content select, .p-panel-content textarea, [data-action^="step:"]',
          )
          .forEach((control) => {
            control.disabled = true;
          });
      }
      bindDividers();
      if (focusAction)
        [...root.querySelectorAll('[data-action]')]
          .find((n) => n.dataset.action === focusAction)
          ?.focus({ preventScroll: true });
      if (keepHistoryScroll) {
        for (const { selector, top, left } of scrollPositions) {
          const node = root.querySelector(selector);
          if (node) {
            node.scrollTop = top;
            node.scrollLeft = left;
          }
        }
        window.scrollTo({ left: pageScroll.x, top: pageScroll.y, behavior: 'instant' });
      }
    }

    return Object.freeze({ render, getRoot: () => mounted });
  };
})();
