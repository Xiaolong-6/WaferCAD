// One stable panel/content host per view. No cloned canvases or domain knowledge.
(() => {
  const { el } = window.WaferCadV2Components;
  window.createWaferCadV2ViewPanels = () => {
    const panels = new Map();
    function update(key, attributes, ...children) {
      let panel = panels.get(key);
      if (!panel) {
        panel = el('section', attributes);
        panels.set(key, panel);
      }
      const contentIndex = children.findIndex(
        (node) => node?.classList?.contains('p-science') || node?.querySelector?.('.p-science'),
      );
      const host = panel.querySelector('.p-science');
      if (host && contentIndex >= 0) {
        // The host identity survives navigation, layout and History updates.
        // Only the mock illustrations change; M3 renderers can own this stable slot.
        const freshHost = children[contentIndex].classList.contains('p-science')
          ? children[contentIndex]
          : children[contentIndex].querySelector('.p-science');
        host.replaceChildren(...freshHost.childNodes);
        if (freshHost === children[contentIndex]) children[contentIndex] = host;
        else freshHost.replaceWith(host);
      }
      const legend = panel.querySelector('#layerLegend');
      const freshLegend = children
        .find((node) => node?.querySelector?.('#layerLegend'))
        ?.querySelector('#layerLegend');
      if (legend && freshLegend) {
        const scrollTop = legend.querySelector('.v2-legend-list')?.scrollTop || 0;
        legend.replaceChildren(...freshLegend.childNodes);
        legend.hidden = freshLegend.hidden;
        legend.querySelector('.v2-legend-list').scrollTop = scrollTop;
        freshLegend.replaceWith(legend);
      }
      for (const [name, value] of Object.entries(attributes)) panel.setAttribute(name, value);
      panel.replaceChildren(...children);
      return panel;
    }
    return Object.freeze({ update, get: (key) => panels.get(key) });
  };
})();
