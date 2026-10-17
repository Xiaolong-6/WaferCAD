// UI-only startup readiness. The scientific model, view state and persisted
// render quality remain owned by their existing runtime/controllers.
const VIEW_KEYS = Object.freeze(['main', 'mask', 'section', 'three']);

export function createProgressiveStartup({ onChange = () => {} } = {}) {
  const state = {
    shell: 'assembling',
    project: 'loading',
    firstFrame: 'pending',
    views: Object.fromEntries(VIEW_KEYS.map((key) => [key, 'pending'])),
  };
  const snapshot = () => ({
    shell: state.shell,
    project: state.project,
    firstFrame: state.firstFrame,
    views: { ...state.views },
  });
  const emit = () => onChange(snapshot());
  return Object.freeze({
    snapshot,
    shellReady() {
      if (state.shell !== 'assembling') return false;
      state.shell = 'ready';
      emit();
      return true;
    },
    projectReady() {
      if (state.shell !== 'ready' || state.project !== 'loading') return false;
      state.project = 'ready';
      emit();
      return true;
    },
    viewFrame(key, quality = 'ready') {
      if (state.project !== 'ready' || !(key in state.views)) return false;
      if (!['coarse', 'refining', 'ready', 'unavailable'].includes(quality)) return false;
      const previous = state.views[key];
      if (previous === 'ready' || previous === 'unavailable') return false;
      if (previous === quality) return false;
      // A coarse frame must precede an optional quality-refinement pass.
      if (quality === 'refining' && previous !== 'coarse') return false;
      state.views[key] = quality;
      if (state.firstFrame === 'pending' && (quality === 'coarse' || quality === 'ready')) {
        state.firstFrame = 'ready';
      }
      emit();
      return true;
    },
  });
}
