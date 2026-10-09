// All M2 mock and future production presenters share this lifecycle.
(() => {
  const methods = ['mount', 'onShow', 'onHide', 'destroy'];
  function create() {
    const registered = new Map();
    const current = new Set();
    function register(id, implementation) {
      if (registered.has(id)) throw Error(`Adapter already registered: ${id}`);
      if (methods.some((name) => typeof implementation?.[name] !== 'function')) {
        throw TypeError(`Adapter ${id} must implement mount/onShow/onHide/destroy`);
      }
      registered.set(id, { implementation, node: null, mounted: false });
      return implementation;
    }
    function prepare(id, host) {
      const entry = registered.get(id);
      if (!entry) return;
      if (!entry.mounted) {
        entry.node = entry.implementation.mount(host) || host;
        entry.mounted = true;
      }
      return entry.node;
    }
    function show(id, host) {
      const entry = registered.get(id);
      if (!entry) return;
      const node = prepare(id, host);
      if (!current.has(id)) entry.implementation.onShow(node);
      current.add(id);
      return node;
    }
    function refresh(id) {
      if (!current.has(id)) return;
      const entry = registered.get(id);
      entry?.implementation.onShow(entry.node);
    }
    function hide(id) {
      if (!current.has(id)) return;
      registered.get(id)?.implementation.onHide();
      current.delete(id);
    }
    function destroy() {
      for (const id of [...current]) hide(id);
      for (const entry of registered.values()) if (entry.mounted) entry.implementation.destroy();
      registered.clear();
    }
    return Object.freeze({ register, prepare, show, refresh, hide, destroy,
      node: (id) => registered.get(id)?.node,
      keys: () => [...registered.keys()],
    });
  }
  function presentationAdapter({ render }) {
    return {
      mount(host) { return host; },
      onShow(host) { render(host); },
      onHide() {},
      destroy() {},
    };
  }
  window.WaferCadV2DomainAdapters = Object.freeze({ create, presentationAdapter });
})();
