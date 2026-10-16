// Production compact-viewport keyboard lifecycle.
// The Shell owns no extra mobile scroll container; this controller only sets
// the keyboard-occlusion state used to hide the bottom dock while typing.
export function createMobileViewportController({
  root,
  state,
  compact,
  win = window,
  doc = document,
}) {
  let destroyed = false;
  const update = () => {
    if (destroyed) return;
    const active = doc.activeElement;
    const editing = active?.matches?.('input, select, textarea, [contenteditable="true"]');
    const occluded = win.innerHeight - (win.visualViewport?.height ?? win.innerHeight);
    root.dataset.keyboard =
      compact() && state.mobile === 'edit' && editing && occluded > 120 ? 'open' : 'closed';
  };
  const subscriptions = [];
  const listen = (target, event, callback) => {
    if (!target) return;
    target.addEventListener(event, callback);
    subscriptions.push(() => target.removeEventListener(event, callback));
  };
  listen(doc, 'focusin', update);
  listen(doc, 'focusout', update);
  listen(win.visualViewport, 'resize', update);
  listen(win, 'resize', update);
  update();
  return Object.freeze({
    update,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const unsubscribe of subscriptions) unsubscribe();
    },
  });
}
