// One persistent M2 strip; views supply tools, groups, hooks and settings actions.
export function createFloatingStrip({
  id,
  label,
  groups,
  settings,
  toolAttribute,
  owner,
  onToolCreated = () => {},
  components = window.WaferCadV2Components,
}) {
  const { el, button } = components;
  const tools = new Map();
  const availability = new Map();
  const glyphButton = ({ label: hint, action, glyph, path, key, enabled, helpKey }) => {
    const node = button('', action, glyph, {
      title: hint,
      'data-help': helpKey,
      'aria-label': hint,
      'aria-pressed': 'false',
    });
    if (enabled) availability.set(node, enabled);
    if (path) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('aria-hidden', 'true');
      svg.classList.add('wc-icon');
      const shape = document.createElementNS(svg.namespaceURI, 'path');
      shape.setAttribute('d', path);
      svg.append(shape);
      node.append(svg);
    }
    if (key) {
      if (toolAttribute) node.setAttribute(toolAttribute, key);
      tools.set(key, node);
      onToolCreated(key, node);
    }
    return node;
  };
  const children = [];
  groups.forEach((group, index) => {
    if (index) children.push(el('span', { class: 'p-mask-tool-divider', 'aria-hidden': 'true' }));
    children.push(...group.map(glyphButton));
  });
  children.push(glyphButton(settings));
  const node = el(
    'div',
    { id, class: 'v2-floating-strip p-mask-controls', hidden: true },
    el('div', { class: 'p-mask-tools', role: 'toolbar', 'aria-label': label }, children),
  );
  return {
    node,
    update({ open, selected }) {
      owner()?.setAttribute('aria-pressed', String(open));
      node.hidden = !open;
      for (const [control, enabled] of availability) control.disabled = !enabled();
      for (const [key, control] of tools)
        control.setAttribute('aria-pressed', String(key === selected));
    },
  };
}
