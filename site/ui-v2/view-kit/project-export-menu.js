// Project exports share the workstation's existing anchored popover owner.
// Business actions remain bound by the Project and Process Report controllers.
import { mountToolPopover } from './tool-popover.js';

export function mountProjectExportMenu({ overlays, trigger, projectItem, reportItem, el }) {
  const content = el('div', { class: 'p-form v2-project-export-options' }, projectItem, reportItem);
  content.addEventListener('click', (event) => {
    if (event.target.closest('#exportProjectBtn, #exportReportBtn')) {
      overlays.close('popover', 'selected');
    }
  });
  trigger.onclick = () => {
    if (trigger.getAttribute('aria-expanded') === 'true') {
      overlays.close('popover', 'toggle');
      return;
    }
    mountToolPopover(overlays, {
      trigger,
      content,
      label: 'Project export formats',
    });
  };
}
