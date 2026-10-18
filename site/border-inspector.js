// View-local presentation choices. These never affect physical topology or saved History.
export const BORDER_CATEGORIES = ['exterior', 'interface', 'buried', 'occluded', 'roi'];
export const BORDER_PRESETS = Object.freeze({
  clean: Object.freeze({ exterior: 'solid', interface: 'off', buried: 'off', occluded: 'off', roi: 'solid' }),
  structure: Object.freeze({ exterior: 'solid', interface: 'auto', buried: 'auto', occluded: 'off', roi: 'solid' }),
  xray: Object.freeze({ exterior: 'solid', interface: 'solid', buried: 'solid', occluded: 'dashed', roi: 'solid' }),
});

export function normalizeBorderSettings(input = {}) {
  const preset = input.preset === 'custom' || Object.hasOwn(BORDER_PRESETS, input.preset)
    ? input.preset : 'structure';
  const original = BORDER_PRESETS[preset] || BORDER_PRESETS.structure;
  const styles = Object.fromEntries(
    BORDER_CATEGORIES.map((category) => {
      const value = input.styles?.[category];
      return [category, ['solid', 'dashed', 'off', 'auto'].includes(value) ? value : original[category]];
    }),
  );
  const raw = Number(input.strength);
  return {
    preset,
    styles,
    strength: Number.isFinite(raw) ? Math.max(0.15, Math.min(1, raw)) : 0.65,
  };
}

export function resolvedBorderStyle(settings, category, opacity) {
  const choice = normalizeBorderSettings(settings).styles[category] || 'off';
  if (choice !== 'auto') return choice;
  if (Number(opacity) >= 0.999) return 'off';
  return ['buried', 'occluded'].includes(category) ? 'dashed' : 'solid';
}

export function borderNeedsInternalGeometry(settings, opacity, enabled) {
  return Boolean(enabled) && ['interface', 'buried'].some(
    (category) => resolvedBorderStyle(settings, category, opacity) !== 'off',
  );
}
