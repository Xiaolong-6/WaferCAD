// M2.5 declarative surfaces: this registry owns navigation and placement, not application state.
(() => {
  const defaults = {
    primaryNav: [
      { key: 'project', label: 'Project', icon: 'project', panel: 'project' },
      { key: 'mask', label: 'Mask', icon: 'mask', panel: 'mask' },
      { key: 'process', label: 'Process', icon: 'process', panel: 'process' },
      { key: 'history', label: 'History', icon: 'history', panel: 'history' },
    ],
    panels: ['project', 'base', 'mask', 'process', 'history'],
    nestedPanels: { base: 'project' },
    subpanelOwner: 'process',
    processModes: ['step', 'recipe', 'code', 'diagnostics'],
    views: [
      { key: 'main', label: 'Main', icon: 'main' },
      { key: 'mask', label: 'Mask', icon: 'mask' },
      { key: 'three', label: '3D', icon: 'cube' },
      { key: 'section', label: 'Section', icon: 'section' },
    ],
    viewModes: [
      { key: 'single', label: 'Single' },
      { key: 'overview', label: 'Overview' },
      { key: 'split', label: 'Split' },
    ],
    topbarSlots: ['topbar.project'],
    navigationSlots: ['navigation.primary'],
    overlaySlots: ['portal.popover', 'portal.dialog', 'portal.toast'],
    statusSlots: ['status.message', 'status.save', 'status.version'],
  };
  const copy = (value) => structuredClone(value);
  function define(overrides = {}) {
    const config = { ...copy(defaults), ...copy(overrides) };
    const keys = new Set();
    for (const item of config.primaryNav) {
      if (!item.key || keys.has(item.key)) throw Error('Duplicate or missing primary nav key');
      keys.add(item.key);
    }
    const names = [
      ...config.topbarSlots, ...config.navigationSlots, ...config.overlaySlots, ...config.statusSlots,
      ...config.panels.map((key) => `panel.${key}`),
      ...config.processModes.map((key) => `panel.process.${key}`),
      ...config.views.flatMap(({ key }) =>
        ['header', 'actions', 'stage', 'readout', 'overlays'].map((part) => `view.${key}.${part}`)),
    ];
    return Object.freeze({ ...config, slots: Object.freeze([...new Set(names)]) });
  }
  window.WaferCadV2ShellRegistry = Object.freeze({ define, defaults: define() });
})();
