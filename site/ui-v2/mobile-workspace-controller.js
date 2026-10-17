// Production mobile navigation and native-document scroll ownership.
// Scientific view instances, form drafts, and desktop docking are never recreated here.
export function createMobileWorkspaceController({
  state,
  compact,
  readScroll = () => document.scrollingElement?.scrollTop || 0,
  restoreScroll = (position) => window.scrollTo(0, position),
  nextFrame = (callback) => requestAnimationFrame(callback),
}) {
  const domainScroll = new Map();
  let transitionSerial = 0;

  const cancelPendingScroll = () => {
    transitionSerial += 1;
  };

  const selectPane = (pane, domain = state.domain) => {
    if (!compact()) return false;
    if (state.mobile === 'edit') {
      domainScroll.set(state.domain, Math.max(0, Number(readScroll()) || 0));
    }
    state.domain = domain;
    state.mobile = pane;
    const destination = pane === 'edit' ? domainScroll.get(domain) || 0 : 0;
    const serial = ++transitionSerial;

    // The new document layout must settle before restoring the saved offset.
    // A newer navigation action or breakpoint transition cancels stale callbacks.
    nextFrame(() => {
      if (serial !== transitionSerial || !compact()) return;
      nextFrame(() => {
        if (serial === transitionSerial && compact()) restoreScroll(destination);
      });
    });
    return true;
  };

  const handleAction = (action) => {
    if (!compact()) return false;
    if (action.startsWith('domain:')) {
      const domain = action.split(':')[1];
      // Preserve the existing Mask coupling without changing its scientific model.
      state.maximize = domain === 'mask' ? 'mask' : null;
      if (domain === 'mask') state.view = 'mask';
      selectPane('edit', domain);
    } else if (action.startsWith('view:')) {
      state.view = action.split(':')[1];
      state.mode = 'single';
      state.maximize = null;
    } else if (action === 'mobile-section') {
      state.view = 'section';
      state.mode = 'single';
    } else if (action === 'hide-editor' || action === 'return-results') {
      selectPane('view');
    } else if (action === 'show-editor' || action === 'expand-empty') {
      selectPane('edit');
    } else {
      return false;
    }
    return true;
  };

  return Object.freeze({
    handleAction,
    selectPane,
    cancelPendingScroll,
    destroy: cancelPendingScroll,
  });
}
