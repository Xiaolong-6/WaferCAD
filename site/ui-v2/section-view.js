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
import { createInspectionFields } from './view-kit/inspection-fields.js';
import { createZBreakEditor } from './z-break-editor.js';
import { bindPlanGestures } from './view-kit/plan-gestures.js';
import { createDisplayUnits, syncDisplayUnitFields } from './view-kit/display-units.js';
import { mountToolPopover } from './view-kit/tool-popover.js';
import { STRUCTURE_PALETTES } from '../controllers/layer-legend-controller.js';
import {
  setLayerVisible,
  setImplantVisible,
  setElectricalRegionVisible,
  recolorLayer,
  recolorImplant,
  recolorElectricalRegion,
  renameLayer,
  renameImplant,
  renameElectricalRegion,
  setImplantDepthProfile,
  setElectricalRegionDepthProfile,
} from '../model.js';

export function createSectionView({ store, main, workstation }) {
  const { el, button, toolbar } = window.WaferCadV2Components;
  const state = store.state,
    local = store.local.section,
    preview = workstation.readOnlyPreview === true;
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
  const units = createDisplayUnits(() => state);
  const fields = createInspectionFields({ hook, units });
  const icon = (label, action, glyph) =>
    button('', action, glyph, {
      title: label,
      'aria-label': label,
      'data-help': {
        'fit:section': 'view.fit',
        'tool:pan:section': 'view.pan',
        'tool:zoom:section': 'view.zoom',
        'zbreak-settings': 'section.zbreak',
        'scale:section': 'section.scale',
        'borders:section': 'section.borders',
        detail: 'section.detail',
        legend: 'section.layers',
        'maximize:section': 'shell.maximize',
      }[action],
    });
  const canvas = hook(
    'sectionCanvas',
    el('canvas', { 'aria-label': 'Physical Section A–B', tabindex: 0 }),
  );
  const detailButton = hook('sectionDetailRoiBtn', icon('ROI', 'detail', 'roi'));
  hook('sectionDetailShapeBtn', el('button'));
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
          hook('sectionDetailCloseBtn', icon('Clear Detail ROI', null, 'close')),
        ),
      ),
      hook('sectionDetailInsetCanvas', el('canvas')),
    ),
  );
  const legendResizer = el('div', {
    class: 'v2-section-legend-resizer',
    role: 'separator',
    tabindex: 0,
    'aria-label': 'Resize Layers pane',
    'aria-orientation': 'vertical',
    'aria-controls': 'layerLegend',
    'aria-valuemin': 160,
    'aria-valuemax': 400,
    title: 'Drag to resize Layers pane',
    'data-help': 'shell.section.resize',
  });
  const body = hook(
    'sectionBody',
    el(
      'div',
      { class: 'v2-section-body v2-section-body-resizable' },
      el('div', { class: 'p-science v2-plan-stage', 'data-v2-stage-host': '' }, canvas),
      detailOverlay,
      inset,
      legendResizer,
    ),
  );
  let legendOpen = !preview && state.sectionLayersVisible !== false,
    editingName = false,
    legendPalette = 'balanced',
    paletteOpen = null,
    legend;
  if (preview) {
    body.dataset.legendOpen = 'false';
    legendResizer.hidden = true;
  }
  const legendWidthKey = 'wafercad.v2.section-legend-width.v1';
  try {
    const savedWidth = Number(sessionStorage.getItem(legendWidthKey));
    if (Number.isFinite(savedWidth) && savedWidth >= 160 && savedWidth <= 400)
      body.style.setProperty('--v2-legend-width', `${savedWidth}px`);
  } catch {
    // Resizing stays available when browser preference storage is blocked.
  }
  let legendResizeStart = null;
  const resizeLegend = (requested) => {
    const maximum = Math.min(400, Math.max(160, body.clientWidth - 160));
    const width = Math.round(Math.max(160, Math.min(maximum, requested)));
    body.style.setProperty('--v2-legend-width', `${width}px`);
    legendResizer.setAttribute('aria-valuenow', String(width));
    legendResizer.setAttribute('aria-valuemax', String(maximum));
    return width;
  };
  const rememberLegendWidth = () => {
    try {
      sessionStorage.setItem(
        legendWidthKey,
        String(Math.round(legend.getBoundingClientRect().width)),
      );
    } catch {
      // View-only width never blocks the workspace.
    }
  };
  legendResizer.onpointerdown = (event) => {
    if (!legendOpen || window.innerWidth <= 820) return;
    event.preventDefault();
    legendResizeStart = { x: event.clientX, width: legend.getBoundingClientRect().width };
    legendResizer.setPointerCapture(event.pointerId);
  };
  legendResizer.onpointermove = (event) => {
    if (legendResizeStart)
      resizeLegend(legendResizeStart.width + legendResizeStart.x - event.clientX);
  };
  const finishLegendResize = () => {
    if (!legendResizeStart) return;
    legendResizeStart = null;
    rememberLegendWidth();
  };
  legendResizer.onpointerup = finishLegendResize;
  legendResizer.onpointercancel = finishLegendResize;
  legendResizer.onlostpointercapture = finishLegendResize;
  legendResizer.onkeydown = (event) => {
    const delta = { ArrowLeft: 16, ArrowRight: -16 }[event.key];
    if (!delta) return;
    event.preventDefault();
    resizeLegend(legend.getBoundingClientRect().width + delta);
    rememberLegendWidth();
  };
  const zSettings = hook('sectionCollapseAxisBtn', icon('Z Break', 'zbreak-settings', 'zbreak'));
  const tools = toolbar(
    'Section',
    [
      [
        icon('Fit', 'fit:section', 'fit'),
        icon('Pan', 'tool:pan:section', 'pan'),
        icon('Zoom', 'tool:zoom:section', 'zoom'),
      ],
      [
        zSettings,
        icon('XZ Scale', 'scale:section', 'alignment'),
        icon('Borders', 'borders:section', 'rectangle'),
        detailButton,
      ],
    ],
    [
      icon('Layers', 'legend', 'main'),
      button('Export', 'section-export-menu', 'export', { 'data-help': 'view.export' }),
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
  // Compact desktop docking is a presentation mode only. The persisted Layers
  // preference and scientific layer visibility stay unchanged.
  let compactLegendExpanded = false;
  let compactLegendBefore = false;
  const sectionDockCompact = () =>
    !preview &&
    window.innerWidth > 820 &&
    Boolean(workstation?.uiState?.desktopLayout) &&
    panel.getBoundingClientRect().width < 390;
  const legendDisplayed = () => sectionDockCompact() ? compactLegendExpanded : legendOpen;
  const syncLegendPlacement = () => {
    const compact = sectionDockCompact();
    if (compact !== compactLegendBefore) {
      compactLegendExpanded = false;
      compactLegendBefore = compact;
    }
    const shown = compact ? compactLegendExpanded : legendOpen;
    body.dataset.compactLegend = String(compact);
    body.dataset.legendOpen = String(shown);
    if (legend) legend.hidden = !shown;
    legendResizer.hidden = compact || !shown;
    panel.querySelector('[data-action="legend"]')?.setAttribute('aria-pressed', String(shown));
  };
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
    formatXY: units.format,
    xyUnitLabel: units.label,
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
    getState: () => ({ ...state, model: store.renderModel() }),
    ...main.runtime.plan,
    getSectionCollapseController: () => collapse,
    syncSectionInputs: () => main.runtime.slice.syncInputs(),
    formatXY: units.format,
    xyText: (value) => `${units.format(value)} ${units.label()}`,
    xyUnitLabel: units.label,
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
    panEnabled: () => local.panEnabled,
    zoomEnabled: () => local.zoomEnabled,
    panBy: (dx, dy) => viewport(panSectionViewport(state.sectionViewport, dx, dy)),
    zoomAt,
  });
  detailButton.addEventListener('click', (event) => {
    if (state.sectionDetailRoi) {
      event.stopImmediatePropagation();
      detail.clear();
      return;
    }
    local.panEnabled = false;
    local.zoomEnabled = false;
    sync();
  });
  if (!preview) detail.bind();
  // UI-v2-only presentation; retain the shared controller's physical semantics.
  const zEditor = createZBreakEditor({ el, button, fields, hook, units, collapse });
  const zForm = zEditor.form;
  function sync() {
    syncDisplayUnitFields(zForm, units.key());
    zEditor.sync();
    for (const key of ['pan', 'zoom'])
      panel
        .querySelector(`[data-action="tool:${key}:section"]`)
        .setAttribute('aria-pressed', String(local[`${key}Enabled`]));
    panel
      .querySelector('[data-action="borders:section"]')
      .setAttribute('aria-pressed', String(state.sectionShowBorders));
    const scaleButton = panel.querySelector('[data-action="scale:section"]');
    const physicalScale = state.sectionScaleMode === 'physical';
    scaleButton.setAttribute('aria-pressed', String(physicalScale));
    scaleButton.title = physicalScale ? 'XZ Scale: 1:1' : 'XZ Scale: Auto';
    scaleButton
      .querySelector('use')
      .setAttribute('href', `#p-icon-${physicalScale ? 'scalePhysical' : 'scaleAuto'}`);
    detailButton.title = state.sectionDetailRoi ? 'Hide Section ROI' : 'Draw Section ROI';
    panel.querySelector('[data-slot="view.section.readout"]').textContent =
      hooks.get('sectionMeta').textContent;
  }
  function renderLegend() {
    if (preview) return;
    syncLegendPlacement();
    const annotations = [
      ...(state.model.implants || []).map((item) => ({ ...item, kind: 'Implant' })),
      ...(state.model.electricalRegions || []).map((item) => ({ ...item, kind: 'Electrical' })),
    ];
    const next = window.createWaferCadV2SectionLegend({
      layers: state.model.layers,
      annotations,
      open: legendDisplayed(),
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
        'data-help': 'section.visibility',
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
      const name = row.querySelector('.v2-legend-name');
      name.tabIndex = 0;
      name.setAttribute('role', 'button');
      name.setAttribute('aria-label', `Rename ${item.name}`);
      name.dataset.help = 'section.layers';
      const editName = () => {
        if (name.querySelector('input')) return;
        editingName = true;
        store.setRenameFocus({ kind: row.dataset.layerId ? 'layer' : item.kind, id: item.id });
        const input = el('input', { value: item.name, 'aria-label': `Name for ${item.name}` });
        let cancelled = false;
        input.onblur = () => {
          editingName = false;
          store.setRenameFocus(null);
          const rename = row.dataset.layerId
            ? renameLayer
            : item.kind === 'Implant'
              ? renameImplant
              : renameElectricalRegion;
          if (!cancelled && input.value.trim() !== item.name) {
            rename(state.model, item.id, input.value);
            store.history?.renameHistoryEntity(
              row.dataset.layerId ? 'layer' : item.kind.toLowerCase(),
              item.id,
              input.value.trim(),
            );
          }
          store.renderAll();
        };
        input.onkeydown = (event) => {
          event.stopPropagation();
          if (event.key === 'Enter') input.blur();
          else if (event.key === 'Escape') {
            cancelled = true;
            input.blur();
          }
        };
        name.replaceChildren(input);
        input.focus();
        input.select();
      };
      name.onclick = editName;
      name.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          editName();
        }
      };
      if (row.dataset.annotationId) {
        const smooth = item.depthProfile === 'smooth';
        const profile = icon(
          `Depth profile for ${item.name}`,
          null,
          smooth ? 'depthSmooth' : 'depthFollow',
        );
        profile.dataset.help = 'section.profile';
        profile.removeAttribute('title');
        profile.setAttribute('aria-pressed', String(smooth));
        profile.onclick = () => {
          const setProfile =
            item.kind === 'Implant' ? setImplantDepthProfile : setElectricalRegionDepthProfile;
          setProfile(state.model, item.id, smooth ? 'follow' : 'smooth');
          store.renderAll();
        };
        row.append(profile);
      }
      row.append(checkbox);
    });
    if (legend) legend.replaceWith(next);
    else body.append(next);
    legend = next;
    syncLegendPlacement();
    legendResizer.setAttribute(
      'aria-valuenow',
      String(Math.round(legend.getBoundingClientRect().width)),
    );
  }
  const exporter = createExportController({
    root,
    getState: () => state,
    ...main.runtime.plan,
    formatXY: units.format,
    status: workstation.status,
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && paletteOpen) {
      paletteOpen = null;
      renderLegend();
    }
  });
  document.addEventListener('click', (event) => {
    if (preview) return;
    if (paletteOpen && !event.target.closest('.v2-legend-palette-anchor')) {
      paletteOpen = null;
      if (editingName) panel.querySelector('.v2-legend-palette')?.remove();
      else renderLegend();
    }
    const trigger = event.target.closest('[data-action]');
    if (!trigger || trigger.disabled || !trigger.closest('#sectionPanel,.v2-section-floating'))
      return;
    const action = trigger.dataset.action;
    if (action === 'fit:section') viewport({ zoom: 1, panX: 0, panY: 0 });
    else if (action === 'tool:pan:section' || action === 'tool:zoom:section') {
      const key = action.split(':')[1];
      detail.cancelDrawing();
      local[`${key}Enabled`] = !local[`${key}Enabled`];
      sync();
    } else if (action === 'scale:section') {
      state.sectionScaleMode = state.sectionScaleMode === 'physical' ? 'auto' : 'physical';
      render();
    } else if (action === 'borders:section') {
      state.sectionShowBorders = !state.sectionShowBorders;
      render();
    } else if (action === 'zbreak-settings') {
      workstation.overlays.mountFloating({
        id: 'sectionZSettings',
        title: 'Z Break',
        content: zForm,
        trigger,
        width: 352,
      });
      sync();
    } else if (action === 'legend') {
      if (sectionDockCompact()) {
        compactLegendExpanded = !compactLegendExpanded;
        syncLegendPlacement();
      } else {
        legendOpen = !legendOpen;
        state.sectionLayersVisible = legendOpen;
        try {
          localStorage.setItem('wafercad.v2.section-layers.v1', String(legendOpen));
        } catch {}
        renderLegend();
      }
    } else if (action === 'section-export-menu')
      mountToolPopover(workstation.overlays, {
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
      const key = action.slice('legend-palette:'.length);
      paletteOpen = paletteOpen === key ? null : key;
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
  if (!preview) new ResizeObserver(syncLegendPlacement).observe(panel);
  renderLegend();
  return {
    panel,
    root,
    detail,
    collapse,
    resetTransient() {
      const input = legend?.querySelector('.v2-legend-name input');
      if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      editingName = false;
      paletteOpen = null;
      workstation.overlays.closeFloatings();
    },
    runtime: {
      render() {
        render();
        if (!editingName) renderLegend();
      },
    },
    viewport,
  };
}
