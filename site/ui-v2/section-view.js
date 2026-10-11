// M2 presentation over the existing physical Section compositor and inspection controllers.
import { createPlanRenderers } from '../plan-renderers.js';
import { createSectionCollapseController } from '../controllers/section-collapse-controller.js';
import { createSectionDetailRoiController } from '../controllers/section-detail-roi-controller.js';
import { createExportController } from '../controllers/export-controller.js';
import {
  normalizeSectionViewport,
  panSectionViewport,
  zoomSectionViewportAt,
} from '../section-view-viewport.js';
import { createInspectionFields, formatInspectionLength } from './view-kit/inspection-fields.js';
import { bindPlanGestures } from './view-kit/plan-gestures.js';
import { STRUCTURE_PALETTES } from '../controllers/layer-legend-controller.js';
import {
  setLayerVisible,
  setImplantVisible,
  setElectricalRegionVisible,
  recolorLayer,
  recolorImplant,
  recolorElectricalRegion,
} from '../model.js';

export function createSectionView({ store, main, workstation }) {
  const { el, button, toolbar } = window.WaferCadV2Components;
  const state = store.state,
    local = store.local.section;
  const hooks = new Map();
  const hook = (id, node) => {
    node.id = id;
    hooks.set(id, node);
    return node;
  };
  const root = {
    getElementById: (id) => document.getElementById(id) || hooks.get(id),
    createElement: (...args) => document.createElement(...args),
    body: document.body,
    get activeElement() {
      return document.activeElement;
    },
  };
  const fields = createInspectionFields({ hook });
  const icon = (label, action, glyph) =>
    button('', action, glyph, { title: label, 'aria-label': label });
  const canvas = hook(
    'sectionCanvas',
    el('canvas', { 'aria-label': 'Physical Section A–B', tabindex: 0 }),
  );
  const detailButton = hook('sectionDetailRoiBtn', icon('Detail ROI', 'detail', 'roi'));
  const detailOverlay = hook(
    'sectionDetailRoiOverlay',
    el(
      'div',
      { class: 'v2-detail-overlay', hidden: true },
      ...['nw', 'ne', 'sw', 'se'].map((corner) =>
        el('button', { 'data-detail-handle': corner, 'aria-label': `Detail ${corner} resize` }),
      ),
    ),
  );
  const inset = hook(
    'sectionDetailInset',
    el(
      'div',
      { class: 'v2-detail-inset', hidden: true },
      hook(
        'sectionDetailInsetHead',
        el(
          'header',
          {},
          hook('sectionDetailZoom', el('span')),
          hook('sectionDetailShapeBtn', icon('Toggle Detail shape', null, 'rectangle')),
          hook('sectionDetailCloseBtn', icon('Clear Detail ROI', null, 'close')),
        ),
      ),
      hook('sectionDetailInsetCanvas', el('canvas')),
    ),
  );
  const body = hook(
    'sectionBody',
    el(
      'div',
      { class: 'v2-section-body' },
      el('div', { class: 'p-science v2-plan-stage', 'data-v2-stage-host': '' }, canvas),
      detailOverlay,
      inset,
    ),
  );
  let legendOpen = true,
    legendPalette = 'balanced',
    paletteOpen = null,
    legend;
  const settings = icon('Section settings', 'settings:section', 'settings');
  const zSettings = hook(
    'sectionCollapseAxisBtn',
    icon('Z Break settings', 'zbreak-settings', 'zbreak'),
  );
  const tools = toolbar(
    'Section',
    [
      [
        icon('Fit', 'fit:section', 'fit'),
        icon('Pan', 'tool:pan:section', 'pan'),
        icon('Zoom', 'tool:zoom:section', 'zoom'),
      ],
      [icon('Z Break', 'zbreak', 'zbreak'), icon('Layers', 'legend', 'main'), detailButton],
    ],
    [
      button('Export', 'section-export-menu', 'export'),
      settings,
      zSettings,
      icon('Detail settings', 'settings:detail', 'roi'),
    ],
  );
  tools.append(icon('Maximize', 'maximize:section', 'maximize'));
  hook('sectionScaleModeBtn', el('select'));
  hook('sectionBordersBtn', el('button'));
  hook('sectionMeta', el('span'));
  hook('sectionRange', el('span'));
  const panel = window
    .createWaferCadV2ViewPanels()
    .update(
      'section',
      { class: 'p-view', id: 'sectionPanel', 'data-view': 'section', 'aria-label': 'Section view' },
      el('header', {}, el('strong', {}, 'Section'), tools),
      body,
      el('div'),
    );
  workstation.mount(panel);
  let renderer, detail, collapse;
  const render = () => {
    if (!canvas.checkVisibility()) return;
    renderer.renderSection();
    detail.sync();
    sync();
  };
  collapse = createSectionCollapseController({
    root,
    getModel: () => state.model,
    getSectionCollapse: () => state.sectionCollapse,
    setSectionCollapse: (value) => {
      state.sectionCollapse = value;
    },
    renderSection: render,
    onChanged: () => {
      store.views.get('three')?.runtime.updateZCollapse?.();
    },
    onSettled: () => store.invalidate('three'),
    formatXY: formatInspectionLength,
    xyUnitLabel: () => 'µm',
  });
  detail = createSectionDetailRoiController({
    root,
    getRoi: () => state.sectionDetailRoi,
    setRoi: (value) => {
      state.sectionDetailRoi = value;
    },
    renderDetail: (target, roi) => renderer.renderSectionDetail(target, roi),
    status: workstation.status,
  });
  renderer = createPlanRenderers({
    root,
    getState: () => state,
    ...main.runtime.plan,
    getSectionCollapseController: () => collapse,
    syncSectionInputs: () => main.runtime.slice.syncInputs(),
    formatXY: formatInspectionLength,
    xyText: (value) => `${formatInspectionLength(value)} µm`,
    xyUnitLabel: () => 'µm',
  });
  const viewport = (value) => {
    state.sectionViewport = normalizeSectionViewport(value);
    render();
  };
  const zoomAt = (factor, x, y) => {
    const rect = canvas.getBoundingClientRect();
    viewport(
      zoomSectionViewportAt(
        state.sectionViewport,
        factor,
        x - rect.left,
        y - rect.top,
        rect.width,
        rect.height,
      ),
    );
  };
  bindPlanGestures({
    canvas,
    mouse: true,
    dragZoom: true,
    panEnabled: () => local.panEnabled,
    zoomEnabled: () => local.zoomEnabled,
    panBy: (dx, dy) => viewport(panSectionViewport(state.sectionViewport, dx, dy)),
    zoomAt,
  });
  detailButton.addEventListener('click', () => {
    local.panEnabled = false;
    local.zoomEnabled = false;
    sync();
  });
  detail.bind();
  const form = el(
    'div',
    { class: 'p-form' },
    fields.choice(
      'X:Z scale',
      'section-scale',
      [
        ['auto', 'Auto'],
        ['physical', '1:1 X:Z'],
      ],
      state.sectionScaleMode,
    ),
    el(
      'label',
      { class: 'wc-field' },
      el('span', { class: 'wc-label' }, 'Show structural borders'),
      hook('section-borders', el('input', { type: 'checkbox', checked: state.sectionShowBorders })),
    ),
  );
  hooks.get('section-scale').onchange = (e) => {
    state.sectionScaleMode = e.target.value;
    render();
  };
  hooks.get('section-borders').onchange = (e) => {
    state.sectionShowBorders = e.target.checked;
    render();
  };
  const ruler = hook(
    'sectionCollapseRuler',
    el(
      'div',
      { class: 'v2-z-ruler' },
      hook('sectionCollapseWindow', el('div', { class: 'v2-z-window' })),
      ...['Top', 'Bottom'].map((key) =>
        hook(`sectionCollapse${key}Handle`, button(key, null, null, { class: 'v2-z-handle' })),
      ),
    ),
  );
  const zForm = el(
    'div',
    { class: 'p-form' },
    el(
      'label',
      {},
      hook('sectionCollapseSnap', el('input', { type: 'checkbox', checked: true })),
      ' Snap to structure',
    ),
    ruler,
    fields.pair(
      fields.input('Top · µm', 'sectionCollapseTopInput'),
      fields.input('Bottom · µm', 'sectionCollapseBottomInput'),
    ),
    el(
      'label',
      {},
      hook('sectionCollapseScaleLinked', el('input', { type: 'checkbox', checked: true })),
      ' Link Front / Back scales',
    ),
    fields.pair(
      fields.input('Front scale', 'sectionCollapseFrontScale', 1, { kind: 'scale' }),
      fields.input('Back scale', 'sectionCollapseBackScale', 1, { kind: 'scale' }),
    ),
  );
  for (const [id, key] of [
    ['sectionCollapseTopInput', 'top'],
    ['sectionCollapseBottomInput', 'bottom'],
  ])
    hooks.get(id).onchange = (e) => {
      const value = Number(e.target.value);
      if (Number.isFinite(value))
        collapse.setCurrent({ ...collapse.current(), [key]: value }, { settled: true });
    };
  for (const key of ['Front', 'Back'])
    hooks.get(`sectionCollapse${key}Scale`).onchange = (e) =>
      collapse.setSurfaceScale(key.toLowerCase(), e.target.value);
  hooks.get('sectionCollapseScaleLinked').onchange = (e) =>
    collapse.setCurrent(
      {
        ...collapse.current(),
        scaleLinked: e.target.checked,
        ...(e.target.checked ? { frontScale: 1, backScale: 1 } : {}),
      },
      { settled: true },
    );
  for (const key of ['Top', 'Bottom'])
    hooks.get(`sectionCollapse${key}Handle`).onpointerdown = (e) =>
      collapse.startDrag(key.toLowerCase(), e);
  window.addEventListener('pointermove', collapse.moveDrag);
  window.addEventListener('pointerup', collapse.endDrag);
  window.addEventListener('pointercancel', collapse.endDrag);
  function sync() {
    for (const key of ['pan', 'zoom'])
      panel
        .querySelector(`[data-action="tool:${key}:section"]`)
        .setAttribute('aria-pressed', String(local[`${key}Enabled`]));
    panel
      .querySelector('[data-action="zbreak"]')
      .setAttribute('aria-pressed', String(collapse.current().enabled !== false));
    const z = collapse.current();
    for (const [id, value] of [
      ['sectionCollapseTopInput', z.top],
      ['sectionCollapseBottomInput', z.bottom],
      ['sectionCollapseFrontScale', z.frontScale],
      ['sectionCollapseBackScale', z.backScale],
    ]) {
      const input = hooks.get(id);
      if (input !== document.activeElement) input.value = formatInspectionLength(value);
    }
    hooks.get('sectionCollapseScaleLinked').checked = z.scaleLinked !== false;
    for (const key of ['Front', 'Back'])
      hooks.get(`sectionCollapse${key}Scale`).disabled = z.scaleLinked !== false;
    const top = collapse.zToRulerY(z.top),
      bottom = collapse.zToRulerY(z.bottom);
    hooks.get('sectionCollapseTopHandle').style.top = `${top}px`;
    hooks.get('sectionCollapseBottomHandle').style.top = `${bottom}px`;
    hooks.get('sectionCollapseWindow').style.top = `${top}px`;
    hooks.get('sectionCollapseWindow').style.height = `${bottom - top}px`;
    panel.querySelector('[data-slot="view.section.readout"]').textContent =
      hooks.get('sectionMeta').textContent;
  }
  function renderLegend() {
    const annotations = [
      ...(state.model.implants || []).map((item) => ({ ...item, kind: 'Implant' })),
      ...(state.model.electricalRegions || []).map((item) => ({ ...item, kind: 'Electrical' })),
    ];
    const next = window.createWaferCadV2SectionLegend({
      layers: state.model.layers,
      annotations,
      open: legendOpen,
      paletteName: legendPalette,
      paletteOpen,
    });
    next.querySelector('.v2-legend-palette-select').onchange = (event) => {
      legendPalette = event.target.value;
      const colors = STRUCTURE_PALETTES[legendPalette] || window.WaferCadV2RandomLegendPalette();
      state.model.layers.forEach((layer, index) =>
        recolorLayer(state.model, layer.id, colors[index % colors.length]),
      );
      paletteOpen = null;
      store.renderAll();
    };
    next.querySelectorAll('[data-layer-id], [data-annotation-id]').forEach((row) => {
      const id = row.dataset.layerId || row.dataset.annotationId;
      const item =
        state.model.layers.find((item) => String(item.id) === id) ||
        annotations.find((item) => String(item.id) === id);
      const checkbox = el('input', {
        type: 'checkbox',
        checked: item.visible !== false,
        'aria-label': `Show ${item.name}`,
      });
      checkbox.onchange = () => {
        const fn = row.dataset.layerId
          ? setLayerVisible
          : item.kind === 'Implant'
            ? setImplantVisible
            : setElectricalRegionVisible;
        fn(state.model, item.id, checkbox.checked);
        store.renderAll();
      };
      row.prepend(checkbox);
    });
    if (legend) legend.replaceWith(next);
    else body.append(next);
    legend = next;
    body.dataset.legendOpen = String(legendOpen);
  }
  const exporter = createExportController({
    root,
    getState: () => state,
    ...main.runtime.plan,
    formatXY: formatInspectionLength,
    status: workstation.status,
  });
  const floating = (id, title, content, trigger) =>
    workstation.overlays.mountFloating({ id, title, content, trigger });
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger || trigger.disabled || !trigger.closest('#sectionPanel,.v2-section-floating'))
      return;
    const action = trigger.dataset.action;
    if (action === 'fit:section') viewport({ zoom: 1, panX: 0, panY: 0 });
    else if (action === 'tool:pan:section' || action === 'tool:zoom:section') {
      const key = action.split(':')[1];
      detail.cancelDrawing();
      local[`${key}Enabled`] = !local[`${key}Enabled`];
      local[key === 'pan' ? 'zoomEnabled' : 'panEnabled'] = false;
      sync();
    } else if (action === 'zbreak') collapse.toggleEnabled();
    else if (action === 'settings:section') {
      main.openSliceCoordinates(trigger);
      floating('sectionSettings', 'Section controls', form, trigger);
    } else if (action === 'zbreak-settings') {
      floating('sectionZSettings', 'Z Break · physical µm', zForm, trigger);
      sync();
    } else if (action === 'settings:detail')
      floating(
        'sectionDetailSettings',
        'Detail ROI',
        el(
          'div',
          { class: 'p-form' },
          button('Redraw', 'detail-redraw', 'roi'),
          button('Rectangle / Circle', 'detail-shape', 'rectangle'),
          button('Clear Detail ROI', 'detail-clear', 'clear'),
        ),
        trigger,
      );
    else if (action === 'detail-redraw') detailButton.click();
    else if (action === 'detail-shape') hooks.get('sectionDetailShapeBtn').click();
    else if (action === 'detail-clear') detail.clear();
    else if (action === 'legend') {
      legendOpen = !legendOpen;
      renderLegend();
    } else if (action === 'section-export-menu')
      workstation.overlays.mount('popover', {
        trigger,
        label: 'Export Section',
        content: el(
          'div',
          { class: 'p-form v2-section-floating' },
          button('SVG', 'export:section:svg', 'export'),
          button('PNG · Pending', null, 'export', {
            disabled: true,
            title: 'PNG is pending implementation',
          }),
        ),
      });
    else if (action === 'export:section:svg') {
      exporter.exportSectionSvg();
      workstation.overlays.close('popover');
    } else if (action.startsWith('legend-palette:')) {
      paletteOpen = action.slice('legend-palette:'.length);
      renderLegend();
    } else if (action.startsWith('legend-set:') || action.startsWith('legend-random:')) {
      const [, kind, id] = action.split(':');
      const color =
        trigger.dataset.color || window.WaferCadV2LegendPalette[Math.floor(Math.random() * 20)];
      const item =
        state.model.layers.find((item) => String(item.id) === id) ||
        state.model.implants?.find((item) => String(item.id) === id) ||
        state.model.electricalRegions?.find((item) => String(item.id) === id);
      if (item) {
        const fn =
          kind === 'layer'
            ? recolorLayer
            : state.model.implants?.includes(item)
              ? recolorImplant
              : recolorElectricalRegion;
        fn(state.model, item.id, color);
        paletteOpen = null;
        renderLegend();
        store.renderAll();
      }
    }
  });
  new ResizeObserver(render).observe(canvas);
  renderLegend();
  return {
    panel,
    root,
    detail,
    collapse,
    runtime: {
      render() {
        render();
        renderLegend();
      },
    },
    viewport,
  };
}
