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
      details.querySelector(':scope > summary')?.addEventListener('click', () => {
        if (!details.open) claim(details);
      });
      details.addEventListener('toggle', () => {
        if (details.open) {
          claim(details);
        } else {
          for (const child of details.querySelectorAll('details[open]')) child.open = false;
          // A secondary editor moved into More should hand control back to
          // the canvas when it closes. Otherwise the still-open More surface
          // can intercept ROI handle drags even though the editor is hidden.
          const more = details.closest('.view-overflow-secondary')?.closest('.view-more-control');
          if (more?.open) more.open = false;
        }
      });
    }

    // Clicking a canvas must not leave a menu obscuring the user's target.
    root.addEventListener('pointerdown', (event) => {
      for (const panel of root.querySelectorAll('.view-panel')) {
        for (const details of panel.querySelectorAll('details[open]')) {
          if (!details.contains(event.target)) details.open = false;
        }
      }
    });

    root.addEventListener('click', (event) => {
      const button = event.target.closest?.(
        '.view-menu-popover button, .focus-popover-actions .roi-tool, .mask-roi-popover .mask-roi-tool',
      );
      if (!button) return;
      // Run the action first, then close the visual editor/overflow shell.
      const details = button.closest('.view-more-control, .focus-editor');
      if (details) {
        details.open = false;
      }
    });

    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      for (const panel of root.querySelectorAll('.view-panel')) closeAll(panel);
    });
  }

  return { bind, claim, closeAll };
}
