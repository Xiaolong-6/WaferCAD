// Source-fixture illustrations only; no scientific renderer imported.
(() => {
  const { el, button, field, select, toolbar } = window.WaferCadV2Components;
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
      const maskTransform = state.maskTransform || { x: 0, y: 0, scale: 1, rotation: 0 };
      const group = svgNode('g', {
        transform: mask
          ? `translate(${maskTransform.x} ${maskTransform.y}) rotate(${-maskTransform.rotation}) scale(${maskTransform.scale} -${maskTransform.scale})`
          : 'scale(1,-1)',
      });
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
        const shapes = state.drawDraft;
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
          if (shape.type === 'circle')
            group.append(
              svgNode('circle', { ...attrs, cx: shape.c[0], cy: shape.c[1], r: shape.r }),
            );
          if (shape.type === 'polygon')
            group.append(
              svgNode('polygon', {
                ...attrs,
                points: shape.points.map((point) => point.join(',')).join(' '),
              }),
            );
        }
      } else {
        for (const ref of model.paths) {
          const p = data.pathDictionary[ref];
          group.append(svgNode('path', { d: p.d, fill: p.color, 'fill-rule': 'evenodd' }));
        }
      }
      if (
        (state.roi || state.detail) &&
        state.roiSettings.width > 0 &&
        state.roiSettings.height > 0
      ) {
        const { x, y, width, height, radius, rotation } = state.roiSettings;
        if (state.roiShape === 'circle' || state.roiShape === 'ring')
          group.append(
            svgNode('circle', {
              cx: x,
              cy: y,
              r: state.roiShape === 'ring' ? radius * 1.15 : Math.min(width, height) / 2,
              fill: 'none',
              stroke: 'var(--wc-accent)',
              'stroke-width': state.roiShape === 'ring' ? radius * 0.15 : 0,
              'vector-effect': state.roiShape === 'ring' ? 'none' : 'non-scaling-stroke',
              'data-roi-mark': '',
            }),
          );
        else
          group.append(
            svgNode('rect', {
              x: x - width / 2,
              y: y - height / 2,
              width,
              height,
              transform: `rotate(${-rotation} ${x} ${y})`,
              fill: 'none',
              stroke: 'var(--wc-accent)',
              'stroke-dasharray': '5 4',
              'vector-effect': 'non-scaling-stroke',
              'data-roi-mark': '',
            }),
          );
      }
      const section = state.sectionLine || {
        ax: data.section.a?.[0],
        ay: data.section.a?.[1],
        bx: data.section.b?.[0],
        by: data.section.b?.[1],
      };
      if (Number.isFinite(section.ax) && Number.isFinite(section.bx))
        group.append(
          svgNode('line', {
            x1: section.ax,
            y1: section.ay,
            x2: section.bx,
            y2: section.by,
            stroke: 'var(--wc-text)',
            'vector-effect': 'non-scaling-stroke',
          }),
        );
      svg.append(group);
      return svg;
    }
    function maskCanvasTools() {
      const tools = [
        ['select', 'Select', 'select'],
        ['rect', 'Rectangle', 'rectangle'],
        ['circle', 'Circle', 'circle'],
        ['polygon', 'Polygon', 'polygon'],
        ['ring', 'Ring', 'ring'],
        ['ring-sector', 'Ring sector', 'ringSector'],
      ];
      const unitFactor = state.displayUnit === 'nm' ? 1000 : state.displayUnit === 'mm' ? 0.001 : 1;
      const unitName = state.displayUnit === 'nm' ? 'nm' : state.displayUnit === 'mm' ? 'mm' : 'µm';
      const displayLength = (value) => Number(value) * unitFactor;
      return [
        el(
          'div',
          { class: 'p-mask-tools', role: 'toolbar', 'aria-label': 'Mask canvas tools' },
          state.maskMode === 'draw'
            ? [
                el('span', { class: 'p-mask-tool-divider', 'aria-hidden': 'true' }),
                ...tools.map(([key, label, glyph]) =>
                  button('', `draw-tool:${key}`, glyph, {
                    'aria-label': label,
                    title: label,
                    'aria-pressed': String(state.drawTool === key),
                  }),
                ),
                button('Add', 'draw-add', 'plus', {
                  title: 'Add preview shape',
                  disabled: state.drawTool === 'select',
                }),
                button('', 'draw-delete', 'delete', {
                  'aria-label': 'Delete last shape',
                  title: 'Delete last shape',
                }),
                button('', 'draw-clear', 'clear', {
                  'aria-label': 'Clear Draw draft',
                  title: 'Clear Draw draft',
                }),
              ]
            : null,
          state.maskMode === 'draw'
            ? el('span', { class: 'p-mask-tool-divider', 'aria-hidden': 'true' })
            : null,
          button('', 'roi', 'roi', {
            'aria-label': state.roi ? 'Hide ROI' : 'Show ROI',
            title: state.roi ? 'Hide ROI' : 'Show ROI',
            'aria-pressed': String(state.roi),
          }),
          button('', 'mask-roi-settings', 'settings', {
            'aria-label': 'ROI parameters and mask alignment',
            title: 'ROI parameters and mask alignment',
            'aria-pressed': String(state.maskRoiOpen),
          }),
        ),
        state.maskRoiOpen
          ? el(
              'section',
              { class: 'p-mask-settings', role: 'dialog', 'aria-label': 'ROI and mask alignment' },
              el(
                'header',
                { class: 'p-mask-settings-head' },
                el('strong', {}, 'ROI & alignment'),
                button('', 'mask-roi-close', 'close', { 'aria-label': 'Close ROI settings' }),
              ),
              select(
                'ROI shape',
                'roiShape',
                [
                  ['rect', 'Rectangle'],
                  ['circle', 'Circle'],
                  ['ring', 'Ring'],
                  ['ring-sector', 'Ring sector'],
                ],
                state.roiShape,
              ),
              select(
                'Reference',
                'roiAnchor',
                [
                  ['center', 'Center / origin'],
                  ['top-left', 'Top-left'],
                  ['bottom-left', 'Bottom-left'],
                  ['top-right', 'Top-right'],
                  ['bottom-right', 'Bottom-right'],
                ],
                state.roiAnchor,
              ),
              el(
                'div',
                { class: 'p-mask-field-grid' },
                field(`X · ${unitName}`, 'roiX', displayLength(state.roiSettings.x), {
                  type: 'number',
                  step: 'any',
                }),
                field(`Y · ${unitName}`, 'roiY', displayLength(state.roiSettings.y), {
                  type: 'number',
                  step: 'any',
                }),
                field(`Width · ${unitName}`, 'roiWidth', displayLength(state.roiSettings.width), {
                  type: 'number',
                  min: 0,
                  step: 'any',
                }),
                field(
                  `Height · ${unitName}`,
                  'roiHeight',
                  displayLength(state.roiSettings.height),
                  { type: 'number', min: 0, step: 'any' },
                ),
                field(
                  `Radius · ${unitName}`,
                  'roiRadius',
                  displayLength(state.roiSettings.radius),
                  { type: 'number', min: 0, step: 'any' },
                ),
                field('Rotation · °', 'roiRotation', state.roiSettings.rotation, {
                  type: 'number',
                  step: 'any',
                }),
              ),
              el(
                'div',
                { class: 'p-mask-field-grid' },
                field(`Alignment X · ${unitName}`, 'alignX', displayLength(state.maskTransform.x), {
                  type: 'number',
                  step: 'any',
                }),
                field(`Alignment Y · ${unitName}`, 'alignY', displayLength(state.maskTransform.y), {
                  type: 'number',
                  step: 'any',
                }),
                field('Alignment scale', 'alignScale', state.maskTransform.scale, {
                  type: 'number',
                  min: 0.0001,
                  step: 'any',
                }),
                field('Alignment rotation · °', 'alignRotation', state.maskTransform.rotation, {
                  type: 'number',
                  step: 'any',
                }),
              ),
              field('Mask opacity', 'maskOpacity', state.maskOpacity, {
                type: 'range',
                min: 0,
                max: 1,
                step: 0.05,
              }),
              el(
                'div',
                { class: 'p-actions' },
                button('Clear ROI', 'clear-roi', 'close'),
                button('Done', 'mask-roi-close', 'check', { primary: true }),
              ),
            )
          : null,
      ];
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
            : name === 'main'
              ? [button('ROI', 'roi', 'roi', { 'aria-pressed': String(state.roi) })]
              : [];
      const more = name === 'main' ? [button('Section line', 'tool:line:main', 'line')] : [];
      if (name === 'main') more.push(button('ROI settings…', 'settings:main', 'settings'));
      if (name === 'three') more.push(button('3D display settings…', 'settings:three', 'settings'));
      if (name === 'section')
        more.push(
          button('Section controls…', 'settings:section', 'section'),
          button('Z-break settings…', 'zbreak-settings', 'zbreak'),
          button('Detail ROI', 'detail', 'roi'),
          button('Detail ROI settings…', 'settings:detail', 'settings'),
        );
      const exports =
        name === 'mask'
          ? [
              ['SVG', 'svg'],
              ['GDS', 'gds'],
              ['OAS', 'oas'],
            ].map(([label, type]) => button(`Export ${label}`, `mask-export:${type}`, 'export'))
          : name === 'three'
            ? [
                button('Export PNG', 'export:three:png', 'export'),
                button('Export GLB · physical units', 'export:three:glb', 'export'),
              ]
            : [
                button(
                  `Export ${name === 'section' ? 'Section' : 'view'} SVG`,
                  `export:${name}:svg`,
                  'export',
                ),
                button(
                  `Export ${name === 'section' ? 'Section' : 'view'} PNG`,
                  `export:${name}:png`,
                  'export',
                ),
              ];
      more.push(...exports);
      if (name === 'three')
        more.push(
          button('Cancel export', 'cancel-export', 'close', { disabled: !state.exportTask }),
        );
      const canvas = el(
        'div',
        { class: 'p-science', 'data-science': name },
        el('div', { class: 'v2-mock-scene' },
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
        name === 'mask' ? maskCanvasTools() : null,
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
            x: state.roiSettings.x - state.roiSettings.width / 2,
            y: state.roiSettings.y - state.roiSettings.height / 2,
            width: state.roiSettings.width,
            height: state.roiSettings.height,
            transform: `rotate(${-state.roiSettings.rotation} ${state.roiSettings.x} ${state.roiSettings.y})`,
            fill: 'none',
            stroke: 'var(--wc-accent)',
            'stroke-dasharray': '5 4',
            'vector-effect': 'non-scaling-stroke',
            'data-roi-mark': '',
          }),
        );
        canvas.querySelector('.v2-mock-scene').append(roiPlane);
      }
      if (name === 'section') canvas.dataset.borders = String(state.sectionBorders);
      if (name === 'three') {
        const image = canvas.querySelector('img');
        if (image) image.style.opacity = String(state.threeOpacity);
        canvas.dataset.borders = String(state.borders);
      }
      const viewTools = toolbar(label, [common, extra], more);
      viewTools.append(
        button(state.maximize === name ? 'Restore' : 'Max', `maximize:${name}`, 'maximize', {
          'aria-label': `${label} ${state.maximize === name ? 'restore' : 'maximize'}`,
        }),
      );
      const preparedStage = name === 'section'
        ? el('div', { class: 'v2-section-body', 'data-legend-open': String(state.legendOpen) },
            canvas,
            window.createWaferCadV2SectionLegend({
              layers: model.layers, annotations: model.annotations, colors: state.legendColors,
              paletteOpen: state.legendPaletteOpen, paletteName: state.legendPalette, open: state.legendOpen,
            }))
        : canvas;
      const panel = viewPanels.update(
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
        preparedStage,
        el(
          'div',
          { class: 'p-readout' },
          name === 'three'
            ? `${state.quality} · fixed final snapshot / mock ROI plane`
            : name === 'section'
              ? `${state.sectionScale === 'physical' ? '1:1 X:Z' : 'Auto'} · ${model.stack.length} actual stack segments · schematic, not computed geometry`
              : `${model.layers.length} layers · ${model.regionCount} regions · cursor ${cursor} · ${state.displayUnit || 'um'}`,
        ),
      );
      // A mock adapter may refresh its own illustration and list children; the
      // named scientific canvas host and its renderer-facing ancestors never change.
      const live = viewPanels.getCanvas(name);
      if (live !== canvas) {
        live.querySelector('.v2-mock-scene').replaceChildren(
          ...canvas.querySelector('.v2-mock-scene').childNodes,
        );
        live.dataset.borders = canvas.dataset.borders;
        if (name === 'section') {
          const body = panel.querySelector('.v2-section-body');
          const legend = body?.querySelector('#layerLegend');
          const nextLegend = preparedStage.querySelector('#layerLegend');
          if (legend && nextLegend) {
            const scroller = legend.querySelector('.v2-legend-list');
            const position = scroller?.scrollTop || 0;
            legend.querySelector('.v2-legend-list').replaceChildren(
              ...nextLegend.querySelector('.v2-legend-list').childNodes,
            );
            legend.querySelector('.v2-legend-title').textContent =
              nextLegend.querySelector('.v2-legend-title').textContent;
            legend.hidden = nextLegend.hidden;
            const selector = legend.querySelector('.v2-legend-palette-select');
            if (selector) selector.value = state.legendPalette || 'balanced';
            if (scroller) scroller.scrollTop = position;
          }
          body.dataset.legendOpen = String(state.legendOpen);
        }
      }
      return panel;
    }

    return { render: viewPanel };
  };
})();
