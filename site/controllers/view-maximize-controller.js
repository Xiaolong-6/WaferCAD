export function createViewMaximizeController({
  root = document,
  status,
  renderMain,
  renderMask,
  renderSection,
  renderThree,
  fit3d,
  updateSectionEditor,
}) {
  let maximizedPanelId = null;

  function setMaximizedView(panelId) {
    const previous = maximizedPanelId,
      next = previous === panelId ? null : panelId;
    root
      .querySelectorAll('.view-panel.is-maximized')
      .forEach((panel) => panel.classList.remove('is-maximized'));
    maximizedPanelId = next;
    root.body.classList.toggle('view-maximized', Boolean(next));
    if (next) root.getElementById(next)?.classList.add('is-maximized');

    root.querySelectorAll('.view-max-btn').forEach((button) => {
      const active = Boolean(next) && button.dataset.viewPanel === next;
      button.classList.toggle('active', active);
      button.textContent = active ? 'Restore' : 'Max';
      button.title = active
        ? 'Restore the workspace layout'
        : `Maximize ${root
            .getElementById(button.dataset.viewPanel)
            ?.querySelector('strong')?.textContent || 'view'} in the current page`;
    });

    requestAnimationFrame(() => {
      renderMain();
      renderMask();
      renderSection();
      renderThree();
      updateSectionEditor();
      if (next === 'threePanel' || previous === 'threePanel') requestAnimationFrame(fit3d);
    });
    status(next ? 'View maximized. Press Restore or Escape to return.' : 'Workspace restored.');
  }

  function bind() {
    root
      .querySelectorAll('.view-max-btn')
      .forEach((button) => (button.onclick = () => setMaximizedView(button.dataset.viewPanel)));
    globalThis.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && maximizedPanelId) {
        event.preventDefault();
        setMaximizedView(maximizedPanelId);
      }
    });
  }

  return { bind, setMaximizedView };
}
