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
              row(
                `${b.parentBranchId ? '↳ ' : ''}${b.name}`,
                b.id,
                `branch:${b.id}`,
                branch === b.id,
              ),
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
          el(
            'h3',
            {},
            `History · ${data.history.length} nodes / ${data.bookmarks.length} bookmarks`,
          ),
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
        {
          class: 'p-code-editor',
          spellcheck: 'false',
          'data-key': 'codeDraft',
          'aria-label': 'Process Recipe code draft',
        },
        state.codeDraft ?? sourceText,
      );
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
      const domain = ['project', 'mask', 'process', 'recipe', 'code', 'history'].includes(
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

    return { render: inspector };
  };
})();
