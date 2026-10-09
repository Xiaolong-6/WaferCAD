// M2-only presentation adapter; replace with real domain callbacks during M3.
(() => {
  const { el, button, select, field, stepper, emptyState, busy, panelHeader, row, notice } =
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
        ],
        placement: [
          ['follow', 'Follow surface'],
          ['flat', 'Flat bridge'],
        ],
        profile: [
          ['directional', 'Directional'],
          ['isotropic', 'Isotropic release'],
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
      if (choices[key]) return select(key, `step-param:${key}`, choices[key], value);
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
        `${key}${physical ? ` · ${unitName}` : ''}`,
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
          field('Project name (prototype draft)', 'projectName', state.projectName || data.name),
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
          button('Rebuild Base…', 'base-rebuild', 'history'),
        ),
      ];
    }
    function maskPanel() {
      const model = currentModel();
      const renderCell = (cell, depth = 0) =>
        el(
          'li',
          { class: 'p-cell-node', 'data-cell-id': cell.name, 'data-depth': depth },
          row(
            cell.name,
            `${cell.shapeCount} shapes · ${cell.layers.join(', ') || 'references only'}`,
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
                      el(
                        'label',
                        { class: 'p-mask-file-layer' },
                        el('input', {
                          type: 'checkbox',
                          checked: state.fileLayersVisible?.[layer] !== false,
                          'data-key': `file-layer-visible:${layer}`,
                          'aria-label': `Show GDS layer ${layer}`,
                        }),
                        row(
                          `Layer / datatype ${layer}`,
                          'Metadata selection only',
                          `file-layer:${layer}`,
                          state.fileLayer === layer,
                        ),
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
        ),
        el(
          'section',
          {},
          el('h3', {}, `Cells · ${state.fileLoaded ? fileMask.cells.length : data.layout.cells}`),
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
              return el(
                'div',
                {
                  class: 'p-layer',
                  'data-layer-visible': String(state.layerVisibility[l.id] !== false),
                },
                swatch,
                row(l.name, l.id, `layer:${l.id}`),
                el('input', {
                  type: 'checkbox',
                  checked: state.layerVisibility[l.id] !== false,
                  'data-action': `mask-layer:${l.id}`,
                  'aria-label': `Show ${l.name}`,
                }),
              );
            }),
          ),
        ),
      ];
    }
    function taskControls() {
      if (!state.task) return [];
      return [
        notice(
          state.task.kind === 'recipe'
            ? `Recipe · step ${Math.min(state.task.done + 1, state.task.total)} / ${state.task.total} · ${recipe.steps[Math.min(state.task.done, recipe.steps.length - 1)]?.id || ''}`
            : `Manual · one ${state.operation || 'deposit'} operation · 0 / 1`,
        ),
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
      if (operation === 'extend')
        return [
          select(
            'Coverage',
            'processCoverage',
            [
              ['direct', 'Directional'],
              ['conformal', 'Conformal'],
            ],
            state.processCoverage || sample?.coverage || 'direct',
          ),
          select(
            'Placement',
            'processPlacement',
            [
              ['follow', 'Follow surface'],
              ['flat', 'Flat bridge'],
            ],
            state.processPlacement || sample?.placement || 'follow',
          ),
        ];
      if (operation === 'etch')
        return [
          select(
            'Profile',
            'processProfile',
            [
              ['directional', 'Directional'],
              ['isotropic', 'Isotropic release'],
            ],
            state.processProfile || 'directional',
          ),
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
        ];
      if (operation === 'liftoff') return [
        select('Sacrificial layer (Lift-off)', 'liftoffSacrificial',
          currentModel().layers.map((layer) => [layer.name, layer.name]),
          state.liftoffSacrificial || currentModel().layers.at(-1)?.name || ''),
        notice('Ideal sacrificial lift-off · UI draft only; no geometry or transaction executed.'),
      ];
      if (operation === 'implant')
        return [
          field(
            'Implant name / source assumptions',
            'processName',
            state.processName || sample?.name || 'Prototype implant draft',
          ),
          stepper(
            'Tilt X · degrees',
            'processTilt',
            state.processTilt ?? sample?.tilt ?? 0,
            1,
            -80,
            80,
          ),
          stepper(
            'Illustrative depth · µm',
            'processDepth',
            state.processDepth ?? sample?.depthUm ?? 0.5,
            0.01,
          ),
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
            'Illustrative depth · µm',
            'processDepth',
            state.processDepth ?? sample?.depthUm ?? 0.05,
            0.01,
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
      ];
    }
    function processModes(active) {
      const registry = window.WaferCadV2ShellRegistry.defaults;
      const labels = { step: 'Manual', recipe: 'Recipe', code: 'Code', diagnostics: 'Diagnostics' };
      return el('div', { class: 'p-actions', 'aria-label': 'Process modes' },
        registry.processModes.map((key) => button(labels[key] || key,
          `domain:${key === 'step' ? 'process' : key}`,
          key === 'step' ? 'process' : key === 'diagnostics' ? 'settings' : key,
          { 'aria-pressed': String(active === key) })));
    }
    function processPanel() {
      return [
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
          select(
            'Material / target',
            'material',
            currentModel().layers.map((l) => [l.id, l.name]),
            state.material || currentModel().layers.at(-1).id,
          ),
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
            `Display unit: ${unitName} · canonical geometry remains stored in µm; typed precision retained in draft. Geometry is never executed.`,
          ),
          button('Apply · simulate', 'apply', 'play', {
            primary: true,
            disabled: Boolean(state.task) || (state.operation !== 'liftoff' && state.thickness != null && state.thickness <= 0),
          }),
          state.operation !== 'liftoff' && state.thickness != null && state.thickness <= 0
            ? notice('Enter a positive thickness / depth before Apply.', 'error')
            : null,
          el(
            'div',
            { class: 'p-actions', role: 'toolbar', 'aria-label': 'Apply history' },
            button('Undo', 'draft-undo', 'undo', { disabled: !state.draftUndo }),
            button('Redo', 'draft-redo', 'redo', { disabled: !state.draftRedo }),
          ),
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
          processModes('recipe'),
          field('Recipe name', 'recipeName', recipe.name),
          el(
            'div',
            { class: 'p-recipe-toolbar' },
            select(
              'Add step',
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
            button('Undo edit', 'recipe-undo', 'undo', { disabled: !state.recipeUndo }),
            button('Redo edit', 'recipe-redo', 'redo', { disabled: !state.recipeRedo }),
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
            notice('Loading a template replaces this Recipe draft after explicit confirmation.'),
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
                el('strong', {}, `Edit step ${activeStep + 1} · ${selected.id}`),
                field('Material / label draft', 'stepLabel', stepTitle(selected)),
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
                  button('Delete', `delete-step:${i}`, 'close', {
                    'aria-label': `Delete step ${i + 1}`,
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
            'Only History is empty in this targeted scene; the actual model stays loaded.',
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
        return el(
          'li',
          {
            class: 'p-history-branch',
            role: 'treeitem',
            'aria-level': depth * 2 + 1,
            'data-branch-id': tree.branch.id,
            'data-depth': depth,
          },
          historyRow(
            `${tree.branch.name}${tree.branch.id === 'main' ? ' · Main' : ''}`,
            `${tree.branch.headNodeId === cursor ? 'HEAD · selected cursor' : `HEAD · ${historyLabel(tree.branch.headNodeId)}`} · from ${tree.origin?.label || 'Base'}`,
            `branch:${tree.branch.id}`,
            active,
            active ? 'active' : '',
            'branch',
          ),
          tree.steps.length
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
            : emptyState('No steps in this Variant', 'This draft branch has no saved Steps.', null),
        );
      }
      return [
        el(
          'section',
          { class: 'p-history-workspace' },
          el(
            'div',
            { class: 'p-history-fixed' },
            el('strong', {}, selected?.label || 'Prototype Variant'),
            el(
              'span',
              { class: 'p-history-context' },
              `Cursor · ${branch} · ${selected?.kind || 'Base'}`,
            ),
            el(
              'div',
              { class: 'p-actions' },
              button('Restore cursor', 'restore', 'history'),
              button('Edit step', 'edit-old', 'process'),
              button('Create Variant', 'create-variant', 'branch'),
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
            el(
              'details',
              { class: 'p-bookmarks' },
              el('summary', {}, `History bookmarks · ${data.bookmarks.length}`),
              el(
                'div',
                { class: 'p-list' },
                data.bookmarks.map((bookmark) =>
                  row(
                    bookmark.name,
                    bookmark.historyNodeId,
                    `history:${bookmark.historyNodeId}`,
                    cursor === bookmark.historyNodeId,
                  ),
                ),
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
          'aria-label': 'Process Recipe code draft',
        },
        state.codeDraft ?? sourceText,
      );
      return [
        processModes('code'),
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
    function diagnosticsPanel() {
      return [
        processModes('diagnostics'),
        notice('Geometry Diagnostics has a named Process slot. Real Analyze, Materials, metrics and Findings enter during M3.'),
      ];
    }
    function inspector() {
      const domain = ['project', 'mask', 'process', 'recipe', 'code', 'diagnostics', 'history'].includes(
        state.domain,
      )
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
        panelHeader(
          domain[0].toUpperCase() + domain.slice(1),
          state.placement === 'process' && ['recipe', 'code', 'diagnostics'].includes(domain)
            ? `Process / ${domain[0].toUpperCase() + domain.slice(1)} mode`
            : 'Docked workflow · never an automatic overlay',
          [],
        ),
        el('div', { class: 'p-panel-content' }, content),
      );
    }

    return { render: inspector };
  };
})();
