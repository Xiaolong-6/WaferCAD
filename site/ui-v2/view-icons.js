// Native inline SVG sprite shared by all v2 view panels.
(() => {
  // Original 16px outline set: currentColor, 1.6px round strokes; no icon dependency.
  const iconPaths = {
    code: 'M5 3L1 8l4 5 M11 3l4 5-4 5 M9 2L7 14',
    project: 'M2 4h5l2 2h5v8H2Z M2 4V2h5l2 2',
    mask: 'M2 2h12v12H2Z M5 5h6v6H5Z',
    select: 'M3 2v11l3-3 2 4 2-1-2-4h4Z',
    rectangle: 'M2 3h12v10H2Z',
    circle: 'M3 8a5 5 0 1 0 10 0a5 5 0 1 0-10 0',
    polygon: 'M2 4l5-2 7 4-2 8-8-1Z',
    ring: 'M3 8a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M6 8a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    ringSector: 'M10.5 3.67a5 5 0 0 1 0 8.66L9 9.73a2 2 0 0 0 0-3.46Z',
    delete: 'M2 4h12 M6 2h4 M4 4l1 10h6l1-10 M7 6v6 M9 6v6',
    clear: 'M3 3l10 10 M13 3L3 13 M2 8h2 M12 8h2',
    process: 'M2 4h12 M2 8h12 M2 12h12 M5 2v4 M11 6v4 M6 10v4',
    recipe: 'M4 2h9v12H3V3 M6 5h4 M6 8h4 M6 11h3',
    history: 'M3 4A6 6 0 1 1 2 9 M2 1v4h4 M8 4v4l3 2',
    main: 'M2 4l6-2 6 2-6 2Z M2 8l6 2 6-2 M2 12l6 2 6-2',
    cube: 'M2 4l6-3 6 3v8l-6 3-6-3Z M2 4l6 4 6-4 M8 8v7',
    section: 'M2 3h12v10H2Z M5 3v10 M8 3v10 M11 3v10',
    fit: 'M2 6V2h4 M10 2h4v4 M14 10v4h-4 M6 14H2v-4',
    zoom: 'M10 10l4 4 M5 2a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M3 6h4 M5 4v4',
    pan: 'M8 1v14 M1 8h14 M5 4l3-3 3 3 M5 12l3 3 3-3 M4 5L1 8l3 3 M12 5l3 3-3 3',
    roi: 'M2 5V2h3 M11 2h3v3 M14 11v3h-3 M5 14H2v-3 M5 5h6v6H5Z',
    line: 'M2 13L14 3 M2 11v3h3 M11 2h3v3',
    export: 'M8 10V1 M5 4l3-3 3 3 M2 8v6h12V8',
    maximize: 'M2 6V2h4 M10 2h4v4 M14 10v4h-4 M6 14H2v-4 M5 5l-3-3 M11 5l3-3 M11 11l3 3 M5 11l-3 3',
    more: 'M3 8h.01 M8 8h.01 M13 8h.01',
    play: 'M4 2l10 6-10 6Z',
    stop: 'M3 3h10v10H3Z',
    check: 'M2 8l4 4 8-9',
    warning: 'M8 1l7 13H1Z M8 5v4 M8 11v.1',
    branch: 'M4 2v12 M4 8h5l3-3 M2 2h4 M2 14h4 M10 3h4v4h-4Z',
    save: 'M2 2h10l2 2v10H2Z M5 2v4h6V2 M5 10h6v4H5Z',
    folder: 'M1 4h5l2 2h7l-2 8H1Z M1 4V2h5l2 2h5v2',
    plus: 'M8 2v12 M2 8h12',
    minus: 'M2 8h12',
    back: 'M7 2L1 8l6 6 M1 8h14',
    undo: 'M5 2L1 6l4 4 M1 6h8a4 4 0 0 1 0 8',
    redo: 'M11 2l4 4-4 4 M15 6H7a4 4 0 0 0 0 8',
    close: 'M3 3l10 10 M13 3L3 13',
    eye: 'M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5Z M8 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4',
    zbreak: 'M2 2h12 M2 14h12 M3 6l3-2 4 4 3-2 M3 10l3-2 4 4 3-2',
    quality: 'M8 1l2 4 5 1-4 3 1 5-4-2-4 2 1-5-4-3 5-1Z',
    settings:
      'M6 1h4l.5 2 1.4.8 1.9-.7 2 3.4-1.5 1.3v1.6l1.5 1.3-2 3.4-1.9-.7-1.4.8-.5 2H6l-.5-2-1.4-.8-1.9.7-2-3.4 1.5-1.3V7.8L.2 6.5l2-3.4 1.9.7 1.4-.8Z M6 8a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    palette:
      'M8 1a7 7 0 1 0 0 14h1.2a1.8 1.8 0 0 0 1.2-3.1 1.1 1.1 0 0 1 .8-1.9H13A2 2 0 0 0 15 8a7 7 0 0 0-7-7Z M4.2 7.2h.1 M6.2 4.5h.1 M9.4 4.3h.1 M11.8 6.2h.1',
  };
  function installSprite() {
    const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sprite.setAttribute('aria-hidden', 'true');
    sprite.classList.add('p-sprite');
    for (const [name, path] of Object.entries(iconPaths)) {
      const symbol = document.createElementNS(sprite.namespaceURI, 'symbol');
      symbol.id = `p-icon-${name}`;
      symbol.setAttribute('viewBox', '0 0 16 16');
      const shape = document.createElementNS(sprite.namespaceURI, 'path');
      shape.setAttribute('d', path);
      symbol.append(shape);
      sprite.append(symbol);
    }
    document.body.prepend(sprite);
  }
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'wc-icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(svg.namespaceURI, 'use');
    use.setAttribute('href', `#p-icon-${name}`);
    svg.append(use);
    return svg;
  }

  window.WaferCadV2Icons = Object.freeze({ installSprite, icon, iconPaths });
})();
