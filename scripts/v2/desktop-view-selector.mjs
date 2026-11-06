// Exercise actual production controls across desktop Docking and compact View mode.
// Do not synthesize state transitions or bypass UI click handling.
import { waitForPaint } from '../test-helpers/ui.mjs';

export async function selectScientificView(page, name, width) {
  if (!['main', 'mask', 'three', 'section'].includes(name))
    throw new Error('Invalid scientific view: ' + name);
  if (width <= 820) {
    const action = name === 'section' ? 'mobile-section' : 'view:' + name;
    await page.locator('.p-nav [data-action="' + action + '"]').click();
  } else {
    const maximize = (key) =>
      page.locator('#' + key + 'Panel [data-action="maximize:' + key + '"]');
    const target = maximize(name);
    // Temporary Mask focus and a persisted maximized Dock are different
    // presentation layers. The persisted state alone cannot tell whether a
    // target panel is reachable; restore through the currently visible
    // production control, never by forcing a click on a hidden button.
    for (let attempt = 0; attempt < 2 && !(await target.isVisible()); attempt++) {
      let restored = false;
      for (const key of ['mask', 'main', 'three', 'section']) {
        if (key === name || !(await maximize(key).isVisible())) continue;
        await maximize(key).click();
        await waitForPaint(page);
        restored = true;
        break;
      }
      if (!restored) throw new Error('No visible Dock control to restore ' + name);
    }
    const previous = await page.evaluate(
      () => window.WaferCadV2Workstation.snapshot().ui.desktopLayout?.maximized,
    );
    if (previous !== name) {
      if (previous) {
        if (await maximize(previous).isVisible()) {
          await maximize(previous).click();
        }
      }
      await page.locator('#' + name + 'Panel [data-action="maximize:' + name + '"]').click();
    }
  }
  await waitForPaint(page);
  await page.locator('#' + name + 'Panel').waitFor({ state: 'visible' });
}
