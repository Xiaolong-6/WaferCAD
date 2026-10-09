// Native template functions; no Shadow DOM or dependency.
(() => {
  const { icon } = window.WaferCadV2Icons;
  // Pure native templates first; all event binding lives in prototype.js.
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      if (key === 'class') node.className = value;
      else node.setAttribute(key, value === true ? '' : String(value));
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
  function stepper(label, key, value, step = 0.001) {
    return el(
      'div',
      { class: 'p-stepper' },
      field(label, key, value, { type: 'number', step, min: 0 }),
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
      el('span', { class: 'p-aux' }, `${done} / ${total} · simulation; source unchanged`),
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
    const id = `p-overflow-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const trigger = button('More', null, 'more', {
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
        'aria-label': `${label} more tools`,
      },
      overflow,
    );
    overflow.forEach((item) => item.setAttribute('role', 'menuitem'));
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
        overflow.find((item) => !item.disabled)?.focus({ preventScroll: true });
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
      const index = items.indexOf(document.activeElement);
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
    return el(
      'div',
      { class: 'p-toolbar', role: 'toolbar', 'aria-label': `${label} tools` },
      groups.map((group, i) =>
        el(
          'div',
          { class: 'p-tool-group', role: 'group', 'aria-label': `${label} group ${i + 1}` },
          group,
        ),
      ),
      el('div', { class: 'p-overflow-anchor' }, trigger, menu),
    );
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
