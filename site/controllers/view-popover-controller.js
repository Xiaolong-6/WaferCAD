function owningView(element) {
  return element?.closest?.('.view-panel') || null;
}

function closeCustomPanel(element) {
  const event = new CustomEvent('wafercad:popover-close', {
    bubbles: false,
    cancelable: true,
  });
  element.dispatchEvent(event);
  if (!event.defaultPrevented) element.hidden = true;
}

export function createViewPopoverController({ root = document } = {}) {
  function closeOthers(owner) {
    const panel = owningView(owner);
    if (!panel) return;

    for (const details of panel.querySelectorAll('details[open]')) {
      if (details !== owner && !details.contains(owner)) details.open = false;
    }

    for (const element of panel.querySelectorAll('[data-view-popover-panel]:not([hidden])')) {
      if (element !== owner && !element.contains(owner)) closeCustomPanel(element);
    }
  }

  function claim(owner) {
    if (!owner || !owningView(owner)) return;
    closeOthers(owner);
  }

  function closeAll(panelOrElement) {
    const panel = panelOrElement?.matches?.('.view-panel')
      ? panelOrElement
      : owningView(panelOrElement);
    if (!panel) return;

    for (const details of panel.querySelectorAll('details[open]')) details.open = false;
    for (const element of panel.querySelectorAll('[data-view-popover-panel]:not([hidden])')) {
      closeCustomPanel(element);
    }
  }

  function bind() {
    for (const details of root.querySelectorAll('.view-panel details')) {
      details.addEventListener('toggle', () => {
        if (details.open) claim(details);
      });
    }
  }

  return { bind, claim, closeAll };
}
