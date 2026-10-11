// UI precision only; this module never rounds canonical geometry or projections.
export const formatInspectionLength = (value) => String(Number(Number(value).toFixed(4)));

export function createInspectionFields({
  hook = (_id, node) => node,
  components = window.WaferCadV2Components,
}) {
  const { el, field, select } = components;
  return {
    input(label, id, value = 0, { kind = 'length' } = {}) {
      const node = field(label, id, kind === 'length' ? formatInspectionLength(value) : value, {
        type: 'number',
        step: kind === 'angle' ? '0.001' : '0.0001',
      });
      const control = hook(id, node.querySelector('input'));
      if (kind === 'length')
        control.addEventListener('change', () => {
          if (control.value !== '' && Number.isFinite(Number(control.value)))
            control.value = formatInspectionLength(control.value);
        });
      return node;
    },
    choice(label, id, options, value, { hookId = id } = {}) {
      const node = select(label, id, options, value);
      hook(hookId, node.querySelector('select'));
      return node;
    },
    textarea(label, id, value = '') {
      const control = hook(id, el('textarea', { class: 'wc-input', rows: 5, spellcheck: false }));
      control.value = value;
      return el('label', { class: 'wc-field' }, el('span', { class: 'wc-label' }, label), control);
    },
    pair: (...children) => el('div', { class: 'v2-inspection-pair' }, children),
  };
}
