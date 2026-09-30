import { availableSelectedLayers } from '../view-interactions.js';

export function createMaskBrowserController({
  root = document,
  getLayout,
  getActiveCell,
  setActiveCellValue,
  getExpandedCells,
  getSelectedLayerKeys,
  getHoveredLayerKey,
  setHoveredLayerKey,
  layerKey,
  layerColor,
  renderMask,
  renderAll,
}) {
  let scopeCacheCell = null,
    scopeCacheHierarchy = null,
    scopeCache = new Set();

  const $ = (id) => root.getElementById(id);

  function hierarchyFromParsed(parsed) {
    const hierarchy = {};
    for (const name of parsed.cellOrder) {
      const counts = new Map(),
        cell = parsed.cells.get(name);
      for (const element of cell?.elements || []) {
        if (element.kind !== 'sref' && element.kind !== 'aref') continue;
        const count =
          element.kind === 'aref'
            ? Math.max(1, element.cols || 1) * Math.max(1, element.rows || 1)
            : 1;
        counts.set(element.name, (counts.get(element.name) || 0) + count);
      }
      hierarchy[name] = [...counts].map(([child, count]) => ({ name: child, count }));
    }
    return hierarchy;
  }

  function ensureHierarchy() {
    const layout = getLayout();
    if (layout.hierarchy && Object.keys(layout.hierarchy).length) return;
    const rootCell = layout.root || '',
      cells = new Set(rootCell ? [rootCell] : []);
    for (const combo of layout.combos || []) cells.add(combo.cell);
    for (const element of layout.linework || []) {
      if (element.sourceCell) cells.add(element.sourceCell);
    }
    layout.hierarchy = {};
    for (const name of cells) layout.hierarchy[name] = [];
    if (rootCell) {
      layout.hierarchy[rootCell] = [...cells]
        .filter((name) => name !== rootCell)
        .map((name) => ({ name, count: 1 }));
    }
  }

  function cellChildren(name) {
    ensureHierarchy();
    return getLayout().hierarchy?.[name] || [];
  }

  function descendantCells(name) {
    const out = new Set();
    function walk(cellName) {
      if (!cellName || out.has(cellName)) return;
      out.add(cellName);
      for (const child of cellChildren(cellName)) walk(child.name);
    }
    walk(name);
    return out;
  }

  function invalidateScope() {
    scopeCacheCell = null;
    scopeCacheHierarchy = null;
    scopeCache = new Set();
  }

  function activeScopeCells() {
    const layout = getLayout(),
      activeCell = getActiveCell();
    if (scopeCacheCell === activeCell && scopeCacheHierarchy === layout.hierarchy)
      return scopeCache;
    scopeCacheCell = activeCell;
    scopeCacheHierarchy = layout.hierarchy;
    scopeCache = activeCell ? descendantCells(activeCell) : new Set();
    return scopeCache;
  }

  function selectedElement(element) {
    return (
      activeScopeCells().has(element.sourceCell) &&
      getSelectedLayerKeys().has(layerKey(element.layer, element.datatype))
    );
  }

  function globalLayers() {
    const map = new Map();
    for (const combo of getLayout().combos || []) {
      const key = layerKey(combo.layer, combo.datatype);
      if (!map.has(key)) {
        map.set(key, {
          key,
          layer: combo.layer,
          datatype: combo.datatype,
          count: 0,
          cells: new Set(),
        });
      }
      const item = map.get(key);
      item.count += combo.count;
      item.cells.add(combo.cell);
    }
    return [...map.values()].sort((a, b) => a.layer - b.layer || a.datatype - b.datatype);
  }

  function syncMaskCellLabel(layers = globalLayers(), scope = activeScopeCells()) {
    const activeCell = getActiveCell();
    if (!activeCell) {
      $('maskCellLabel').textContent = '—';
      return;
    }
    const selected = availableSelectedLayers(layers, getSelectedLayerKeys(), scope);
    $('maskCellLabel').textContent =
      selected.length === 1
        ? `${activeCell} · ${selected[0].layer}/${selected[0].datatype}`
        : selected.length
          ? `${activeCell} · ${selected.length} layers`
          : `${activeCell} · no active layer`;
  }

  function setActiveCell(name) {
    setActiveCellValue(name || null);
    invalidateScope();
    renderCellTree();
    renderMaskList();
    renderMask();
  }

  function renderCellTree() {
    ensureHierarchy();
    const layout = getLayout(),
      host = $('cellTree'),
      rootCell = layout.root || Object.keys(layout.hierarchy || {})[0] || '';
    host.innerHTML = '';
    if (!rootCell) {
      const empty = root.createElement('div');
      empty.className = 'empty-list';
      empty.textContent = 'No mask loaded';
      host.append(empty);
      setActiveCellValue(null);
      invalidateScope();
      return;
    }

    if (!getActiveCell() || !(getActiveCell() in (layout.hierarchy || {}))) {
      setActiveCellValue(rootCell);
      invalidateScope();
    }

    function node(name, depth, path) {
      const children = cellChildren(name),
        row = root.createElement('div');
      row.className =
        'cell-row' + (name === getActiveCell() ? ' active' : '') + (depth === 0 ? ' root' : '');
      row.style.setProperty('--depth', depth);

      const caret = root.createElement('button');
      caret.className = 'cell-caret';
      caret.type = 'button';
      caret.textContent = children.length ? (getExpandedCells().has(name) ? '▾' : '▸') : '';
      caret.disabled = !children.length;
      caret.onclick = (event) => {
        event.stopPropagation();
        const expanded = getExpandedCells();
        expanded.has(name) ? expanded.delete(name) : expanded.add(name);
        renderCellTree();
      };

      const label = root.createElement('button');
      label.className = 'cell-name';
      label.type = 'button';
      label.textContent = name;
      label.onclick = () => setActiveCell(name);

      row.append(caret, label);
      host.append(row);

      if (children.length && getExpandedCells().has(name)) {
        for (const child of children) {
          if (path.includes(child.name)) continue;
          const before = host.children.length;
          node(child.name, depth + 1, [...path, name]);
          if (child.count > 1 && host.children[before]) {
            const count = root.createElement('span');
            count.className = 'cell-count';
            count.textContent = `×${child.count}`;
            host.children[before].append(count);
          }
        }
      }
    }

    node(rootCell, 0, []);
  }

  function renderMaskList() {
    const host = $('maskLayerList'),
      layers = globalLayers(),
      scope = activeScopeCells(),
      selectedLayerKeys = getSelectedLayerKeys();
    host.innerHTML = '';

    if (!layers.length) {
      const empty = root.createElement('div');
      empty.className = 'empty-list';
      empty.textContent = 'No area layers';
      host.append(empty);
    }

    for (const item of layers) {
      const available = [...item.cells].some((cell) => scope.has(cell));
      const row = root.createElement('label');
      row.className =
        'layer-row' +
        (selectedLayerKeys.has(item.key) ? ' selected' : '') +
        (available ? '' : ' unavailable');
      row.onmouseenter = () => {
        setHoveredLayerKey(item.key);
        renderMask();
      };
      row.onmouseleave = () => {
        if (getHoveredLayerKey() === item.key) setHoveredLayerKey(null);
        renderMask();
      };

      const checkbox = root.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedLayerKeys.has(item.key);
      checkbox.onchange = () => {
        checkbox.checked ? selectedLayerKeys.add(item.key) : selectedLayerKeys.delete(item.key);
        renderAll();
      };

      const swatch = root.createElement('span');
      swatch.className = 'layer-swatch';
      swatch.style.background = layerColor(item.key);

      const name = root.createElement('span');
      name.className = 'layer-name';
      name.textContent = `${item.layer}/${item.datatype}`;

      const count = root.createElement('span');
      count.className = 'layer-count';
      count.textContent = item.count;

      row.title = available
        ? `Layer ${item.layer}/${item.datatype} in selected cell hierarchy`
        : `Layer ${item.layer}/${item.datatype} is not present in ${getActiveCell() || 'this cell'}`;
      row.append(checkbox, swatch, name, count);
      host.append(row);
    }

    syncMaskCellLabel(layers, scope);
  }

  return {
    hierarchyFromParsed,
    ensureHierarchy,
    invalidateScope,
    activeScopeCells,
    selectedElement,
    globalLayers,
    syncMaskCellLabel,
    setActiveCell,
    renderCellTree,
    renderMaskList,
  };
}
