const DOCK_KEY = 'wafercad.ui.inspector.docked.v1';

const COMMANDS = Object.freeze([
  { id: 'project', group: 'Workspace', label: 'Project settings', hint: 'Files, save, recovery', tool: 'project' },
  { id: 'base', group: 'Workspace', label: 'Base substrate', hint: 'Geometry and dimensions', tool: 'base' },
  { id: 'mask', group: 'Workspace', label: 'Mask editor', hint: 'Layout, cells and drawing', tool: 'mask' },
  { id: 'process', group: 'Workspace', label: 'Process steps and recipe', hint: 'Build device geometry', tool: 'process' },
  { id: 'history', group: 'Workspace', label: 'History and variants', hint: 'Inspect and restore steps', tool: 'snapshots' },
  { id: 'overview', group: 'Views', label: 'Overview layout', hint: 'Main, Mask and 3D', view: 'overview' },
  { id: 'main', group: 'Views', label: 'Main view', hint: 'Top-down surface', view: 'main' },
  { id: 'mask-view', group: 'Views', label: 'Mask view', hint: 'Mask geometry', view: 'mask' },
  { id: 'three', group: 'Views', label: '3D view', hint: 'Structure and morphology', view: 'three' },
  { id: 'split', group: 'Views', label: 'Split comparison', hint: 'Compare two views', view: 'split' },
]);

export function filterIntelligentCommands(query, commands = COMMANDS) {
  const words = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...commands];
  const needle = words.join(' ');
  const rank = (command) => {
    const label = command.label.toLocaleLowerCase();
    if (label === needle) return 0;
    if (label.startsWith(needle)) return 1;
    if (label.includes(needle)) return 2;
    if (command.hint.toLocaleLowerCase().includes(needle)) return 3;
    return 4;
  };
  return commands
    .filter((command) => {
      const text = [command.label, command.hint, command.group].join(' ').toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => rank(a) - rank(b));
}

export function createIntelligentUi({ root = document, win = window, workstation } = {}) {
  let initialized = false;
  let dockPreference = true;
  let previousFocus = null;
  let selectedIndex = 0;
  let visibleCommands = [];

  const refs = {};

  function isDocked() {
    return dockPreference && win.innerWidth >= 1180;
  }

  function syncDock() {
    const docked = isDocked();
    root.documentElement.classList.toggle('intelligent-ui-docked', docked);
    if (!docked) root.documentElement.classList.remove('intelligent-inspector-collapsed');
    if (refs.dock) {
      refs.dock.setAttribute('aria-pressed', String(dockPreference));
      refs.dock.textContent = dockPreference ? 'Undock' : 'Dock';
      refs.dock.title = dockPreference ? 'Use an overlay inspector' : 'Pin inspector beside the canvas';
    }
    if (docked) {
      workstation.openTool(workstation.state.activeTool || 'project', { behavior: 'auto' });
    }
  }

  function setDockPreference(next) {
    dockPreference = Boolean(next);
    try {
      win.sessionStorage?.setItem(DOCK_KEY, String(dockPreference));
    } catch {}
    syncDock();
    win.dispatchEvent(new Event('resize'));
  }

  function closePalette() {
    if (refs.dialog.hidden) return;
    refs.dialog.hidden = true;
    root.documentElement.classList.remove('intelligent-command-open');
    previousFocus?.focus?.();
  }

  function execute(command) {
    closePalette();
    if (command.tool) workstation.openTool(command.tool, { behavior: 'auto' });
    if (command.view) workstation.applyViewMode(command.view);
  }

  function render(query = '') {
    visibleCommands = filterIntelligentCommands(query);
    selectedIndex = Math.min(selectedIndex, Math.max(0, visibleCommands.length - 1));
    refs.results.replaceChildren();
    if (!visibleCommands.length) {
      const empty = root.createElement('p');
      empty.className = 'intelligent-command-empty';
      empty.textContent = 'No matching commands';
      refs.results.append(empty);
      return;
    }
    visibleCommands.forEach((command, index) => {
      const row = root.createElement('button');
      row.type = 'button';
      row.className = 'intelligent-command-item';
      row.dataset.selected = String(index === selectedIndex);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === selectedIndex));
      const primary = root.createElement('span');
      primary.className = 'intelligent-command-primary';
      primary.textContent = command.label;
      const meta = root.createElement('span');
      meta.className = 'intelligent-command-hint';
      meta.textContent = command.hint;
      row.append(primary, meta);
      row.addEventListener('mouseenter', () => select(index));
      row.addEventListener('click', () => execute(command));
      refs.results.append(row);
    });
  }

  function select(index) {
    selectedIndex = index;
    refs.results.querySelectorAll('[role="option"]').forEach((node, i) => {
      node.dataset.selected = String(i === index);
      node.setAttribute('aria-selected', String(i === index));
    });
  }

  function openPalette() {
    if (!refs.dialog.hidden) return;
    previousFocus = root.activeElement;
    refs.dialog.hidden = false;
    root.documentElement.classList.add('intelligent-command-open');
    refs.input.value = '';
    selectedIndex = 0;
    render();
    refs.input.focus();
  }

  function createPalette() {
    const dialog = root.createElement('div');
    dialog.id = 'intelligentCommandPalette';
    dialog.className = 'intelligent-command-backdrop';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'WaferCAD commands');
    dialog.setAttribute('aria-modal', 'true');
    dialog.hidden = true;

    const surface = root.createElement('div');
    surface.className = 'intelligent-command-surface';
    const heading = root.createElement('div');
    heading.className = 'intelligent-command-heading';
    heading.textContent = 'Quick actions';
    const keyboard = root.createElement('span');
    keyboard.textContent = 'Esc to close';
    heading.append(keyboard);

    const input = root.createElement('input');
    input.id = 'intelligentCommandInput';
    input.type = 'search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Search views and tools…';
    input.setAttribute('aria-label', 'Search commands');
    input.setAttribute('aria-controls', 'intelligentCommandResults');

    const results = root.createElement('div');
    results.id = 'intelligentCommandResults';
    results.className = 'intelligent-command-results';
    results.setAttribute('role', 'listbox');
    results.setAttribute('aria-label', 'Available commands');
    surface.append(heading, input, results);
    dialog.append(surface);
    root.body.append(dialog);
    refs.dialog = dialog;
    refs.input = input;
    refs.results = results;

    dialog.addEventListener('pointerdown', (event) => {
      if (event.target === dialog) closePalette();
    });
    input.addEventListener('input', () => {
      selectedIndex = 0;
      render(input.value);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (visibleCommands.length) {
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          select((selectedIndex + delta + visibleCommands.length) % visibleCommands.length);
          refs.results.children[selectedIndex]?.scrollIntoView({ block: 'nearest' });
        }
      } else if (event.key === 'Enter' && visibleCommands[selectedIndex]) {
        event.preventDefault();
        execute(visibleCommands[selectedIndex]);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        input.focus();
      }
    });
  }

  function bind() {
    if (initialized || !workstation || root.documentElement.classList.contains('welcome-project-preview')) return;
    initialized = true;
    root.documentElement.classList.add('intelligent-ui');
    try {
      dockPreference = win.sessionStorage?.getItem(DOCK_KEY) !== 'false';
    } catch {}

    const dock = root.createElement('button');
    dock.id = 'intelligentInspectorDockBtn';
    dock.type = 'button';
    dock.className = 'intelligent-inspector-toggle';
    dock.setAttribute('aria-label', 'Dock or undock inspector');
    dock.addEventListener('click', () => setDockPreference(!dockPreference));
    const head = root.querySelector('#toolPanel .workstation-tool-head');
    head?.insertBefore(dock, head.querySelector('.workstation-tool-close'));
    refs.dock = dock;

    const action = root.createElement('button');
    action.id = 'intelligentActionButton';
    action.className = 'intelligent-quick-action';
    action.type = 'button';
    action.textContent = 'Search actions';
    action.title = 'Search tools and views (Ctrl/⌘ K)';
    action.setAttribute('aria-keyshortcuts', 'Control+K Meta+K');
    action.addEventListener('click', openPalette);
    const topbar = root.querySelector('.topbar');
    topbar?.insertBefore(action, topbar.querySelector('.workstation-top-spacer'));
    refs.action = action;

    createPalette();
    syncDock();
    win.addEventListener('resize', () => {
      const before = root.documentElement.classList.contains('intelligent-ui-docked');
      const after = isDocked();
      if (before !== after) syncDock();
    });

    root.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        openPalette();
      } else if (event.key === 'Escape' && !refs.dialog.hidden) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closePalette();
      }
    }, true);
  }

  return { bind, openPalette, closePalette };
}
