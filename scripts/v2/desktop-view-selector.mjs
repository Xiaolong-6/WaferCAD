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
    const previous = await page.evaluate(
      () => window.WaferCadV2Workstation.snapshot().ui.desktopLayout?.maximized,
    );
    if (previous !== name) {
      if (previous) {
        await page.locator('#' + previous + 'Panel [data-action="maximize:' + previous + '"]').click();
      }
      await page.locator('#' + name + 'Panel [data-action="maximize:' + name + '"]').click();
    }
  }
  await waitForPaint(page);
  await page.locator('#' + name + 'Panel').waitFor({ state: 'visible' });
}
