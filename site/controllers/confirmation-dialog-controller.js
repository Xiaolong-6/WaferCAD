function actionClass(kind) {
  if (kind === 'danger') return 'confirmation-action danger';
  if (kind === 'primary') return 'confirmation-action primary';
  return 'confirmation-action';
}

export function createConfirmationDialogController({ root = document } = {}) {
  let active = null;

  function ensureDialog() {
    let overlay = root.getElementById('confirmationDialogOverlay');
    if (overlay) return overlay;

    overlay = root.createElement('div');
    overlay.id = 'confirmationDialogOverlay';
    overlay.className = 'confirmation-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section
        id="confirmationDialog"
        class="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmationDialogTitle"
        aria-describedby="confirmationDialogMessage"
      >
        <div class="confirmation-copy">
          <strong id="confirmationDialogTitle"></strong>
          <p id="confirmationDialogMessage"></p>
          <p id="confirmationDialogDetail" class="confirmation-detail" hidden></p>
        </div>
        <div id="confirmationDialogActions" class="confirmation-actions"></div>
      </section>
    `;
    (root.body || root.documentElement).append(overlay);
    return overlay;
  }

  function close(value) {
    const current = active;
    if (!current) return;
    active = null;
    current.overlay.hidden = true;
    current.overlay.removeEventListener('keydown', current.onKeyDown);
    current.restoreFocus?.focus?.();
    current.resolve(value);
  }

  function ask({
    title = 'Confirm action',
    message = '',
    detail = '',
    actions = [
      { value: 'cancel', label: 'Cancel' },
      { value: 'confirm', label: 'Continue', kind: 'primary' },
    ],
    cancelValue = 'cancel',
  } = {}) {
    if (active) close(active.cancelValue);

    const overlay = ensureDialog(),
      titleHost = root.getElementById('confirmationDialogTitle'),
      messageHost = root.getElementById('confirmationDialogMessage'),
      detailHost = root.getElementById('confirmationDialogDetail'),
      actionsHost = root.getElementById('confirmationDialogActions'),
      restoreFocus = root.activeElement;

    titleHost.textContent = String(title || 'Confirm action');
    messageHost.textContent = String(message || '');
    detailHost.textContent = String(detail || '');
    detailHost.hidden = !detail;
    actionsHost.replaceChildren();

    return new Promise((resolve) => {
      const onKeyDown = (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        close(cancelValue);
      };
      active = { overlay, resolve, cancelValue, restoreFocus, onKeyDown };
      overlay.hidden = false;
      overlay.addEventListener('keydown', onKeyDown);

      for (const [index, action] of actions.entries()) {
        const button = root.createElement('button');
        button.type = 'button';
        button.className = actionClass(action.kind);
        button.textContent = String(action.label || action.value || 'Continue');
        button.dataset.dialogAction = String(action.value);
        button.onclick = () => close(action.value);
        actionsHost.append(button);
        if (action.default || (!actions.some((item) => item.default) && index === actions.length - 1)) {
          queueMicrotask(() => button.focus());
        }
      }
    });
  }

  async function confirm({
    title = 'Confirm action',
    message = '',
    detail = '',
    confirmLabel = 'Continue',
    danger = false,
  } = {}) {
    return (
      (await ask({
        title,
        message,
        detail,
        actions: [
          { value: 'cancel', label: 'Cancel' },
          {
            value: 'confirm',
            label: confirmLabel,
            kind: danger ? 'danger' : 'primary',
            default: true,
          },
        ],
      })) === 'confirm'
    );
  }

  return { ask, confirm, close };
}
