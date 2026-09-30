function activateToolTab(root, tabName, focus = false) {
  const buttons = [...root.querySelectorAll('[data-tool-tab]')],
    panels = [...root.querySelectorAll('[data-tab-panel]')];

  for (const button of buttons) {
    const active = button.dataset.toolTab === tabName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  }

  for (const panel of panels) panel.hidden = panel.dataset.tabPanel !== tabName;
}

export function bindToolTabs(root = document) {
  const buttons = [...root.querySelectorAll('[data-tool-tab]')];
  if (!buttons.length) return;

  buttons.forEach((button, index) => {
    button.onclick = () => activateToolTab(root, button.dataset.toolTab);
    button.onkeydown = (event) => {
      let nextIndex = null;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + buttons.length) % buttons.length;
      else if (event.key === 'ArrowRight') nextIndex = (index + 1) % buttons.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = buttons.length - 1;
      if (nextIndex == null) return;
      event.preventDefault();
      activateToolTab(root, buttons[nextIndex].dataset.toolTab, true);
    };
  });

  const initial =
    buttons.find((button) => button.classList.contains('active'))?.dataset.toolTab ||
    buttons[0].dataset.toolTab;
  activateToolTab(root, initial);
}
