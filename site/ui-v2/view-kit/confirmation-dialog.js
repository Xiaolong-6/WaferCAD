// Shared v2 confirmation UI: the portal owns focus and lifecycle.
export function createDialogConfirmation({ overlays, el, button }) {
  function ask({ title, message, detail = '', actions = [], cancelValue = 'cancel' }) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        overlays.close('dialog');
        resolve(value);
      };
      const cancelAction = actions.find((action) => Object.is(action.value, cancelValue));
      const options = actions.filter((action) => !Object.is(action.value, cancelValue));
      const cancel = button(cancelAction?.label || 'Cancel', null, null);
      cancel.onclick = () => finish(cancelValue);
      const choices = options.map((action) => {
        const control = button(action.label, null, null, {
          primary: action.kind === 'primary',
          'data-help': action.helpKey,
          'data-risk': action.kind === 'danger' ? 'danger' : null,
        });
        control.onclick = () => finish(action.value);
        return el('div', { class: 'v2-confirm-dialog-option' }, control);
      });
      const content = el(
        'div',
        { class: 'p-form v2-confirm-dialog' },
        el('strong', {}, title),
        el('p', {}, message),
        detail ? el('p', { class: 'p-aux' }, detail) : null,
        el(
          'div',
          { class: 'v2-confirm-dialog-choices', role: 'group', 'aria-label': 'Available actions' },
          choices,
        ),
        el('div', { class: 'p-actions v2-confirm-dialog-footer' }, cancel),
      );
      overlays.mount('dialog', {
        label: title,
        content,
        onClose: () => {
          if (settled) return;
          settled = true;
          resolve(cancelValue);
        },
      });
      if (options.some((action) => action.kind === 'danger')) cancel.focus({ preventScroll: true });
    });
  }
  function confirm(options) {
    return ask({
      ...options,
      actions: [
        { value: false, label: 'Cancel' },
        {
          value: true,
          label: options.confirmLabel || 'Continue',
          kind: options.danger ? 'danger' : 'primary',
        },
      ],
      cancelValue: false,
    });
  }
  return Object.freeze({ ask, confirm });
}
