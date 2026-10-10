// Shared portal owner for Popover, Dialog and Toast; domain code contributes content only.
(() => {
  function create({ root, portals }) {
    const active = new Map();
    const tabStops =
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';
    function close(type, reason = 'close') {
      const entry = active.get(type);
      if (!entry) return;
      active.delete(type);
      const { node, trigger, onClose, cleanup, external } = entry;
      cleanup?.();
      if (external === 'native-details' && node.open) {
        node.open = false;
      } else if (external === 'native-dialog' && node.open) {
        const event = new CustomEvent('wafercad:popover-close', {
          cancelable: true, bubbles: false,
        });
        node.dispatchEvent(event);
        if (!event.defaultPrevented && node.open) node.close();
      } else if (type === 'dialog' && node.open) node.close();
      if (type === 'popover' && node.matches(':popover-open')) node.hidePopover();
      if (!external) node.remove();
      // Replacing one menu with another must never steal focus from its
      // new owner. Escape/dismiss explicitly restore the original trigger.
      if (trigger?.isConnected && !['replaced', 'dialog', 'view-hide', 'destroy'].includes(reason))
        trigger.focus({ preventScroll: true });
      onClose?.(reason);
    }
    function mount(
      type,
      { content, trigger = document.activeElement, id, onClose, className = '', label } = {},
    ) {
      if (!portals[type]) throw Error(`Unknown overlay type: ${type}`);
      if (type === 'dialog') {
        const menu = active.get('popover');
        if (menu?.node.contains(trigger)) trigger = menu.trigger;
        close('popover', 'dialog');
      }
      close(type, 'replaced');
      const node = document.createElement(type === 'dialog' ? 'dialog' : 'div');
      node.className = className || `v2-${type}`;
      if (id) node.id = id;
      if (label) node.setAttribute('aria-label', label);
      if (type === 'popover') {
        node.popover = 'manual';
        node.tabIndex = -1;
        node.setAttribute('role', 'menu');
      }
      if (type === 'toast') {
        node.setAttribute('role', 'status');
        node.setAttribute('aria-live', 'polite');
      }
      if (content != null) node.append(content);
      portals[type].append(node);
      const outside = (event) => {
        if (type === 'toast' || trigger?.contains?.(event.target)) return;
        // Native <dialog> dispatches backdrop hits on the dialog itself.
        // Check the content rectangle before treating them as an inside click.
        if (type === 'dialog' && event.target === node) {
          const rect = node.getBoundingClientRect();
          const outsideBox =
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom;
          if (outsideBox) close(type, 'outside');
          return;
        }
        if (!node.contains(event.target)) close(type, 'outside');
      };
      const onKey = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close(type, 'escape');
          return;
        }
        if (type !== 'dialog' || event.key !== 'Tab') return;
        const items = [...node.querySelectorAll(tabStops)].filter(
          (item) => item.getClientRects().length,
        );
        if (!items.length) {
          event.preventDefault();
          node.focus();
          return;
        }
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      const cleanup = () => {
        document.removeEventListener('pointerdown', outside, true);
        node.removeEventListener('keydown', onKey);
        if (trigger) {
          trigger.setAttribute('aria-expanded', 'false');
        }
      };
      active.set(type, { node, trigger, onClose, cleanup });
      if (trigger && type !== 'toast') {
        if (!node.id) node.id = `v2-${type}-portal-content`;
        trigger.setAttribute('aria-expanded', 'true');
        trigger.setAttribute('aria-controls', node.id);
      }
      if (type === 'dialog') {
        node.addEventListener('cancel', (event) => {
          event.preventDefault();
          close(type, 'escape');
        });
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
    // Adopt native scientific view owners without cloning or portalling their
    // original DOM. Their product controllers still handle button actions,
    // dialogs and focus; the shared manager handles cross-view lifecycle.
    function adoptNativeViews(panels) {
      const owners = new Map();
      const cleanups = [];
      for (const panel of panels) {
        if (!panel?.isConnected) continue;
        const details = [...panel.querySelectorAll('details')];
        // Keep references: the Z Break dialog may enter document.body's
        // native modal top layer and later return to Section's own DOM.
        const custom = [...panel.querySelectorAll('[data-view-popover-panel]')];
        owners.set(panel, { details, custom });
      }
      const closePanel = (panel) => {
        const owner = owners.get(panel);
        if (!owner) return;
        for (const item of owner.details) if (item.open) item.open = false;
        for (const item of owner.custom) {
          if (item.hidden && !item.open) continue;
          const event = new CustomEvent('wafercad:popover-close', {
            cancelable: true, bubbles: false,
          });
          item.dispatchEvent(event);
          // Respect native owning controllers that preventDefault and
          // reparent their original dialog or update scientific state.
          if (event.defaultPrevented) continue;
          if (item.open && typeof item.close === 'function') item.close();
          item.hidden = true;
        }
      };
      for (const [panel, owner] of owners) {
        for (const detail of owner.details) {
          const changed = () => {
            if (!detail.open) return;
            for (const other of owners.keys()) {
              if (other !== panel) closePanel(other);
            }
          };
          detail.addEventListener('toggle', changed);
          cleanups.push(() => detail.removeEventListener('toggle', changed));
        }
      }
      const sync = () => {
        for (const panel of owners.keys()) {
          // This checks ancestors as well as the panel's hidden state.
          // Native dialog reparenting does not bypass its registered owner.
          if (!panel.isConnected || !panel.checkVisibility()) closePanel(panel);
        }
      };
      return Object.freeze({
        sync,
        destroy() {
          owners.forEach((_value, panel) => closePanel(panel));
          cleanups.forEach((cleanup) => cleanup());
          owners.clear();
        },
      });
    }
    return Object.freeze({
      mount,
      close,
      adoptPopover,
      adoptNativeViews,
      destroy: () => [...active.keys()].forEach(close),
    });
  }
  window.WaferCadV2Overlays = Object.freeze({ create });
})();
