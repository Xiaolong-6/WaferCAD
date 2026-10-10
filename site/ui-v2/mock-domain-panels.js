// M2-only presentation adapter; replace with real domain callbacks during M3.
(() => {
  const { el, button, select, field, stepper, emptyState, busy, row, notice } =
    window.WaferCadV2Components;
  window.createWaferCadV2MockDomainPanels = ({
    state,
    data,
    recipe,
    cursor,
    branch,
    variants,
    activeStep,
    fileMask,
    currentModel,
    stepTitle,
  }) => {
    const unit = state.displayUnit || 'um';
    const unitFactor = unit === 'nm' ? 1000 : unit === 'mm' ? 0.001 : 1;
    const unitName = unit === 'um' ? 'µm' : unit;
    const displayLength = (value) => Number(value) * unitFactor;
    const fieldLabel = (key) =>
      ({
        face: 'Active face',
        area: 'Area',
        coverage: 'Coverage',
        placement: 'Placement',
        profile: 'Profile',
        regionType: 'Region type',
        source: 'Source',
        process: 'Process',
        temperatureC: 'Temperature · °C',
        durationMin: 'Duration · min',
        featureSize: 'Feature XY',
        featureCv: 'Feature variation · %',
        meanHeight: 'Height',
        heightCv: 'Height variation · %',
        morphology: 'Surface pattern',
        polarity: 'Orientation',
        tilt: 'Tilt X · °',
        depthProfile: 'Depth profile',
        sacrificial: 'Sacrificial layer',
      })[key] ||
      key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
    function recipeParameter(key, value) {
      const choices = {
        face: [
          ['front', 'Front'],
          ['back', 'Back'],
        ],
        area: [
          ['full', 'Full face'],
          ['mask', 'Mask'],
          ['invert', 'Invert mask'],
        ],
        coverage: [
          ['direct', 'Directional'],
          ['conformal', 'Conformal'],
          ['transfer', 'Transfer / Laminate'],
        ],
        placement: [
          ['follow', 'Follow surface'],
          ['flat', 'Flat bridge'],
        ],
        profile: [
          ['directional', 'Directional'],
          ['isotropic', 'Isotropic release'],
          ['planarize', 'Planarize / CMP'],
          ['undercut', 'Undercut release'],
        ],
        regionType: [
          ['p-type', 'p-type'],
          ['n-type', 'n-type'],
          ['p-inversion', 'p inversion'],
          ['n-inversion', 'n inversion'],
          ['p-accumulation', 'p accumulation'],
          ['n-accumulation', 'n accumulation'],
          ['depletion', 'Depletion'],
          ['custom', 'Custom'],
        ],
        source: [
          ['induced', 'Induced'],
          ['doped', 'Doped'],
          ['interface', 'Interface'],
          ['custom', 'Custom'],
        ],
        process: [
          ['anneal', 'Anneal'],
          ['clean', 'Clean'],
          ['oxidation', 'Oxidation'],
          ['surface-treatment', 'Surface treatment'],
          ['activation', 'Activation'],
          ['custom', 'Custom'],
        ],
      };
      if (choices[key]) return select(fieldLabel(key), `step-param:${key}`, choices[key], value);
      if (key === 'surface' && typeof value === 'string')
        return select(
          'Surface',
          `step-param:${key}`,
          [
            ['smooth', 'Smooth'],
            ['rough', 'Rough'],
            ['pyramid', 'Pyramid'],
          ],
          value,
        );
      const physical = ['thicknessUm', 'depthUm'].includes(key);
      return field(
        `${fieldLabel(key)}${physical ? ` · ${unitName}` : ''}`,
        `step-param:${key}`,
        physical ? displayLength(value) : value,
        typeof value === 'number' || physical ? { type: 'number', step: 'any' } : {},
      );
    }
    function projectPanel() {
      return [
        el(
          'div',
          { class: 'p-form' },
          field('Project name', 'projectName', state.projectName || data.name),
          select(
            'XYZ display unit',
            'displayUnit',
            [
              ['nm', 'nm'],
              ['um', 'µm'],
              ['mm', 'mm'],
            ],
            state.displayUnit,
          ),
          notice(`${data.source.split('/').at(-1)} · ${data.bytes.toLocaleString()} bytes`),
          el(
            'div',
            { class: 'p-actions' },
            button('New', 'new-project', 'plus'),
            button('Load', 'load-project', 'folder'),
            button('Export settings', 'save', 'save'),
          ),
        ),
        el(
          'section',
          {},
          el('h3', {}, 'Recovery'),
          el('p', { class: 'p-aux' }, 'Review this example as a recovery candidate.'),
          button('Review recovery', 'recovery', 'history'),
        ),
      ];
    }
    function basePanel() {
      const draft = state.baseDraft || currentModel();
      return el(
        'section',
        { class: 'p-base-editor', 'aria-label': 'Base dimensions' },
        el('h3', {}, 'Base'),
        select(
          'Shape',
          'baseShape',
          [
            ['rect', 'Rectangle'],
            ['circle', 'Circle'],
          ],
          state.baseShape || 'rect',
        ),
        el(
          'div',
          { class: 'p-base-fields' },
          ...['width', 'height', 'thickness']
            .filter((key) => state.baseShape !== 'circle' || key !== 'height')
            .map((key) =>
              field(
                `${state.baseShape === 'circle' && key === 'width' ? 'Diameter' : key[0].toUpperCase() + key.slice(1)} · ${unitName}`,
                `base:${key}`,
                displayLength(draft[key]),
                { type: 'number', step: 'any', min: '0' },
              ),
            ),
        ),
        state.baseError ? notice(state.baseError, 'error') : null,
        button('Rebuild Base', 'base-rebuild', 'history', {
          primary: true,
          disabled: Boolean(state.baseError),
        }),
        button('Revert changes', 'base-revert', 'undo'),
        state.baseApplied
          ? el(
              'p',
              { class: 'p-aux' },
              `Confirmed dimensions: ${['width', 'height', 'thickness']
                .map((key) => displayLength(state.baseApplied[key]))
                .join(' × ')} ${unitName}`,
            )
          : null,
      );
    }
    function maskPanel() {
      const renderCell = (cell, depth = 0) =>
        el(
          'li',
          { class: 'p-cell-node', 'data-cell-id': cell.name, 'data-depth': depth },
          row(
            cell.name,
            `${cell.shapeCount} ${cell.shapeCount === 1 ? 'shape' : 'shapes'} · ${cell.layers.join(', ') || 'references only'}`,
            `cell:${cell.name}`,
            state.fileCell === cell.name,
          ),
          cell.references.length
            ? el(
                'ul',
                { class: 'p-cell-children' },
                ...fileMask.cells
                  .filter((child) => cell.references.includes(child.name))
                  .map((child) => renderCell(child, depth + 1)),
              )
            : null,
        );
      return [
        el(
          'div',
          { class: 'p-form' },
          select(
            'Mask source',
            'maskMode',
            [
              ['draw', 'Draw'],
              ['file', 'File'],
            ],
            state.maskMode,
          ),
          state.maskMode === 'file'
            ? state.fileLoaded
              ? el(
                  'section',
                  { class: 'p-form' },
                  notice(fileMask.source.split('/').at(-1)),
                  el('h3', {}, `Layers · ${fileMask.layers.length}`),
                  el(
                    'div',
                    { class: 'p-list' },
                    fileMask.layers.map((layer) =>
                      el(
                        'div',
                        { class: 'p-mask-file-layer' },
                        el('input', {
                          type: 'checkbox',
                          checked: state.fileLayersVisible?.[layer] !== false,
                          'data-key': `file-layer-visible:${layer}`,
                          'aria-label': `Show GDS layer ${layer}`,
                        }),
                        row(
                          `Layer / datatype ${layer}`,
                          '',
                          `file-layer:${layer}`,
                          state.fileLayer === layer,
                        ),
                      ),
                    ),
                  ),
                )
              : emptyState(
                  'No imported layout',
                  'Choose a layout to browse its Cells and Layers.',
                  button('Inspect bundled GDS sample', 'file-import', 'folder'),
                )
            : el(
                'div',
                { class: 'p-form' },
                notice(`${state.drawDraft.length} drawn shapes · ${unitName}`),
                button('Inspect bundled GDS sample', 'file-import', 'folder'),
              ),
        ),
        state.maskMode === 'file'
          ? el(
              'section',
              {},
              el(
                'h3',
                {},
                `Cells · ${state.fileLoaded ? fileMask.cells.length : data.layout.cells}`,
              ),
              state.fileLoaded
                ? el(
                    'ul',
                    { class: 'p-list', 'data-file-cells': '' },
                    ...fileMask.cells
                      .filter(
                        (cell) =>
                          cell.name !== '$$$CONTEXT_INFO$$$' &&
                          !fileMask.cells.some((parent) => parent.references.includes(cell.name)),
                      )
                      .map((cell) => renderCell(cell)),
                  )
                : emptyState(
                    'No imported Cells',
                    'Choose a layout to browse its Cells.',
                    button('Inspect bundled GDS sample', 'file-import', 'folder'),
                  ),
            )
          : null,
      ];
    }
    function taskControls() {
      if (!state.task) return [];
      return [
        notice(
          state.task.kind === 'recipe'
            ? `Recipe · step ${Math.min(state.task.done + 1, state.task.total)} / ${state.task.total}`
            : `Manual · one ${state.operation || 'deposit'} operation · 0 / 1`,
        ),
        busy(
          state.task.kind === 'recipe' ? 'Run All · preview' : 'Apply · preview',
          state.task.done,
          state.task.total,
        ),
        el(
          'div',
          { class: 'p-actions' },
          button('Complete preview', 'complete', 'check'),
          button('Advance progress', 'advance-task', 'play'),
          button('Inject failure', 'fail', 'warning'),
          button('Cancel', 'cancel-task', 'stop'),
        ),
      ];
    }
    function processSample(operation) {
      return [...data.recipe.steps, ...data.branches.flatMap((b) => b.recipe.steps)].find(
        (s) => s.command === operation,
      )?.params;
    }
    function processGuide() {
      const { processGuideKey, processGuideEntry, processGuideSvg } = window.WaferCadProcessGuide;
      const operation = state.operation || 'deposit';
      const sample = processSample(operation);
      const id = processGuideKey({
        type: { deposit: 'add', extend: 'grow' }[operation] || operation,
        growth: state.processCoverage || sample?.coverage || 'direct',
        placement: state.processPlacement || sample?.placement || 'follow',
        profile: state.processProfile || 'directional',
        surface: state.processSurface || sample?.surface?.kind || sample?.surface || 'smooth',
        polarity: state.processPolarity || 'inverted',
        targetMaterial: Boolean(state.material || currentModel().layers.at(-1)?.id),
      });
      const entry = processGuideEntry(id);
      const illustration = (after) => {
        const drawing = el('div', { class: 'p-process-guide-drawing' });
        // Trusted canonical SVG only; form values are not interpolated into markup.
        drawing.innerHTML = processGuideSvg(id, after);
        return el('div', {}, el('span', { class: 'p-aux' }, after ? 'After' : 'Before'), drawing);
      };
      const guide = el(
        'details',
        {
          class: 'p-process-guide',
          'data-process-guide': id,
          'aria-label': 'Current process schematic',
          open: state.processGuideOpen !== false,
        },
        el(
          'summary',
          {},
          `How ${operation === 'liftoff' ? 'Lift-off' : operation[0].toUpperCase() + operation.slice(1)} works`,
        ),
        el('strong', {}, entry.title),
        el(
          'div',
          {
            class: 'p-process-guide-illustrations',
            'aria-label': 'Schematic process before and after',
          },
          illustration(false),
          el('span', { 'aria-hidden': 'true' }, '→'),
          illustration(true),
        ),
        el('p', {}, entry.summary),
        el(
          'small',
          { class: 'p-aux' },
          operation === 'record'
            ? 'History only'
            : `${state.area === 'full' ? 'Whole face' : state.area === 'invert' ? 'Invert Mask' : 'Selected Mask'} · ${state.face === 'back' ? 'Back' : 'Front'}`,
        ),
        el(
          'a',
          {
            href: `https://github.com/Xiaolong-6/WaferCAD/wiki/Process-Operations#${id}`,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          'Full operation guide ↗',
        ),
      );
      guide.addEventListener('toggle', () => {
        if (guide.isConnected) state.processGuideOpen = guide.open;
      });
      return guide;
    }
    function processExtras() {
      const operation = state.operation || 'deposit';
      const sample = processSample(operation);
      if (operation === 'deposit' || operation === 'extend')
        return [
          ...(operation === 'deposit'
            ? [field('Layer name', 'processName', state.processName || 'New layer')]
            : []),
          select(
            'Coverage',
            'processCoverage',
            [
              ['direct', 'Direct'],
              ['conformal', 'Conformal'],
              ...(operation === 'deposit' ? [['transfer', 'Transfer / Laminate']] : []),
            ],
            state.processCoverage || sample?.coverage || 'direct',
          ),
          ...(operation === 'deposit' && state.processCoverage === 'transfer'
            ? [
                select(
                  'Placement',
                  'processPlacement',
                  [
                    ['follow', 'Follow surface'],
                    ['flat', 'Flat bridge'],
                  ],
                  state.processPlacement || sample?.placement || 'follow',
                ),
              ]
            : []),
        ];
      if (operation === 'etch')
        return [
          select(
            'Profile',
            'processProfile',
            [
              ['directional', 'Directional'],
              ['isotropic', 'Isotropic release'],
              ['planarize', 'Planarize / CMP'],
              ['undercut', 'Undercut release'],
            ],
            state.processProfile || 'directional',
          ),
          ...(state.processProfile && state.processProfile !== 'directional'
            ? []
            : [
                select(
                  'Surface',
                  'processSurface',
                  [
                    ['smooth', 'Smooth'],
                    ['rough', 'Rough'],
                    ['pyramid', 'Pyramid'],
                  ],
                  state.processSurface || sample?.surface?.kind || sample?.surface || 'smooth',
                ),
              ]),
          ...((!state.processProfile || state.processProfile === 'directional') &&
          ['rough', 'pyramid'].includes(state.processSurface)
            ? [
                field(
                  `Feature XY · ${unitName}`,
                  'processFeatureSize',
                  displayLength(state.processFeatureSize ?? 0.1),
                  { type: 'number', min: 0, step: 'any' },
                ),
                field('Feature CV · %', 'processFeatureCv', state.processFeatureCv ?? 0, {
                  type: 'number',
                  min: 0,
                  max: 100,
                }),
                field(
                  `Height · ${unitName}`,
                  'processMeanHeight',
                  displayLength(state.processMeanHeight ?? 0.1),
                  { type: 'number', min: 0, step: 'any' },
                ),
                field('Height CV · %', 'processHeightCv', state.processHeightCv ?? 0, {
                  type: 'number',
                  min: 0,
                  max: 100,
                }),
                select(
                  'Orientation',
                  'processPolarity',
                  [
                    ['inverted', 'Inverted'],
                    ['normal', 'Normal'],
                  ],
                  state.processPolarity || 'inverted',
                ),
                field('Seed', 'processSeed', state.processSeed ?? '', {
                  type: 'number',
                  min: 0,
                  max: 4294967295,
                  step: 1,
                }),
              ]
            : []),
        ];
      if (operation === 'liftoff')
        return [
          select(
            'Sacrificial layer (Lift-off)',
            'liftoffSacrificial',
            currentModel().layers.map((layer) => [layer.name, layer.name]),
            state.liftoffSacrificial || currentModel().layers.at(-1)?.name || '',
          ),
          notice('Select the sacrificial material to remove.'),
        ];
      if (operation === 'implant')
        return [
          field('Implant name', 'processName', state.processName || sample?.name || 'New Implant'),
          stepper(
            'Tilt X · degrees',
            'processTilt',
            state.processTilt ?? sample?.tilt ?? 0,
            1,
            -80,
            80,
          ),
          stepper(
            `Illustrative depth · ${unitName}`,
            'processDepth',
            displayLength(state.processDepth ?? sample?.depthUm ?? 0.5),
            0.01 * unitFactor,
          ),
          notice(sample?.name || 'No Implant step in this example.'),
        ];
      if (operation === 'electrical')
        return [
          field(
            'Electrical region name',
            'processName',
            state.processName || sample?.name || 'New Electrical Region',
          ),
          select(
            'Region type',
            'processRegionType',
            [
              ['p-type', 'p-type'],
              ['n-type', 'n-type'],
              ['p-inversion', 'p inversion'],
              ['n-inversion', 'n inversion'],
              ['p-accumulation', 'p accumulation'],
              ['n-accumulation', 'n accumulation'],
              ['depletion', 'Depletion'],
              ['custom', 'Custom'],
            ],
            state.processRegionType || sample?.regionType || 'p-inversion',
          ),
          select(
            'Source',
            'processRegionSource',
            [
              ['induced', 'Induced'],
              ['doped', 'Doped'],
              ['interface', 'Interface'],
              ['custom', 'Custom'],
            ],
            state.processRegionSource || sample?.source || 'induced',
          ),
          stepper(
            `Illustrative depth · ${unitName}`,
            'processDepth',
            displayLength(state.processDepth ?? sample?.depthUm ?? 0.05),
            0.01 * unitFactor,
          ),
          notice(sample?.name || 'No Electrical step in this Recipe.'),
        ];
      return [
        select(
          'Record process',
          'processRecordKind',
          ['anneal', 'clean', 'oxidation', 'surface-treatment', 'activation', 'custom'].map(
            (kind) => [kind, kind],
          ),
          state.processRecordKind || sample?.process || 'custom',
        ),
        field(
          'Record label',
          'processRecordLabel',
          state.processRecordLabel || sample?.label || 'New record',
        ),
        field(
          'Temperature · °C',
          'processTemperature',
          state.processTemperature ?? sample?.temperatureC ?? '',
          { type: 'number' },
        ),
        field(
          'Duration · min',
          'processDuration',
          state.processDuration ?? sample?.durationMin ?? '',
          {
            type: 'number',
            min: 0,
          },
        ),
        field('Ambient', 'processAmbient', state.processAmbient || sample?.ambient || ''),
        field('Note', 'processNote', state.processNote || sample?.note || ''),
      ];
    }
    function processModes(active) {
      const registry = window.WaferCadV2ShellRegistry.defaults;
      const labels = { step: 'Manual', recipe: 'Recipe', code: 'Code', diagnostics: 'Diagnostics' };
      return el(
        'div',
        { class: 'p-actions', 'aria-label': 'Process modes' },
        registry.processModes.map((key) =>
          button(
            labels[key] || key,
            `domain:${key === 'step' ? 'process' : key}`,
            key === 'step' ? 'process' : key === 'diagnostics' ? 'settings' : key,
            { 'aria-pressed': String(active === key) },
          ),
        ),
      );
    }
    function processPanel() {
      return [
        state.editOld
          ? el(
              'div',
              { class: 'p-history-edit-context' },
              notice(
                `${state.historyEditMode === 'insert' ? 'Insert before' : 'Edit'}: ${data.history.find((node) => node.id === cursor)?.label || 'Selected step'}`,
              ),
              button('Cancel · return to HEAD', 'history-cancel-edit', 'back'),
            )
          : null,
        el(
          'div',
          { class: 'p-form' },
          processModes('step'),
          select(
            'Operation',
            'operation',
            [
              ['deposit', 'Deposit'],
              ['extend', 'Extend'],
              ['etch', 'Etch'],
              ['liftoff', 'Lift-off'],
              ['implant', 'Implant'],
              ['electrical', 'Electrical'],
              ['record', 'Record'],
            ],
            state.operation || 'deposit',
          ),
          ...(!['record', 'liftoff'].includes(state.operation)
            ? [
                select(
                  'Material / target',
                  'material',
                  currentModel().layers.map((l) => [l.id, l.name]),
                  state.material || currentModel().layers.at(-1).id,
                ),
              ]
            : []),
          ...(!['record', 'liftoff'].includes(state.operation || 'deposit')
            ? [
                stepper(
                  `Thickness / depth · ${unitName}`,
                  'thickness',
                  displayLength(state.thickness ?? 0.07),
                  unitFactor === 1000 ? 1 : 0.001,
                ),
              ]
            : []),
          ...processExtras(),
          ...(state.operation === 'record'
            ? []
            : [
                select(
                  'Active face',
                  'face',
                  [
                    ['front', 'Front'],
                    ['back', 'Back'],
                  ],
                  state.face || 'front',
                ),
                select(
                  'Area',
                  'area',
                  [
                    ['mask', 'Selected Mask'],
                    ['invert', 'Invert Mask'],
                    ['full', 'Whole face'],
                  ],
                  state.area || 'mask',
                ),
              ]),
          select(
            'Also add to Recipe',
            'processAddToRecipe',
            [
              ['false', 'No'],
              ['true', 'Yes'],
            ],
            state.processAddToRecipe || 'false',
          ),
          el('span', { id: 'p-units', class: 'p-aux' }, `Input unit: ${unitName}`),
          el(
            'div',
            { class: 'p-apply-actions' },
            button('Apply', 'apply', 'play', {
              primary: true,
              disabled:
                Boolean(state.task) ||
                (!['record', 'liftoff'].includes(state.operation) &&
                  state.thickness != null &&
                  (!Number.isFinite(state.thickness) || state.thickness <= 0)),
            }),
            el(
              'div',
              { class: 'p-edit-actions', role: 'toolbar', 'aria-label': 'Form edits' },
              button('', 'draft-undo', 'undo', {
                disabled: !state.draftUndo,
                'aria-label': 'Undo form edit',
                title: 'Undo form edit',
              }),
              button('', 'draft-redo', 'redo', {
                disabled: !state.draftRedo,
                'aria-label': 'Redo form edit',
                title: 'Redo form edit',
              }),
            ),
          ),
          !['record', 'liftoff'].includes(state.operation) &&
            state.thickness != null &&
            (!Number.isFinite(state.thickness) || state.thickness <= 0)
            ? notice('Enter a positive thickness / depth before Apply.', 'error')
            : null,
          ...taskControls(),
          state.failure ? notice(state.failure, 'error') : null,
        ),
        processGuide(),
        el(
          'div',
          { class: 'p-process-summary' },
          el(
            'span',
            { class: 'p-aux' },
            `${currentModel().regionCount} regions · ${currentModel().layers.length} layers`,
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
          processModes('recipe'),
          field('Recipe name', 'recipeName', recipe.name),
          el(
            'div',
            { class: 'p-recipe-toolbar' },
            select(
              'Operation',
              'recipeAddKind',
              [
                ['deposit', 'Deposit'],
                ['extend', 'Extend'],
                ['etch', 'Etch'],
                ['liftoff', 'Lift-off'],
                ['implant', 'Implant'],
                ['electrical', 'Electrical'],
                ['record', 'Record'],
                ['snapshot', 'Snapshot'],
              ],
              state.recipeAddKind || 'deposit',
            ),
            button('Add step', 'add-step', 'plus'),
            el(
              'div',
              { class: 'p-actions p-recipe-edits', role: 'toolbar', 'aria-label': 'Recipe edits' },
              button('Undo edit', 'recipe-undo', 'undo', { disabled: !state.recipeUndo }),
              button('Redo edit', 'recipe-redo', 'redo', { disabled: !state.recipeRedo }),
            ),
          ),
          el(
            'div',
            { class: 'p-recipe-template' },
            select(
              'Template preview',
              'recipeTemplate',
              [
                ['source', `Current example · ${data.recipe.steps.length} steps`],
                ['deposit-etch', 'Deposit + Etch · 2 steps'],
                ['blank', 'Blank Recipe'],
              ],
              state.recipeTemplate || 'source',
            ),
            el('p', { class: 'p-aux' }, 'Replacing a template can be undone.'),
            button('Preview / replace template…', 'template-preview', 'recipe'),
          ),
          state.recipeErrors?.length ? notice(state.recipeErrors.join(' · '), 'error') : null,
          el(
            'div',
            { class: 'p-actions' },
            button('Validate Recipe', 'recipe-validate', 'check'),
            button('Run All', 'run-all', 'play', {
              primary: true,
              disabled: Boolean(state.task) || Boolean(state.recipeErrors?.length),
            }),
            button('Continue', 'continue-confirm', 'play', { disabled: Boolean(state.task) }),
            button('Rebuild Base', 'rebuild-confirm', 'history', { disabled: Boolean(state.task) }),
          ),
          ...taskControls(),
          state.failure ? notice(state.failure, 'error') : null,
          selected
            ? el(
                'div',
                { class: 'p-form', 'data-step-editor': selected.id },
                el('strong', {}, `Edit step ${activeStep + 1}`),
                select(
                  'Operation',
                  'stepCommand',
                  [
                    'deposit',
                    'extend',
                    'etch',
                    'liftoff',
                    'implant',
                    'electrical',
                    'record',
                    'snapshot',
                  ].map((kind) => [kind, kind]),
                  selected.command,
                ),
                field('Material / label', 'stepLabel', stepTitle(selected)),
                ...(selected.params.thicknessUm != null || selected.params.depthUm != null
                  ? [
                      stepper(
                        `Thickness / depth · ${unitName}`,
                        'stepThickness',
                        displayLength(selected.params.thicknessUm ?? selected.params.depthUm ?? 0),
                        unitFactor === 1000 ? 1 : 0.001,
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
                  .map(([key, value]) => recipeParameter(key, value)),
                typeof selected.params.surface === 'object' && selected.params.surface
                  ? el(
                      'fieldset',
                      { class: 'p-form' },
                      el('legend', {}, 'Surface'),
                      ...Object.entries(selected.params.surface).map(([key, value]) => {
                        const physical = ['featureSize', 'meanHeight'].includes(key);
                        return field(
                          `${fieldLabel(key)}${physical ? ` · ${unitName}` : ''}`,
                          `step-surface:${key}`,
                          physical ? displayLength(value) : value,
                          typeof value === 'number' ? { type: 'number', step: 'any' } : {},
                        );
                      }),
                    )
                  : null,
                selected.params.mask
                  ? el(
                      'p',
                      { class: 'p-aux', 'data-mask-summary': '' },
                      `Captured Mask · ${selected.params.mask.sourceMode || 'draw'} · ${selected.params.mask.drawMask?.shapes?.length || 0} shapes · ${selected.params.mask.layerKeys?.length || 0} layers`,
                    )
                  : null,
                ['mask', 'invert'].includes(selected.params.area)
                  ? button('Use current Mask', 'recipe-capture-mask', 'mask')
                  : null,
                button('Copy step', 'copy-step'),
                button('Save step', 'save-step', 'save'),
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
              el(
                'div',
                { class: 'p-recipe-step', 'data-recipe-step': s.id },
                row(
                  `${String(i + 1).padStart(2, '0')} · ${s.command.toUpperCase()}`,
                  stepTitle(s),
                  `step:${i}`,
                  i === activeStep,
                  state.failedStep === i && state.failure ? 'error' : '',
                ),
                el(
                  'div',
                  { class: 'p-actions' },
                  button('↑', `move-up:${i}`, null, {
                    'aria-label': `Move step ${i + 1} up`,
                    disabled: i === 0,
                  }),
                  button('↓', `move-down:${i}`, null, {
                    'aria-label': `Move step ${i + 1} down`,
                    disabled: i === recipe.steps.length - 1,
                  }),
                  button('', `delete-step:${i}`, 'close', {
                    'aria-label': `Delete step ${i + 1}`,
                    title: `Delete step ${i + 1}`,
                  }),
                ),
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
            'No steps have been recorded yet.',
            button('Back to canvas', 'return-results', 'back'),
          ),
        ];
      const selected = data.history.find((n) => n.id === cursor);
      const allBranches = [...data.branches, ...variants];
      const historyTree = window.WaferCadV2HistoryTree.build(data.history, allBranches);
      const historyLabel = (id) =>
        data.history.find((node) => node.id === id)?.label || id || 'Draft';
      const historyRow = (title, subtitle, action, pressed, tone, type) =>
        el(
          'button',
          {
            type: 'button',
            class: `p-history-row p-history-row--${type}`,
            'data-action': action,
            'data-state': tone,
            'aria-pressed': String(pressed),
          },
          el('span', { class: 'p-history-title' }, title),
          el('span', { class: 'p-history-meta' }, subtitle),
        );
      function renderBranch(tree, depth = 0) {
        const active = branch === tree.branch.id;
        const collapsed = Boolean(state.historyCollapsed[tree.branch.id]);
        return el(
          'li',
          {
            class: 'p-history-branch',
            role: 'treeitem',
            'aria-level': depth * 2 + 1,
            'data-branch-id': tree.branch.id,
            'data-depth': depth,
          },
          el(
            'div',
            { class: 'p-history-row-wrap' },
            button(collapsed ? '›' : '⌄', `history-collapse:${tree.branch.id}`, null, {
              class: 'p-history-toggle',
              'aria-label': `${collapsed ? 'Expand' : 'Collapse'} ${tree.branch.name}`,
              'aria-expanded': String(!collapsed),
            }),
            historyRow(
              `${tree.branch.name}${tree.branch.id === 'main' ? ' · Main' : ''}`,
              `${tree.steps.length} steps · ${tree.branch.headNodeId === cursor ? 'HEAD · selected cursor' : `HEAD · ${historyLabel(tree.branch.headNodeId)}`} · from ${tree.origin?.label || 'Base'}`,
              `branch:${tree.branch.id}`,
              active,
              active ? 'active' : '',
              'branch',
            ),
            button('', `history-branch-menu:${tree.branch.id}`, 'more', {
              class: 'p-history-more',
              'aria-label': `Variant actions for ${tree.branch.name}`,
              'aria-expanded': String(state.historyBranchMenu === tree.branch.id),
            }),
            state.historyBranchMenu === tree.branch.id
              ? el(
                  'div',
                  { class: 'p-history-menu', role: 'menu' },
                  button('Rename Variant', `history-rename:${tree.branch.id}`, null, {
                    role: 'menuitem',
                  }),
                  button('Return to HEAD', 'history-return-head', null, { role: 'menuitem' }),
                  button('Delete Variant', `history-delete-branch:${tree.branch.id}`, null, {
                    role: 'menuitem',
                    disabled:
                      tree.branch.id === 'main' ||
                      allBranches.some((item) => item.parentBranchId === tree.branch.id),
                    title:
                      tree.branch.id === 'main'
                        ? 'Main is protected'
                        : allBranches.some((item) => item.parentBranchId === tree.branch.id)
                          ? 'Delete child Variants first'
                          : 'Delete Variant',
                  }),
                )
              : null,
          ),
          collapsed
            ? null
            : tree.steps.length
              ? el(
                  'ul',
                  {
                    class: 'p-history-steps',
                    role: 'group',
                    'data-history-list': depth === 0 ? '' : false,
                  },
                  tree.steps.map((step, index) =>
                    el(
                      'li',
                      {
                        class: 'p-history-step',
                        role: 'treeitem',
                        'aria-level': depth * 2 + 2,
                        'data-step-id': step.node.id,
                      },
                      el(
                        'div',
                        { class: 'p-history-row-wrap' },
                        historyRow(
                          `${String(index + 1).padStart(2, '0')} · ${step.node.label}`,
                          `${step.node.kind || step.node.operationKind || 'Step'}${step.node.id === cursor ? ' · Cursor' : ''}${step.node.id === tree.branch.headNodeId ? ' · Branch HEAD' : ''}`,
                          `history:${step.node.id}`,
                          step.node.id === cursor,
                          step.node.id === tree.branch.headNodeId ? 'head' : '',
                          'step',
                        ),
                        button('', `history-menu:${step.node.id}`, 'more', {
                          class: 'p-history-more',
                          'aria-label': `Actions for ${step.node.label}`,
                          'aria-expanded': String(state.historyMenuNode === step.node.id),
                          title: 'Step actions',
                        }),
                        state.historyMenuNode === step.node.id
                          ? el(
                              'div',
                              { class: 'p-history-menu', role: 'menu' },
                              button('Select as cursor', `history-select:${step.node.id}`, null, {
                                role: 'menuitem',
                              }),
                              button('Restore from here', `history-restore:${step.node.id}`, null, {
                                role: 'menuitem',
                              }),
                              button('Edit from here', `history-edit:${step.node.id}`, null, {
                                role: 'menuitem',
                              }),
                              button('Insert before', `history-insert:${step.node.id}`, null, {
                                role: 'menuitem',
                                disabled: !step.node.parentId,
                              }),
                              button(
                                'Continue from here',
                                `history-continue:${step.node.id}`,
                                null,
                                { role: 'menuitem' },
                              ),
                              button('Add bookmark', `history-bookmark-add:${step.node.id}`, null, {
                                role: 'menuitem',
                              }),
                              button('Return to HEAD', 'history-return-head', null, {
                                role: 'menuitem',
                              }),
                              button(
                                'Create Variant from here',
                                `history-variant:${step.node.id}`,
                                null,
                                {
                                  role: 'menuitem',
                                },
                              ),
                            )
                          : null,
                      ),
                      data.bookmarks.some((item) => item.historyNodeId === step.node.id)
                        ? el(
                            'details',
                            { class: 'p-bookmarks' },
                            el(
                              'summary',
                              {},
                              `Bookmarks · ${data.bookmarks.filter((item) => item.historyNodeId === step.node.id).length}`,
                            ),
                            ...data.bookmarks
                              .filter((item) => item.historyNodeId === step.node.id)
                              .map((item) =>
                                el(
                                  'div',
                                  { class: 'p-history-bookmark', 'data-bookmark-id': item.id },
                                  row(
                                    item.name,
                                    'Bookmark',
                                    `history:${step.node.id}`,
                                    cursor === step.node.id,
                                  ),
                                  el(
                                    'div',
                                    { class: 'p-actions' },
                                    button('Rename', `history-bookmark-rename:${item.id}`, null),
                                    button('Delete', `history-bookmark-delete:${item.id}`, null),
                                  ),
                                ),
                              ),
                          )
                        : null,
                      step.variants.length
                        ? el(
                            'ul',
                            { class: 'p-history-variants', role: 'group' },
                            step.variants.map((child) => renderBranch(child, depth + 1)),
                          )
                        : null,
                    ),
                  ),
                )
              : emptyState('No steps in this Variant', 'This Variant has no recorded steps.', null),
        );
      }
      return [
        el(
          'section',
          { class: 'p-history-workspace' },
          el(
            'div',
            { class: 'p-history-fixed' },
            el('strong', {}, selected?.label || 'New Variant'),
            el(
              'span',
              { class: 'p-history-context' },
              `Cursor · ${allBranches.find((item) => item.id === branch)?.name || 'Variant'}`,
            ),
          ),
          el(
            'div',
            { class: 'p-history-scroll', 'data-history-scroll': '' },
            el('h3', {}, `History · ${allBranches.length} Variants`),
            el(
              'div',
              { class: 'p-history-tree', role: 'tree', 'aria-label': 'History and Variants' },
              el(
                'ul',
                { class: 'p-history-roots', 'data-variant-list': '' },
                historyTree.map((tree) => renderBranch(tree)),
              ),
            ),
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
        {
          class: 'p-code-editor',
          spellcheck: 'false',
          'data-key': 'codeDraft',
          'aria-label': 'Process Recipe code',
        },
        state.codeDraft ?? sourceText,
      );
      return [
        el(
          'section',
          { class: 'p-code-workspace' },
          processModes('code'),
          el(
            'div',
            { class: 'p-code-heading' },
            el('strong', { title: recipe.name }, recipe.name),
            el('span', { class: 'p-aux' }, `${recipe.steps.length} steps`),
          ),
          state.failure ? notice(state.failure, 'error') : null,
          editor,
          el(
            'div',
            { class: 'p-actions' },
            button('Apply code', 'code-apply', 'check', { primary: true }),
            button('Format', 'code-format', 'code'),
          ),
        ),
      ];
    }
    function diagnosticsPanel() {
      return [
        processModes('diagnostics'),
        notice('Geometry analysis is not available in this preview.'),
      ];
    }
    function inspector() {
      const domain = [
        'project',
        'mask',
        'process',
        'recipe',
        'code',
        'diagnostics',
        'history',
      ].includes(state.domain)
        ? state.domain
        : 'process';
      const content = {
        project: projectPanel,
        mask: maskPanel,
        process: processPanel,
        recipe: recipePanel,
        code: codePanel,
        diagnostics: diagnosticsPanel,
        history: historyPanel,
      }[domain]();
      return el(
        'aside',
        { class: 'p-inspector', 'aria-label': `${domain} editor` },
        el('div', { class: 'p-panel-content' }, content),
      );
    }

    return { render: inspector, renderBase: basePanel };
  };
})();
