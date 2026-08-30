import path from 'node:path';

import { expect, test } from '@playwright/test';


test('core wafer workflow stays functional in Chrome', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  await page.goto('/?qa=playwright-core-workflow');
  await expect(page.locator('#statusText')).toHaveText('Ready.');
  await expect(page.locator('#modelStats')).toBeEmpty();

  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('#statusText')).toHaveText('New circle wafer created.');
  await expect(page.locator('#figureLegend')).toContainText('Thickness 500 µm');

  const gdsFixture = path.resolve('tests/fixtures/synthetic_two_layer.gds');
  await page.locator('#gdsInput').setInputFiles(gdsFixture);
  await expect(page.locator('#statusText')).toContainText('2 layer/datatype pairs');

  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await expect(page.locator('#patLayerList')).toContainText('1/0');
  await expect(page.locator('#patLayerList')).toContainText('10/5');
  await expect(page.locator('#patLayerList')).toContainText('raw → 1 filled');
  await expect(page.locator('.pattern-view-panel')).toHaveCount(2);
  await expect(page.locator('#patSvg')).toBeVisible();
  await expect(page.locator('#patProjectionSvg')).toBeVisible();
  await expect(page.locator('#patLegend')).toContainText('Mask legend');
  await expect(page.locator('#patLegend')).toContainText('Selected polygons — transmits light');
  await expect(page.locator('#patLegend')).toContainText('Excluded component boundary');
  await expect(page.locator('#patProjectionLegend')).toContainText('UV light reaching substrate');
  await expect(page.locator('#patProjectionControls')).toBeVisible();
  await page.locator('#patLayerList input[type="checkbox"]').first().check();
  await expect(page.locator('#patSvg [data-component-id]')).toHaveCount(1);
  await expect(page.locator('#patApplyBtn')).toBeEnabled();
  await expect(page.locator('#patProjectionSvg [data-uv-exposure]')).toHaveCount(1);
  await expect(page.locator('#patProjectionSvg [data-uv-exposure]')).toHaveAttribute('stroke', 'none');
  await expect(page.locator('#patProjectionSvg [data-component-id]')).toHaveCount(0);
  await expect(page.locator('#topSvg [data-scale-bar="top"]')).toHaveCount(1);
  await expect(page.locator('#patSvg [data-scale-bar="mask"]')).toHaveCount(1);
  await expect(page.locator('#patProjectionSvg [data-scale-bar="projection"]')).toHaveCount(1);
  const maskPathBefore = await page.locator('#patSvg [data-component-id]').getAttribute('d');
  const projectionPathBefore = await page.locator('#patProjectionSvg clipPath path').getAttribute('d');
  await page.locator('#patSvg').hover({ position: { x: 300, y: 210 } });
  await page.mouse.wheel(0, -160);
  await expect.poll(() => page.locator('#patSvg [data-component-id]').getAttribute('d')).not.toBe(maskPathBefore);
  await expect.poll(() => page.locator('#patProjectionSvg clipPath path').getAttribute('d')).not.toBe(projectionPathBefore);
  await expect(page.locator('#patApplyBtn')).toHaveText('Commit projection to Main');
  await page.locator('#patApplyBtn').click();
  await expect(page.locator('#selectionMode')).toHaveValue('imprinted');
  await expect(page.locator('#topSvg [data-committed-projection]')).toHaveCount(1);
  await expect(page.locator('#topSvg [data-layer]')).toHaveCount(0);
  await page.locator('#materialInput').fill('Automated oxide');
  await page.locator('#distanceInput').fill('100');
  await page.getByRole('button', { name: 'Apply operation' }).click();
  await expect(page.locator('#modelStats')).toContainText('1 solids');
  await expect(page.locator('#topSvg [data-model-solid]')).toHaveCount(1);
  await expect(page.locator('#figureLegend')).toContainText('Automated oxide');
  await expect(page.locator('#figureLegend')).toContainText('Thickness 100 µm');

  await page.locator('#sliceAy').fill('0.2');
  await page.locator('#sliceBy').fill('0.2');
  await page.getByRole('button', { name: 'Apply A–B' }).click();
  await expect(page.locator('#sectionSvg rect')).toHaveCount(2);

  await page.locator('#pushMode').selectOption('down');
  await page.locator('#distanceInput').fill('50');
  await page.getByRole('button', { name: 'Apply operation' }).click();
  await expect(page.locator('#figureLegend')).toContainText('Thickness 50 µm');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#figureLegend')).toContainText('Thickness 100 µm');

  await page.locator('#snapshotBtn').click();
  await expect(page.locator('#snapshotNameDialog')).toBeVisible();
  await page.locator('#snapshotNameInput').fill('Automated state');
  await page.locator('#snapshotNameForm').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#snapshotTrack .snapshot-card')).toHaveCount(1);
  await expect(page.locator('#snapshotTrack')).toContainText('Automated state');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#saveProjectBtn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('wafercad-project.json');
  await expect(page.locator('#statusText')).toHaveText('Project saved.');

  const projectFixture = path.resolve('tests/fixtures/synthetic_project.json');
  await page.locator('#openProjectInput').setInputFiles(projectFixture);
  await expect(page.locator('#statusText')).toContainText('Opened synthetic_project.json');
  await expect(page.locator('#snapshotTrack .snapshot-card')).toHaveCount(2);

  const cards = page.locator('#snapshotTrack .snapshot-card');
  await cards.first().click();
  await expect(page.locator('#modelStats')).toContainText('0 solids');
  await cards.nth(1).click();
  await expect(page.locator('#modelStats')).toContainText('1 solids');

  expect(pageErrors).toEqual([]);
});


test('refresh stays empty until the user restores the previous session', async ({ page }) => {
  await page.goto('/?qa=playwright-refresh-reset');
  const gdsFixture = path.resolve('tests/fixtures/synthetic_two_layer.gds');
  await page.locator('#gdsInput').setInputFiles(gdsFixture);
  await expect(page.locator('#statusText')).toContainText('2 layer/datatype pairs');

  await page.reload();
  await expect(page.locator('#restoreBanner')).toBeVisible();
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await expect(page.locator('#patLayerList')).toContainText('Import a file to view layers');
  await expect(page.locator('#patHierarchy')).toBeHidden();

  await page.locator('#restoreBtn').click();
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await expect(page.locator('#patLayerList')).toContainText('1/0');
  await expect(page.locator('#patHierarchy')).toContainText('Cells');
});


test('new wafer invalidates a committed substrate projection', async ({ page }) => {
  await page.goto('/?qa=playwright-projection-invalidation');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.locator('#gdsInput').setInputFiles(path.resolve('tests/fixtures/synthetic_two_layer.gds'));
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await page.locator('#patLayerList input[type="checkbox"]').first().check();
  await expect(page.locator('#patApplyBtn')).toBeEnabled();
  await page.locator('#patApplyBtn').click();
  await expect(page.locator('#selectionInfo')).toContainText('Committed front substrate projection');

  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.locator('#newWaferConfirmDiscard').click();
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('#selectionInfo')).toContainText('No substrate projection committed');
  await expect(page.locator('#topSvg [data-committed-projection]')).toHaveCount(0);
});


test('slow layout import still notifies Pattern Editor after completion', async ({ page }) => {
  await page.route('**/api/gds/inspect', async route => {
    await new Promise(resolve => setTimeout(resolve, 650));
    await route.continue();
  });
  await page.goto('/?qa=playwright-gds-loaded-event');
  await page.locator('#gdsInput').setInputFiles(path.resolve('tests/fixtures/synthetic_two_layer.gds'));
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await expect(page.locator('#patLayerList')).toContainText('1/0');
  await expect(page.locator('#patLayerList')).toContainText('10/5');
});


test('Top view mirrors current model solids and substrate cuts', async ({ page }) => {
  await page.goto('/?qa=playwright-top-model-projection');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();

  await page.locator('#materialInput').fill('Projection film');
  await page.locator('#distanceInput').fill('100');
  await page.getByRole('button', { name: 'Apply operation' }).click();
  await expect(page.locator('#modelStats')).toContainText('1 solids');
  await expect(page.locator('#topSvg [data-model-solid]')).toHaveCount(1);

  await page.locator('#selectionMode').selectOption('imprinted');
  await expect(page.locator('#topSvg [data-model-solid]')).toHaveCount(1);

  await page.locator('#selectionMode').selectOption('top');
  await page.locator('#pushMode').selectOption('down');
  await page.locator('#distanceInput').fill('150');
  await page.getByRole('button', { name: 'Apply operation' }).click();
  await expect(page.locator('#topSvg [data-model-solid]')).toHaveCount(0);
  await expect(page.locator('#topSvg [data-model-cut]')).toHaveCount(1);
});


test('blanket growth partitions a mask across mixed surface heights', async ({ page }) => {
  await page.goto('/?qa=playwright-mixed-surface-growth');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.locator('#gdsInput').setInputFiles(path.resolve('tests/fixtures/synthetic_two_layer.gds'));
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await page.locator('#patLayerList input[type="checkbox"]').first().check();
  await page.locator('#patApplyBtn').click();
  await page.locator('#materialInput').fill('Partial base film');
  await page.locator('#distanceInput').fill('100');
  await page.getByRole('button', { name: 'Apply operation' }).click();
  await expect(page.locator('#modelStats')).toContainText('1 solids');

  await page.locator('#selectionMode').selectOption('top');
  await page.locator('#materialInput').fill('Partitioned blanket');
  await page.locator('#distanceInput').fill('50');
  await page.getByRole('button', { name: 'Apply operation' }).click();
  await expect(page.locator('#modelStats')).toContainText('3 solids');

  const bounds = await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    return state.solids.map(solid => [solid.material, solid.zMin, solid.zMax]);
  });
  expect(bounds.some(([material,zMin,zMax]) => material === 'Partitioned blanket' && zMin === 0 && zMax === 50)).toBeTruthy();
  expect(bounds.some(([material,zMin,zMax]) => material === 'Partitioned blanket' && zMin === 100 && zMax === 150)).toBeTruthy();
  await expect(page.locator('#topSvg [data-surface-face]')).toHaveCount(2);
  await expect(page.locator('#topSvg [data-surface-kind="solid"]')).toHaveCount(2);
});


test('substrate doping starts from the locally etched surface', async ({ page }) => {
  await page.goto('/?qa=playwright-local-surface-doping');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.locator('#pushMode').selectOption('down');
  await page.locator('#distanceInput').fill('100');
  await page.getByRole('button', { name: 'Apply operation' }).click();
  await page.locator('#pushMode').selectOption('doping');
  await page.locator('#dopingTargetLayer').selectOption('substrate');
  await page.locator('#materialInput').fill('Boron');
  await page.locator('#distanceInput').fill('25');
  await page.getByRole('button', { name: 'Apply operation' }).click();
  await expect(page.locator('#modelStats')).toContainText('1 doped regions');
  const dopings = await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    return state.dopings.map(region => ({ zMin: region.zMin, zMax: region.zMax, target: region.targetLayerId }));
  });
  expect(dopings).toEqual([{ zMin: -125, zMax: -100, target: 'substrate' }]);
});


test('push down consumes mixed-height materials before cutting local substrate', async ({ page }) => {
  await page.goto('/?qa=playwright-mixed-surface-etch');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.locator('#gdsInput').setInputFiles(path.resolve('tests/fixtures/synthetic_two_layer.gds'));
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await page.locator('#patLayerList input[type="checkbox"]').first().check();
  await page.locator('#patApplyBtn').click();
  await page.locator('#materialInput').fill('Etch stop film');
  await page.locator('#distanceInput').fill('100');
  await page.getByRole('button', { name: 'Apply operation' }).click();
  await expect(page.locator('#modelStats')).toContainText('1 solids');
  await page.locator('#selectionMode').selectOption('top');
  await page.locator('#pushMode').selectOption('down');
  await page.locator('#distanceInput').fill('150');
  await page.getByRole('button', { name: 'Apply operation' }).click();
  await expect(page.locator('#modelStats')).toContainText('0 solids');
  const cutDepths = await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    return [...new Set(state.cuts.map(cut => cut.zMin))].sort((a,b) => a-b);
  });
  expect(cutDepths).toEqual([-150, -50]);
});


test('Legend deletes only exposed top and bottom material layers', async ({ page }) => {
  await page.goto('/?qa=playwright-outer-layer-delete');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();

  await page.locator('#materialInput').fill('Front inner');
  await page.locator('#distanceInput').fill('100');
  await page.getByRole('button', { name: 'Apply operation' }).click();

  await page.locator('#materialInput').fill('Front outer');
  await page.locator('#distanceInput').fill('50');
  await page.getByRole('button', { name: 'Apply operation' }).click();

  await expect(page.getByRole('button', { name: 'Delete Front inner' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete Front outer' })).toHaveCount(1);

  await page.locator('#flipFaceBtn').click();
  await page.locator('#materialInput').fill('Back outer');
  await page.locator('#distanceInput').fill('25');
  await page.locator('#pushMode').selectOption('up');
  await page.getByRole('button', { name: 'Apply operation' }).click();
  await expect(page.getByRole('button', { name: 'Delete Back outer' })).toHaveCount(1);

  await expect(page.locator('#figureLegend .figure-legend-name')).toHaveText([
    'Front outer',
    'Front inner',
    'Substrate · Si',
    'Back outer',
  ]);
  const frontOuterRow=page.locator('#figureLegend .figure-legend-row').filter({hasText:'Front outer'});
  const frontInnerRow=page.locator('#figureLegend .figure-legend-row').filter({hasText:'Front inner'});
  const backOuterRow=page.locator('#figureLegend .figure-legend-row').filter({hasText:'Back outer'});
  await expect(frontOuterRow.locator('.figure-legend-badge')).toHaveText(['Front','Top']);
  await expect(frontInnerRow.locator('.figure-legend-badge')).toHaveText(['Front']);
  await expect(backOuterRow.locator('.figure-legend-badge')).toHaveText(['Back','Bottom']);

  await page.getByRole('button', { name: 'Delete Front outer' }).click();
  await expect(page.locator('#deleteLayerDialog')).toBeVisible();
  await expect(page.locator('#deleteLayerMessage')).toContainText('exposed top layer');
  await page.getByRole('button', { name: 'Delete layer' }).click();
  await expect(page.locator('#figureLegend')).not.toContainText('Front outer');
  await expect(page.getByRole('button', { name: 'Delete Front inner' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#figureLegend')).toContainText('Front outer');
  await expect(page.getByRole('button', { name: 'Delete Front inner' })).toHaveCount(0);
});
