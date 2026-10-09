// A single responsive policy for Main, Mask, 3D and Section toolbars.
// Physically move the original controls rather than clone their IDs or state.
const rules = {
  mainPanel: [['#mainPanBtn', 540], ['#focusEditor', 390], ['#mainMaxBtn', 420]],
  maskPanel: [['.mask-opacity-control', 540], ['#maskRoiEditor', 390], ['#maskMaxBtn', 420]],
  threePanel: [['.view-display-control', 510], ['#threeMaxBtn', 390]],
  sectionPanel: [['.view-display-control', 530], ['#sectionMaxBtn', 390]],
};

export function createViewToolbarController({ root = document } = {}) {
  const entries = [];
  let observer = null;

  function move(entry, compact) {
    const { node, placeholder, menu } = entry;
    const inOverflow = node.parentNode === menu;
    if (inOverflow === compact) return;
    if (node.matches('details')) node.open = false;
    if (compact) {
      menu.append(node);
    } else {
      placeholder.parentNode?.insertBefore(node, placeholder);
    }
  }

  function update() {
    for (const entry of entries) {
      const width = entry.panel.getBoundingClientRect().width;
      if (width < 1) continue;
      move(entry, width < entry.breakpoint);
    }
  }

  function bind() {
    for (const [panelId, configs] of Object.entries(rules)) {
      const panel = root.getElementById(panelId);
      const menuDetails = panel?.querySelector('.view-more-control');
      const menuSurface = menuDetails?.querySelector('.view-menu-popover');
      if (!menuSurface) continue;
      const overflow = root.createElement('div');
      overflow.className = 'view-overflow-secondary';
      overflow.setAttribute('aria-label', 'Additional view controls');
      menuSurface.append(overflow);

      for (const [selector, breakpoint] of configs) {
        const node = panel.querySelector(selector);
        if (!node) throw new Error(`View toolbar control missing: ${panelId} ${selector}`);
        const placeholder = root.createComment(`view-toolbar:${selector}`);
        node.parentNode.insertBefore(placeholder, node);
        entries.push({ panel, node, placeholder, menu: overflow, breakpoint });
      }
    }
    observer = new ResizeObserver(update);
    for (const panelId of Object.keys(rules)) {
      const panel = root.getElementById(panelId);
      if (panel) observer.observe(panel);
    }
    update();
  }

  return { bind, update };
}
