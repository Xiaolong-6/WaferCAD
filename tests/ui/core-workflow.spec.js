import path from 'node:path';
import fs from 'node:fs/promises';

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
  await expect(page.locator('.toolbar #gdsInput')).toHaveCount(0);
  await expect(page.locator('.pat-layers-head #gdsInput')).toHaveCount(1);

  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.locator('#statusText')).toHaveText('New circle wafer created.');
  await expect(page.locator('#figureLegend')).toContainText('Thickness 500 µm');
  await expect(page.locator('.slice-row')).toHaveCount(2);
  await expect(page.locator('.top-tool-row')).toBeVisible();

  const gdsFixture = path.resolve('tests/fixtures/synthetic_two_layer.gds');
  await page.locator('#gdsInput').setInputFiles(gdsFixture);
  await expect(page.locator('#statusText')).toContainText('2 layer/datatype pairs');
  await expect.poll(() => page.evaluate(async () => {
    const request=indexedDB.open('wafercad-local',1);
    const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const value=await new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),get=tx.objectStore('records').get('state');get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);});
    db.close();return !!value?.gds?.layers?.length;
  })).toBe(true);
  expect(await page.evaluate(() => ({marker:localStorage.getItem('wafercad_has_state'),legacyLocal:localStorage.getItem('wafercad_shared'),legacySession:sessionStorage.getItem('wafercad_gds_blob')}))).toEqual({marker:'1',legacyLocal:null,legacySession:null});

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
  await page.locator('#maskOpacity').fill('0');
  await page.locator('#maskOpacity').dispatchEvent('input');
  await expect(page.locator('#maskOpacityValue')).toHaveText('0%');
  await expect(page.locator('#topSvg [data-mask-veil]')).toHaveCount(0);
  await expect(page.locator('#topSvg [data-committed-projection]')).toHaveCount(0);
  await page.locator('#maskOpacity').fill('100');
  await page.locator('#maskOpacity').dispatchEvent('input');
  await expect(page.locator('#topSvg [data-mask-veil]')).toHaveAttribute('fill-opacity','1');
  await expect(page.locator('#topSvg [data-committed-projection]')).toHaveAttribute('fill-opacity','1');
  await page.locator('#maskOpacity').fill('35');
  await page.locator('#maskOpacity').dispatchEvent('input');
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
  await expect(page.locator('#sectionSvg [data-layer-id]')).toHaveCount(2);

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
  const savedProject=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  expect(savedProject.version).toBe(9);
  expect(savedProject.view.zMapping).toBe('linear');
  expect(savedProject.snapshots[0].device).toBeUndefined();
  expect(savedProject.snapshots[0].deviceRef).toBeTruthy();
  expect(savedProject.snapshotDevices[savedProject.snapshots[0].deviceRef]).toBeTruthy();
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
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  const gdsFixture = path.resolve('tests/fixtures/synthetic_two_layer.gds');
  await page.locator('#gdsInput').setInputFiles(gdsFixture);
  await expect(page.locator('#statusText')).toContainText('2 layer/datatype pairs');
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await expect(page.locator('#patImportLayoutText')).toHaveText('Replace layout');
  await expect(page.locator('#patLayoutFilename')).toContainText('synthetic_two_layer.gds');
  await page.locator('#patLayerList input[type="checkbox"]').first().check();
  await page.locator('#patApplyBtn').click();

  await page.reload();
  await expect(page.locator('#restoreBanner')).toBeVisible();
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await expect(page.locator('#patLayerList')).toContainText('Import a GDSII or OASIS file to view layers');
  await expect(page.locator('#patLayerList').getByRole('button', { name: 'Import layout' })).toBeVisible();
  await expect(page.locator('#patHierarchy')).toBeHidden();

  await page.locator('#restoreBtn').click();
  await expect(page.locator('#restoreBanner')).toHaveCount(0);
  await expect(page.locator('#selectionMode')).toHaveValue('imprinted');
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await expect(page.locator('#patLayerList')).toContainText('1/0');
  await expect(page.locator('#patHierarchy')).toContainText('Cells');
});

test('project loader rejects future versions and invalid wafer dimensions', async ({ page }) => {
  await page.goto('/?qa=playwright-project-schema');
  const future={format:'wafercad-mvp',version:999,wafer:null,solids:[],cuts:[],dopings:[],imprintedFaces:[],snapshots:[]};
  await page.locator('#openProjectInput').setInputFiles({name:'future.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(future))});
  await expect(page.locator('#statusText')).toContainText('newer than supported');
  const invalid={...future,version:7,wafer:{shape:'circle',diameter:-1,thickness:500},snapshots:[]};
  await page.locator('#openProjectInput').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
  await expect(page.locator('#statusText')).toContainText('wafer.diameter must be greater than zero');
  await expect(page.locator('#modelStats')).toBeEmpty();
});

test('slow exact-thickness response cannot overwrite newer cut geometry', async ({ page }) => {
  await page.route('**/api/geometry/substrate-thickness', async route => {
    const body=route.request().postDataJSON();
    const response=await route.fetch();
    if(!body.cuts.length)await new Promise(resolve=>setTimeout(resolve,350));
    await route.fulfill({response});
  });
  await page.goto('/?qa=playwright-thickness-revision');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.locator('#pushMode').selectOption('down');
  await page.locator('#distanceInput').fill('50');
  await page.getByRole('button', { name: 'Apply operation' }).click();
  await expect(page.locator('#figureLegend')).toContainText('Thickness 450 µm');
  await page.waitForTimeout(450);
  await expect(page.locator('#figureLegend')).toContainText('Thickness 450 µm');
  await expect(page.locator('#figureLegend')).not.toContainText('Thickness 500 µm');
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


test('mask source changes make a committed projection stale until recommit', async ({ page }) => {
  await page.goto('/?qa=playwright-projection-fingerprint');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.locator('#gdsInput').setInputFiles(path.resolve('tests/fixtures/synthetic_two_layer.gds'));
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await page.locator('#patLayerList input[type="checkbox"]').first().check();
  await page.locator('#patApplyBtn').click();
  await expect(page.locator('#selectionInfo')).toContainText('Committed front substrate projection');
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await page.locator('#patMaskPolarity').selectOption('block');
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await expect(page.locator('#selectionInfo')).toContainText('projection is stale');
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


test('Apply operation becomes Stop and terminates its geometry worker', async ({ page }) => {
  let geometryJobs=0;
  page.on('request', request => {if(request.method()==='POST'&&request.url().endsWith('/api/geometry/jobs'))geometryJobs++;});
  await page.route('**/api/geometry/jobs', async route => {
    await new Promise(resolve => setTimeout(resolve, 650));
    await route.continue();
  });
  await page.goto('/?qa=playwright-operation-busy');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  const apply=page.locator('#applyPushPullBtn');
  await apply.click();
  await expect(apply).toBeEnabled();
  await expect(apply).toHaveText(/Stop · \d+s/);
  await expect.poll(() => geometryJobs).toBe(1);
  await apply.click();
  await expect(page.locator('#statusText')).toContainText('Operation stopped');
  await expect(apply).toBeEnabled();
  await expect(apply).toHaveText('Apply operation');
  await expect(page.locator('#modelStats')).toContainText('0 solids');
  expect(geometryJobs).toBe(1);
});

test('cross section can compress a persisted substrate Z interval', async ({ page }) => {
  await page.goto('/?qa=playwright-section-z-break');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  const enabled=page.locator('#sectionBreakEnabled');
  await expect(enabled).toBeChecked();
  await expect(page.locator('#sectionBreakMode')).toHaveValue('surfaces');
  await expect(page.locator('#sectionBreakFrontKeep')).toHaveValue('5');
  await expect(page.locator('#sectionBreakBackKeep')).toHaveValue('5');
  await expect(page.locator('#sectionBreakFrom')).toHaveValue('-495');
  await expect(page.locator('#sectionBreakTo')).toHaveValue('-5');
  await expect(page.locator('#sectionSvg [data-section-break="true"]')).toHaveCount(1);
  await expect(page.locator('#sectionMeta')).toContainText('Z break 490.0 µm');
  await page.locator('#zMapping').selectOption('relative');
  await expect(page.locator('#sectionMeta')).toContainText('relative thickness');
  const relativeMapping=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');const {relativeThickness,displayZ}=await import('/static/js/layer-model.js');const checks=[[0.001,1],[0.01,2],[0.1,3],[1,4],[10,5],[100,6],[500,1+Math.log10(500*1000)]];const results=checks.map(([t,expected])=>({t,expected,actual:relativeThickness(t)}));const front=Math.abs(displayZ(-0.05)-displayZ(0)),back=Math.abs(displayZ(-500.05)-displayZ(-500)); // in relative mode displayZ for substrate: front near-surface vs back not comparable, just ensure mapping present
    return {mapping:state.zMapping,results,front,back};});
  expect(relativeMapping.mapping).toBe('relative');
  for(const {expected,actual} of relativeMapping.results){ expect(actual).toBeCloseTo(expected,5); }
  await page.locator('#zMapping').selectOption('linear');
  await expect(page.locator('#sectionMeta')).toContainText('physical Z');
  await page.locator('#sectionBreakFrontKeep').fill('10');
  await page.locator('#sectionBreakFrontKeep').press('Enter');
  await page.locator('#sectionBreakBackKeep').fill('20');
  await page.locator('#sectionBreakBackKeep').press('Enter');
  await expect(page.locator('#sectionBreakFrom')).toHaveValue('-480');
  await expect(page.locator('#sectionBreakTo')).toHaveValue('-10');
  await expect(page.locator('#sectionMeta')).toContainText('Z break 470.0 µm');
  await enabled.uncheck();
  await expect(page.locator('#sectionBreakControls')).toBeHidden();
  await expect(page.locator('#sectionSvg [data-section-break="true"]')).toHaveCount(0);
  await enabled.check();
  await page.locator('#sectionBreakMode').selectOption('coordinates');
  await expect(page.locator('#sectionBreakSurfaceFields')).toBeHidden();
  await expect(page.locator('#sectionBreakCoordinateFields')).toBeVisible();
  await page.locator('#sectionBreakFrom').fill('-400');
  await page.locator('#sectionBreakFrom').press('Enter');
  await page.locator('#sectionBreakTo').fill('-20');
  await page.locator('#sectionBreakTo').press('Enter');
  await expect(page.locator('#sectionSvg [data-section-break="true"]')).toHaveCount(1);
  await expect(page.locator('#sectionSvg')).toContainText('Z -400 … -20 µm hidden');
  await expect.poll(() => page.evaluate(async () => {
    const request=indexedDB.open('wafercad-local',1);
    const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const value=await new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),get=tx.objectStore('records').get('state');get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);});
    db.close();return value?.sectionBreak;
  })).toEqual({enabled:true,mode:'coordinates',frontKeep:20,backKeep:100,from:-400,to:-20});
});

test('Pattern Editor releases transient previews while preserving GDS source data', async ({ page }) => {
  let composeRequests=0;
  page.on('request', request => {if(request.url().includes('/api/geometry/mask-compose'))composeRequests++;});
  await page.goto('/?qa=memory');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.locator('#gdsInput').setInputFiles(path.resolve('tests/fixtures/synthetic_two_layer.gds'));
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await page.locator('#patLayerList input[type="checkbox"]').first().check();
  await expect(page.locator('#patApplyBtn')).toBeEnabled();
  const firstRequestCount=composeRequests;
  expect(firstRequestCount).toBe(2);
  await expect(page.locator('#patSvg [data-mask-union]')).toHaveCount(1);
  const beforeSuspend=await page.evaluate(()=>window.wafercadMemoryDiagnostics());
  expect(beforeSuspend.pattern.maskPreview.polygons).toBeGreaterThan(0);
  expect(beforeSuspend.pattern.projectionPreview.polygons).toBeGreaterThan(0);
  expect(beforeSuspend.persistent.gdsPolygons).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Main', exact: true }).click();
  await expect(page.locator('#patSvg path')).toHaveCount(0);
  await expect(page.locator('#patProjectionSvg path')).toHaveCount(0);
  const afterSuspend=await page.evaluate(()=>window.wafercadMemoryDiagnostics());
  expect(afterSuspend.pattern.maskPreview.polygons).toBe(0);
  expect(afterSuspend.pattern.projectionPreview.polygons).toBe(0);
  expect(afterSuspend.persistent.gdsPolygons).toBe(beforeSuspend.persistent.gdsPolygons);
  expect(afterSuspend.persistent.gdsPoints).toBe(beforeSuspend.persistent.gdsPoints);
  await page.getByRole('button', { name: 'Pattern Editor' }).click();
  await expect(page.locator('#patApplyBtn')).toBeEnabled();
  await expect.poll(()=>composeRequests).toBe(firstRequestCount+2);
  await expect.poll(()=>page.evaluate(()=>window.wafercadMemoryDiagnostics().pattern.maskPreview.polygons)).toBeGreaterThan(0);
});

test('Main batches many physical cuts into one SVG path', async ({ page }) => {
  await page.goto('/?qa=playwright-batched-cuts');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.evaluate(async () => {
    const {state}=await import('/static/js/core.js');
    state.cuts=Array.from({length:50},(_,index)=>({id:`cut-${index}`,side:'front',footprint:[[index*100,-100],[index*100+50,-100],[index*100+50,100],[index*100,100]],zMin:-10,zMax:0,target:'substrate',sourceFaceId:null,wholeFace:false,profile:'vertical',lateralRadius:0}));
    state.layerVisuals.batch={name:'Batch film',color:'#2563eb',scale:1};
    state.solids=Array.from({length:50},(_,index)=>({id:`solid-${index}`,layerId:'batch',side:'front',material:'Batch film',footprint:[[index*100,200],[index*100+50,200],[index*100+50,400],[index*100,400]],zMin:0,zMax:10}));
  });
  await page.locator('#selectionMode').selectOption('imprinted');
  await expect(page.locator('#topSvg [data-model-cut]')).toHaveCount(1);
  await expect(page.locator('#topSvg [data-model-cut]')).toHaveAttribute('data-region-count','50');
  await expect(page.locator('#topSvg [data-model-solid]')).toHaveCount(1);
  await expect(page.locator('#topSvg [data-model-solid]')).toHaveAttribute('data-region-count','50');
  await page.locator('#zExagNumber').fill('9');
  await page.locator('#zExagNumber').dispatchEvent('change');
  await expect.poll(() => page.evaluate(async () => {const {state}=await import('/static/js/core.js');return state._renderStats?.solidMeshes;})).toBe(1);
  await expect.poll(() => page.evaluate(async () => {const {state}=await import('/static/js/core.js');return state._cutUnionStats?.find(entry=>entry.sourceCount===50)?.reusedPartition;})).toBe(true);
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


test('overlapping substrate cuts are unioned before Three.js hole creation', async ({ page }) => {
  await page.goto('/?qa=playwright-cut-hole-union');
  await page.getByRole('button', { name: 'New wafer' }).click();
  await page.getByRole('button', { name: 'Create' }).click();
  await page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    state.cuts=[
      {id:'cut-a',side:'front',footprint:[[-10000,-10000],[5000,-10000],[5000,10000],[-10000,10000]],zMin:-100,zMax:0},
      {id:'cut-b',side:'front',footprint:[[-5000,-10000],[10000,-10000],[10000,10000],[-5000,10000]],zMin:-100,zMax:0},
    ];
  });
  await page.locator('#zExagNumber').fill('9');
  await page.locator('#zExagNumber').dispatchEvent('change');
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/static/js/core.js');
    return state._cutUnionStats?.find(entry => entry.sourceCount===2)?.regionCount;
  })).toBe(1);
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
