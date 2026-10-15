// Pure desktop view-layout state. No DOM, scientific model, renderer or storage API.
import {
  VIEW_LAYOUT_DEFAULTS,
  resolveTemplate,
  templateById,
  trackFractions,
} from './view-layout-templates.js';

export const DOCKABLE_VIEWS = Object.freeze(['main', 'mask', 'three', 'section']);
const VIEWS = new Set(DOCKABLE_VIEWS);
const COUNTS = Object.freeze([1, 2, 3, 4]);
const defaults = () => ({
  visible: [...DOCKABLE_VIEWS],
  order: [...DOCKABLE_VIEWS],
  preset: 'four-grid',
  remembered: Object.fromEntries(COUNTS.map((n) => [n, VIEW_LAYOUT_DEFAULTS[n]])),
  tracks: {},
  maximized: null,
});
const validId = (value) => VIEWS.has(value);
const unique = (items) => new Set(items).size === items.length;
const isValidPermutation = (items) =>
  Array.isArray(items) &&
  items.length === DOCKABLE_VIEWS.length &&
  unique(items) &&
  items.every(validId);
const isValidSubset = (items) => Array.isArray(items) && unique(items) && items.every(validId);
const finitePositiveTrack = (values, count) =>
  Array.isArray(values) &&
  values.length === count &&
  values.every((n) => Number.isFinite(n) && n > 0);
const normalizedTrack = (values, count) => {
  if (!finitePositiveTrack(values, count)) return null;
  const fractions = trackFractions(values);
  return fractions.every((n) => n >= 0.08) ? fractions : null;
};
export const desktopDockingEnabled = (width) => Number.isFinite(width) && width > 820;

function safeRemembered(source) {
  const result = Object.fromEntries(COUNTS.map((n) => [n, VIEW_LAYOUT_DEFAULTS[n]]));
  for (const count of COUNTS)
    if (templateById(source?.[count])?.count === count) result[count] = source[count];
  return result;
}
function safeTracks(source) {
  const result = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return result;
  for (const [id, raw] of Object.entries(source)) {
    const preset = templateById(id);
    if (!preset || !raw || typeof raw !== 'object') continue;
    const columns = normalizedTrack(raw.columns, preset.columns.length);
    const rows = normalizedTrack(raw.rows, preset.rows.length);
    if (columns && rows) result[id] = { columns, rows };
  }
  return result;
}
// This function accepts a persisted *view-only* preference payload, not a Project snapshot.
// Corrupt/partial state gets a safe, deterministic Overview default.
export function normalizeDesktopLayout(source) {
  if (
    !source ||
    typeof source !== 'object' ||
    Array.isArray(source) ||
    !isValidPermutation(source.order) ||
    !isValidSubset(source.visible)
  )
    return defaults();
  const remembered = safeRemembered(source.remembered);
  const visible = source.order.filter((id) => source.visible.includes(id));
  const selected = resolveTemplate(visible.length, source.preset);
  if (selected) remembered[visible.length] = selected.id;
  return {
    visible,
    order: [...source.order],
    preset: selected?.id || null,
    remembered,
    tracks: safeTracks(source.tracks),
    // Maximization is transient and must not be restored from preferences.
    maximized: null,
  };
}
export function createDesktopLayout() {
  return defaults();
}
export function orderedVisible(state) {
  return state.order.filter((id) => state.visible.includes(id));
}
export function displayedViews(state) {
  return state.maximized ? [state.maximized] : orderedVisible(state);
}
export function isOverview(state) {
  return (
    !state.maximized &&
    state.preset === 'four-grid' &&
    state.visible.length === DOCKABLE_VIEWS.length
  );
}
export function activeTracks(state) {
  const selected = resolveTemplate(state.visible.length, state.preset);
  if (!selected) return null;
  const saved = state.tracks[selected.id];
  return (
    saved || {
      columns: trackFractions(selected.columns),
      rows: trackFractions(selected.rows),
    }
  );
}
function withVisibility(state, nextIds) {
  const visible = state.order.filter((id) => nextIds.includes(id));
  const count = visible.length;
  const preset = resolveTemplate(count, state.remembered[count])?.id || null;
  return { ...state, visible, preset, maximized: null };
}
function reorderVisible(state, nextVisible) {
  const hidden = state.order.filter((id) => !state.visible.includes(id));
  return {
    ...state,
    order: [...nextVisible, ...hidden],
    visible: [...nextVisible],
    maximized: null,
  };
}
export function reduceDesktopLayout(state, action) {
  if (!action || typeof action !== 'object') return state;
  const id = action.view;
  switch (action.type) {
    case 'RESET_OVERVIEW':
      return {
        ...state,
        visible: [...DOCKABLE_VIEWS],
        order: [...DOCKABLE_VIEWS],
        preset: 'four-grid',
        maximized: null,
        remembered: { ...state.remembered, 4: 'four-grid' },
      };
    case 'TOGGLE_VIEW':
      if (!validId(id)) return state;
      // While maximized, clicking another already-open view restores the prior
      // composition instead of unexpectedly closing a view that looked unselected.
      if (state.maximized && id !== state.maximized && state.visible.includes(id))
        return { ...state, maximized: null };
      return withVisibility(
        state,
        state.visible.includes(id)
          ? state.visible.filter((key) => key !== id)
          : [...state.visible, id],
      );
    case 'CLOSE_VIEW':
      if (!validId(id) || !state.visible.includes(id)) return state;
      return withVisibility(
        state,
        state.visible.filter((key) => key !== id),
      );
    case 'MAXIMIZE':
      if (!validId(id) || !state.visible.includes(id)) return state;
      return { ...state, maximized: state.maximized === id ? null : id };
    case 'RESTORE':
      return state.maximized ? { ...state, maximized: null } : state;
    case 'APPLY_PRESET': {
      const selected = resolveTemplate(state.visible.length, action.preset);
      if (!selected || selected.id !== action.preset) return state;
      return {
        ...state,
        preset: selected.id,
        maximized: null,
        remembered: { ...state.remembered, [selected.count]: selected.id },
      };
    }
    case 'SNAP_TO_SLOT': {
      const current = orderedVisible(state);
      const template = templateById(action.preset);
      if (
        !template ||
        template.count !== current.length ||
        current.length < 2 ||
        !current.includes(id) ||
        !Number.isInteger(action.slot) ||
        action.slot < 0 ||
        action.slot >= current.length
      )
        return state;
      current.splice(current.indexOf(id), 1);
      current.splice(action.slot, 0, id);
      const reordered = reorderVisible(state, current);
      return {
        ...reordered,
        preset: template.id,
        remembered: { ...state.remembered, [template.count]: template.id },
      };
    }
    case 'SWAP': {
      const a = action.a;
      const b = action.b;
      if (a === b || !state.visible.includes(a) || !state.visible.includes(b)) return state;
      const next = orderedVisible(state);
      const i = next.indexOf(a);
      const j = next.indexOf(b);
      [next[i], next[j]] = [next[j], next[i]];
      return reorderVisible(state, next);
    }
    case 'MOVE_TO_SLOT': {
      const next = orderedVisible(state);
      if (
        !next.includes(id) ||
        !Number.isInteger(action.slot) ||
        action.slot < 0 ||
        action.slot >= next.length ||
        next.length < 2
      )
        return state;
      next.splice(next.indexOf(id), 1);
      next.splice(action.slot, 0, id);
      return reorderVisible(state, next);
    }
    case 'SET_RATIOS': {
      const selected = resolveTemplate(state.visible.length, state.preset);
      const axis = action.axis;
      if (!selected || !['columns', 'rows'].includes(axis)) return state;
      const values = normalizedTrack(action.values, selected[axis].length);
      if (!values) return state;
      const current = activeTracks(state);
      return {
        ...state,
        tracks: {
          ...state.tracks,
          [selected.id]: { ...current, [axis]: values },
        },
      };
    }
    default:
      return state;
  }
}

/** Read-only projection for the desktop Shell: panel placement, navigation and tracks.
 * The renderer never receives a new project/scene/camera from a layout transition.
 */
export function projectDesktopLayout(state) {
  const displayed = displayedViews(state);
  const template = resolveTemplate(displayed.length, state.maximized ? 'one-full' : state.preset);
  const tracks = state.maximized ? { columns: [1], rows: [1] } : activeTracks(state);
  return {
    displayed,
    highlighted: [...displayed],
    overviewPressed: isOverview(state),
    maximized: state.maximized,
    preset: template?.id || null,
    columns: tracks?.columns || [],
    rows: tracks?.rows || [],
    placements: displayed.map((view, slot) => ({
      view,
      ...template.spans[slot],
    })),
  };
}
