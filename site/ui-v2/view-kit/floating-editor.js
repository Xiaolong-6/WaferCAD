// Shared v2 overlay extension for persistent nonmodal inspection editors.
// Menus/dialogs retain the shared manager; these editors own focus/Escape,
// dragging and viewport bounds without a scrim, outside dismissal or Tab trap.
export function createFloatingEditorManager(
  base,
  { className = '', root = document, windowRef = window } = {},
) {
  const entries = new Map();
  let active;
  const closeFloating = (id, reason = 'close') => {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    entry.cleanup();
    entry.node.remove();
    entry.trigger.setAttribute('aria-expanded', 'false');
    entry.trigger.setAttribute('aria-pressed', 'false');
    if (!['hidden', 'destroy'].includes(reason)) entry.trigger.focus({ preventScroll: true });
    entry.onClose?.();
    active = [...entries.keys()].at(-1);
  };
  const clamp = (node, x, y) => {
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(x, windowRef.innerWidth - rect.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(y, windowRef.innerHeight - rect.height - 8))}px`;
  };
  const mountFloating = ({ id, title, content, trigger, width = 320, onClose }) => {
    if (entries.has(id)) {
      closeFloating(id);
      return null;
    }
    base.close('popover', 'replaced');
    const { el, button } = windowRef.WaferCadV2Components;
    const close = button('', null, 'close', { title: 'Close', 'aria-label': `Close ${title}` });
    const header = el('header', {}, el('strong', { id: `${id}-title` }, title), close);
    const node = el(
      'section',
      {
        id,
        class: `v2-floating-editor ${className}`.trim(),
        role: 'dialog',
        'aria-modal': 'false',
        'aria-labelledby': `${id}-title`,
        tabindex: -1,
      },
      header,
      el('div', { class: 'v2-floating-editor-body' }, content),
    );
    node.style.width = `${width}px`;
    root.body.append(node);
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-pressed', 'true');
    trigger.setAttribute('aria-controls', id);
    let drag;
    header.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button') || event.button !== 0) return;
      const rect = node.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
      header.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    header.addEventListener('pointermove', (event) => {
      if (drag?.id === event.pointerId) clamp(node, event.clientX - drag.x, event.clientY - drag.y);
    });
    const finish = (event) => {
      if (drag?.id !== event.pointerId) return;
      drag = null;
      if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
    };
    header.addEventListener('pointerup', finish);
    header.addEventListener('pointercancel', finish);
    close.onclick = () => closeFloating(id);
    node.addEventListener('pointerdown', () => {
      active = id;
    });
    node.addEventListener('focusin', () => {
      active = id;
    });
    const resize = () => {
      const rect = node.getBoundingClientRect();
      clamp(node, rect.left, rect.top);
    };
    windowRef.addEventListener('resize', resize);
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    entries.set(id, {
      node,
      trigger,
      onClose,
      cleanup: () => {
        observer.disconnect();
        windowRef.removeEventListener('resize', resize);
      },
    });
    const anchor = trigger.getBoundingClientRect();
    clamp(node, anchor.left, anchor.bottom + 8);
    for (const other of entries.values()) {
      if (other.node === node) continue;
      const rect = other.node.getBoundingClientRect();
      const current = node.getBoundingClientRect();
      if (
        current.left < rect.right &&
        current.right > rect.left &&
        current.top < rect.bottom &&
        current.bottom > rect.top
      ) {
        const right = rect.right + 12;
        if (right + current.width <= windowRef.innerWidth - 8) clamp(node, right, rect.top);
        else if (rect.left - current.width - 12 >= 8)
          clamp(node, rect.left - current.width - 12, rect.top);
        else clamp(node, anchor.left, rect.bottom + 12);
      }
    }
    active = id;
    node
      .querySelector(
        '.v2-floating-editor-body input, .v2-floating-editor-body select, .v2-floating-editor-body button',
      )
      ?.focus({ preventScroll: true });
    return node;
  };
  const onKey = (event) => {
    if (
      event.key !== 'Escape' ||
      !entries.size ||
      root.querySelector(':popover-open, dialog[open]')
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeFloating(active || [...entries.keys()].at(-1));
  };
  root.addEventListener('keydown', onKey, true);
  return {
    mount: base.mount,
    close: base.close,
    mountFloating,
    closeFloating,
    hasFloating: (id) => entries.has(id),
    closeFloatings: () => [...entries.keys()].forEach((id) => closeFloating(id, 'hidden')),
    destroy() {
      [...entries.keys()].forEach((id) => closeFloating(id, 'destroy'));
      root.removeEventListener('keydown', onKey, true);
    },
  };
}
