import {
  deleteExposedLayer,
  isLayerExposed,
  recolorLayer,
  renameLayer,
} from '../model.js';

const STRUCTURE_PALETTES = {
  balanced: [
    '#6C8EBF',
    '#82B6A6',
    '#D6A85F',
    '#C97B84',
    '#8A7CB8',
    '#6FA9B8',
    '#A98B6C',
    '#7FA178',
    '#B7799C',
    '#7590AA',
  ],
  airy: [
    '#76A9DC',
    '#86C7B5',
    '#E8C97A',
    '#E5A0A8',
    '#A99AD6',
    '#8BC6D2',
    '#C8AA82',
    '#9ABD91',
    '#D29ABD',
    '#91A9C2',
  ],
  warm: [
    '#C77C62',
    '#D49A62',
    '#C9AD68',
    '#A8A36D',
    '#B98273',
    '#C48A9D',
    '#9D8175',
    '#D1A279',
    '#B78D64',
    '#A76F6F',
  ],
  cool: [
    '#5F88B5',
    '#5FA4A5',
    '#7294C6',
    '#7186A7',
    '#7E81B2',
    '#6E9C91',
    '#779FB8',
    '#8A8DB8',
    '#6397A9',
    '#7B94A6',
  ],
};

function hslHex(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return (
    '#' +
    [r, g, b]
      .map((value) =>
        Math.round((value + m) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}

function randomHarmoniousPalette(count = 10) {
  const seed = Math.random() * 360,
    out = [];
  for (let index = 0; index < count; index++) {
    out.push(
      hslHex(
        (seed + index * 137.508) % 360,
        48 + (index % 3) * 4,
        61 + (index % 2) * 5,
      ),
    );
  }
  return out;
}

export { STRUCTURE_PALETTES };

export function createLayerLegendController({
  root = document,
  getModel,
  getActiveStructurePalette,
  setActiveStructurePalette,
  getCustomStructurePalette,
  setCustomStructurePalette,
  getOpenLayerPaletteId,
  setOpenLayerPaletteId,
  saveHistory,
  discardLastHistory,
  syncUndo,
  renderMain,
  renderSection,
  renderThree,
  renderAll,
  updateOperationUI,
  status,
  confirmDelete = (message) => globalThis.confirm(message),
}) {
  const $ = (id) => root.getElementById(id);

  function structurePalette() {
    return (
      getCustomStructurePalette() ||
      STRUCTURE_PALETTES[getActiveStructurePalette()] ||
      STRUCTURE_PALETTES.balanced
    );
  }

  function applyStructurePalette(palette) {
    let index = 0;
    for (const layer of getModel().layers) {
      if (layer.id === 'base') continue;
      recolorLayer(getModel(), layer.id, palette[index % palette.length]);
      index++;
    }
  }

  function renderLayerLegend() {
    const host = $('layerLegend'),
      model = getModel();
    host.innerHTML = '';

    const head = root.createElement('div');
    head.className = 'legend-head';

    const title = root.createElement('div');
    title.className = 'legend-title';
    title.textContent = 'Layers';

    const tools = root.createElement('div');
    tools.className = 'legend-tools';

    const paletteSelect = root.createElement('select');
    paletteSelect.className = 'legend-palette-select';
    paletteSelect.title = 'Structure color palette';
    for (const [key, label] of [
      ['balanced', 'Balanced'],
      ['airy', 'Airy'],
      ['warm', 'Warm'],
      ['cool', 'Cool'],
    ]) {
      paletteSelect.add(new Option(label, key));
    }
    if (getCustomStructurePalette()) paletteSelect.add(new Option('Random', 'random'));
    paletteSelect.value = getCustomStructurePalette() ? 'random' : getActiveStructurePalette();
    paletteSelect.onchange = () => {
      setCustomStructurePalette(null);
      setActiveStructurePalette(paletteSelect.value);
      setOpenLayerPaletteId(null);
      applyStructurePalette(structurePalette());
      renderLayerLegend();
      renderMain();
      renderSection();
      renderThree();
    };

    const randomButton = root.createElement('button');
    randomButton.type = 'button';
    randomButton.className = 'legend-random';
    randomButton.textContent = 'Random';
    randomButton.title = 'Generate and apply a harmonious palette';
    randomButton.onclick = () => {
      const palette = randomHarmoniousPalette();
      setCustomStructurePalette(palette);
      setOpenLayerPaletteId(null);
      applyStructurePalette(palette);
      renderLayerLegend();
      renderMain();
      renderSection();
      renderThree();
    };

    tools.append(paletteSelect, randomButton);
    head.append(title, tools);
    host.append(head);

    const target = $('targetLayer'),
      previous = target.value;
    target.innerHTML = '';
    const palette = structurePalette();

    for (const layer of model.layers) {
      const row = root.createElement('div');
      row.className = 'legend-row-wrap';

      const main = root.createElement('div');
      main.className = 'legend-row';

      const color = root.createElement('button');
      color.type = 'button';
      color.className = 'legend-color-chip';
      color.style.background = layer.color;
      color.title = 'Choose from the active palette';
      color.onclick = () => {
        setOpenLayerPaletteId(getOpenLayerPaletteId() === layer.id ? null : layer.id);
        renderLayerLegend();
      };

      const name = root.createElement('input');
      name.type = 'text';
      name.className = 'legend-name';
      name.value = layer.name;
      name.title = 'Rename layer';
      name.onchange = () => {
        if (!renameLayer(model, layer.id, name.value)) name.value = layer.name;
        renderLayerLegend();
        renderMain();
        renderSection();
        renderThree();
      };

      main.append(color, name);

      if (isLayerExposed(model, layer.id)) {
        const remove = root.createElement('button');
        remove.type = 'button';
        remove.className = 'legend-delete';
        remove.textContent = '×';
        remove.title = `Delete exposed layer "${layer.name}"`;
        remove.setAttribute('aria-label', `Delete exposed layer ${layer.name}`);
        remove.onclick = () => {
          if (!confirmDelete(`Delete exposed layer "${layer.name}"? This can be undone.`)) return;
          saveHistory();
          if (!deleteExposedLayer(model, layer.id)) {
            discardLastHistory();
            syncUndo();
            status('Layer is no longer fully exposed and cannot be deleted.');
            return;
          }
          if (getOpenLayerPaletteId() === layer.id) setOpenLayerPaletteId(null);
          renderAll();
          updateOperationUI();
          status(`Deleted exposed layer "${layer.name}".`);
        };
        main.append(remove);
      }

      row.append(main);

      if (getOpenLayerPaletteId() === layer.id) {
        const grid = root.createElement('div');
        grid.className = 'legend-palette-grid';
        for (const value of palette) {
          const chip = root.createElement('button');
          chip.type = 'button';
          chip.className = 'legend-palette-chip';
          chip.style.background = value;
          chip.title = value;
          chip.onclick = () => {
            recolorLayer(model, layer.id, value);
            setOpenLayerPaletteId(null);
            renderLayerLegend();
            renderMain();
            renderSection();
            renderThree();
          };
          grid.append(chip);
        }
        row.append(grid);
      }

      host.append(row);
      if (layer.id !== 'base') target.add(new Option(layer.name, layer.id));
    }

    if ([...target.options].some((option) => option.value === previous)) target.value = previous;
  }

  return { renderLayerLegend, structurePalette, applyStructurePalette };
}
