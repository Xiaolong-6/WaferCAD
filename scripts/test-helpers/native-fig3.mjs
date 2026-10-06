import assert from 'node:assert/strict';
import { openFunctionPanel } from './ui.mjs';
export async function nativeApply(page, p) {
  page.setDefaultTimeout(300000);
  const start = performance.now();
  if (p.layer != null) {
    await openFunctionPanel(page, 'mask', { timeout: 30000 });
    const rows = page.locator('#maskLayerList .layer-row');
    for (let i = 0; i < (await rows.count()); i++) {
      const row = rows.nth(i);
      await row
        .locator('input[type=checkbox]')
        .setChecked((await row.locator('.layer-name').textContent()) === `${p.layer}/0`);
    }
  }
  await openFunctionPanel(page, 'process', { timeout: 30000 });
  await page
    .locator(`[data-process-mode="${p.type}"]`)
    .click({ noWaitAfter: true, timeout: 300000 });
  if (p.type === 'record') {
    await page.locator('#recordProcessType').selectOption(p.processType || 'custom');
    await page.locator('#recordProcessLabel').fill(p.name);
    await page.locator('#recordNote').fill((p.note || '').slice(0, 240));
    for (const [id, value] of [
      ['recordTemperature', p.temperature],
      ['recordDuration', p.duration],
      ['recordAmbient', p.ambient],
    ])
      await page.locator('#' + id).fill(value == null ? '' : String(value));
  } else {
    await page
      .locator('#operationArea')
      .selectOption(p.area || (p.layer == null ? 'full' : 'mask'));
    assert.equal(await page.locator('#operationThicknessUnit').textContent(), 'µm');
    await page.locator('#operationThickness').fill(String(p.thickness));
    if (p.type === 'add') {
      await page.locator('#growthMode').selectOption(p.growth || 'direct');
      await page.locator('#layerName').fill(p.name);
    } else if (p.type === 'etch') {
      await page.locator('#etchProfile').selectOption(p.profile || 'directional');
      if (p.profile !== 'planarize') {
        const options = await page
          .locator('#etchTargetLayer option')
          .evaluateAll((es) => es.map((e) => ({ value: e.value, text: e.textContent })));
        const target = p.target ? options.find((e) => e.text.includes(p.target)) : null;
        assert.ok(!p.target || target, `Missing material ${p.target}`);
        await page.locator('#etchTargetLayer').selectOption(target?.value || '');
        await page.locator('#etchSurfaceMode').selectOption('smooth');
      }
    } else if (p.type === 'electrical') {
      await page.locator('#electricalName').fill(p.name);
      await page.locator('#electricalRegionType').selectOption('n-type');
      await page.locator('#electricalRegionSource').selectOption('doped');
    }
  }
  const before = await page.locator('#statusText').textContent();
  await page.locator('#applyOperationBtn').click({ noWaitAfter: true, timeout: 300000 });
  await page.waitForFunction(
    (before) =>
      !document.querySelector('#applyOperationBtn').disabled &&
      document.querySelector('#statusText').textContent !== before,
    before,
    { timeout: 300000 },
  );
  const status = await page.locator('#statusText').textContent();
  const result = {
    ...p,
    status,
    seconds: (performance.now() - start) / 1000,
    passed: /^(Deposited|Transferred|Defined|Marked|Etched|Planarized|Recorded|Extended)/.test(
      status,
    ),
  };
  console.log('NATIVE_APPLY', JSON.stringify(result));
  return result;
}
