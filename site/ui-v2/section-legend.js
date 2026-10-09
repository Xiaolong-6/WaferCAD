// Read-only legend template. Receives presentation rows; never owns model mutations.
(() => {
  const { el } = window.WaferCadV2Components;
  const row = (item, annotation = false) => {
    const swatch = el('span', { class: 'v2-legend-swatch', 'aria-hidden': 'true' });
    swatch.style.backgroundColor = item.color;
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
    );
  };
  window.createWaferCadV2SectionLegend = ({ layers, annotations = [], open }) =>
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
        layers.map((layer) => row(layer)),
        annotations.length
          ? el('strong', { class: 'v2-legend-group' }, `Annotations · ${annotations.length}`)
          : null,
        annotations.map((item) => row(item, true)),
      ),
      el('p', { class: 'p-aux v2-legend-note' }, '源层名 / 注释 / 色块 · 只读展示'),
    );
})();
