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
          cancelable: true,
          bubbles: false,
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
    function activateNative(type, node, trigger, external) {
      const previous = active.get(type);
      if (previous?.node === node) return;
      if (type === 'dialog') close('popover', 'dialog');
      if (previous) close(type, 'replaced');
      active.set(type, { node, trigger, external });
      if (trigger && type !== 'toast') trigger.setAttribute('aria-expanded', 'true');
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
      const observer = new MutationObserver(() => {
        for (const [panel, entry] of owners) {
          for (const node of entry.custom) trackCustom(panel, node);
        }
      });
      const closeCustom = (node) => {
        if (node.hidden && !node.open) return;
        const event = new CustomEvent('wafercad:popover-close', {
          cancelable: true,
          bubbles: false,
        });
        node.dispatchEvent(event);
        if (!event.defaultPrevented) {
          if (node.open && typeof node.close === 'function') node.close();
          node.hidden = true;
        }
      };
      const closePanel = (panel) => {
        const entry = owners.get(panel);
        if (!entry) return;
        for (const node of entry.details) {
          if (active.get('popover')?.node === node) close('popover', 'view-hide');
          else if (node.open) node.open = false;
        }
        for (const node of entry.custom) {
          if (active.get('dialog')?.node === node) close('dialog', 'view-hide');
          else closeCustom(node);
        }
      };
      function trackCustom(panel, node) {
        const opened = node.open || (!node.hidden && node.tagName !== 'DIALOG');
        if (opened) {
          const trigger = node.id ? panel.querySelector(`[aria-controls="${node.id}"]`) : null;
          activateNative('dialog', node, trigger, 'native-dialog');
        } else if (active.get('dialog')?.node === node) {
          active.delete('dialog');
        }
      }
      for (const panel of panels) {
        if (!panel?.isConnected) continue;
        const details = [...panel.querySelectorAll('details')];
        // Keep object identity when native Z Break temporarily enters body.
        const custom = [...panel.querySelectorAll('[data-view-popover-panel]')];
        owners.set(panel, { details, custom });
        for (const node of details) {
          const trigger = node.querySelector(':scope > summary');
          const changed = () => {
            if (node.open) activateNative('popover', node, trigger, 'native-details');
            else if (active.get('popover')?.node === node) active.delete('popover');
          };
          node.addEventListener('toggle', changed);
          cleanups.push(() => node.removeEventListener('toggle', changed));
        }
        for (const node of custom) {
          const changed = () => trackCustom(panel, node);
          node.addEventListener('toggle', changed);
          cleanups.push(() => node.removeEventListener('toggle', changed));
          observer.observe(node, { attributes: true, attributeFilter: ['open', 'hidden'] });
        }
      }
      const sync = () => {
        for (const panel of owners.keys())
          if (!panel.isConnected || !panel.checkVisibility()) closePanel(panel);
      };
      return Object.freeze({
        sync,
        destroy() {
          observer.disconnect();
          for (const panel of owners.keys()) closePanel(panel);
          cleanups.forEach((fn) => fn());
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
