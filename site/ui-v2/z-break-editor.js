// UI-v2-only presentation adapter. All physical Z and snapping stay in the shared controller.
// data-help/data-help-detail are consumed by the central v2 tooltip service.
// A native title is used only in isolated previews without that service.
export function createZBreakEditor({ el, button, fields, hook, units, collapse }) {
  const help = (node, key, description) => {
    node.dataset.help = key;
    node.dataset.helpDetail = description;
    if (!window.WaferCadV2TooltipCatalog) node.title = description;
    return node;
  };
  const tagged = (id, node) => hook(id, node);
  const enabled = tagged('section-collapse-enabled', el('input', { type: 'checkbox' }));
  const snap = tagged('sectionCollapseSnap', el('input', { type: 'checkbox', checked: true }));
  const linked = tagged(
    'sectionCollapseScaleLinked',
    el('input', { type: 'checkbox', checked: true }),
  );
  const topField = fields.input('Top · µm', 'sectionCollapseTopInput');
  const bottomField = fields.input('Bottom · µm', 'sectionCollapseBottomInput');
  const topInput = topField.querySelector('input');
  const bottomInput = bottomField.querySelector('input');
  const frontField = fields.input('Front scale', 'sectionCollapseFrontScale', 1, { kind: 'scale' });
  const backField = fields.input('Back scale', 'sectionCollapseBackScale', 1, { kind: 'scale' });
  const frontInput = frontField.querySelector('input');
  const backInput = backField.querySelector('input');
  help(
    enabled,
    'section.zbreak',
    'Omit the interval between Top and Bottom in Section and 3D displays. Geometry and exports remain physical.',
  );
  help(
    snap,
    'section.zbreak',
    'During ruler dragging, snap to nearby material interfaces. Typed coordinates always remain exact.',
  );
  help(
    linked,
    'section.scale',
    'Keep Front and Back display weights at the same physical 1× scale. Unlink to adjust independently.',
  );
  help(
    topInput,
    'section.zbreak',
    'Precise upper boundary of the omitted physical Z interval; type a value in the current display units.',
  );
  help(
    bottomInput,
    'section.zbreak',
    'Precise lower boundary of the omitted physical Z interval; type a value in the current display units.',
  );
  help(
    frontInput,
    'section.scale',
    'Front-side display weight for Section Auto and 3D; range 0.1×–10×.',
  );
  help(
    backInput,
    'section.scale',
    'Back-side display weight for Section Auto and 3D; range 0.1×–10×.',
  );

  const handles = {};
  const marks = el('div', { class: 'v2-z-marks', 'aria-hidden': 'true' });
  const zeroLine = el('div', { class: 'v2-z-zero', 'aria-hidden': 'true' });
  const windowNode = tagged(
    'sectionCollapseWindow',
    el('div', { class: 'v2-z-window', 'aria-hidden': 'true' }),
  );
  const ruler = tagged(
    'sectionCollapseRuler',
    el(
      'div',
      {
        class: 'v2-z-ruler',
        'aria-label': 'Physical Z boundary preview',
      },
      marks,
      zeroLine,
      windowNode,
    ),
  );
  for (const name of ['Top', 'Bottom']) {
    const key = name.toLowerCase();
    const handle = tagged(
      `sectionCollapse${name}Handle`,
      button(name, null, null, {
        class: 'v2-z-handle',
        role: 'slider',
        'aria-label': `${name} Z break boundary`,
        'aria-orientation': 'vertical',
        'aria-keyshortcuts': 'ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown',
      }),
    );
    help(
      handle,
      'section.zbreak',
      'Drag to adjust the boundary; arrow keys move by 0.1 µm and Shift + arrow keys by 1 µm. Type below for exact values.',
    );
    handles[key] = handle;
    ruler.append(handle);
  }
  const pair = el('div', { class: 'v2-z-field-pair' }, topField, bottomField);
  const independent = el(
    'div',
    { class: 'v2-z-field-pair v2-z-independent' },
    frontField,
    backField,
  );
  const linkedReadout = el('span', { class: 'v2-z-linked-value' }, '1×');
  const scaleDetails = el(
    'details',
    { class: 'v2-z-advanced' },
    el(
      'summary',
      {
        'data-help': 'section.scale',
        'data-help-detail':
          'Optional Front/Back display weighting for Auto Section and 3D; never alters physical geometry.',
      },
      'Advanced scaling',
    ),
    el(
      'div',
      { class: 'v2-z-advanced-body' },
      el(
        'label',
        { class: 'v2-z-check v2-z-link-row' },
        linked,
        el('span', {}, 'Link Front / Back'),
        linkedReadout,
      ),
      independent,
    ),
  );
  const form = el(
    'div',
    { class: 'v2-z-editor' },
    el('label', { class: 'v2-z-check v2-z-enable-row' }, enabled, el('span', {}, 'Enable Z Break')),
    pair,
    el(
      'div',
      { class: 'v2-z-plot' },
      el(
        'div',
        { class: 'v2-z-plot-head' },
        el('span', {}, 'Z boundaries'),
        el('span', { class: 'v2-z-unit' }, 'µm'),
      ),
      ruler,
    ),
    el('label', { class: 'v2-z-check v2-z-snap-row' }, snap, el('span', {}, 'Snap to structure')),
    scaleDetails,
  );

  const numeric = (input, field) => {
    const update = () => {
      const raw = input.value.trim();
      const z = raw === '' ? NaN : units.parse(raw);
      const current = collapse.current();
      const valid = collapse.acceptsBoundary(field, z);
      if (!valid) {
        input.setCustomValidity(
          'Enter a physical Z boundary that keeps both edges in range and preserves the minimum break width.',
        );
        input.reportValidity();
        return;
      }
      input.setCustomValidity('');
      collapse.setCurrent({ ...current, [field]: z }, { settled: true });
      sync();
    };
    input.addEventListener('change', update);
    input.addEventListener('input', () => input.setCustomValidity(''));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && input.validationMessage) {
        input.setCustomValidity('');
        input.blur();
        sync();
      }
    });
  };
  numeric(topInput, 'top');
  numeric(bottomInput, 'bottom');
  enabled.addEventListener('change', () => {
    collapse.setCurrent({ ...collapse.current(), enabled: enabled.checked }, { settled: true });
    sync();
  });
  linked.addEventListener('change', () => {
    collapse.setCurrent(
      {
        ...collapse.current(),
        scaleLinked: linked.checked,
        ...(linked.checked ? { frontScale: 1, backScale: 1 } : {}),
      },
      { settled: true },
    );
    sync();
  });
  for (const [key, input] of [
    ['front', frontInput],
    ['back', backInput],
  ]) {
    input.addEventListener('change', () => {
      collapse.setSurfaceScale(key, input.value);
      sync();
    });
  }
  for (const [key, handle] of Object.entries(handles)) {
    handle.addEventListener('pointerdown', (event) => collapse.startDrag(key, event));
    handle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (handle.disabled) return;
      event.preventDefault();
      const current = collapse.current();
      const [lo, hi] = collapse.bounds();
      const increment = event.shiftKey ? 1 : 0.1;
      const value =
        Math.round((current[key] + (event.key === 'ArrowUp' ? increment : -increment)) * 1e7) / 1e7;
      const clamped =
        key === 'top'
          ? Math.max(current.bottom + 1e-9, Math.min(hi, value))
          : Math.min(current.top - 1e-9, Math.max(lo, value));
      if (!collapse.acceptsBoundary(key, clamped)) return;
      collapse.setCurrent({ ...current, [key]: clamped }, { settled: true });
      sync();
    });
  }
  window.addEventListener('pointermove', collapse.moveDrag);
  window.addEventListener('pointerup', collapse.endDrag);
  window.addEventListener('pointercancel', collapse.endDrag);

  function sync() {
    const current = collapse.current();
    const [lo, hi] = collapse.bounds();
    const active = current.enabled !== false;
    form.dataset.enabled = String(active);
    enabled.checked = active;
    linked.checked = current.scaleLinked !== false;
    const linkedState = current.scaleLinked !== false;
    independent.hidden = linkedState;
    linkedReadout.hidden = !linkedState;
    snap.disabled = !active;
    topInput.disabled = !active;
    bottomInput.disabled = !active;
    linked.disabled = !active;
    frontInput.disabled = !active || linkedState;
    backInput.disabled = !active || linkedState;
    for (const [input, value] of [
      [topInput, current.top],
      [bottomInput, current.bottom],
    ]) {
      if (document.activeElement !== input) {
        input.setCustomValidity('');
        input.value = units.format(value);
      }
    }
    for (const [input, value] of [
      [frontInput, current.frontScale],
      [backInput, current.backScale],
    ]) {
      if (document.activeElement !== input) input.value = String(Number(value.toFixed(4)));
    }
    form.querySelector('.v2-z-unit').textContent = units.label();
    const yTop = collapse.zToRulerY(current.top);
    const yBottom = collapse.zToRulerY(current.bottom);
    windowNode.style.top = `${yTop}px`;
    windowNode.style.height = `${Math.max(2, yBottom - yTop)}px`;
    zeroLine.hidden = !(lo <= 0 && hi >= 0);
    if (!zeroLine.hidden) zeroLine.style.top = `${collapse.zToRulerY(0)}px`;
    marks.replaceChildren(
      ...[hi, (hi + lo) / 2, lo].map((value) => {
        const tick = el('span', { class: 'v2-z-mark', 'aria-hidden': 'true' }, units.format(value));
        tick.style.top = `${collapse.zToRulerY(value)}px`;
        return tick;
      }),
    );
    for (const [key, handle] of Object.entries(handles)) {
      const z = current[key];
      handle.style.top = `${collapse.zToRulerY(z)}px`;
      handle.disabled = !active;
      handle.setAttribute('aria-valuenow', String(z));
      handle.setAttribute('aria-valuemin', String(key === 'top' ? current.bottom : lo));
      handle.setAttribute('aria-valuemax', String(key === 'top' ? hi : current.top));
      handle.setAttribute('aria-valuetext', `${units.format(z)} ${units.label()}`);
    }
  }
  return { form, sync };
}
