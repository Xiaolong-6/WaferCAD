export const WORKSTATION_TOOL_ORDER = Object.freeze([
  'project',
  'base',
  'mask',
  'process',
  'snapshots',
]);

export function getAdjacentToolName(current, direction, order = WORKSTATION_TOOL_ORDER) {
  const delta = direction > 0 ? 1 : -1;
  const index = Math.max(0, order.indexOf(current));
  return order[Math.max(0, Math.min(order.length - 1, index + delta))];
}

const WORKSTATION_VIEW_MODE_STORAGE_KEY = 'wafercad.workstation-view-mode.v1';
const SINGLE_VIEW_MODES = new Set(['main', 'mask', 'three']);
const DESKTOP_VIEW_MODES = new Set(['main', 'mask', 'three', 'overview', 'split']);

export function preferredWorkstationViewMode(width, rememberedMode = '') {
  const compact = Number(width) <= 820;
  if (compact) return SINGLE_VIEW_MODES.has(rememberedMode) ? rememberedMode : 'main';
  return DESKTOP_VIEW_MODES.has(rememberedMode) ? rememberedMode : 'main';
}

function storedWorkstationViewMode(winLike) {
  try {
    return String(winLike?.sessionStorage?.getItem(WORKSTATION_VIEW_MODE_STORAGE_KEY) || '');
  } catch {
    return '';
  }
}

function rememberWorkstationViewMode(winLike, mode) {
  if (!DESKTOP_VIEW_MODES.has(mode)) return;
  try {
    winLike?.sessionStorage?.setItem(WORKSTATION_VIEW_MODE_STORAGE_KEY, mode);
  } catch {}
}

export function isCompactWorkstationViewport(winLike) {
  const innerWidth = Number(winLike?.innerWidth);
  const screenWidth = Number(winLike?.screen?.width);
  const coarsePointer = Boolean(winLike?.matchMedia?.('(pointer: coarse)')?.matches);
  return (
    (Number.isFinite(innerWidth) && innerWidth <= 820) ||
    (coarsePointer && Number.isFinite(screenWidth) && screenWidth <= 820)
  );
}

const TOOL_META = {
  project: { id: 'settingsTools', label: 'Project', icon: '▣', hint: 'file · recovery · display' },
  base: { id: 'baseTools', label: 'Base', icon: '◇', hint: 'substrate definition' },
  mask: { id: 'maskTools', label: 'Mask', icon: '⌗', hint: 'source · layout · alignment' },
  process: { id: 'operationTools', label: 'Process', icon: '≋', hint: 'operation · target · parameters' },
  snapshots: { id: 'snapshotsTools', label: 'History', icon: '◷', hint: 'milestones · variants' },
};

const VIEW_META = {
  main: 'Front surface',
  mask: 'Mask layout',
  three: '3D structure',
  overview: 'Main + Mask + 3D',
  split: 'Main + 3D',
};

function makeButton(root, className, text, attrs = {}) {
  const button = root.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'dataset') {
      Object.assign(button.dataset, value);
    } else if (key === 'ariaLabel') {
      button.setAttribute('aria-label', value);
    } else if (key === 'title') {
      button.title = value;
    } else {
      button.setAttribute(key, value);
    }
  }
  return button;
}

export function createWorkstationUiController({ root = document, win = window } = {}) {
  const rememberedViewMode = storedWorkstationViewMode(win);
  const state = {
    initialized: false,
    bound: false,
    activeTool: 'process',
    currentSingleView: SINGLE_VIEW_MODES.has(rememberedViewMode) ? rememberedViewMode : 'main',
    desktopViewMode: preferredWorkstationViewMode(win.innerWidth, rememberedViewMode),
    viewMode: 'single',
    wasMobile: isCompactWorkstationViewport(win),
    programmaticToolScroll: false,
    toolScrollRelease: 0,
    railWheelLocked: false,
  };

  const refs = {};

  function updateProjectMeta(explicitName = '') {
    if (!refs.topMeta) return;
    const value =
      String(explicitName || '').trim() || root.getElementById('projectNameInput')?.value?.trim();
    refs.topMeta.textContent = value || 'Untitled';
  }

  function updateViewMeta(mode = state.viewMode) {
    if (!refs.viewMeta) return;
    refs.viewMeta.textContent = VIEW_META[mode] || VIEW_META[state.currentSingleView] || '';
  }

  function updateRailAnchor(name) {
    const button = refs.railButtons?.get(name);
    const panel = refs.toolPanel;
    if (!button || !panel || !panel.classList.contains('open')) return;
    const buttonRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const y = buttonRect.top + buttonRect.height / 2 - panelRect.top;
    const clamped = Math.max(16, Math.min(panelRect.height - 16, y));
    panel.style.setProperty('--workstation-anchor-y', `${clamped}px`);
  }

  function setActiveRail(name, { preserveClosed = false } = {}) {
    state.activeTool = name;
    for (const [toolName, button] of refs.railButtons) {
      button.classList.toggle(
        'active',
        toolName === name && (!preserveClosed || refs.toolPanel.classList.contains('open')),
      );
      button.setAttribute(
        'aria-pressed',
        String(toolName === name && refs.toolPanel.classList.contains('open')),
      );
    }
    if (refs.toolPosition) refs.toolPosition.textContent = TOOL_META[name]?.label || '';
    updateRailAnchor(name);
  }

  function closeTools() {
    refs.toolPanel?.classList.remove('open');
    for (const button of refs.railButtons?.values() || []) {
      button.classList.remove('active');
      button.setAttribute('aria-pressed', 'false');
    }
  }

  function syncToolScrollTail() {
    if (!refs.toolScrollTail || !refs.toolContent) return;
    refs.toolScrollTail.style.height = `${Math.max(0, refs.toolContent.clientHeight - 72)}px`;
  }

  function scrollToTool(name, behavior = 'smooth') {
    const section = refs.toolSections?.get(name);
    const scroller = refs.toolContent;
    if (!section || !scroller) return;

    syncToolScrollTail();
    const sectionTop =
      scroller.scrollTop +
      section.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top;
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const targetTop = Math.max(0, Math.min(maxTop, sectionTop - 6));
    state.programmaticToolScroll = true;
    win.clearTimeout(state.toolScrollRelease);
    scroller.scrollTo({ top: targetTop, behavior });
    state.toolScrollRelease = win.setTimeout(() => {
      state.programmaticToolScroll = false;
      setActiveRail(name);
    }, behavior === 'smooth' ? 340 : 40);
  }

  function openTool(name, { toggle = false, behavior = 'smooth' } = {}) {
    const same = state.activeTool === name;
    if (toggle && same && refs.toolPanel.classList.contains('open')) {
      closeTools();
      return;
    }
    refs.toolPanel.classList.add('open');
    setActiveRail(name);
    win.requestAnimationFrame(() => updateRailAnchor(name));
    scrollToTool(name, behavior);
  }

  function scheduleViewportRefresh() {
    win.requestAnimationFrame(() => {
      win.requestAnimationFrame(() => {
        win.dispatchEvent(new Event('resize'));
      });
    });
  }

  function syncCompactUi() {
    const compact = isCompactWorkstationViewport(win);
    root.documentElement.classList.toggle('workstation-compact-ui', compact);
    if (!compact) {
      refs.sectionPanel?.classList.remove('workstation-legend-open');
      refs.sectionLayersButton?.setAttribute('aria-expanded', 'false');
    }
    return compact;
  }

  function applyViewMode(mode, { refresh = true, remember = true } = {}) {
    const mobile = syncCompactUi();
    let nextMode = mode;

    if (mobile && (mode === 'overview' || mode === 'split')) {
      nextMode = state.currentSingleView;
    }

    if (!mobile) state.desktopViewMode = nextMode;

    if (nextMode === 'overview' || nextMode === 'split') {
      state.viewMode = nextMode;
    } else {
      state.currentSingleView = nextMode;
      state.viewMode = 'single';
    }

    if (remember) {
      rememberWorkstationViewMode(
        win,
        state.viewMode === 'single' ? state.currentSingleView : state.viewMode,
      );
    }

    const visible =
      state.viewMode === 'overview'
        ? new Set(['main', 'mask', 'three'])
        : state.viewMode === 'split'
          ? new Set(['main', 'three'])
          : new Set([state.currentSingleView]);

    refs.viewStage.dataset.viewMode = state.viewMode;
    for (const [name, panel] of refs.viewPanels) {
      panel.hidden = !visible.has(name);
    }

    for (const [name, button] of refs.viewTabs) {
      const active = state.viewMode === 'single' && name === state.currentSingleView;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    }

    refs.overviewButton?.classList.toggle('active', state.viewMode === 'overview');
    refs.splitButton?.classList.toggle('active', state.viewMode === 'split');
    updateViewMeta(state.viewMode === 'single' ? state.currentSingleView : state.viewMode);

    if (refresh) scheduleViewportRefresh();
  }

  function toggleSectionDock() {
    const collapsed = refs.workspace.classList.toggle('section-dock-collapsed');
    refs.sectionPanel.classList.toggle('workstation-section-collapsed', collapsed);
    refs.sectionCollapseButton.textContent = collapsed ? 'Show' : 'Hide';
    refs.sectionCollapseButton.setAttribute('aria-expanded', String(!collapsed));
    refs.sectionCollapseButton.title = collapsed ? 'Show Section A–B' : 'Hide Section A–B';
    scheduleViewportRefresh();
  }

  function createRail() {
    const rail = root.createElement('nav');
    rail.className = 'workstation-rail';
    rail.setAttribute('aria-label', 'Workspace functions');
    const buttons = new Map();

    for (const name of WORKSTATION_TOOL_ORDER) {
      const meta = TOOL_META[name];
      const button = makeButton(root, 'workstation-rail-button', meta.icon, {
        title: meta.label,
        ariaLabel: meta.label,
        dataset: { tool: name, label: meta.label },
      });
      button.setAttribute('aria-pressed', 'false');
      rail.append(button);
      buttons.set(name, button);
    }

    const spacer = root.createElement('div');
    spacer.className = 'workstation-rail-spacer';
    rail.append(spacer);

    refs.appShell.prepend(rail);
    refs.rail = rail;
    refs.railButtons = buttons;
  }

  function createViewbar() {
    const viewbar = root.createElement('div');
    viewbar.className = 'workstation-viewbar';

    const tabs = root.createElement('div');
    tabs.className = 'workstation-view-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Primary views');

    const viewTabs = new Map();
    for (const [name, label] of [
      ['main', 'Main'],
      ['mask', 'Mask'],
      ['three', '3D'],
    ]) {
      const button = makeButton(root, 'workstation-view-tab', label, {
        dataset: { view: name },
      });
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', 'false');
      tabs.append(button);
      viewTabs.set(name, button);
    }

    const divider = root.createElement('span');
    divider.className = 'workstation-view-divider';

    const meta = root.createElement('span');
    meta.className = 'workstation-view-meta';

    viewbar.append(tabs, divider, meta);
    refs.appShell.insertBefore(viewbar, refs.workspace);

    refs.viewbar = viewbar;
    refs.viewTabs = viewTabs;
    refs.viewMeta = meta;
  }

  function createTopbarControls() {
    const topbar = root.querySelector('.topbar');
    if (!topbar) return;

    const meta = root.createElement('div');
    meta.className = 'workstation-top-meta';

    const spacer = root.createElement('div');
    spacer.className = 'workstation-top-spacer';

    const actions = root.createElement('div');
    actions.className = 'workstation-layout-actions';

    const overview = makeButton(root, 'workstation-chrome-btn', 'Overview', {
      title: 'Show Main, Mask and 3D together',
    });
    const split = makeButton(root, 'workstation-chrome-btn', 'Split', {
      title: 'Compare Main and 3D',
    });

    actions.append(overview, split);
    topbar.append(meta, spacer, actions);

    refs.topMeta = meta;
    refs.overviewButton = overview;
    refs.splitButton = split;
    updateProjectMeta();
  }

  function createViewStage() {
    const stage = root.createElement('div');
    stage.className = 'workstation-view-stage';

    for (const panel of [refs.mainPanel, refs.maskPanel, refs.threePanel]) {
      stage.append(panel);
    }

    refs.workspace.insertBefore(stage, refs.sectionPanel);
    refs.viewStage = stage;
    refs.viewPanels = new Map([
      ['main', refs.mainPanel],
      ['mask', refs.maskPanel],
      ['three', refs.threePanel],
    ]);
  }

  function setupToolFlyout() {
    refs.toolPanel.classList.add('workstation-tool-flyout');
    refs.appShell.append(refs.toolPanel);

    const head = root.createElement('div');
    head.className = 'workstation-tool-head';

    const title = root.createElement('strong');
    title.textContent = 'Functions';

    const position = root.createElement('span');
    position.className = 'workstation-tool-position';

    const spacer = root.createElement('span');
    spacer.className = 'workstation-tool-head-spacer';

    const close = makeButton(root, 'workstation-tool-close', '×', {
      title: 'Collapse functions',
      ariaLabel: 'Collapse functions',
    });

    head.append(title, position, spacer, close);
    refs.toolPanel.prepend(head);

    refs.toolContent = refs.toolPanel.querySelector('.tool-tab-content');
    refs.toolPosition = position;
    refs.toolClose = close;
    refs.toolSections = new Map();

    for (const name of WORKSTATION_TOOL_ORDER) {
      const meta = TOOL_META[name];
      const section = root.getElementById(meta.id);
      if (!section) continue;

      section.hidden = false;
      section.removeAttribute('role');
      section.removeAttribute('aria-labelledby');
      section.dataset.workstationSection = name;

      const label = root.createElement('div');
      label.className = 'workstation-section-label';
      const strong = root.createElement('strong');
      strong.textContent = meta.label;
      const hint = root.createElement('span');
      hint.textContent = meta.hint;
      label.append(strong, hint);
      section.prepend(label);

      refs.toolContent.append(section);
      refs.toolSections.set(name, section);
    }

    const scrollTail = root.createElement('div');
    scrollTail.className = 'workstation-tool-scroll-tail';
    scrollTail.setAttribute('aria-hidden', 'true');
    refs.toolContent.append(scrollTail);
    refs.toolScrollTail = scrollTail;
    syncToolScrollTail();

    refs.toolPanel.classList.remove('open');
    refs.toolPosition.textContent = TOOL_META[state.activeTool].label;
  }

  function setupSectionDock() {
    const tools = refs.sectionPanel.querySelector('.view-tools');
    if (!tools) return;

    const layersButton = makeButton(root, 'mini-btn workstation-section-layers', 'Layers', {
      title: 'Show or hide the layer legend',
      ariaLabel: 'Show or hide the layer legend',
    });
    layersButton.setAttribute('aria-expanded', 'false');

    const collapseButton = makeButton(root, 'mini-btn workstation-section-collapse', 'Hide', {
      title: 'Hide Section A–B',
      ariaLabel: 'Show or hide Section A–B',
    });
    collapseButton.setAttribute('aria-expanded', 'true');

    tools.append(layersButton, collapseButton);
    refs.sectionLayersButton = layersButton;
    refs.sectionCollapseButton = collapseButton;
  }

  function initialize() {
    if (state.initialized) return true;

    refs.appShell = root.querySelector('.app-shell');
    refs.workspace = root.querySelector('.workspace');
    refs.mainPanel = root.getElementById('mainPanel');
    refs.maskPanel = root.getElementById('maskPanel');
    refs.threePanel = root.getElementById('threePanel');
    refs.toolPanel = root.getElementById('toolPanel');
    refs.sectionPanel = root.getElementById('sectionPanel');

    if (
      !refs.appShell ||
      !refs.workspace ||
      !refs.mainPanel ||
      !refs.maskPanel ||
      !refs.threePanel ||
      !refs.toolPanel ||
      !refs.sectionPanel
    ) {
      return false;
    }

    root.documentElement.classList.add('workstation-ui-v2');
    syncCompactUi();
    createRail();
    createViewbar();
    createTopbarControls();
    createViewStage();
    setupToolFlyout();
    setupSectionDock();

    const compact = syncCompactUi();
    const initialMode = compact
      ? SINGLE_VIEW_MODES.has(rememberedViewMode)
        ? rememberedViewMode
        : 'main'
      : preferredWorkstationViewMode(win.innerWidth, rememberedViewMode);
    applyViewMode(initialMode, { refresh: false, remember: false });

    state.initialized = true;
    return true;
  }

  function bind() {
    if (state.bound) return;
    if (!initialize()) return;
    state.bound = true;

    for (const [name, button] of refs.railButtons) {
      button.addEventListener('click', () => openTool(name, { toggle: true }));
    }

    refs.toolClose.addEventListener('click', closeTools);

    for (const [name, button] of refs.viewTabs) {
      button.addEventListener('click', () => applyViewMode(name));
    }

    refs.overviewButton?.addEventListener('click', () => applyViewMode('overview'));
    refs.splitButton?.addEventListener('click', () => applyViewMode('split'));
    refs.sectionCollapseButton?.addEventListener('click', toggleSectionDock);
    refs.sectionLayersButton?.addEventListener('click', () => {
      const open = refs.sectionPanel.classList.toggle('workstation-legend-open');
      refs.sectionLayersButton.setAttribute('aria-expanded', String(open));
      scheduleViewportRefresh();
    });
    root.querySelectorAll('.view-max-btn').forEach((button) => {
      button.addEventListener('click', closeTools);
    });

    root.getElementById('projectNameInput')?.addEventListener('input', () => updateProjectMeta());
    root.addEventListener('wafercad:project-name-sync', (event) => {
      updateProjectMeta(event.detail?.name);
    });

    refs.rail.addEventListener(
      'wheel',
      (event) => {
        if (Math.abs(event.deltaY) < 4 || state.railWheelLocked) return;
        event.preventDefault();

        const hovered = event.target.closest?.('.workstation-rail-button[data-tool]');
        const baseName = hovered?.dataset.tool || state.activeTool;
        const next = getAdjacentToolName(baseName, event.deltaY);
        openTool(next, { behavior: 'auto' });

        state.railWheelLocked = true;
        win.setTimeout(() => {
          state.railWheelLocked = false;
        }, 120);
      },
      { passive: false },
    );

    let scrollFrame = 0;
    refs.toolContent.addEventListener('scroll', () => {
      if (state.programmaticToolScroll || scrollFrame) return;
      scrollFrame = win.requestAnimationFrame(() => {
        const atBottom =
          refs.toolContent.scrollTop + refs.toolContent.clientHeight >=
          refs.toolContent.scrollHeight - 2;
        if (atBottom) {
          setActiveRail(WORKSTATION_TOOL_ORDER.at(-1));
          scrollFrame = 0;
          return;
        }

        const referenceTop = refs.toolContent.getBoundingClientRect().top + 14;
        let bestName = state.activeTool;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const [name, section] of refs.toolSections) {
          const distance = Math.abs(section.getBoundingClientRect().top - referenceTop);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestName = name;
          }
        }

        setActiveRail(bestName);
        scrollFrame = 0;
      });
    });

    win.addEventListener('resize', () => {
      const mobile = syncCompactUi();
      if (mobile !== state.wasMobile) {
        state.wasMobile = mobile;
        refs.sectionPanel.classList.remove('workstation-legend-open');
        refs.sectionLayersButton?.setAttribute('aria-expanded', 'false');
        if (mobile) {
          applyViewMode(state.currentSingleView, { refresh: false, remember: false });
        } else {
          applyViewMode(state.desktopViewMode, { refresh: false, remember: false });
        }
        scheduleViewportRefresh();
      }
      syncToolScrollTail();
      updateRailAnchor(state.activeTool);
    });

    win.visualViewport?.addEventListener('resize', () => {
      const mobile = syncCompactUi();
      if (mobile !== state.wasMobile) {
        state.wasMobile = mobile;
        applyViewMode(mobile ? state.currentSingleView : state.desktopViewMode);
      }
    });

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && refs.toolPanel.classList.contains('open')) {
        closeTools();
      }
    });

    // Reparenting the view panels changes their available canvas geometry.
    // Refresh once after all bindUi() listeners have had a chance to attach.
    scheduleViewportRefresh();
  }

  initialize();

  return {
    bind,
    closeTools,
    openTool,
    applyViewMode,
    get state() {
      return { ...state };
    },
  };
}
