// A single, focus-neutral tooltip service for opt-in, dynamically rendered controls.
(() => {
  function create({ root = document, delay = 450 } = {}) {
    const catalog = window.WaferCadV2TooltipCatalog;
    const node = document.createElement('div');
    const heading = document.createElement('strong');
    const detail = document.createElement('span');
    node.id = 'wc-context-tooltip';
    node.className = 'wc-tooltip wc-context-tooltip';
    node.setAttribute('role', 'tooltip');
    node.hidden = true;
    node.append(heading, detail);
    document.body.append(node);
    let target = null,
      pending = null,
      requested = null,
      destroyed = false;
    const listeners = [];
    const listen = (owner, type, fn, opts) => {
      owner.addEventListener(type, fn, opts);
      listeners.push(() => owner.removeEventListener(type, fn, opts));
    };
    const clearPending = () => {
      if (pending !== null) clearTimeout(pending);
      pending = null;
      requested = null;
    };
    const removeDescription = () => {
      if (!target) return;
      const values = (target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const other = values.filter((value) => value !== node.id);
      if (other.length) target.setAttribute('aria-describedby', other.join(' '));
      else target.removeAttribute('aria-describedby');
    };
    function hide() {
      clearPending();
      removeDescription();
      target = null;
      node.hidden = true;
    }
    function usable(anchor) {
      if (!anchor?.isConnected || !root.contains(anchor) || anchor.closest('[hidden],[inert]'))
        return false;
      if (!anchor.getClientRects().length) return false;
      return Boolean(catalog.resolve(anchor.dataset.help, anchor));
    }
    function show(anchor) {
      pending = null;
      requested = null;
      if (destroyed || !usable(anchor)) return;
      const copy = catalog.resolve(anchor.dataset.help, anchor);
      if (!copy) return;
      if (target && target !== anchor) removeDescription();
      target = anchor;
      heading.textContent = copy[0];
      detail.textContent = anchor.dataset.helpDetail || copy[1];
      node.hidden = false;
      const rect = anchor.getBoundingClientRect();
      const width = node.offsetWidth,
        height = node.offsetHeight,
        gap = 8,
        edge = 8;
      node.style.left = `${Math.max(edge, Math.min(rect.left + (rect.width - width) / 2, innerWidth - width - edge))}px`;
      const below = rect.bottom + gap;
      node.style.top = `${below + height <= innerHeight - edge ? below : Math.max(edge, rect.top - height - gap)}px`;
      const descriptions = (anchor.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter(Boolean);
      if (!descriptions.includes(node.id))
        anchor.setAttribute('aria-describedby', [...descriptions, node.id].join(' '));
    }
    function schedule(anchor, keyboard = false) {
      if (destroyed || !anchor || !usable(anchor)) {
        hide();
        return;
      }
      if (target === anchor && !node.hidden) {
        show(anchor); // Refresh state-dependent copy without waiting.
        return;
      }
      if (requested === anchor) return;
      hide();
      requested = anchor;
      pending = setTimeout(() => show(anchor), keyboard ? 0 : delay);
    }
    const candidate = (from) => from?.closest?.('[data-help]') || null;
    const enter = (event) => {
      if (event.pointerType !== 'mouse') return;
      const anchor = candidate(event.target);
      if (anchor && anchor === candidate(event.relatedTarget)) return;
      if (anchor) schedule(anchor);
      else hide();
    };
    const leave = (event) => {
      if (event.pointerType !== 'mouse') return;
      const anchor = candidate(event.target);
      if (anchor && anchor !== candidate(event.relatedTarget)) hide();
    };
    const focused = (event) => {
      const anchor = candidate(event.target);
      if (anchor) schedule(anchor, true);
      else hide();
    };
    const unfocused = (event) => {
      if (candidate(event.target) !== candidate(event.relatedTarget)) hide();
    };
    listen(document, 'pointerover', enter, true);
    listen(document, 'pointerout', leave, true);
    listen(document, 'focusin', focused, true);
    listen(document, 'focusout', unfocused, true);
    listen(document, 'pointerdown', hide, true);
    listen(document, 'scroll', hide, true);
    listen(window, 'resize', hide);
    listen(window, 'blur', hide);
    listen(document, 'visibilitychange', () => {
      if (document.hidden) hide();
    });
    listen(
      document,
      'keydown',
      (event) => {
        if (event.key === 'Escape') hide();
      },
      true,
    );
    return Object.freeze({
      hide,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        hide();
        listeners.forEach((dispose) => dispose());
        node.remove();
      },
    });
  }
  window.WaferCadV2TooltipController = Object.freeze({ create });
})();
