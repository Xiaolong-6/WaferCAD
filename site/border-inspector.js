// View-local presentation choices. These never affect physical topology or saved History.
export const BORDER_CATEGORIES = ['exterior', 'interface', 'buried', 'occluded', 'roi'];
export const BORDER_PRESETS = Object.freeze({
  clean: Object.freeze({
    exterior: 'solid',
    interface: 'off',
    buried: 'off',
    occluded: 'off',
    roi: 'solid',
  }),
  structure: Object.freeze({
    exterior: 'solid',
    interface: 'auto',
    buried: 'auto',
    occluded: 'off',
    roi: 'solid',
  }),
  xray: Object.freeze({
    exterior: 'solid',
    interface: 'solid',
    buried: 'solid',
    occluded: 'dashed',
    roi: 'solid',
  }),
});

export function normalizeBorderSettings(input = {}) {
  const preset =
    input.preset === 'custom' || Object.hasOwn(BORDER_PRESETS, input.preset)
      ? input.preset
      : 'structure';
  const original = BORDER_PRESETS[preset] || BORDER_PRESETS.structure;
  const styles = Object.fromEntries(
    BORDER_CATEGORIES.map((category) => {
      const value = input.styles?.[category];
      return [
        category,
        ['solid', 'dashed', 'off', 'auto'].includes(value) ? value : original[category],
      ];
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
  return (
    Boolean(enabled) &&
    ['interface', 'buried'].some(
      (category) => resolvedBorderStyle(settings, category, opacity) !== 'off',
    )
  );
}

// Rendering policy for structural outlines, separate from canonical geometry,
// depth-pass ownership, and the mutable Three.js scene. Receives the same
// clamped opacity used by the production surface presentation state.
export function borderPresentationState(descriptor, settings, opacity, enabled) {
  const kind = descriptor?.kind;
  if (!['border', 'internal-border', 'hidden-border'].includes(kind)) return null;
  const internal = kind === 'internal-border';
  const hidden = kind === 'hidden-border';
  const category = hidden ? 'occluded' : descriptor.category || 'exterior';
  const style = resolvedBorderStyle(settings, category, opacity);
  const lineStyle = descriptor.lineStyle || (hidden ? 'dashed' : 'solid');
  const strength = normalizeBorderSettings(settings).strength;
  return {
    visible: Boolean(enabled) && (!hidden || opacity < 0.999) && style === lineStyle,
    materialState: {
      opacity: hidden
        ? Math.min(0.36, (0.13 + (1 - opacity) * 0.22) * strength)
        : internal
          ? Math.min(0.7, 0.15 + strength * 0.55)
          : strength,
      transparent: true,
      // Buried inspection contours are intentionally X-ray overlays.
      // Exterior and occluded lines use the structural-depth pass.
      depthTest: !internal,
      depthWrite: false,
    },
    transparentSort: false,
  };
}

export const DENSE_ARRAY_BORDER_PREVIEW_SITES = 8;

// Scale-dependent presentation LOD only: retain each canonical cap and wall,
// but bound replica expansion in full-wafer overviews. An inspection ROI
// always uses the complete physical surface plan, without this preview.
export function borderContourPresentationPlan(
  plan,
  { hasRoi = false, maxSites = DENSE_ARRAY_BORDER_PREVIEW_SITES } = {},
) {
  if (!plan || hasRoi || Number(plan.arrayInstances || 0) < 64) {
    return { plan, mode: 'exact' };
  }
  const cache = new WeakMap();
  const sample = (translations) => {
    if (!Array.isArray(translations) || translations.length <= maxSites) return translations;
    if (cache.has(translations)) return cache.get(translations);
    const selected = translations
      .map((point, index) => ({
        point,
        index,
        distance: Number(point[0]) ** 2 + Number(point[1]) ** 2,
      }))
      .sort((a, b) => a.distance - b.distance || a.index - b.index)
      .slice(0, maxSites)
      .sort((a, b) => a.index - b.index)
      .map(({ point }) => point);
    cache.set(translations, selected);
    return selected;
  };
  const project = (items = []) =>
    items.map((item) =>
      item?.instanceTranslations?.length > maxSites
        ? { ...item, instanceTranslations: sample(item.instanceTranslations) }
        : item,
    );
  return {
    plan: {
      ...plan,
      caps: project(plan.caps),
      sidewalls: project(plan.sidewalls),
    },
    mode: 'array-overview-preview',
  };
}
