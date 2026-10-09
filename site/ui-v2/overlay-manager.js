// Shared portal owner for Popover, Dialog and Toast; domain code contributes content only.
(() => {
  function create({ root, portals }) {
    const active = new Map();
    const tabStops = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';
    function close(type, reason = 'close') {
      const entry = active.get(type);
      if (!entry) return;
      active.delete(type);
      const { node, trigger, onClose, cleanup, external } = entry;
      cleanup?.();
      if (type === 'dialog' && node.open) node.close();
      if (type === 'popover' && node.matches(':popover-open')) node.hidePopover();
      if (!external) node.remove();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      onClose?.(reason);
    }
    function mount(type, { content, trigger = document.activeElement, id, onClose, className = '', label } = {}) {
      if (!portals[type]) throw Error(`Unknown overlay type: ${type}`);
      close(type, 'replaced');
      const node = document.createElement(type === 'dialog' ? 'dialog' : 'div');
      node.className = className || `v2-${type}`;
      if (id) node.id = id;
      if (label) node.setAttribute('aria-label', label);
      if (type === 'popover') { node.popover = 'manual'; node.setAttribute('role', 'menu'); }
      if (type === 'toast') { node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); }
      if (content != null) node.append(content);
      portals[type].append(node);
      const outside = (event) => {
        if (node.contains(event.target) || trigger?.contains?.(event.target)) return;
        if (type !== 'toast') close(type, 'outside');
      };
      const onKey = (event) => {
        if (event.key === 'Escape') { event.preventDefault(); close(type, 'escape'); return; }
        if (type !== 'dialog' || event.key !== 'Tab') return;
        const items = [...node.querySelectorAll(tabStops)].filter((item) => item.getClientRects().length);
        if (!items.length) { event.preventDefault(); node.focus(); return; }
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      };
      const cleanup = () => {
        document.removeEventListener('pointerdown', outside, true);
        node.removeEventListener('keydown', onKey);
        if (trigger) { trigger.setAttribute('aria-expanded', 'false'); }
      };
      active.set(type, { node, trigger, onClose, cleanup });
      if (trigger && type !== 'toast') {
        if (!node.id) node.id = `v2-${type}-portal-content`;
        trigger.setAttribute('aria-expanded', 'true');
        trigger.setAttribute('aria-controls', node.id);
      }
      if (type === 'dialog') {
        node.addEventListener('cancel', (event) => { event.preventDefault(); close(type, 'escape'); });
        node.showModal();
      } else if (type === 'popover') node.showPopover();
      if (type !== 'toast') {
        document.addEventListener('pointerdown', outside, true);
        node.addEventListener('keydown', onKey);
        (node.querySelector(tabStops) || node).focus({ preventScroll: true });
      }
      return node;
    }
    function adoptPopover(node, trigger) {
      // Native toolbar menus remain in their owning toolbar for legacy-friendly
      // accessibility selectors, but share the same close/focus semantics.
      node.addEventListener('toggle', (event) => {
        if (event.newState === 'open') {
          if (active.has('popover') && active.get('popover').node !== node)
            close('popover', 'replaced');
          active.set('popover', { node, trigger, external: true });
          trigger.setAttribute('aria-expanded', 'true');
          trigger.setAttribute('aria-controls', node.id);
        } else if (active.get('popover')?.node === node) close('popover', 'dismissed');
      });
      return node;
    }
    return Object.freeze({
      mount, close, adoptPopover, destroy: () => [...active.keys()].forEach(close),
    });
  }
  window.WaferCadV2Overlays = Object.freeze({ create });
})();
