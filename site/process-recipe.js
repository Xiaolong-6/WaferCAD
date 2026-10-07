const COMMANDS = new Set([
  'deposit',
  'extend',
  'etch',
  'implant',
  'electrical',
  'record',
  'snapshot',
]);

const UNIT_SCALE_UM = Object.freeze({
  nm: 1e-3,
  um: 1,
  'µm': 1,
  mm: 1e3,
});

function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export function recipeLengthUm(value, label = 'Length') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
    return value;
  }
  const text = cleanText(value);
  const match = text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(nm|um|µm|mm)?$/i);
  if (!match) throw new Error(`${label} must be a number with optional nm, µm/um, or mm units.`);
  const unit = match[2] || 'um';
  const scale = UNIT_SCALE_UM[unit.toLowerCase()] ?? UNIT_SCALE_UM[unit];
  return Number(match[1]) * scale;
}

function normalizeArea(value) {
  const area = cleanText(value, 'full').toLowerCase().replace(/[\s-]+/g, '_');
  if (['full', 'whole_face', 'whole'].includes(area)) return 'full';
  if (['mask', 'selected_mask', 'selected'].includes(area)) return 'mask';
  if (['invert', 'invert_mask', 'inverse'].includes(area)) return 'invert';
  throw new Error(`Unsupported recipe area "${value}".`);
}

function normalizeCoverage(value, { allowTransfer = false } = {}) {
  const mode = cleanText(value, 'directional').toLowerCase();
  if (['directional', 'direct'].includes(mode)) return 'direct';
  if (mode === 'conformal') return 'conformal';
  if (allowTransfer && ['transfer', 'laminate'].includes(mode)) return 'transfer';
  throw new Error(`Unsupported coverage "${value}".`);
}

function normalizeMask(mask) {
  if (mask == null) return null;
  if (typeof mask === 'string') {
    return { sourceMode: 'file', cell: mask, layerKeys: [] };
  }
  if (!mask || typeof mask !== 'object' || Array.isArray(mask)) {
    throw new Error('mask must be a string or object.');
  }
  const sourceMode = mask.source === 'draw' || mask.sourceMode === 'draw' ? 'draw' : 'file';
  const layerKeys = Array.isArray(mask.layers)
    ? mask.layers.map((value) => String(value))
    : Array.isArray(mask.layerKeys)
      ? mask.layerKeys.map((value) => String(value))
      : [];
  return {
    sourceMode,
    ...(mask.cell ? { cell: String(mask.cell) } : {}),
    layerKeys,
    ...(mask.transform && typeof mask.transform === 'object'
      ? { transform: structuredClone(mask.transform) }
      : {}),
    ...(Object.hasOwn(mask, 'roi') ? { roi: structuredClone(mask.roi) } : {}),
    ...(sourceMode === 'draw' && mask.drawMask && typeof mask.drawMask === 'object'
      ? { drawMask: structuredClone(mask.drawMask) }
      : {}),
  };
}

function normalizeStep(command, input, index = 0) {
  if (!COMMANDS.has(command)) throw new Error(`Unsupported recipe command "${command}".`);
  if (command === 'snapshot') {
    const name =
      typeof input === 'string' ? cleanText(input, `Step ${index + 1}`) : cleanText(input?.name, `Step ${index + 1}`);
    return { id: `recipe-step-${index + 1}`, command, params: { name } };
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${command}() requires an object argument.`);
  }

  const params = structuredClone(input);
  if (Object.hasOwn(params, 'mask')) params.mask = normalizeMask(params.mask);
  if (Object.hasOwn(params, 'area')) params.area = normalizeArea(params.area);

  if (command === 'deposit') {
    params.material = cleanText(params.material || params.name);
    if (!params.material) throw new Error('deposit.material is required.');
    params.thicknessUm = recipeLengthUm(params.thickness, 'deposit.thickness');
    if (!(params.thicknessUm > 0)) throw new Error('deposit.thickness must be greater than zero.');
    params.coverage = normalizeCoverage(params.coverage || params.mode, { allowTransfer: true });
    params.area = normalizeArea(params.area);
    params.face = params.face === 'back' ? 'back' : 'front';
    delete params.thickness;
    delete params.mode;
  } else if (command === 'extend') {
    params.material = cleanText(params.material || params.target);
    if (!params.material) throw new Error('extend.material is required.');
    params.thicknessUm = recipeLengthUm(params.thickness, 'extend.thickness');
    if (!(params.thicknessUm > 0)) throw new Error('extend.thickness must be greater than zero.');
    params.coverage = normalizeCoverage(params.coverage || params.mode);
    params.area = normalizeArea(params.area);
    params.face = params.face === 'back' ? 'back' : 'front';
    delete params.thickness;
    delete params.mode;
    delete params.target;
  } else if (command === 'etch') {
    params.profile = cleanText(params.profile, 'directional').toLowerCase();
    if (!['directional', 'isotropic', 'planarize', 'undercut'].includes(params.profile)) {
      throw new Error(`Unsupported etch profile "${params.profile}".`);
    }
    const lengthKey = params.profile === 'planarize' ? 'targetZ' : 'depth';
    const sourceLength = params[lengthKey] ?? params.thickness;
    params.thicknessUm = recipeLengthUm(sourceLength, `etch.${lengthKey}`);
    if (params.profile !== 'planarize' && !(params.thicknessUm > 0)) {
      throw new Error(`etch.${lengthKey} must be greater than zero.`);
    }
    params.target = cleanText(params.target);
    if (['isotropic', 'undercut'].includes(params.profile) && !params.target) {
      throw new Error(`etch.target is required for ${params.profile}.`);
    }
    params.area = normalizeArea(params.area);
    params.face = params.face === 'back' ? 'back' : 'front';
    params.surface = params.surface ?? 'smooth';
    delete params.depth;
    delete params.targetZ;
    delete params.thickness;
  } else if (command === 'implant') {
    params.name = cleanText(params.name, 'Implant');
    params.depthUm = recipeLengthUm(params.depth ?? params.thickness, 'implant.depth');
    if (!(params.depthUm > 0)) throw new Error('implant.depth must be greater than zero.');
    params.tilt = Number(params.tilt ?? 0);
    if (!Number.isFinite(params.tilt) || params.tilt < -80 || params.tilt > 80) {
      throw new Error('implant.tilt must be between -80 and 80 degrees.');
    }
    params.area = normalizeArea(params.area);
    params.face = params.face === 'back' ? 'back' : 'front';
    delete params.depth;
    delete params.thickness;
  } else if (command === 'electrical') {
    params.name = cleanText(params.name, 'Electrical Region');
    params.depthUm = recipeLengthUm(params.depth ?? params.thickness, 'electrical.depth');
    if (!(params.depthUm > 0)) throw new Error('electrical.depth must be greater than zero.');
    params.regionType = cleanText(params.regionType || params.type, 'p-inversion');
    params.source = cleanText(params.source, 'induced');
    params.area = normalizeArea(params.area);
    params.face = params.face === 'back' ? 'back' : 'front';
    delete params.depth;
    delete params.thickness;
    delete params.type;
  } else if (command === 'record') {
    params.process = cleanText(params.process || params.processType, 'custom');
    params.label = cleanText(params.label, params.process);
    if (params.temperatureC != null && params.temperatureC !== '') {
      params.temperatureC = Number(params.temperatureC);
      if (!Number.isFinite(params.temperatureC)) throw new Error('record.temperatureC must be finite.');
    } else params.temperatureC = null;
    if (params.durationMin != null && params.durationMin !== '') {
      params.durationMin = Number(params.durationMin);
      if (!Number.isFinite(params.durationMin) || params.durationMin < 0) {
        throw new Error('record.durationMin must be zero or greater.');
      }
    } else params.durationMin = null;
    params.ambient = cleanText(params.ambient) || null;
    params.note = cleanText(params.note) || null;
    delete params.processType;
  }

  return { id: `recipe-step-${index + 1}`, command, params };
}

export function normalizeProcessRecipe(value = {}) {
  const inputSteps = Array.isArray(value.steps) ? value.steps : [];
  const steps = inputSteps.map((step, index) => {
    const command = cleanText(step?.command || step?.kind).toLowerCase();
    const source = step?.params ?? step?.arguments ?? step;
    const normalized = normalizeStep(command, source, index);
    if (step?.id) normalized.id = String(step.id);
    return normalized;
  });
  return {
    version: 1,
    name: cleanText(value.name, 'Process Recipe'),
    steps,
    activeStepId: steps.some((step) => step.id === value.activeStepId)
      ? value.activeStepId
      : steps[0]?.id || null,
  };
}

class LiteralParser {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }
  error(message) {
    throw new Error(`${message} at character ${this.index + 1}.`);
  }
  skip() {
    while (this.index < this.source.length) {
      const ch = this.source[this.index];
      if (/\s/.test(ch)) {
        this.index += 1;
        continue;
      }
      if (ch === '/' && this.source[this.index + 1] === '/') {
        this.index += 2;
        while (this.index < this.source.length && this.source[this.index] !== '\n') this.index += 1;
        continue;
      }
      if (ch === '/' && this.source[this.index + 1] === '*') {
        const end = this.source.indexOf('*/', this.index + 2);
        if (end < 0) this.error('Unterminated comment');
        this.index = end + 2;
        continue;
      }
      break;
    }
  }
  peek() {
    this.skip();
    return this.source[this.index];
  }
  take(expected) {
    this.skip();
    if (this.source[this.index] !== expected) this.error(`Expected "${expected}"`);
    this.index += 1;
  }
  identifier() {
    this.skip();
    const match = this.source.slice(this.index).match(/^[A-Za-z_$][\w$]*/);
    if (!match) this.error('Expected identifier');
    this.index += match[0].length;
    return match[0];
  }
  string() {
    this.skip();
    const quote = this.source[this.index++];
    let out = '';
    while (this.index < this.source.length) {
      const ch = this.source[this.index++];
      if (ch === quote) return out;
      if (ch !== '\\') {
        out += ch;
        continue;
      }
      if (this.index >= this.source.length) this.error('Unterminated string escape');
      const esc = this.source[this.index++];
      const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'" };
      if (esc === 'u') {
        const hex = this.source.slice(this.index, this.index + 4);
        if (!/^[0-9a-f]{4}$/i.test(hex)) this.error('Invalid unicode escape');
        out += String.fromCharCode(parseInt(hex, 16));
        this.index += 4;
      } else out += Object.hasOwn(map, esc) ? map[esc] : esc;
    }
    this.error('Unterminated string');
  }
  number() {
    this.skip();
    const match = this.source.slice(this.index).match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) this.error('Expected number');
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) this.error('Number must be finite');
    return value;
  }
  array() {
    this.take('[');
    const out = [];
    while (true) {
      if (this.peek() === ']') {
        this.index += 1;
        return out;
      }
      out.push(this.value());
      const next = this.peek();
      if (next === ',') {
        this.index += 1;
        if (this.peek() === ']') {
          this.index += 1;
          return out;
        }
      } else if (next === ']') {
        this.index += 1;
        return out;
      } else this.error('Expected "," or "]"');
    }
  }
  object() {
    this.take('{');
    const out = {};
    while (true) {
      if (this.peek() === '}') {
        this.index += 1;
        return out;
      }
      const key = ['"', "'"].includes(this.peek()) ? this.string() : this.identifier();
      this.take(':');
      out[key] = this.value();
      const next = this.peek();
      if (next === ',') {
        this.index += 1;
        if (this.peek() === '}') {
          this.index += 1;
          return out;
        }
      } else if (next === '}') {
        this.index += 1;
        return out;
      } else this.error('Expected "," or "}"');
    }
  }
  value() {
    this.skip();
    const ch = this.source[this.index];
    if (ch === '{') return this.object();
    if (ch === '[') return this.array();
    if (ch === '"' || ch === "'") return this.string();
    if (/[+\-.\d]/.test(ch || '')) return this.number();
    const id = this.identifier();
    if (id === 'true') return true;
    if (id === 'false') return false;
    if (id === 'null') return null;
    this.error(`Unsupported literal "${id}"`);
  }
}

export function parseProcessRecipeSource(source, { name = 'Process Recipe' } = {}) {
  const parser = new LiteralParser(String(source ?? ''));
  const steps = [];
  while (true) {
    parser.skip();
    if (parser.index >= parser.source.length) break;
    const command = parser.identifier().toLowerCase();
    if (!COMMANDS.has(command)) {
      throw new Error(`Unsupported recipe command "${command}". Allowed: ${[...COMMANDS].join(', ')}.`);
    }
    parser.take('(');
    let argument = {};
    if (parser.peek() !== ')') argument = parser.value();
    parser.take(')');
    parser.skip();
    if (parser.source[parser.index] === ';') parser.index += 1;
    steps.push(normalizeStep(command, argument, steps.length));
  }
  return normalizeProcessRecipe({ version: 1, name, steps });
}

function quote(value) {
  return JSON.stringify(value);
}

function serializeMask(mask, indent = '  ') {
  if (!mask) return '';
  const source = mask.sourceMode || 'file';
  const fields = [`source: ${quote(source)}`];
  if (mask.cell) fields.push(`cell: ${quote(mask.cell)}`);
  if (mask.layerKeys?.length) fields.push(`layers: ${JSON.stringify(mask.layerKeys)}`);
  if (mask.transform) fields.push(`transform: ${JSON.stringify(mask.transform)}`);
  if (Object.hasOwn(mask, 'roi')) fields.push(`roi: ${JSON.stringify(mask.roi)}`);
  if (source === 'draw' && mask.drawMask) fields.push(`drawMask: ${JSON.stringify(mask.drawMask)}`);
  return `{ ${fields.join(', ')} }`;
}

function displayLength(um) {
  const value = Number(um);
  if (Math.abs(value) < 1 && Math.abs(value) >= 1e-3) return `${Number((value * 1000).toPrecision(8))} nm`;
  if (Math.abs(value) >= 1000) return `${Number((value / 1000).toPrecision(8))} mm`;
  return `${Number(value.toPrecision(8))} µm`;
}

export function serializeProcessRecipe(recipeValue) {
  const recipe = normalizeProcessRecipe(recipeValue);
  return recipe.steps
    .map((step) => {
      const p = step.params || {};
      if (step.command === 'snapshot') return `snapshot(${quote(p.name)});`;
      const lines = [];
      const add = (key, value, raw = false) => {
        if (value == null || value === '') return;
        lines.push(`  ${key}: ${raw ? value : quote(value)}`);
      };
      if (step.command === 'deposit') {
        add('material', p.material);
        add('thickness', displayLength(p.thicknessUm));
        add('coverage', p.coverage === 'direct' ? 'directional' : p.coverage);
      } else if (step.command === 'extend') {
        add('material', p.material);
        add('thickness', displayLength(p.thicknessUm));
        add('coverage', p.coverage === 'direct' ? 'directional' : p.coverage);
      } else if (step.command === 'etch') {
        add('target', p.target);
        add(p.profile === 'planarize' ? 'targetZ' : 'depth', displayLength(p.thicknessUm));
        add('profile', p.profile);
        if (p.surface && p.surface !== 'smooth') add('surface', JSON.stringify(p.surface), true);
      } else if (step.command === 'implant') {
        add('name', p.name);
        add('depth', displayLength(p.depthUm));
        if (p.tilt) lines.push(`  tilt: ${p.tilt}`);
      } else if (step.command === 'electrical') {
        add('name', p.name);
        add('depth', displayLength(p.depthUm));
        add('regionType', p.regionType);
        add('source', p.source);
      } else if (step.command === 'record') {
        add('process', p.process);
        add('label', p.label);
        if (p.temperatureC != null) lines.push(`  temperatureC: ${p.temperatureC}`);
        if (p.durationMin != null) lines.push(`  durationMin: ${p.durationMin}`);
        add('ambient', p.ambient);
        add('note', p.note);
      }
      if (!['record'].includes(step.command)) {
        add('face', p.face || 'front');
        add('area', p.area || 'full');
        if (p.area !== 'full' && p.mask) add('mask', serializeMask(p.mask), true);
      }
      return `${step.command}({\n${lines.join(',\n')}\n});`;
    })
    .join('\n\n');
}

export function recipeStepLabel(step) {
  const p = step?.params || {};
  if (step?.command === 'deposit') return `Deposit ${p.material || 'layer'}`;
  if (step?.command === 'extend') return `Extend ${p.material || 'layer'}`;
  if (step?.command === 'etch') return `${p.profile === 'planarize' ? 'Planarize' : 'Etch'}${p.target ? ` ${p.target}` : ''}`;
  if (step?.command === 'implant') return `Implant ${p.name || ''}`.trim();
  if (step?.command === 'electrical') return `Electrical ${p.name || ''}`.trim();
  if (step?.command === 'record') return p.label || 'Record process';
  if (step?.command === 'snapshot') return `Snapshot · ${p.name || 'milestone'}`;
  return 'Process step';
}

export function recipeStepSummary(step) {
  const p = step?.params || {};
  const area = p.area && p.area !== 'full' ? ` · ${p.area}` : '';
  if (step?.command === 'deposit' || step?.command === 'extend') {
    return `${displayLength(p.thicknessUm)} · ${p.coverage === 'direct' ? 'Directional' : p.coverage}${area}`;
  }
  if (step?.command === 'etch') return `${displayLength(p.thicknessUm)} · ${p.profile}${area}`;
  if (step?.command === 'implant' || step?.command === 'electrical') return `${displayLength(p.depthUm)}${area}`;
  if (step?.command === 'record') return [p.process, p.durationMin == null ? '' : `${p.durationMin} min`].filter(Boolean).join(' · ');
  if (step?.command === 'snapshot') return 'Named milestone';
  return '';
}

export function recipeTemplate(id = 'blank') {
  const templates = {
    blank: { name: 'Process Recipe', steps: [] },
    'deposit-etch': {
      name: 'Deposit + Etch',
      steps: [
        { command: 'deposit', params: { material: 'SiO2', thickness: '100 nm', coverage: 'directional', area: 'full' } },
        { command: 'etch', params: { target: 'SiO2', depth: '100 nm', profile: 'directional', area: 'mask' } },
      ],
    },
    conformal: {
      name: 'Conformal coating',
      steps: [
        { command: 'deposit', params: { material: 'Al2O3', thickness: '30 nm', coverage: 'conformal', area: 'full' } },
      ],
    },
    implant: {
      name: 'Implant',
      steps: [
        { command: 'implant', params: { name: 'Implant 1', depth: '500 nm', tilt: 0, area: 'mask' } },
      ],
    },
  };
  return normalizeProcessRecipe(templates[id] || templates.blank);
}
