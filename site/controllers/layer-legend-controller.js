import {
  layerPresent,
  recolorElectricalRegion,
  recolorImplant,
  recolorLayer,
  renameElectricalRegion,
  renameImplant,
  renameLayer,
  setElectricalRegionDepthProfile,
  setElectricalRegionVisible,
  setImplantDepthProfile,
  setImplantVisible,
  setLayerVisible,
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
    '#5577A8',
    '#6A9B89',
    '#C28D42',
    '#B76570',
    '#7566A7',
    '#548FA2',
    '#8E7459',
    '#668866',
    '#9E6284',
    '#5F7894',
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
    '#5E97CE',
    '#6BB6A2',
    '#DAB75E',
    '#D78893',
    '#9685C7',
    '#72B5C4',
    '#B89569',
    '#83A97A',
    '#C184AA',
    '#7895B1',
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
    '#B96850',
    '#C2844D',
    '#B99A50',
    '#92915A',
    '#A56D60',
    '#B37589',
    '#886C61',
    '#BD8C64',
    '#A47A51',
    '#915C5C',
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
    '#4C76A4',
    '#4B9193',
    '#5D81B5',
    '#5D7295',
    '#696CA1',
    '#5A897E',
    '#628DA7',
    '#7679A6',
    '#4F8396',
    '#677F93',
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

function randomHarmoniousPalette(count = 20) {
  const seed = Math.random() * 360,
    out = [];
  for (let index = 0; index < count; index++) {
    out.push(hslHex((seed + index * 137.508) % 360, 48 + (index % 3) * 4, 61 + (index % 2) * 5));
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
  renderMain,
  renderSection,
  renderThree,
  renderAll,
  updateOperationUI,
  onChanged = () => {},
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
    const model = getModel();
    for (const layer of model.layers) {
      if (layer.id === 'base') continue;
      recolorLayer(model, layer.id, palette[index % palette.length]);
      index++;
    }
    for (const implant of model.implants || []) {
      recolorImplant(model, implant.id, palette[index % palette.length]);
      index++;
    }
    for (const electrical of model.electricalRegions || []) {
      recolorElectricalRegion(model, electrical.id, palette[index % palette.length]);
      index++;
    }
  }

  function colorNewLayer(layerId) {
    const layers = getModel().layers.filter((layer) => layer.id !== 'base'),
      index = layers.findIndex((layer) => layer.id === layerId),
      palette = structurePalette();
    if (index >= 0) recolorLayer(getModel(), layerId, palette[index % palette.length]);
  }

  function colorNewImplant(implantId) {
    const model = getModel(),
      layerCount = model.layers.filter((layer) => layer.id !== 'base').length,
      implantIndex = (model.implants || []).findIndex((implant) => implant.id === implantId),
      palette = structurePalette();
    if (implantIndex >= 0) {
      recolorImplant(model, implantId, palette[(layerCount + implantIndex) % palette.length]);
    }
  }

  function colorNewElectricalRegion(regionId) {
    const model = getModel(),
      layerCount = model.layers.filter((layer) => layer.id !== 'base').length,
      implantCount = (model.implants || []).length,
      regionIndex = (model.electricalRegions || []).findIndex((region) => region.id === regionId),
      palette = structurePalette();
    if (regionIndex >= 0) {
      recolorElectricalRegion(
        model,
        regionId,
        palette[(layerCount + implantCount + regionIndex) % palette.length],
      );
    }
  }

  function buildDepthProfileEditor(item, setProfile, kindLabel) {
    const mode = item.depthProfile === 'smooth' ? 'smooth' : 'follow',
      trigger = root.createElement('button'),
      panel = root.createElement('div'),
      label = root.createElement('span'),
      options = root.createElement('div');

    trigger.type = 'button';
    trigger.className = 'legend-profile-trigger';
    trigger.textContent = mode === 'follow' ? '∿' : '—';
    trigger.title =
      mode === 'follow'
        ? 'Depth profile: Follow offset'
        : 'Depth profile: Smooth';
    trigger.setAttribute('aria-label', `Edit depth profile for ${item.name}`);
    trigger.setAttribute('aria-expanded', 'false');

    panel.className = 'legend-profile-editor';
    panel.hidden = true;
    label.className = 'legend-profile-label';
    label.textContent = 'Depth profile';
    options.className = 'legend-profile-options';

    for (const [value, text, title] of [
      [
        'follow',
        'Follow offset',
        'Inner boundary follows the same surface morphology at the selected depth.',
      ],
      [
        'smooth',
        'Smooth',
        'Keep the inner boundary planar while the entry surface still follows morphology.',
      ],
    ]) {
      const button = root.createElement('button');
      button.type = 'button';
      button.className = 'legend-profile-option';
      button.textContent = text;
      button.title = title;
      button.classList.toggle('active', mode === value);
      button.setAttribute('aria-pressed', String(mode === value));
      button.onclick = () => {
        if (!setProfile(getModel(), item.id, value)) return;
        onChanged();
        renderLayerLegend();
        renderSection();
        renderThree();
      };
      options.append(button);
    }

    trigger.onclick = () => {
      panel.hidden = !panel.hidden;
      trigger.setAttribute('aria-expanded', String(!panel.hidden));
    };

    panel.title = `${kindLabel} depth-boundary display`;
    panel.append(label, options);
    return { trigger, panel };
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
      onChanged();
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
      onChanged();
      renderLayerLegend();
      renderMain();
      renderSection();
      renderThree();
    };

    tools.append(paletteSelect, randomButton);
    head.append(title, tools);
    host.append(head);

    const palette = structurePalette();

    for (const layer of model.layers) {
      const row = root.createElement('div');
      row.className = 'legend-row-wrap';
      const present = layerPresent(model, layer.id);
      row.classList.toggle('layer-absent', !present);
      row.classList.toggle('layer-hidden', layer.visible === false);

      const main = root.createElement('div');
      main.className = 'legend-row';

      const color = root.createElement('button');
      color.type = 'button';
      color.className = 'legend-color-chip';
      color.style.background = layer.color;
      color.disabled = !present;
      color.title = present ? 'Choose from the active palette' : 'Layer is not present in the model';
      color.onclick = () => {
        setOpenLayerPaletteId(getOpenLayerPaletteId() === layer.id ? null : layer.id);
        renderLayerLegend();
      };

      const name = root.createElement('input');
      name.type = 'text';
      name.className = 'legend-name';
      name.value = layer.name;
      name.disabled = !present;
      name.title = present ? 'Rename layer' : 'Layer is not present in the model';
      name.onchange = () => {
        if (!renameLayer(model, layer.id, name.value)) name.value = layer.name;
        onChanged();
        renderLayerLegend();
        renderMain();
        renderSection();
        renderThree();
        updateOperationUI();
      };

      const visible = root.createElement('input');
      visible.type = 'checkbox';
      visible.className = 'legend-visibility';
      visible.checked = layer.visible !== false;
      visible.title = visible.checked ? 'Hide material layer' : 'Show material layer';
      visible.setAttribute('aria-label', `Toggle visibility for ${layer.name}`);
      visible.onchange = () => {
        setLayerVisible(model, layer.id, visible.checked);
        if (!visible.checked && getOpenLayerPaletteId() === layer.id) {
          setOpenLayerPaletteId(null);
        }
        onChanged();
        renderLayerLegend();
        renderAll();
        updateOperationUI();
      };

      main.append(color, name, visible);
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
            onChanged();
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
    }

    for (const implant of model.implants || []) {
      const row = root.createElement('div');
      row.className = 'legend-row-wrap implant-row-wrap';
      row.classList.toggle('implant-hidden', implant.visible === false);

      const main = root.createElement('div');
      main.className = 'legend-row implant-legend-row';

      const color = root.createElement('button');
      color.type = 'button';
      color.className = 'legend-color-chip implant-gradient-chip';
      color.style.background = `linear-gradient(90deg, ${implant.color} 0%, ${implant.color}26 100%)`;
      color.title = 'Choose implant color from the active palette';
      color.onclick = () => {
        setOpenLayerPaletteId(getOpenLayerPaletteId() === implant.id ? null : implant.id);
        renderLayerLegend();
      };

      const name = root.createElement('input');
      name.type = 'text';
      name.className = 'legend-name implant-legend-name';
      name.value = implant.name;
      name.title = 'Rename implant overlay';
      name.onchange = () => {
        if (!renameImplant(model, implant.id, name.value)) name.value = implant.name;
        onChanged();
        renderLayerLegend();
        renderMain();
        renderSection();
        renderThree();
      };

      const visible = root.createElement('input');
      visible.type = 'checkbox';
      visible.className = 'legend-visibility';
      visible.checked = implant.visible !== false;
      visible.title = visible.checked ? 'Hide implant overlay' : 'Show implant overlay';
      visible.setAttribute('aria-label', `Toggle visibility for ${implant.name}`);
      visible.onchange = () => {
        setImplantVisible(model, implant.id, visible.checked);
        onChanged();
        renderLayerLegend();
        renderAll();
      };

      const profileEditor = buildDepthProfileEditor(
        implant,
        setImplantDepthProfile,
        'Implant',
      );

      main.append(color, name, profileEditor.trigger, visible);
      row.append(main, profileEditor.panel);

      if (getOpenLayerPaletteId() === implant.id) {
        const grid = root.createElement('div');
        grid.className = 'legend-palette-grid';
        for (const value of palette) {
          const chip = root.createElement('button');
          chip.type = 'button';
          chip.className = 'legend-palette-chip';
          chip.style.background = `linear-gradient(90deg, ${value} 0%, ${value}26 100%)`;
          chip.title = value;
          chip.onclick = () => {
            recolorImplant(model, implant.id, value);
            onChanged();
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
    }

    for (const electrical of model.electricalRegions || []) {
      const row = root.createElement('div');
      row.className = 'legend-row-wrap electrical-row-wrap';
      row.classList.toggle('electrical-hidden', electrical.visible === false);

      const main = root.createElement('div');
      main.className = 'legend-row electrical-legend-row';

      const color = root.createElement('button');
      color.type = 'button';
      color.className = 'legend-color-chip electrical-region-chip';
      color.style.background =
        `linear-gradient(135deg, ${electrical.color} 0%, ${electrical.color} 52%, ${electrical.color}38 52%, ${electrical.color}38 100%)`;
      color.title = 'Choose electrical-region color from the active palette';
      color.onclick = () => {
        setOpenLayerPaletteId(getOpenLayerPaletteId() === electrical.id ? null : electrical.id);
        renderLayerLegend();
      };

      const name = root.createElement('input');
      name.type = 'text';
      name.className = 'legend-name electrical-legend-name';
      name.value = electrical.name;
      name.title = `${electrical.regionType} · ${electrical.source} — rename electrical region`;
      name.onchange = () => {
        if (!renameElectricalRegion(model, electrical.id, name.value)) name.value = electrical.name;
        onChanged();
        renderLayerLegend();
        renderMain();
        renderSection();
        renderThree();
      };

      const visible = root.createElement('input');
      visible.type = 'checkbox';
      visible.className = 'legend-visibility';
      visible.checked = electrical.visible !== false;
      visible.title = visible.checked ? 'Hide electrical region' : 'Show electrical region';
      visible.setAttribute('aria-label', `Toggle visibility for ${electrical.name}`);
      visible.onchange = () => {
        setElectricalRegionVisible(model, electrical.id, visible.checked);
        onChanged();
        renderLayerLegend();
        renderAll();
      };

      const profileEditor = buildDepthProfileEditor(
        electrical,
        setElectricalRegionDepthProfile,
        'Electrical Region',
      );

      main.append(color, name, profileEditor.trigger, visible);
      row.append(main, profileEditor.panel);

      if (getOpenLayerPaletteId() === electrical.id) {
        const grid = root.createElement('div');
        grid.className = 'legend-palette-grid';
        for (const value of palette) {
          const chip = root.createElement('button');
          chip.type = 'button';
          chip.className = 'legend-palette-chip';
          chip.style.background =
            `linear-gradient(135deg, ${value} 0%, ${value} 52%, ${value}38 52%, ${value}38 100%)`;
          chip.title = value;
          chip.onclick = () => {
            recolorElectricalRegion(model, electrical.id, value);
            onChanged();
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
    }
  }

  return {
    renderLayerLegend,
    structurePalette,
    applyStructurePalette,
    colorNewLayer,
    colorNewImplant,
    colorNewElectricalRegion,
  };
}
