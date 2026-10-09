import { installSprite, icon, iconPaths } from './prototype-icons.js';
import {
  el,
  button,
  select,
  field,
  stepper,
  emptyState,
  busy,
  panelHeader,
  divider,
  toolbar,
  row,
  notice,
} from './prototype-components.js';

const root = document.querySelector('#prototype-root');
const query = new URL(window.location.href).searchParams;
const state = {
  layout: 'a',
  example: query.get('example') === 'photodetector' ? 'photodetector' : 'm3d',
  placement: 'process',
  font: query.get('font') === 'system' ? 'system' : 'inter',
  domain: ['project', 'mask', 'process', 'recipe', 'code', 'history'].includes(query.get('domain'))
    ? query.get('domain')
    : query.get('scene') === 'recipe-failure'
      ? 'recipe'
      : query.get('scene') === 'empty-history'
        ? 'history'
        : 'process',
  mode: 'overview',
  view: 'main',
  mobile: query.get('scene') === 'empty-history' ? 'view' : 'edit',
  section: true,
  maximize: null,
  maskMode: 'draw',
  roi: false,
  zbreak: false,
  detail: false,
  quality: 'Fast',
  task: null,
  failure: null,
  message: 'ROUND 2 · A / Recipe inside Process · UI simulation only · source unchanged.',
  empty: query.get('scene') === 'empty-history',
  emptyExpanded: false,
  dirty: false,
  panelSize: null,
  bottomSize: null,
  tool: 'pan',
};
let fileMask,
  fixtures,
  data,
  recipe,
  cursor,
  branch,
  variants = [],
  activeStep = 0,
  originFocus;
const narrow = () => window.matchMedia('(max-width: 820px)').matches;
const currentModel = () =>
  data.models[data.history.find((n) => n.id === cursor)?.modelRef ?? 'project'];
const stepTitle = (s) =>
  s.params.material || s.params.target || s.params.label || s.params.name || s.command;
function useExample() {
  data = fixtures.find((f) => f.id === state.example);
  recipe = structuredClone(data.recipe);
  cursor = data.cursor;
  branch = data.activeBranch;
  variants = [];
  activeStep = 0;
  state.task = null;
  state.failure = null;
  state.dirty = false;
  delete state.projectName;
  delete state.material;
  delete state.fileLoaded;
  delete state.fileCell;
  delete state.fileLayer;
  delete state.codeDraft;
}
function nav() {
  const domains = ['project', 'mask', 'process', 'history'];
  return el(
    'nav',
    { class: 'p-nav', 'aria-label': 'Workspaces' },
    el('span', { class: 'p-nav-label' }, 'WORKSPACE'),
    domains.map((name) =>
      button(name[0].toUpperCase() + name.slice(1), `domain:${name}`, name, {
        'aria-pressed': String(
          state.domain === name ||
            (name === 'process' &&
              state.placement === 'process' &&
              ['recipe', 'code'].includes(state.domain)),
        ),
      }),
    ),
    button('Hide', 'hide-editor', 'close', { 'aria-label': 'Hide navigation and workflow editor' }),
    el('span', { class: 'p-nav-label' }, 'Text labels stay visible'),
  );
}
function presetRecipeFailure() {
  activeStep = Math.min(2, recipe.steps.length - 1);
  state.failedStep = activeStep;
  state.failure = `Simulated failure · Step ${activeStep + 1} · ${recipe.steps[activeStep].id}. Edit here; then Continue or Rebuild. Source remains unchanged.`;
}
function reviewBar() {
  return el(
    'header',
    { class: 'p-review' },
    el(
      'div',
      { class: 'p-summary' },
      el(
        'div',
        {},
        el('h1', {}, 'WaferCAD · M1.5 workspace lab'),
        el(
          'span',
          { class: 'p-aux' },
          'Round 1: choose layout + Recipe location. Project/Mask, view tools, fonts and component completion are deferred.',
        ),
      ),
      el('span', { class: 'p-review-badge' }, 'PROTOTYPE · NO CORE'),
    ),
    el(
      'details',
      { open: !narrow(), 'data-review-controls': '' },
      el('summary', {}, 'Compare layouts / real projects / failure scenes'),
      el(
        'div',
        { class: 'p-review-controls' },
        select(
          'Layout',
          'layout',
          [
            ['a', 'A · left dock'],
            ['b', 'B · top nav / right dock'],
            ['c', 'C · workflow / bottom'],
          ],
          state.layout,
        ),
        select(
          'Real project',
          'example',
          [
            ['m3d', 'M3D · 27 layers / 35 steps'],
            ['photodetector', 'Photodetector · 7 variants'],
          ],
          state.example,
        ),
        select(
          'Recipe location',
          'placement',
          [
            ['top', 'Top-level workspace'],
            ['process', 'Mode inside Process'],
          ],
          state.placement,
        ),
        select(
          'Targeted scene',
          'scene',
          [
            ['process', 'Process · M3D'],
            ['recipe-failure', 'Recipe · M3D · failed step'],
            ['variants', 'History · Photodetector Variants'],
            ['empty-history', '#161 · empty History / real model'],
          ],
          state.empty
            ? 'empty-history'
            : state.domain === 'recipe'
              ? 'recipe-failure'
              : state.domain === 'history'
                ? 'variants'
                : 'process',
        ),
      ),
    ),
  );
}
function svgNode(tag, attrs = {}, children = []) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  node.append(...children);
  return node;
}
function planar(model, mask = false) {
  const w = model.width,
    h = model.height;
  const svg = svgNode('svg', {
    viewBox: `${-w * 0.56} ${-h * 0.56} ${w * 1.12} ${h * 1.12}`,
    role: 'img',
    'aria-label': mask ? 'Actual source Draw shapes' : 'Actual source model top-layer polygons',
  });
  const group = svgNode('g', { transform: 'scale(1,-1)' });
  if (mask) {
    group.append(
      svgNode('rect', {
        x: -w / 2,
        y: -h / 2,
        width: w,
        height: h,
        fill: 'var(--wc-surface)',
        stroke: 'var(--wc-border-strong)',
        'vector-effect': 'non-scaling-stroke',
      }),
    );
    const shapes =
      data.branches.find((b) => b.id === branch)?.drawMask?.shapes || data.drawMask.shapes;
    for (const shape of shapes) {
      const attrs = {
        fill: 'var(--wc-accent-tint-active)',
        stroke: 'var(--wc-accent)',
        'vector-effect': 'non-scaling-stroke',
      };
      if (shape.type === 'rect')
        group.append(
          svgNode('rect', {
            ...attrs,
            x: Math.min(shape.a[0], shape.b[0]),
            y: Math.min(shape.a[1], shape.b[1]),
            width: Math.abs(shape.b[0] - shape.a[0]),
            height: Math.abs(shape.b[1] - shape.a[1]),
          }),
        );
      if (shape.type === 'ring')
        group.append(
          svgNode('circle', {
            ...attrs,
            cx: shape.c[0],
            cy: shape.c[1],
            r: (shape.innerR + shape.outerR) / 2,
            fill: 'none',
            'stroke-width': shape.outerR - shape.innerR,
            'vector-effect': 'none',
          }),
        );
    }
  } else {
    for (const ref of model.paths) {
      const p = data.pathDictionary[ref];
      group.append(svgNode('path', { d: p.d, fill: p.color, 'fill-rule': 'evenodd' }));
    }
  }
  if (state.roi || state.detail)
    group.append(
      svgNode('rect', {
        x: -w / 5,
        y: -h / 5,
        width: w / 2.5,
        height: h / 2.5,
        fill: 'none',
        stroke: 'var(--wc-accent)',
        'stroke-dasharray': '5 4',
        'vector-effect': 'non-scaling-stroke',
        'data-roi-mark': '',
      }),
    );
  const { a, b } = data.section;
  if (a && b)
    group.append(
      svgNode('line', {
        x1: a[0],
        y1: a[1],
        x2: b[0],
        y2: b[1],
        stroke: 'var(--wc-text)',
        'vector-effect': 'non-scaling-stroke',
      }),
    );
  svg.append(group);
  return svg;
}
function sectionSchematic(model) {
  const svg = svgNode('svg', {
    viewBox: '0 0 480 180',
    role: 'img',
    'aria-label': 'Representative actual region stack, equal visual bands, not a computed section',
  });
  const stack = model.stack.slice().reverse();
  const height = Math.min(22, 145 / Math.max(1, stack.length));
  stack.forEach((segment, i) => {
    const layer = model.layers.find((l) => l.id === segment.layerId);
    svg.append(
      svgNode('rect', {
        x: 18,
        y: 12 + i * height,
        width: 444,
        height,
        fill: layer?.color || 'var(--wc-border)',
      }),
    );
  });
  if (state.zbreak)
    svg.append(
      svgNode('path', {
        d: 'M18 125l50-7 55 14 55-14 55 14 55-14 55 14 55-14 64 7',
        fill: 'none',
        stroke: 'var(--wc-text)',
        'stroke-width': 2,
      }),
    );
  if (state.detail)
    svg.append(
      svgNode('rect', {
        x: 180,
        y: 10,
        width: 140,
        height: 100,
        fill: 'none',
        stroke: 'var(--wc-accent)',
        'stroke-width': 2,
        'stroke-dasharray': '5 4',
      }),
    );
  return svg;
}
function viewPanel(name) {
  const model = currentModel(),
    label = { main: 'Main', mask: 'Mask', three: '3D', section: 'Section' }[name];
  const common = [
    button('Fit', `fit:${name}`, 'fit'),
    button('Pan', `tool:pan:${name}`, 'pan', { 'aria-pressed': String(state.tool === 'pan') }),
    button('Zoom', `tool:zoom:${name}`, 'zoom'),
  ];
  const extra =
    name === 'three'
      ? [button(state.quality, 'quality', 'quality')]
      : name === 'section'
        ? [button('Z-break', 'zbreak', 'zbreak', { 'aria-pressed': String(state.zbreak) })]
        : [button('ROI', 'roi', 'roi', { 'aria-pressed': String(state.roi) })];
  const more = [
    button('Zoom', `tool:zoom:${name}`, 'zoom'),
    button('Section line', `tool:line:${name}`, 'line'),
    button('ROI', 'roi', 'roi'),
    button('Export SVG', `export:${name}:svg`, 'export'),
    button(
      name === 'three' ? 'Export image / GLB (simulation)' : 'Export image (simulation)',
      `export:${name}:image`,
      'export',
    ),
  ];
  if (name === 'section')
    more.unshift(
      button('Z-break settings', 'zbreak-settings', 'zbreak'),
      button('Detail ROI', 'detail', 'roi'),
      button('Detail export', 'export:section:detail', 'export'),
    );
  if (name === 'three')
    more.unshift(
      button('Fast / Quality', 'quality', 'quality'),
      button('Borders', 'borders', 'cube'),
    );
  const canvas = el(
    'div',
    { class: 'p-science', 'data-science': name },
    name === 'three'
      ? el('img', {
          src: data.thumbnail,
          alt: 'Recorded real final-model 3D thumbnail; not a live renderer',
        })
      : name === 'section'
        ? sectionSchematic(model)
        : planar(model, name === 'mask'),
    el(
      'span',
      { class: 'p-scale' },
      name === 'three'
        ? 'Recorded final state'
        : name === 'section'
          ? 'Equal-band stack schematic'
          : `${model.width} × ${model.height} µm`,
    ),
  );
  const viewTools = toolbar(label, [common, extra], more);
  viewTools.append(
    button(state.maximize === name ? 'Restore' : 'Max', `maximize:${name}`, 'maximize', {
      'aria-label': `${label} ${state.maximize === name ? 'restore' : 'maximize'}`,
    }),
  );
  return el(
    'section',
    { class: 'p-view', 'data-view': name, 'aria-label': `${label} view` },
    el('header', { class: 'p-panel-head p-view-head' }, el('strong', {}, label), viewTools),
    canvas,
    el(
      'div',
      { class: 'p-readout' },
      name === 'three'
        ? `${state.quality} control demo · final thumbnail fixed`
        : name === 'section'
          ? `Stored Z stays in µm · ${model.stack.length} segments · not Section geometry`
          : `${model.layers.length} layers · ${model.regionCount} regions · cursor ${cursor}`,
    ),
  );
}
function stage() {
  const mode = narrow() ? 'single' : state.mode;
  let names =
    mode === 'overview'
      ? ['main', 'mask', 'three', ...(state.section ? ['section'] : [])]
      : mode === 'split'
        ? ['main', 'three']
        : [state.view];
  if (mode === 'single' && state.section && !narrow()) names.push('section');
  if (state.maximize) names = [state.maximize];
  return el(
    'main',
    { class: 'p-stage', 'aria-label': 'Results canvas' },
    el(
      'div',
      { class: 'p-viewbar' },
      el(
        'div',
        { class: 'p-actions' },
        state.editorHidden ? button('Restore panel', 'expand-empty', 'history') : null,
        ['single', 'overview', 'split'].map((m) =>
          button(m[0].toUpperCase() + m.slice(1), `mode:${m}`, null, {
            disabled: narrow() && m !== 'single',
            'aria-pressed': String(mode === m),
            title: narrow() ? 'Tablet / phone use Single' : '',
          }),
        ),
      ),
      el(
        'div',
        { class: 'p-actions' },
        ['main', 'mask', 'three'].map((v) =>
          button(
            v === 'three' ? '3D' : v[0].toUpperCase() + v.slice(1),
            `view:${v}`,
            v === 'three' ? 'cube' : v,
            { 'aria-pressed': String(state.view === v) },
          ),
        ),
        ...(!narrow()
          ? [
              button('Section dock', 'section', 'section', {
                'aria-pressed': String(state.section),
              }),
            ]
          : []),
        ...(narrow()
          ? [
              button('Section', 'mobile-section', 'section', {
                'aria-pressed': String(state.view === 'section'),
              }),
            ]
          : []),
      ),
    ),
    el(
      'div',
      { class: 'p-canvases', 'data-mode': mode, 'data-maximized': String(Boolean(state.maximize)) },
      names.map(viewPanel),
    ),
  );
}
function projectPanel() {
  return [
    el(
      'div',
      { class: 'p-form' },
      field('Project name (prototype draft)', 'projectName', state.projectName || data.name),
      notice(
        `${data.source} · ${data.bytes.toLocaleString()} bytes · real final model + complete History.`,
      ),
      el(
        'div',
        { class: 'p-actions' },
        button('New', 'new-project', 'plus'),
        button('Load', 'load-project', 'folder'),
        button('Save UI draft', 'save', 'save'),
      ),
    ),
    el(
      'section',
      {},
      el('h3', {}, 'Recovery'),
      el(
        'p',
        { class: 'p-aux' },
        'Demonstration recovery candidate: bundled project. No IndexedDB, writer lease or autosave access.',
      ),
      button('Review recovery', 'recovery', 'history'),
      button('Export UI draft', 'save', 'export'),
    ),
  ];
}
function maskPanel() {
  const model = currentModel();
  return [
    el(
      'div',
      { class: 'p-form' },
      select(
        'Mask source',
        'maskMode',
        [
          ['draw', 'Draw · actual source shapes'],
          ['file', 'File · import walkthrough'],
        ],
        state.maskMode,
      ),
      state.maskMode === 'file'
        ? state.fileLoaded
          ? el(
              'section',
              { class: 'p-form' },
              notice(
                `${fileMask.source} · real file metadata only. Draw-source project geometry remains unchanged.`,
              ),
              el('h3', {}, `File Layers · ${fileMask.layers.length}`),
              el(
                'div',
                { class: 'p-list' },
                fileMask.layers.map((layer) =>
                  row(
                    `Layer / datatype ${layer}`,
                    'Metadata selection only',
                    `file-layer:${layer}`,
                    state.fileLayer === layer,
                  ),
                ),
              ),
            )
          : emptyState(
              'No file Cells in this example',
              `${data.layout.elements} imported elements · ${data.layout.cells} Cells. The project uses Draw.`,
              button('Inspect bundled GDS sample', 'file-import', 'folder'),
            )
        : notice(
            `${data.drawMask.shapes.length} stored Draw shapes · coordinates in µm. Canvas shows actual masks.`,
          ),
      el(
        'div',
        { class: 'p-actions' },
        button('Rectangle', 'draw-rect', 'mask'),
        button('Ring', 'draw-ring', 'mask'),
        button('ROI', 'roi', 'roi'),
      ),
      stepper('ROI width · µm', 'roiWidth', model.width / 2, model.width / 20),
      button('Export Draw SVG', 'export:mask:svg', 'export'),
    ),
    el(
      'section',
      {},
      el('h3', {}, `Cells · ${state.fileLoaded ? fileMask.cells.length : data.layout.cells}`),
      state.fileLoaded
        ? el(
            'div',
            { class: 'p-list', 'data-file-cells': '' },
            fileMask.cells.map((cell) =>
              row(
                cell.name,
                `${cell.shapeCount} shapes · refs: ${cell.references.join(', ') || 'none'}`,
                `cell:${cell.name}`,
                state.fileCell === cell.name,
              ),
            ),
          )
        : emptyState(
            'No imported Cells',
            'This real project uses Draw masks. Import metadata to inspect Cells.',
            button('Inspect bundled GDS sample', 'file-import', 'folder'),
          ),
    ),
    el(
      'section',
      {},
      el('h3', {}, `Layers · ${model.layers.length}`),
      el(
        'div',
        { class: 'p-list' },
        model.layers.map((l) => {
          const swatch = el('span', { class: 'p-swatch', 'aria-hidden': 'true' });
          swatch.style.backgroundColor = l.color;
          return el('div', { class: 'p-layer' }, swatch, row(l.name, l.id, `layer:${l.id}`));
        }),
      ),
    ),
  ];
}
function taskControls() {
  if (!state.task) return [];
  return [
    busy(
      state.task.kind === 'recipe' ? 'Run All · simulated' : 'Apply · simulated',
      state.task.done,
      state.task.total,
    ),
    el(
      'div',
      { class: 'p-actions' },
      button('Complete simulation', 'complete', 'check'),
      button('Advance progress', 'advance-task', 'play'),
      button('Inject failure', 'fail', 'warning'),
      button('Cancel', 'cancel-task', 'stop'),
    ),
  ];
}
function processExtras() {
  const operation = state.operation || 'deposit';
  const sample = [...data.recipe.steps, ...data.branches.flatMap((b) => b.recipe.steps)].find(
    (s) => s.command === operation,
  )?.params;
  if (operation === 'deposit')
    return [
      select(
        'Coverage',
        'processCoverage',
        [
          ['direct', 'Direct'],
          ['conformal', 'Conformal'],
        ],
        state.processCoverage || sample?.coverage || 'direct',
      ),
    ];
  if (operation === 'etch')
    return [
      select(
        'Profile',
        'processProfile',
        [
          ['vertical', 'Vertical'],
          ['isotropic', 'Isotropic'],
          ['rough', 'Rough'],
        ],
        state.processProfile || 'vertical',
      ),
    ];
  if (operation === 'implant')
    return [
      field(
        'Implant name / source assumptions',
        'processName',
        state.processName || sample?.name || 'Prototype implant draft',
      ),
      stepper('Tilt · degrees', 'processTilt', state.processTilt ?? sample?.tilt ?? 0, 1),
      notice(
        sample?.name ||
          'This example has no Implant operation. Prototype parameters only; no inferred physical defaults.',
      ),
    ];
  if (operation === 'electrical')
    return [
      field(
        'Electrical region name',
        'processName',
        state.processName || sample?.name || 'Prototype electrical draft',
      ),
      select(
        'Region type',
        'processRegionType',
        [
          ['p-inversion', 'p inversion'],
          ['n-accumulation', 'n accumulation'],
        ],
        state.processRegionType || sample?.regionType || 'p-inversion',
      ),
      notice(sample?.name || 'No Electrical step in this source Recipe. UI-only controls.'),
    ];
  return [
    field(
      'Record label',
      'processRecordLabel',
      state.processRecordLabel || sample?.label || 'Prototype record',
    ),
    field(
      'Temperature · °C',
      'processTemperature',
      state.processTemperature ?? sample?.temperatureC ?? '',
      { type: 'number' },
    ),
    field('Duration · min', 'processDuration', state.processDuration ?? sample?.durationMin ?? '', {
      type: 'number',
      min: 0,
    }),
    field('Ambient', 'processAmbient', state.processAmbient || sample?.ambient || ''),
  ];
}
function processPanel() {
  return [
    el(
      'div',
      { class: 'p-form' },
      ...(state.placement === 'process'
        ? [
            el(
              'div',
              { class: 'p-actions' },
              button('Manual', 'domain:process', 'process', { 'aria-pressed': 'true' }),
              button('Recipe', 'domain:recipe', 'recipe'),
              button('Code', 'domain:code', 'code'),
            ),
          ]
        : []),
      select(
        'Operation',
        'operation',
        [
          ['deposit', 'Deposit'],
          ['etch', 'Etch'],
          ['implant', 'Implant'],
          ['electrical', 'Electrical'],
          ['record', 'Record'],
        ],
        state.operation || 'deposit',
      ),
      select(
        'Material / target',
        'material',
        currentModel().layers.map((l) => [l.id, l.name]),
        state.material || currentModel().layers.at(-1).id,
      ),
      ...((state.operation || 'deposit') !== 'record'
        ? [stepper('Thickness / depth · µm', 'thickness', state.thickness ?? 0.07, 0.001)]
        : []),
      ...processExtras(),
      select(
        'Active face',
        'face',
        [
          ['front', 'Front'],
          ['rear', 'Rear'],
        ],
        state.face || 'front',
      ),
      select(
        'Area',
        'area',
        [
          ['mask', 'Selected Draw mask'],
          ['full', 'Full wafer'],
          ['roi', 'ROI'],
        ],
        state.area || 'mask',
      ),
      el(
        'span',
        { id: 'p-units', class: 'p-aux' },
        'Physical unit: µm · typed precision retained in draft. Geometry is never executed.',
      ),
      button('Apply · simulate', 'apply', 'play', {
        primary: true,
        disabled: Boolean(state.task) || (state.thickness != null && state.thickness <= 0),
      }),
      state.thickness != null && state.thickness <= 0
        ? notice('Enter a positive thickness / depth before Apply.', 'error')
        : null,
      ...taskControls(),
      state.failure ? notice(state.failure, 'error') : null,
    ),
    el(
      'section',
      {},
      el('h3', {}, 'Review before applying'),
      el(
        'p',
        { class: 'p-aux' },
        `${currentModel().regionCount} source regions · ${currentModel().layers.length} layers. No source mutation on failure, cancellation or success.`,
      ),
      button('View results', 'return-results', 'eye'),
    ),
  ];
}
function recipePanel() {
  const selected = recipe.steps[activeStep];
  return [
    el(
      'section',
      { class: 'p-form' },
      ...(state.placement === 'process'
        ? [
            el(
              'div',
              { class: 'p-actions' },
              button('Manual', 'domain:process', 'process'),
              button('Recipe', 'domain:recipe', 'recipe', { 'aria-pressed': 'true' }),
              button('Code', 'domain:code', 'code'),
            ),
          ]
        : []),
      el('h3', {}, recipe.name),
      el(
        'div',
        { class: 'p-actions' },
        button('Run All', 'run-all', 'play', { primary: true, disabled: Boolean(state.task) }),
        button('Continue', 'continue-confirm', 'play', { disabled: Boolean(state.task) }),
        button('Rebuild Base', 'rebuild-confirm', 'history', { disabled: Boolean(state.task) }),
      ),
      ...taskControls(),
      state.failure ? notice(state.failure, 'error') : null,
      selected
        ? el(
            'div',
            { class: 'p-form', 'data-step-editor': selected.id },
            el('strong', {}, `Edit step ${activeStep + 1} · ${selected.id}`),
            field('Material / label draft', 'stepLabel', stepTitle(selected)),
            ...(selected.params.thicknessUm != null || selected.params.depthUm != null
              ? [
                  stepper(
                    'Thickness / depth · µm',
                    'stepThickness',
                    selected.params.thicknessUm ?? selected.params.depthUm ?? 0,
                    0.00001,
                  ),
                ]
              : []),
            ...Object.entries(selected.params)
              .filter(
                ([key, value]) =>
                  !['material', 'target', 'label', 'name', 'thicknessUm', 'depthUm'].includes(
                    key,
                  ) && ['string', 'number', 'boolean'].includes(typeof value),
              )
              .map(([key, value]) =>
                field(
                  key,
                  `step-param:${key}`,
                  value,
                  typeof value === 'number' ? { type: 'number', step: 'any' } : {},
                ),
              ),
            button('Save step draft', 'save-step', 'save'),
            button('Run to step', 'run-prefix', 'play'),
          )
        : emptyState('No steps in this Variant', 'Choose another populated Variant.', null),
    ),
    el(
      'section',
      {},
      el('h3', {}, `Steps · ${recipe.steps.length}`),
      el(
        'div',
        { class: 'p-list', 'data-recipe-list': '' },
        recipe.steps.map((s, i) =>
          row(
            `${String(i + 1).padStart(2, '0')} · ${s.command.toUpperCase()}`,
            stepTitle(s),
            `step:${i}`,
            i === activeStep,
            state.failedStep === i && state.failure ? 'error' : '',
          ),
        ),
      ),
    ),
  ];
}
function historyPanel() {
  if (state.empty)
    return [
      emptyState(
        'No recorded steps',
        'Only History is empty in this targeted scene; the actual model stays loaded.',
        button('Back to canvas', 'return-results', 'back'),
      ),
    ];
  const selected = data.history.find((n) => n.id === cursor);
  const allBranches = [...data.branches, ...variants];
  return [
    el(
      'section',
      { class: 'p-form' },
      el('h3', {}, 'Variants'),
      el(
        'div',
        { class: 'p-list', 'data-variant-list': '' },
        allBranches.map((b) =>
          row(`${b.parentBranchId ? '↳ ' : ''}${b.name}`, b.id, `branch:${b.id}`, branch === b.id),
        ),
      ),
      notice(
        `Inspecting ${cursor}. Main polygons / stack bands reflect the stored model; 3D remains the fixed final thumbnail.`,
      ),
      el('strong', {}, selected?.label || 'Prototype Variant'),
      el(
        'div',
        { class: 'p-actions' },
        button('Restore cursor (demo)', 'restore', 'history'),
        button('Edit old step', 'edit-old', 'process'),
        button('Create Variant', 'create-variant', 'branch'),
      ),
    ),
    el(
      'section',
      {},
      el('h3', {}, `History · ${data.history.length} nodes / ${data.bookmarks.length} bookmarks`),
      el(
        'div',
        { class: 'p-list', 'data-history-list': '' },
        data.history
          .filter(
            (n) =>
              n.branchId === branch ||
              variants.some((v) => v.id === branch && n.id === v.headNodeId),
          )
          .map((n) => row(n.label, n.id, `history:${n.id}`, cursor === n.id)),
      ),
    ),
  ];
}
function codePanel() {
  const sourceText = recipe.steps
    .map((step) => {
      if (step.command === 'snapshot') return `snapshot(${JSON.stringify(step.params.name)});`;
      const params = {};
      for (const [key, value] of Object.entries(step.params)) {
        const name =
          key === 'thicknessUm'
            ? step.command === 'etch'
              ? 'depth'
              : 'thickness'
            : key === 'depthUm'
              ? 'depth'
              : key;
        params[name] = ['thicknessUm', 'depthUm'].includes(key)
          ? `${value} um`
          : key === 'coverage' && value === 'direct'
            ? 'directional'
            : value;
      }
      return `${step.command}(${JSON.stringify(params, null, 2)});`;
    })
    .join('\n\n');
  const editor = el(
    'textarea',
    { class: 'p-code-editor', spellcheck: 'false', 'aria-label': 'Process Recipe code draft' },
    state.codeDraft ?? sourceText,
  );
  editor.addEventListener('input', () => {
    state.codeDraft = editor.value;
    state.dirty = true;
  });
  return [
    el(
      'div',
      { class: 'p-actions' },
      button('Manual', 'domain:process', 'process'),
      button('Recipe', 'domain:recipe', 'recipe'),
      button('Code', 'domain:code', 'code', { 'aria-pressed': 'true' }),
    ),
    el('h3', {}, `${recipe.name} · ${recipe.steps.length} source steps`),
    notice(
      'Editable presentation of the real Recipe commands. Apply / Format are UI demonstrations only: no parser, execution, or saved Recipe changes.',
    ),
    state.failure ? notice(state.failure, 'error') : null,
    editor,
    el(
      'div',
      { class: 'p-actions' },
      button('Apply code · demo', 'code-apply', 'check', { primary: true }),
      button('Format · demo', 'code-format', 'code'),
    ),
  ];
}
function inspector() {
  const domain = ['project', 'mask', 'process', 'recipe', 'code', 'history'].includes(state.domain)
    ? state.domain
    : 'process';
  const content = {
    project: projectPanel,
    mask: maskPanel,
    process: processPanel,
    recipe: recipePanel,
    code: codePanel,
    history: historyPanel,
  }[domain]();
  return el(
    'aside',
    { class: 'p-inspector', 'aria-label': `${domain} editor` },
    panelHeader(
      domain[0].toUpperCase() + domain.slice(1),
      state.placement === 'process' && ['recipe', 'code'].includes(domain)
        ? `Process / ${domain === 'code' ? 'Code' : 'Recipe'} mode`
        : 'Docked workflow · never an automatic overlay',
      [],
    ),
    el('div', { class: 'p-panel-content' }, content),
  );
}
function fontReview() {
  return el(
    'section',
    { class: 'p-font-review', id: 'font-review' },
    el('h2', {}, 'Font comparison · selected: B / Inter Variable WOFF2 / system fallback'),
    el(
      'p',
      { class: 'p-aux' },
      'Same 11 / 12 / 13 px sizes. Inter is locally bundled (352,240 bytes, OFL 1.1); system stack is 0 font-transfer bytes. Chinese uses system fallback in both.',
    ),
    el(
      'div',
      { class: 'p-font-grid' },
      ['system', 'inter'].map((font) =>
        el(
          'div',
          { class: 'p-font-sample', 'data-font': font },
          el(
            'strong',
            {},
            font === 'system'
              ? 'A · Segoe UI / system-ui'
              : 'B · Inter Variable WOFF2 / system fallback',
          ),
          [11, 12, 13].map((size) =>
            el(
              'p',
              { 'data-size': size },
              `${size}px · M3D HfO2 gate dielectric 10nm · −0.00035 µm · 0 O I l 1 · 1050°C · ρ Δ · 辅助文字 / 工艺步骤`,
            ),
          ),
          el(
            'p',
            { 'data-font-measure': font, 'data-size': '12' },
            'M3D graphene monolayer 0.35nm · 27 layers',
          ),
          el(
            'p',
            { class: 'p-aux' },
            font === 'system'
              ? 'No font loading / platform-dependent glyph metrics.'
              : 'Consistent Latin numerals / extra payload and swap / no bundled CJK.',
          ),
        ),
      ),
    ),
    el(
      'details',
      {},
      el('summary', {}, 'Icon system + added component inventory'),
      el(
        'p',
        {},
        '16px outline · 1.6px round strokes · currentColor · inline symbol sprite. All navigation keeps text; toolbar overflow uses native Popover.',
      ),
      el(
        'div',
        { class: 'p-icon-gallery' },
        Object.keys(iconPaths).map((key) => el('span', {}, icon(key), key)),
      ),
      el(
        'p',
        { class: 'p-aux' },
        'New: empty state, progress, panel headers, mouse/touch/keyboard divider, toolbar groups + overflow, list rows, precision numeric stepper.',
      ),
    ),
  );
}
function render(focusAction) {
  const keepHistoryScroll = focusAction?.startsWith('history:');
  const scrollPositions = keepHistoryScroll
    ? ['.p-panel-content', '[data-history-list]', '[data-variant-list]'].map((selector) => {
        const node = root.querySelector(selector);
        return { selector, top: node?.scrollTop ?? 0, left: node?.scrollLeft ?? 0 };
      })
    : [];
  const pageScroll = { x: window.scrollX, y: window.scrollY };
  document.documentElement.dataset.font = state.font;
  const emptyHistory = state.domain === 'history' && state.empty && !state.emptyExpanded;
  const isEmpty = emptyHistory || state.editorHidden;
  const body = el(
    'div',
    { class: 'p-body' },
    state.editorHidden ? null : nav(),
    state.editorHidden
      ? null
      : isEmpty
        ? el(
            'div',
            { class: 'p-empty-strip' },
            state.editorHidden
              ? null
              : el(
                  'span',
                  { class: 'p-aux' },
                  emptyHistory
                    ? 'History empty · real model retained. No blank inspector column.'
                    : 'Workflow hidden · draft retained.',
                ),
            button(state.editorHidden ? 'Restore panel' : 'Inspect', 'expand-empty', 'history'),
          )
        : inspector(),
    isEmpty ? null : divider(state.layout === 'c'),
    stage(),
  );
  const workbench = el(
    'div',
    {
      class: 'p-workbench',
      'data-layout': state.layout,
      'data-empty': String(isEmpty),
      'data-hidden': String(Boolean(state.editorHidden)),
      'data-mobile': state.mobile,
    },
    el(
      'header',
      { class: 'p-topbar' },
      el('span', { class: 'p-brand' }, 'WaferCAD'),
      el('span', { class: 'p-project-title', title: data.name }, data.name),
      el(
        'div',
        { class: 'p-actions p-mobile-return' },
        button(
          state.mobile === 'edit' ? 'Back to results' : 'Edit workspace',
          state.mobile === 'edit' ? 'return-results' : 'show-editor',
          state.mobile === 'edit' ? 'back' : 'process',
        ),
      ),
      el(
        'span',
        { class: 'p-review-badge' },
        state.dirty ? 'DRAFT · source unchanged' : 'READ-ONLY SOURCE',
      ),
    ),
    body,
    el('footer', { class: 'p-status', role: 'status', 'aria-live': 'polite' }, state.message),
  );
  if (state.panelSize) workbench.style.setProperty('--p-panel', `${state.panelSize}px`);
  if (state.bottomSize) workbench.style.setProperty('--p-bottom', `${state.bottomSize}px`);
  root.replaceChildren(workbench, fontReview());
  bindDividers();
  if (focusAction)
    [...root.querySelectorAll('[data-action]')]
      .find((n) => n.dataset.action === focusAction)
      ?.focus({ preventScroll: true });
  if (keepHistoryScroll) {
    for (const { selector, top, left } of scrollPositions) {
      const node = root.querySelector(selector);
      if (node) {
        node.scrollTop = top;
        node.scrollLeft = left;
      }
    }
    window.scrollTo({ left: pageScroll.x, top: pageScroll.y, behavior: 'instant' });
  }
}
function dialog(title, text, accept, action) {
  originFocus = document.activeElement;
  const modal = el(
    'dialog',
    { class: 'p-dialog', 'aria-labelledby': 'p-dialog-title' },
    el('h2', { id: 'p-dialog-title' }, title),
    el('div', {}, text),
    el(
      'div',
      { class: 'p-actions' },
      button('Cancel', 'dialog-cancel', 'close'),
      button(accept, action, 'check', { primary: true }),
    ),
  );
  modal.addEventListener('close', () => {
    modal.remove();
    originFocus?.focus({ preventScroll: true });
  });
  modal.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll('button,input,select,textarea,a[href]')];
    const first = controls[0],
      last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  root.append(modal);
  modal.showModal();
  modal.querySelector('input,button').focus();
}
function closeDialog() {
  root.querySelector('dialog[open]')?.close();
}
function download(name, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = el('a', { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}
function bindDividers() {
  const node = root.querySelector('.p-divider');
  if (!node) return;
  const horizontal = state.layout === 'c';
  const update = (delta) => {
    const current = horizontal
      ? state.bottomSize || 250
      : state.panelSize || (window.innerWidth <= 1180 ? 270 : 300);
    const next = Math.round(
      Math.max(horizontal ? 180 : 240, Math.min(horizontal ? 380 : 400, current + delta)),
    );
    if (horizontal) state.bottomSize = next;
    else state.panelSize = next;
    root
      .querySelector('.p-workbench')
      .style.setProperty(horizontal ? '--p-bottom' : '--p-panel', `${next}px`);
    node.setAttribute('aria-valuenow', String(next));
  };
  let previous;
  node.addEventListener('pointerdown', (event) => {
    previous = horizontal ? event.clientY : event.clientX;
    node.setPointerCapture(event.pointerId);
  });
  node.addEventListener('pointermove', (event) => {
    if (previous == null) return;
    const next = horizontal ? event.clientY : event.clientX;
    update((next - previous) * (horizontal || state.layout === 'b' ? -1 : 1));
    previous = next;
  });
  const release = () => {
    previous = null;
  };
  node.addEventListener('pointerup', release);
  node.addEventListener('pointercancel', release);
  node.addEventListener('keydown', (event) => {
    const direction = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 1, ArrowDown: -1 }[event.key];
    if (direction) {
      event.preventDefault();
      update(direction * 8);
    }
  });
}
function handleAction(action, target) {
  if (!action) return;
  const popupOwner = target?.closest('[popover]')?.id;
  const [kind, value] = action.split(':');
  if (kind === 'dialog-cancel') {
    closeDialog();
    return;
  }
  if (kind === 'domain') {
    state.domain = value;
    if (value === 'mask') {
      state.view = 'mask';
      state.maximize = 'mask';
    } else {
      state.maximize = null;
    }
    state.mobile = 'edit';
    state.emptyExpanded = false;
    state.editorHidden = false;
  } else if (kind === 'code-apply' || kind === 'code-format') {
    state.message = `${kind === 'code-apply' ? 'Apply code' : 'Format'} UI demonstration only. Draft retained; no parser or execution, saved Recipe unchanged.`;
  } else if (kind === 'show-editor') {
    state.mobile = 'edit';
    state.editorHidden = false;
  } else if (kind === 'hide-editor' || kind === 'return-results') {
    state.mobile = 'view';
    state.editorHidden = !narrow();
    state.message =
      'Results kept visible; draft retained. Use a workspace label to reopen the dock.';
  } else if (kind === 'mode') {
    state.mode = value;
    state.maximize = null;
  } else if (kind === 'view') {
    state.view = value;
    state.mode = 'single';
    state.maximize = value === 'mask' ? 'mask' : null;
  } else if (kind === 'mobile-section') {
    state.view = 'section';
    state.maximize = null;
  } else if (kind === 'section') state.section = !state.section;
  else if (kind === 'maximize') state.maximize = state.maximize === value ? null : value;
  else if (kind === 'quality') {
    state.quality = state.quality === 'Fast' ? 'Quality' : 'Fast';
    state.message = 'Quality mode control simulated. Recorded 3D image is not recomputed.';
  } else if (kind === 'roi') {
    state.roi = !state.roi;
    state.message = 'ROI display demo only. Main/3D registration remains the early M2 gate.';
  } else if (kind === 'detail') state.detail = !state.detail;
  else if (kind === 'zbreak') state.zbreak = !state.zbreak;
  else if (kind === 'zbreak-settings') {
    dialog(
      'Section Z-break',
      'Display-only collapse. Physical Z is unchanged. M1.5 stack bands are a schematic, not the Section renderer.',
      'Toggle display break',
      'confirm-zbreak',
    );
    return;
  } else if (kind === 'confirm-zbreak') {
    closeDialog();
    state.zbreak = !state.zbreak;
  } else if (kind === 'tool') {
    state.tool = value;
    state.message = `${value} tool selected · pointer geometry not connected.`;
  } else if (
    kind === 'fit' ||
    kind === 'borders' ||
    kind === 'layer' ||
    kind === 'draw-rect' ||
    kind === 'draw-ring'
  )
    state.message = `${target.textContent.trim()} control demo · source model / masks unchanged.`;
  else if (kind === 'expand-empty') {
    state.emptyExpanded = true;
    state.mobile = 'edit';
    state.editorHidden = false;
  } else if (kind === 'step') {
    activeStep = Number(value);
    state.mobile = 'edit';
  } else if (kind === 'save-step') {
    state.dirty = true;
    state.failure = null;
    state.message = `Step ${activeStep + 1} draft saved in memory; reload discards it.`;
  } else if (kind === 'history') {
    cursor = value;
    state.message = `Inspecting stored ${value}; source History not mutated.`;
  } else if (kind === 'branch') {
    branch = value;
    const b = [...data.branches, ...variants].find((item) => item.id === value);
    cursor = b.headNodeId;
    if (b.recipe) {
      recipe = structuredClone(b.recipe);
      activeStep = 0;
    }
    state.message = `Inspecting ${b.name}; Main uses this stored model. 3D remains final thumbnail.`;
  } else if (kind === 'restore')
    state.message = `Restore walkthrough at ${cursor} · metadata/polygons shown, no actual History transaction.`;
  else if (kind === 'edit-old') {
    state.domain = 'process';
    state.mobile = 'edit';
    state.message = `Editing from ${cursor}; Apply requires a new prototype Variant, preserving the source branch.`;
    state.editOld = true;
  } else if (kind === 'create-variant') {
    const id = `prototype-variant-${variants.length + 1}`;
    variants.push({
      id,
      name: `Prototype Variant ${variants.length + 1} · from ${cursor}`,
      parentBranchId: branch,
      headNodeId: cursor,
      recipe: structuredClone(recipe),
    });
    branch = id;
    state.dirty = true;
    state.message = 'New prototype Variant created. Original source HEAD and node graph unchanged.';
  } else if (kind === 'apply' && state.editOld) {
    dialog(
      'Create Variant before Apply',
      `Detached cursor ${cursor}. Source HEAD will remain intact; this simulates branch creation only.`,
      'Create Variant + simulate',
      'confirm-old-apply',
    );
    return;
  } else if (kind === 'confirm-old-apply') {
    closeDialog();
    handleAction('create-variant', target);
    state.editOld = false;
    state.task = { kind: 'process', done: 0, total: 1 };
  } else if (kind === 'apply' || kind === 'run-all' || kind === 'run-prefix') {
    state.task = {
      kind: kind === 'apply' ? 'process' : 'recipe',
      done: 0,
      total: kind === 'apply' ? 1 : kind === 'run-prefix' ? activeStep + 1 : recipe.steps.length,
    };
    state.failure = null;
  } else if (kind === 'fail') {
    const recipeTask = state.task?.kind === 'recipe';
    state.failedStep = Math.min(2, recipe.steps.length - 1);
    state.task = null;
    state.failure = recipeTask
      ? `Simulated failure at step ${state.failedStep + 1} · ${recipe.steps[state.failedStep].id}. Source model unchanged. Edit, then Continue or Rebuild.`
      : 'Simulated Apply rejection · original model unchanged. Correct parameters and retry.';
    if (recipeTask) activeStep = state.failedStep;
  } else if (kind === 'advance-task') {
    state.task.done = Math.min(state.task.total, state.task.done + 1);
  } else if (kind === 'cancel-task') {
    state.task = null;
    state.message = 'Task cancelled · no source mutation.';
  } else if (kind === 'complete') {
    state.task = null;
    state.failure = null;
    state.dirty = true;
    state.message =
      'Simulation complete. Scientific results are NOT computed; source views stay unchanged.';
  } else if (kind === 'continue-confirm' || kind === 'rebuild-confirm') {
    dialog(
      kind === 'continue-confirm' ? 'Continue current model' : 'Rebuild Base · new Main',
      kind === 'continue-confirm'
        ? 'Additive execution normally needs confirmation on an existing process revision. Here it only starts a simulation.'
        : 'Keep / Clear / Cancel archive semantics are not implemented in this prototype. Source branches remain intact.',
      kind === 'continue-confirm' ? 'Confirm Continue' : 'Keep source + simulate rebuild',
      kind === 'continue-confirm' ? 'confirm-continue' : 'confirm-rebuild',
    );
    return;
  } else if (kind === 'confirm-continue' || kind === 'confirm-rebuild') {
    closeDialog();
    state.task = {
      kind: 'recipe',
      done: kind === 'confirm-continue' ? state.failedStep || 0 : 0,
      total: recipe.steps.length,
    };
    state.failure = null;
    state.message = `${kind === 'confirm-continue' ? 'Continue' : 'Rebuild'} simulation · existing branches preserved.`;
  } else if (kind === 'increment' || kind === 'decrement') {
    const input = root.querySelector(`[data-key="${value}"]`);
    const delta = Number(input.step) * (kind === 'increment' ? 1 : -1);
    input.value = String(Math.max(0, Number((Number(input.value) + delta).toPrecision(12))));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  } else if (
    kind === 'new-project' ||
    kind === 'load-project' ||
    kind === 'recovery' ||
    kind === 'file-import'
  ) {
    const titles = {
      'new-project': 'Create project · draft safety',
      'load-project': 'Load other bundled real project',
      recovery: 'Review Recovery candidate',
      'file-import': 'File import walkthrough',
    };
    dialog(
      titles[kind],
      kind === 'new-project'
        ? el(
            'div',
            { class: 'p-form' },
            notice(
              'New project setup is a UI draft; real example remains visible, no Base transaction.',
            ),
            field('New project name', 'newProjectName', 'Device study'),
            field('Base width · µm', 'newWidth', currentModel().width, {
              type: 'number',
              min: 0.001,
            }),
            field('Base height · µm', 'newHeight', currentModel().height, {
              type: 'number',
              min: 0.001,
            }),
            field('Base thickness · µm', 'newThickness', currentModel().thickness, {
              type: 'number',
              min: 0.00001,
            }),
            field('Base material', 'newMaterial', currentModel().layers[0].name),
          )
        : kind === 'file-import'
          ? 'Inspect the bundled gds-basic-instances.gds inventory. Cells, references and Layers come from its real binary records. This does not replace the Draw-source project or execute a core import.'
          : 'Unsaved prototype drafts are not persisted. Source files remain untouched. You can cancel or confirm this UI-only transition.',
      kind === 'file-import' ? 'Inspect real sample inventory' : 'Confirm simulation',
      `confirm-${kind}`,
    );
    return;
  } else if (kind === 'confirm-file-import') {
    closeDialog();
    state.maskMode = 'file';
    state.fileLoaded = true;
    state.fileCell = fileMask.cells[0].name;
    state.message =
      'Actual GDS Cells / Layers metadata loaded. Project still uses its original Draw mask; no core import.';
  } else if (kind === 'cell' || kind === 'file-layer') {
    state[kind === 'cell' ? 'fileCell' : 'fileLayer'] = value;
    state.message = `Selected ${value} in real sample inventory · view geometry not replaced.`;
  } else if (['confirm-new-project', 'confirm-load-project', 'confirm-recovery'].includes(kind)) {
    closeDialog();
    if (kind === 'confirm-load-project')
      state.example = state.example === 'm3d' ? 'photodetector' : 'm3d';
    if (kind !== 'confirm-new-project') useExample();
    else {
      state.projectName = state.newProjectName || 'Device study';
      state.dirty = true;
    }
    state.message = `${kind.slice(8)} walkthrough complete · real bundled example loaded; no file/Recovery storage transaction.`;
  } else if (kind === 'save') {
    download(
      'wafercad-m15-ui-draft.json',
      'application/json',
      JSON.stringify(
        {
          format: 'M1.5-UI-DRAFT-NOT-WAFERCAD',
          source: data.source,
          sourceHash: data.sha256,
          choices: state,
          recipeDraft: recipe,
          variants,
        },
        null,
        2,
      ),
    );
    state.message = 'Downloaded UI draft, not a scientific .wafercad project.';
  } else if (kind === 'export') {
    const view = action.split(':')[1];
    const svg = root.querySelector(`[data-science="${view}"] svg`);
    if (action.endsWith(':svg') && svg)
      download(
        `m15-${view}-presentation.svg`,
        'image/svg+xml',
        new XMLSerializer().serializeToString(svg),
      );
    state.message =
      svg && action.endsWith(':svg')
        ? 'Presentation SVG downloaded (not a physical export).'
        : `${view} export dialog/control simulated; no physical image / GLB / detail export produced.`;
  }
  render(action);
  if (popupOwner)
    root.querySelector(`[popovertarget="${popupOwner}"]`)?.focus({ preventScroll: true });
  if (kind === 'return-results' && narrow())
    root.querySelector('.p-stage')?.scrollIntoView({ block: 'start' });
  if (kind === 'fail' && state.domain === 'recipe')
    root.querySelector(`[data-action="step:${activeStep}"]`)?.scrollIntoView({ block: 'nearest' });
}
root.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (target && !target.disabled) handleAction(target.dataset.action, target);
});
root.addEventListener('change', (event) => {
  const key = event.target.dataset.key;
  if (!key) return;
  const value = event.target.value;
  if (event.target.closest('dialog')) {
    state[key] = value;
    return;
  }
  if (key === 'stepLabel') {
    const params = recipe.steps[activeStep].params;
    params[
      params.material ? 'material' : params.target ? 'target' : params.name ? 'name' : 'label'
    ] = value;
    state.dirty = true;
    return;
  }
  if (key.startsWith('step-param:')) {
    const param = key.slice(11),
      params = recipe.steps[activeStep].params;
    params[param] =
      typeof params[param] === 'number'
        ? Number(value)
        : typeof params[param] === 'boolean'
          ? value === 'true'
          : value;
    state.dirty = true;
    return;
  }
  if (key === 'stepThickness') {
    const params = recipe.steps[activeStep].params;
    params[params.depthUm != null ? 'depthUm' : 'thicknessUm'] = Number(value);
    state.dirty = true;
    return;
  }
  if (key === 'scene') {
    state.empty = value === 'empty-history';
    state.domain =
      value === 'process' ? 'process' : value === 'recipe-failure' ? 'recipe' : 'history';
    state.example = value === 'variants' ? 'photodetector' : 'm3d';
    useExample();
    if (value === 'recipe-failure') presetRecipeFailure();
    state.mobile = state.empty ? 'view' : 'edit';
    state.emptyExpanded = false;
  } else {
    state[key] = ['thickness', 'roiWidth'].includes(key) ? Number(value) : value;
  }
  if (key === 'example') useExample();
  if (key === 'layout') {
    state.panelSize = null;
    state.bottomSize = null;
  }
  render();
  root.querySelector(`[data-key="${key}"]`)?.focus({ preventScroll: true });
});
root.addEventListener('keydown', (event) => {
  const group = event.target.closest('[role="toolbar"]');
  if (!group || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const buttons = [...group.querySelectorAll('button')].filter(
    (b) => !b.disabled && b.getClientRects().length,
  );
  const index = buttons.indexOf(document.activeElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  event.preventDefault();
  buttons[next]?.focus();
});
window.matchMedia('(max-width: 820px)').addEventListener('change', () => render());
const repositionMenus = () =>
  root
    .querySelectorAll('.p-overflow:popover-open')
    .forEach((menu) => menu.dispatchEvent(new Event('position-menu')));
window.addEventListener('resize', repositionMenus);
document.addEventListener('scroll', repositionMenus, true);
installSprite();
try {
  const response = await window.fetch('./prototype-data.json');
  if (!response.ok) throw new Error(`Fixture HTTP ${response.status}`);
  const payload = await response.json();
  fixtures = payload.fixtures;
  fileMask = payload.fileMask;
  const freeze = (object) => {
    if (object && typeof object === 'object' && !Object.isFrozen(object)) {
      Object.freeze(object);
      Object.values(object).forEach(freeze);
    }
  };
  freeze(payload);
  useExample();
  if (query.get('scene') === 'recipe-failure') presetRecipeFailure();
  render();
  // Read-only audit exposure, not a production API or storage integration.
  window.WaferCadM15 = {
    debug: (options) => {
      if (options.example && options.example !== state.example) {
        state.example = options.example;
        useExample();
      }
      if (options.domain && options.domain !== state.domain) {
        state.domain = options.domain;
        state.maximize = options.domain === 'mask' ? 'mask' : null;
        if (options.domain === 'mask') state.view = 'mask';
      }
      state.font = options.font === 'inter' ? 'inter' : 'system';
      state.empty = Boolean(options.empty);
      state.emptyExpanded = false;
      delete state.editorHidden;
      delete state.failedStep;
      state.failure = null;
      if (options.failed) presetRecipeFailure();
      render();
    },
    snapshot: () =>
      structuredClone({
        state,
        source: data.source,
        hash: data.sha256,
        cursor,
        branch,
        sourceBranches: data.branches.length,
        sourceFrozen: Object.isFrozen(data.models.project) && Object.isFrozen(data.recipe.steps),
        prototypeVariants: variants.length,
        recipeSteps: recipe.steps.length,
        modelRegions: currentModel().regionCount,
      }),
    ready: true,
  };
} catch (error) {
  root.replaceChildren(notice(`Prototype failed to load: ${error.message}`, 'error'));
  window.dispatchEvent(new ErrorEvent('error', { message: error.message }));
}
