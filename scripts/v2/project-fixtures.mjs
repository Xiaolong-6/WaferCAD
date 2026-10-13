// Complete four-unit TiO2 Process project for small-model interaction owners.
// The published metalens Example remains the full 6,400-instance project and
// is covered by the M4 owner; this fixture exercises real staged Project IO.
export async function openMetalensUnitProject(page, base) {
  await page.goto(`${base}/app.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.WaferCadV2Workstation?.ready);
  await page.evaluate(async () => {
    const filename = 'tio2-metalens-four-unit-process.wafercad';
    const response = await fetch(`/examples/${filename}`);
    if (!response.ok) throw Error(`Fixture project: HTTP ${response.status}`);
    const { stageStartupFile } = await import('/startup-file.js');
    await stageStartupFile(new File([await response.arrayBuffer()], filename), 'project');
  });
  await page.goto(`${base}/app.html?start=staged`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, { timeout: 120000 });
  await page.waitForFunction(() => !window.WaferCadV2Workstation.snapshot().workflow.dirty);
}
