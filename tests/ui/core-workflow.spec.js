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
  await expect(page.locator('#patLayerList')).toContainText('raw → 1 optical');
  await expect(page.locator('#patViewTitle')).toHaveText('Mask');
  await expect(page.locator('#patProjectionControls')).toBeHidden();
  await page.locator('#patLayerList input[type="checkbox"]').first().check();
  await expect(page.locator('#patSvg [data-component-id]')).toHaveCount(1);
  await page.locator('#patApplyBtn').click();
  await expect(page.locator('#patViewTitle')).toHaveText('Wafer Projection');
  await expect(page.locator('#patProjectionControls')).toBeVisible();
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


test('Top view mirrors current model solids and substrate cuts', async ({ page }) => {
  await page.goto('/?qa=playwright-top-model-projection');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();

  await page.locator('#materialInput').fill('Projection film');
  await page.locator('#distanceInput').fill('100');
  await page.getByRole('button', { name: 'Apply operation' }).click();
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
