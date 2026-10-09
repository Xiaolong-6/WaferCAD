// Read-only legend template. Receives presentation rows; never owns model mutations.
(() => {
  const { el } = window.WaferCadV2Components;
  // Same four 20-color presets as the production layer legend; Random is the fifth mode.
  const palettes = {
  balanced: [
    '#6C8EBF',
    '#82B6A6',
    '#D6A85F',
    '#C97B84',
    '#8A7CB8',
    '#6FA9B8',
    '#A98B6C',
    '#7FA178',
    '#B7799C',
    '#7590AA',
    '#5577A8',
    '#6A9B89',
    '#C28D42',
    '#B76570',
    '#7566A7',
    '#548FA2',
    '#8E7459',
    '#668866',
    '#9E6284',
    '#5F7894',
  ],
  airy: [
    '#76A9DC',
    '#86C7B5',
    '#E8C97A',
    '#E5A0A8',
    '#A99AD6',
    '#8BC6D2',
    '#C8AA82',
    '#9ABD91',
    '#D29ABD',
    '#91A9C2',
    '#5E97CE',
    '#6BB6A2',
    '#DAB75E',
    '#D78893',
    '#9685C7',
    '#72B5C4',
    '#B89569',
    '#83A97A',
    '#C184AA',
    '#7895B1',
  ],
  warm: [
    '#C77C62',
    '#D49A62',
    '#C9AD68',
    '#A8A36D',
    '#B98273',
    '#C48A9D',
    '#9D8175',
    '#D1A279',
    '#B78D64',
    '#A76F6F',
    '#B96850',
    '#C2844D',
    '#B99A50',
    '#92915A',
    '#A56D60',
    '#B37589',
    '#886C61',
    '#BD8C64',
    '#A47A51',
    '#915C5C',
  ],
  cool: [
    '#5F88B5',
    '#5FA4A5',
    '#7294C6',
    '#7186A7',
    '#7E81B2',
    '#6E9C91',
    '#779FB8',
    '#8A8DB8',
    '#6397A9',
    '#7B94A6',
    '#4C76A4',
    '#4B9193',
    '#5D81B5',
    '#5D7295',
    '#696CA1',
    '#5A897E',
    '#628DA7',
    '#7679A6',
    '#4F8396',
    '#677F93',
  ],
};
  window.WaferCadV2LegendPalettes = Object.freeze(palettes);
  window.WaferCadV2LegendPalette = palettes.balanced;
  const randomPalette = (count = 20) => {
    const offset = Math.random() * 360;
    return Array.from({ length: count }, (_, index) => {
      const hue = (offset + index * 137.508) % 360;
      const h = hue / 360, saturation = 0.5, lightness = 0.63;
      const k = (n) => (n + h * 12) % 12;
      const a = saturation * Math.min(lightness, 1 - lightness);
      const channel = (n) => lightness - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
      return '#' + [channel(0), channel(8), channel(4)]
        .map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    });
  };
  window.WaferCadV2RandomLegendPalette = randomPalette;
  const row = (item, annotation = false, colors = {}, paletteOpen = null, palette = palettes.balanced) => {
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
    paletteName = 'balanced',
    open,
  }) => {
    const palette = palettes[paletteName] || palettes.balanced;
    window.WaferCadV2LegendPalette = palette;
    return el(
      'aside',
      {
        id: 'layerLegend',
        class: 'v2-section-legend',
        'aria-label': 'Structure layers',
        hidden: !open,
      },
      el('div', { class: 'v2-legend-header' },
        el('strong', { class: 'v2-legend-title' }, `Layers · ${layers.length}`),
        el('select', { class: 'v2-legend-palette-select', 'data-key': 'legendPalette',
          'aria-label': 'Structure color palette' },
          ...['balanced', 'airy', 'warm', 'cool', 'random'].map((key) =>
            el('option', { value: key, selected: key === paletteName },
              key === 'random' ? 'Random' : key[0].toUpperCase() + key.slice(1))),
        ),
      ),
      el(
        'div',
        { class: 'v2-legend-list' },
        layers.map((layer) => row(layer, false, colors, paletteOpen, palette)),
        annotations.length
          ? el('strong', { class: 'v2-legend-group' }, `Annotations · ${annotations.length}`)
          : null,
        annotations.map((item) => row(item, true, colors, paletteOpen, palette)),
      ),
      el('p', { class: 'p-aux v2-legend-note' }, '源标签只读 · 调色仅作用于本地 UI draft'),
    );
  };
})();
