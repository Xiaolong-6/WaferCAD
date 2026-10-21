// Native template functions; no Shadow DOM or dependency.
(() => {
  const { icon } = window.WaferCadV2Icons;
  // Plain DOM primitives shared by development and production adapters; overlay lifecycle is centralized.
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      if (key === 'class') node.className = value;
      else if (!(key === 'title' && attrs['data-help']))
        node.setAttribute(key, value === true ? '' : String(value));
    }
    node.append(...children.flat().filter((c) => c != null));
    return node;
  }
  function button(text, action, glyph, options = {}) {
    return el(
      'button',
      {
        type: 'button',
        class: 'wc-button',
        'data-action': action,
        'data-size': 'sm',
        'data-variant': options.primary ? 'primary' : 'secondary',
        ...options,
      },
      glyph ? icon(glyph) : null,
      text,
    );
  }
  function visibilityButton(name, visible) {
    return button('', null, visible ? 'eye' : 'eyeOff', {
      class: 'wc-button v2-visibility-button',
      'aria-label': `${visible ? 'Hide' : 'Show'} ${name}`,
      'aria-pressed': String(visible),
      'data-help': 'section.visibility',
      title: `${visible ? 'Hide' : 'Show'} ${name}`,
    });
  }
  function select(label, key, options, value) {
    return el(
      'label',
      { class: 'wc-field' },
      el('span', { class: 'wc-label' }, label),
      el(
        'select',
        { class: 'wc-select', 'data-key': key },
        options.map(([id, text]) =>
          el('option', { value: id, selected: id === String(value) }, text),
        ),
      ),
    );
  }
  function field(label, key, value, attrs = {}) {
    return el(
      'label',
      { class: 'wc-field' },
      el('span', { class: 'wc-label' }, label),
      el('input', { class: 'wc-input', 'data-key': key, value, ...attrs }),
    );
  }
  function stepper(label, key, value, step = 0.001, min = 0, max = null) {
    return el(
      'div',
      { class: 'p-stepper' },
      field(label, key, value, { type: 'number', step, min, max }),
      el(
        'div',
        { class: 'p-actions' },
        button('−', `decrement:${key}`, null, { 'aria-label': `Decrease ${label}` }),
        button('+', `increment:${key}`, null, { 'aria-label': `Increase ${label}` }),
      ),
    );
  }
  function emptyState(title, hint, action) {
    return el(
      'div',
      { class: 'p-empty' },
      icon('history'),
      el('strong', {}, title),
      el('p', { class: 'p-aux' }, hint),
      action,
    );
  }
  function busy(label, done, total) {
    return el(
      'div',
      { class: 'p-progress', role: 'status', 'aria-live': 'polite' },
      el('strong', {}, label),
      el('progress', { value: done, max: total, 'aria-label': label }),
      el('span', { class: 'p-aux' }, `${done} / ${total}`),
    );
  }
  function panelHeader(title, subtitle, actions = []) {
    return el(
      'header',
      { class: 'p-panel-head' },
      el(
        'div',
        {},
        el('strong', {}, title),
        subtitle ? el('span', { class: 'p-aux' }, subtitle) : null,
      ),
      el('div', { class: 'p-actions' }, actions),
    );
  }
  function divider(horizontal = false) {
    return el('div', {
      class: 'p-divider',
      role: 'separator',
      tabindex: 0,
      'aria-label': 'Resize workflow panel',
      'aria-orientation': horizontal ? 'horizontal' : 'vertical',
      'aria-valuemin': horizontal ? 180 : 240,
      'aria-valuemax': horizontal ? 380 : 400,
      'aria-valuenow': horizontal ? 250 : 300,
    });
  }
  function toolbar(label, groups, overflow) {
    const commands = [...overflow];
    const layoutGroups = [...groups, ...(commands.length ? [commands] : [])];
    commands.forEach((item) => {
      const name = item.getAttribute('aria-label') || item.textContent.trim() || item.title;
      item.setAttribute('aria-label', name);
      if (!item.title && !item.hasAttribute('data-help')) item.title = name;
      // Menu text returns only when the command overflows; title-bar commands stay icon-only.
      [...item.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .forEach((node) => node.remove());
    });
    const id = `p-overflow-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const trigger = button('', null, 'more', {
      title: `${label} more tools`,
      popovertarget: id,
      'aria-label': `${label} more tools`,
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      'aria-controls': id,
    });
    const menu = el(
      'div',
      {
        class: 'p-overflow',
        id,
        popover: 'auto',
        role: 'menu',
        tabindex: -1,
        'aria-label': `${label} more tools`,
      },
      overflow,
    );
    const position = () => {
      const rect = trigger.getBoundingClientRect();
      const width = menu.offsetWidth,
        height = menu.offsetHeight,
        gap = 4;
      menu.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
      const below = rect.bottom + gap;
      menu.style.top = `${below + height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - height - gap)}px`;
    };
    menu.addEventListener('position-menu', position);
    menu.addEventListener('toggle', (event) => {
      trigger.setAttribute('aria-expanded', String(event.newState === 'open'));
      if (event.newState === 'open') {
        position();
        // Focus the menu itself, not the first tool: the global tooltip for
        // that tool would otherwise cover the open More menu. Arrow keys
        // still move focus to commands via the menu keyboard handler.
        menu.focus({ preventScroll: true });
      }
    });
    // Choosing a command in More dismisses the menu just like a toolbar
    // command. The original button and its click event still bubble to the
    // owning view controller; no duplicate command state is introduced.
    menu.addEventListener('click', (event) => {
      const command = event.target.closest('button[data-action]');
      if (command && menu.contains(command) && !command.disabled && menu.matches(':popover-open')) {
        menu.hidePopover();
        // View controllers update aria-pressed later in this same bubbling
        // click. Keep the menuitemcheckbox mirror correct on reopening.
        requestAnimationFrame(() => {
          if (command.hasAttribute('aria-pressed'))
            command.setAttribute('aria-checked', command.getAttribute('aria-pressed'));
        });
      }
    });
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        menu.hidePopover();
        trigger.focus({ preventScroll: true });
        return;
      }
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      const items = overflow.filter((item) => !item.disabled);
      const focusedIndex = items.indexOf(document.activeElement);
      const index = focusedIndex < 0 ? (event.key === 'ArrowUp' ? 0 : -1) : focusedIndex;
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      event.preventDefault();
      event.stopPropagation();
      items[next]?.focus({ preventScroll: true });
    });
    window.WaferCadV2ActiveOverlays?.adoptPopover(menu, trigger);
    const toolGroups = layoutGroups.map((group, i) =>
      el(
        'div',
        { class: 'p-tool-group', role: 'group', 'aria-label': `${label} group ${i + 1}` },
        group,
      ),
    );
    const toolStrip = el('div', { class: 'p-tool-strip' }, toolGroups);
    const bar = el(
      'div',
      { class: 'p-toolbar', role: 'toolbar', 'aria-label': `${label} tools` },
      toolStrip,
      el('div', { class: 'p-overflow-anchor' }, trigger, menu),
    );
    // The same controls are reparented into More: actions, toggles and listeners remain unique.
    // Portrait prioritizes Fit and inspection commands over continuous Pan/Zoom modes.
    const portrait = () =>
      window.matchMedia('(orientation: portrait)').matches && window.innerWidth <= 1100;
    const tools = layoutGroups.flat();
    const roles = new Map(tools.map((item) => [item, item.getAttribute('role')]));
    // Move the original controls, preserving actions and toggle state. No domain state is owned here.
    const arrange = () => {
      if (!bar.isConnected || !bar.clientWidth) return;
      const focused = document.activeElement;
      layoutGroups.forEach((group, i) => {
        toolGroups[i].append(...group);
        group.forEach((item) => {
          item.querySelector('[data-overflow-label]')?.remove();
          item.removeAttribute('aria-checked');
          const role = roles.get(item);
          if (role) item.setAttribute('role', role);
          else item.removeAttribute('role');
        });
      });
      const portraitMode = portrait();
      const hidden = new Set();
      const hide = (item) => {
        item.setAttribute(
          'role',
          item.hasAttribute('aria-pressed') ? 'menuitemcheckbox' : 'menuitem',
        );
        if (item.hasAttribute('aria-pressed'))
          item.setAttribute('aria-checked', item.getAttribute('aria-pressed'));
        if (!item.textContent.trim())
          item.append(
            el(
              'span',
              { 'data-overflow-label': '' },
              item.getAttribute('aria-label') || item.title,
            ),
          );
        hidden.add(item);
        menu.append(item);
      };
      // On narrow portrait screens Pan and Zoom always live in More, even if
      // this particular view happens to have enough room for both icons.
      if (portraitMode) {
        for (const item of tools) {
          if (/^tool:(pan|zoom):/.test(item.dataset.action || '')) hide(item);
        }
      }
      const bounds = toolStrip.getBoundingClientRect();
      const outOfBounds = () =>
        tools.some(
          (item) =>
            toolStrip.contains(item) && item.getBoundingClientRect().right > bounds.right + 0.5,
        );
      while (outOfBounds()) {
        const remaining = tools.filter((item) => toolStrip.contains(item));
        if (!remaining.length) break;
        // Fit is the highest-priority quick action; keep it until no other
        // tool can be moved. Reparent the original button, not its state.
        const candidate =
          remaining.filter((item) => !/^fit:/.test(item.dataset.action || '')).at(-1) ||
          remaining.at(-1);
        hide(candidate);
      }
      // Maintain keyboard order regardless of which icon overflowed first.
      const ordered = tools.filter((item) => hidden.has(item));
      menu.append(...ordered);
      overflow.splice(0, overflow.length, ...ordered);
      if (!ordered.length && menu.matches(':popover-open')) menu.hidePopover();
      trigger.disabled = ordered.length === 0;
      if (focused !== document.activeElement && tools.includes(focused)) {
        if (!hidden.has(focused) || menu.matches(':popover-open'))
          focused.focus({ preventScroll: true });
        else trigger.focus({ preventScroll: true });
      }
    };
    const onResize = () => arrange();
    window.addEventListener('resize', onResize);
    const observer = new ResizeObserver(() => {
      if (!bar.isConnected) observer.disconnect();
      else arrange();
    });
    let disposed = false;
    bar.addEventListener(
      'dispose-toolbar',
      () => {
        disposed = true;
        observer.disconnect();
        window.removeEventListener('resize', onResize);
      },
      { once: true },
    );
    requestAnimationFrame(() => {
      if (disposed || !bar.isConnected) return;
      arrange();
      observer.observe(bar);
    });
    return bar;
  }
  function row(title, subtitle, action, selected = false, state = '') {
    return el(
      'button',
      {
        type: 'button',
        class: 'p-list-row',
        'data-action': action,
        'aria-pressed': String(selected),
        'data-state': state,
      },
      el('span', {}, title),
      subtitle ? el('span', { class: 'p-aux' }, subtitle) : null,
    );
  }
  function notice(text, tone = 'info') {
    return el('div', { class: 'p-notice', 'data-tone': tone, role: 'status' }, text);
  }

  window.WaferCadV2Components = Object.freeze({
    el,
    button,
    visibilityButton,
    select,
    field,
    stepper,
    emptyState,
    busy,
    panelHeader,
    divider,
    toolbar,
    row,
    notice,
  });
})();
