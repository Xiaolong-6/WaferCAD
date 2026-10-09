// Read-only legend template. Receives presentation rows; never owns model mutations.
(() => {
  const { el } = window.WaferCadV2Components;
  const palette = [
    '#2563eb',
    '#0891b2',
    '#059669',
    '#65a30d',
    '#ca8a04',
    '#ea580c',
    '#dc2626',
    '#db2777',
    '#9333ea',
    '#4f46e5',
    '#475569',
    '#111827',
  ];
  window.WaferCadV2LegendPalette = Object.freeze(palette);
  const row = (item, annotation = false, colors = {}, paletteOpen = null) => {
    const key = `${annotation ? 'annotation' : 'layer'}:${item.id}`;
    const color = colors[key] || item.color;
    const swatch = el('span', { class: 'v2-legend-swatch', 'aria-hidden': 'true' });
    swatch.style.backgroundColor = color;
    return el(
      'div',
      {
        class: 'v2-legend-row',
        [annotation ? 'data-annotation-id' : 'data-layer-id']: item.id,
      },
      swatch,
      el(
        'span',
        { class: 'v2-legend-name', title: item.name },
        item.name,
        annotation
          ? el(
              'small',
              { class: 'p-aux' },
              `${item.kind} · ${item.depthProfile || 'smooth'} · ${item.visible === false ? 'Hidden' : 'Visible'}`,
            )
          : null,
      ),
      el(
        'div',
        { class: 'v2-legend-palette-anchor' },
        el(
          'button',
          {
            type: 'button',
            class: 'v2-legend-palette-trigger',
            'data-action': `legend-palette:${key}`,
            'aria-label': `Choose color for ${item.name}`,
            'aria-expanded': String(paletteOpen === key),
            title: `Choose color · ${item.name}`,
          },
          window.WaferCadV2Icons.icon('palette'),
        ),
        paletteOpen === key
          ? el(
              'div',
              { class: 'v2-legend-palette', role: 'menu', 'aria-label': `Colors for ${item.name}` },
              ...palette.map((option) =>
                el(
                  'button',
                  {
                    type: 'button',
                    class: 'v2-legend-swatch-choice',
                    'data-action': `legend-set:${key}`,
                    'data-color': option,
                    'aria-label': option,
                    title: option,
                    role: 'menuitem',
                  },
                  el('span', { class: 'v2-legend-swatch', style: `background-color:${option}` }),
                ),
              ),
              el(
                'button',
                {
                  type: 'button',
                  class: 'v2-legend-random',
                  'data-action': `legend-random:${key}`,
                  role: 'menuitem',
                },
                'Random color',
              ),
            )
          : null,
      ),
    );
  };
  window.createWaferCadV2SectionLegend = ({
    layers,
    annotations = [],
    colors = {},
    paletteOpen,
    open,
  }) =>
    el(
      'aside',
      {
        id: 'layerLegend',
        class: 'v2-section-legend',
        'aria-label': 'Structure layers',
        hidden: !open,
      },
      el('strong', { class: 'v2-legend-title' }, `Layers · ${layers.length}`),
      el(
        'div',
        { class: 'v2-legend-list' },
        layers.map((layer) => row(layer, false, colors, paletteOpen)),
        annotations.length
          ? el('strong', { class: 'v2-legend-group' }, `Annotations · ${annotations.length}`)
          : null,
        annotations.map((item) => row(item, true, colors, paletteOpen)),
      ),
      el('p', { class: 'p-aux v2-legend-note' }, '源标签只读 · 调色仅作用于本地 UI draft'),
    );
})();
