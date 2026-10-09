// Source-fixture illustrations only; no scientific renderer imported.
(() => {
  const { el, button, toolbar } = window.WaferCadV2Components;
  window.createWaferCadV2MockViews = ({
    state,
    data,
    branch,
    cursor,
    currentModel,
    viewPanels,
  }) => {
    const viewState = window.WaferCadV2ViewState;
    const narrow = () => viewState.compact(window);
    function svgNode(tag, attrs = {}, children = []) {
      const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      node.append(...children);
      return node;
    }
    function planar(model, mask = false) {
      const w = model.width,
        h = model.height;
      const svg = svgNode('svg', {
        viewBox: `${-w * 0.56} ${-h * 0.56} ${w * 1.12} ${h * 1.12}`,
        role: 'img',
        'aria-label': mask ? 'Actual source Draw shapes' : 'Actual source model top-layer polygons',
      });
      const group = svgNode('g', { transform: 'scale(1,-1)' });
      if (mask) {
        group.append(
          svgNode('rect', {
            x: -w / 2,
            y: -h / 2,
            width: w,
            height: h,
            fill: 'var(--wc-surface)',
            stroke: 'var(--wc-border-strong)',
            'vector-effect': 'non-scaling-stroke',
          }),
        );
        const shapes =
          data.branches.find((b) => b.id === branch)?.drawMask?.shapes || data.drawMask.shapes;
        for (const shape of shapes) {
          const attrs = {
            fill: 'var(--wc-accent-tint-active)',
            stroke: 'var(--wc-accent)',
            'vector-effect': 'non-scaling-stroke',
          };
          if (shape.type === 'rect')
            group.append(
              svgNode('rect', {
                ...attrs,
                x: Math.min(shape.a[0], shape.b[0]),
                y: Math.min(shape.a[1], shape.b[1]),
                width: Math.abs(shape.b[0] - shape.a[0]),
                height: Math.abs(shape.b[1] - shape.a[1]),
              }),
            );
          if (shape.type === 'ring')
            group.append(
              svgNode('circle', {
                ...attrs,
                cx: shape.c[0],
                cy: shape.c[1],
                r: (shape.innerR + shape.outerR) / 2,
                fill: 'none',
                'stroke-width': shape.outerR - shape.innerR,
                'vector-effect': 'none',
              }),
            );
        }
      } else {
        for (const ref of model.paths) {
          const p = data.pathDictionary[ref];
          group.append(svgNode('path', { d: p.d, fill: p.color, 'fill-rule': 'evenodd' }));
        }
      }
      if (state.roi || state.detail)
        group.append(
          svgNode('rect', {
            x: -w / 5,
            y: -h / 5,
            width: w / 2.5,
            height: h / 2.5,
            fill: 'none',
            stroke: 'var(--wc-accent)',
            'stroke-dasharray': '5 4',
            'vector-effect': 'non-scaling-stroke',
            'data-roi-mark': '',
          }),
        );
      const { a, b } = data.section;
      if (a && b)
        group.append(
          svgNode('line', {
            x1: a[0],
            y1: a[1],
            x2: b[0],
            y2: b[1],
            stroke: 'var(--wc-text)',
            'vector-effect': 'non-scaling-stroke',
          }),
        );
      svg.append(group);
      return svg;
    }
    function sectionSchematic(model) {
      const svg = svgNode('svg', {
        viewBox: '0 0 480 180',
        role: 'img',
        'aria-label':
          'Representative actual region stack, equal visual bands, not a computed section',
      });
      const stack = model.stack.slice().reverse();
      const height = Math.min(22, 145 / Math.max(1, stack.length));
      stack.forEach((segment, i) => {
        const layer = model.layers.find((l) => l.id === segment.layerId);
        svg.append(
          svgNode('rect', {
            x: 18,
            y: 12 + i * height,
            width: 444,
            height,
            fill: layer?.color || 'var(--wc-border)',
          }),
        );
      });
      if (state.zbreak)
        svg.append(
          svgNode('path', {
            d: 'M18 125l50-7 55 14 55-14 55 14 55-14 55 14 55-14 64 7',
            fill: 'none',
            stroke: 'var(--wc-text)',
            'stroke-width': 2,
          }),
        );
      if (state.detail)
        svg.append(
          svgNode('rect', {
            x: 180,
            y: 10,
            width: 140,
            height: 100,
            fill: 'none',
            stroke: 'var(--wc-accent)',
            'stroke-width': 2,
            'stroke-dasharray': '5 4',
          }),
        );
      return svg;
    }
    function viewPanel(name) {
      const model = currentModel(),
        label = { main: 'Main', mask: 'Mask', three: '3D', section: 'Section' }[name];
      const common = [
        button('Fit', `fit:${name}`, 'fit'),
        button('Pan', `tool:pan:${name}`, 'pan', { 'aria-pressed': String(state.tool === 'pan') }),
        button('Zoom', `tool:zoom:${name}`, 'zoom'),
      ];
      const extra =
        name === 'three'
          ? [button(state.quality, 'quality', 'quality')]
          : name === 'section'
            ? [
                button('Z-break', 'zbreak', 'zbreak', { 'aria-pressed': String(state.zbreak) }),
                button('Legend', 'legend', 'main', {
                  'aria-pressed': String(state.legendOpen),
                  'aria-expanded': String(state.legendOpen),
                  'aria-controls': 'layerLegend',
                }),
              ]
            : [button('ROI', 'roi', 'roi', { 'aria-pressed': String(state.roi) })];
      const more = [
        button('Zoom', `tool:zoom:${name}`, 'zoom'),
        button('Section line', `tool:line:${name}`, 'line'),
        button('ROI', 'roi', 'roi'),
        button('Export SVG', `export:${name}:svg`, 'export'),
        button(
          name === 'three' ? 'Export image / GLB (simulation)' : 'Export image (simulation)',
          `export:${name}:image`,
          'export',
        ),
      ];
      if (name === 'section')
        more.unshift(
          button('Z-break settings', 'zbreak-settings', 'zbreak'),
          button('Detail ROI', 'detail', 'roi'),
          button('Detail export', 'export:section:detail', 'export'),
        );
      if (name === 'three')
        more.unshift(
          button('Fast / Quality', 'quality', 'quality'),
          button('Borders', 'borders', 'cube'),
        );
      const canvas = el(
        'div',
        { class: 'p-science', 'data-science': name },
        name === 'three'
          ? el('img', {
              src: data.thumbnail,
              alt: 'Recorded real final-model 3D thumbnail; not a live renderer',
            })
          : name === 'section'
            ? sectionSchematic(model)
            : planar(model, name === 'mask'),
        el(
          'span',
          { class: 'p-scale' },
          name === 'three'
            ? 'Recorded final state'
            : name === 'section'
              ? 'Equal-band stack schematic'
              : `${model.width} × ${model.height} µm`,
        ),
      );
      if (name === 'three' && (state.roi || state.detail)) {
        const roiPlane = svgNode('svg', {
          viewBox: `${-model.width * 0.56} ${-model.height * 0.56} ${model.width * 1.12} ${model.height * 1.12}`,
          class: 'v2-roi-plane',
          'aria-label': 'Mock orthographic ROI registration plane, not a live 3D renderer',
        });
        roiPlane.append(
          svgNode('rect', {
            x: -model.width / 5,
            y: -model.height / 5,
            width: model.width / 2.5,
            height: model.height / 2.5,
            fill: 'none',
            stroke: 'var(--wc-accent)',
            'stroke-dasharray': '5 4',
            'vector-effect': 'non-scaling-stroke',
            'data-roi-mark': '',
          }),
        );
        canvas.append(roiPlane);
      }
      const viewTools = toolbar(label, [common, extra], more);
      viewTools.append(
        button(state.maximize === name ? 'Restore' : 'Max', `maximize:${name}`, 'maximize', {
          'aria-label': `${label} ${state.maximize === name ? 'restore' : 'maximize'}`,
        }),
      );
      return viewPanels.update(
        name,
        {
          class: 'p-view',
          id: `${name === 'three' ? 'three' : name}Panel`,
          'data-view': name,
          'aria-label': `${label} view`,
        },
        el(
          'header',
          { class: 'p-panel-head p-view-head' },
          state.mode === 'split' && !narrow() && state.splitViews.includes(name) && !state.maximize
            ? el(
                'select',
                {
                  'data-key': `split-${state.splitViews.indexOf(name) === 0 ? 'left' : 'right'}`,
                  'aria-label': `Split ${state.splitViews.indexOf(name) === 0 ? 'left' : 'right'} view`,
                  class: 'v2-split-select',
                },
                viewState.singles.map((value) =>
                  el(
                    'option',
                    { value, selected: value === name },
                    { main: 'Main', mask: 'Mask', three: '3D' }[value],
                  ),
                ),
              )
            : el('strong', {}, label),
          viewTools,
        ),
        name === 'section'
          ? el(
              'div',
              { class: 'v2-section-body', 'data-legend-open': String(state.legendOpen) },
              canvas,
              window.createWaferCadV2SectionLegend({
                layers: model.layers,
                annotations: model.annotations,
                open: state.legendOpen,
              }),
            )
          : canvas,
        el(
          'div',
          { class: 'p-readout' },
          name === 'three'
            ? `${state.quality} · fixed final snapshot / mock ROI plane`
            : name === 'section'
              ? `Stored Z stays in µm · ${model.stack.length} segments · not Section geometry`
              : `${model.layers.length} layers · ${model.regionCount} regions · cursor ${cursor}`,
        ),
      );
    }

    return { render: viewPanel };
  };
})();
