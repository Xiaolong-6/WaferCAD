// Same keys and mode/split semantics as legacy; no core or persistence imports.
(() => {
  const modeKey = 'wafercad.workstation-view-mode.v1';
  const splitKey = 'wafercad.workstation-split-views.v1';
  const singles = Object.freeze(['main', 'mask', 'three']);
  const modes = Object.freeze([...singles, 'overview', 'split']);
  function preferredMode(width, remembered = '') {
    if (Number(width) <= 820) return singles.includes(remembered) ? remembered : 'main';
    if (modes.includes(remembered)) return remembered;
    return Number(width) >= 1121 ? 'overview' : 'main';
  }
  function normalizeSplit(value) {
    const source = Array.isArray(value) ? value : [];
    const left = singles.includes(source[0]) ? source[0] : 'main';
    const requested = singles.includes(source[1]) ? source[1] : 'three';
    const right = requested !== left ? requested : singles.find((name) => name !== left);
    return [left, right];
  }
  function replaceSlot(value, slot, name) {
    const current = normalizeSplit(value);
    if (!singles.includes(name)) return current;
    const index = slot === 'right' || slot === 1 ? 1 : 0;
    const other = 1 - index;
    if (current[index] === name) return current;
    if (current[other] === name) return index === 0 ? [name, current[0]] : [current[1], name];
    current[index] = name;
    return current;
  }
  function readMode(win) {
    try {
      return String(win.sessionStorage.getItem(modeKey) || '');
    } catch {
      return '';
    }
  }
  function readSplit(win) {
    try {
      return normalizeSplit(JSON.parse(win.sessionStorage.getItem(splitKey)));
    } catch {
      return ['main', 'three'];
    }
  }
  function remember(win, mode, split) {
    try {
      if (modes.includes(mode)) win.sessionStorage.setItem(modeKey, mode);
      if (mode === 'split')
        win.sessionStorage.setItem(splitKey, JSON.stringify(normalizeSplit(split)));
    } catch {
      /* file:// or denied storage: shell remains usable */
    }
  }
  function compact(win) {
    return (
      Number(win.innerWidth) <= 820 ||
      (win.matchMedia('(pointer: coarse)').matches && Number(win.screen.width) <= 820)
    );
  }
  function viewportWidth(win) {
    return compact(win) ? Math.min(Number(win.innerWidth), 820) : Number(win.innerWidth);
  }
  globalThis.WaferCadV2ViewState = Object.freeze({
    modeKey,
    splitKey,
    singles,
    modes,
    preferredMode,
    normalizeSplit,
    replaceSlot,
    readMode,
    readSplit,
    remember,
    compact,
    viewportWidth,
  });
})();
