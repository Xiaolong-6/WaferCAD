import { expect, test } from '@playwright/test';

async function createWafer(page) {
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('#statusText')).toContainText('wafer created');
}

test('coalesces rapid persistence requests into active plus latest pending writes', async ({ page }) => {
  await page.goto('/?qa=memory');
  const stats = await page.evaluate(async () => {
    const core = await import('/static/js/core.js');
    await core.waitForPersistenceIdle();
    core.resetPersistenceDebugStats();
    core.state._persistenceDebugDelayMs = 100;
    for (let index = 0; index < 100; index++) core.persistSharedState(`stress-${index}`);
    await core.waitForPersistenceIdle();
    delete core.state._persistenceDebugDelayMs;
    return { ...core.state._persistenceStats };
  });
  expect(stats.requested).toBe(100);
  expect(stats.writesStarted).toBeLessThanOrEqual(3);
  expect(stats.writesStarted).toBeLessThan(stats.requested);
  expect(stats.clonesCreated).toBe(stats.writesStarted);
  expect(stats.writesCompleted).toBe(stats.writesStarted);
  expect(stats.pending).toBe(false);
  expect(stats.active).toBe(false);
});

test('Z slider renders inputs but persists only the committed change', async ({ page }) => {
  await page.goto('/?qa=memory');
  await createWafer(page);
  await page.evaluate(async () => {
    const core = await import('/static/js/core.js');
    await core.waitForPersistenceIdle();
    core.resetPersistenceDebugStats();
    core.state._render3DStats = { requested: 0, executed: 0, scheduled: false };
    const slider = document.querySelector('#zExag');
    for (let value = 10; value <= 59; value++) {
      slider.value = String(value);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await expect(page.locator('#zExagNumber')).toHaveValue('59');
  await expect.poll(() => page.evaluate(() => window.wafercadMemoryDiagnostics().render3D.executed)).toBe(1);
  const duringDrag = await page.evaluate(() => window.wafercadMemoryDiagnostics());
  expect(duringDrag.persistence.requested).toBe(0);
  expect(duringDrag.render3D.requested).toBe(50);

  await page.locator('#zExag').dispatchEvent('change');
  const committed = await page.evaluate(async () => {
    const core = await import('/static/js/core.js');
    await core.waitForPersistenceIdle();
    const request = indexedDB.open('wafercad-local', 1);
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const value = await new Promise((resolve, reject) => { const tx = db.transaction('records', 'readonly'), get = tx.objectStore('records').get('state'); get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); });
    db.close();
    return { persisted: value.zExag, stats: { ...core.state._persistenceStats } };
  });
  expect(committed.persisted).toBe(59);
  expect(committed.stats.requested).toBe(1);
  expect(committed.stats.writesStarted).toBe(1);
});

test('coalesces repeated 3D rebuild requests within one animation frame', async ({ page }) => {
  await page.goto('/?qa=memory');
  await createWafer(page);
  await expect.poll(() => page.evaluate(async () => (await import('/static/js/core.js')).state._cutUnionStats?.length || 0)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.wafercadMemoryDiagnostics().three !== null)).toBe(true);
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  const immediate = await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    // Reuse the bootstrapped module, including its version query, without
    // initializing a second application/renderer inside this test.
    const { threeView } = await import(document.querySelector('script[src*="/static/app.js"]').src);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    state._render3DStats = { requested: 0, executed: 0, scheduled: false };
    for (let index = 0; index < 50; index++) threeView.scheduleRender();
    return { ...state._render3DStats };
  });
  expect(immediate.requested).toBe(50);
  expect(immediate.executed).toBe(0);
  expect(immediate.scheduled).toBe(true);
  await expect.poll(() => page.evaluate(() => window.wafercadMemoryDiagnostics().render3D.executed)).toBe(1);
});

test('pauses the Three loop outside Main and resumes on return', async ({ page }) => {
  await page.goto('/?qa=memory');
  await expect.poll(() => page.evaluate(() => window.wafercadMemoryDiagnostics().threeLoopRunning)).toBe(true);
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  expect(await page.evaluate(() => window.wafercadMemoryDiagnostics().threeLoopRunning)).toBe(false);
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.wafercadMemoryDiagnostics().threeLoopRunning)).toBe(true);
});
