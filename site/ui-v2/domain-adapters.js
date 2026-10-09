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
    function show(id, host) {
      const entry = registered.get(id);
      if (!entry) return;
      if (!entry.mounted) {
        entry.node = entry.implementation.mount(host) || host;
        entry.mounted = true;
      }
      if (!current.has(id)) entry.implementation.onShow(entry.node);
      current.add(id);
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
    return Object.freeze({ register, show, hide, destroy, keys: () => [...registered.keys()] });
  }
  function presentationAdapter({ render }) {
    return {
      mount(host) { render(host); return host; },
      onShow() {},
      onHide() {},
      destroy() {},
    };
  }
  window.WaferCadV2DomainAdapters = Object.freeze({ create, presentationAdapter });
})();
