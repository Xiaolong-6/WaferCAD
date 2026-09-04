import {expect,test} from '@playwright/test';

async function start(page,url='/?qa=snapshot-controller'){
  await page.goto(url);await page.getByRole('button',{name:'New wafer'}).click();
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await expect(page.locator('#statusText')).toContainText('wafer created');
  await expect(page.locator('#threeContainer canvas')).toHaveCount(1);
}
async function apply(page,mode,distance){
  await page.locator('#pushMode').selectOption(mode);await page.locator('#distanceInput').fill(String(distance));
  await page.locator('#applyPushPullBtn').click();await expect(page.locator('#applyPushPullBtn')).toHaveText('Apply operation');
}
async function save(page,name){
  await page.locator('#snapshotBtn').click();await page.locator('#snapshotNameInput').fill(name);
  await page.locator('#snapshotNameForm').getByRole('button',{name:'Save',exact:true}).click();
}
function card(page,name){return page.locator('.snapshot-card').filter({has:page.locator('.snapshot-name',{hasText:new RegExp(`^${name}$`)})});}
async function remove(page,name){await card(page,name).hover();await card(page,name).locator('.snapshot-delete').click();}
async function device(page){return page.evaluate(async()=>(await import('/static/js/snapshot-store.js')).captureDevice());}
async function records(page){return page.evaluate(async()=>JSON.parse(JSON.stringify((await import('/static/js/core.js')).state.snapshots)));}
async function debug(page){return page.evaluate(async()=>(await import('/static/js/core.js')).state._snapshotControllerDebug);}
async function camera(page){return page.evaluate(async()=>(await import(document.querySelector('script[type=module]').src)).threeView.captureCamera());}
function sameCamera(actual,expected){for(const key of ['position','target','up'])for(let i=0;i<3;i++)expect(actual[key][i]).toBeCloseTo(expected[key][i],7);}

test('one controller restores exact physical devices and cameras through snapshot cards',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await start(page);
  await apply(page,'up',2);await page.locator('#pushMode').selectOption('doping');
  const layerId=(await device(page)).solids[0].layerId;await page.locator('#dopingTargetLayer').selectOption(layerId);await apply(page,'doping',1);
  const a=await device(page);await save(page,'A');const cameraA=(await records(page))[0].camera;
  await page.locator('#threeContainer canvas').hover();await page.mouse.wheel(0,-160);
  await expect.poll(async()=>JSON.stringify(await camera(page))).not.toBe(JSON.stringify(cameraA));
  await page.locator('#flipFaceBtn').click();await apply(page,'down',1);
  const b=await device(page);await save(page,'B');const cameraB=(await records(page))[1].camera;
  await card(page,'A').click();expect(await device(page)).toEqual(a);sameCamera(await camera(page),cameraA);
  await card(page,'B').click();expect(await device(page)).toEqual(b);sameCamera(await camera(page),cameraB);
  await card(page,'B').click(); // Active card is deliberately a no-op.
  await remove(page,'A');
  expect(await debug(page)).toEqual({instances:1,creates:2,activates:2,autosaves:2,deletes:1,restores:2});
  await expect(page.locator('#threeContainer canvas')).toHaveCount(1);expect(errors).toEqual([]);
});

test('switching away autosaves active geometry, camera and thumbnail without replacing identity',async({page})=>{
  await start(page);await save(page,'A');await save(page,'B');await card(page,'A').click();
  const before=(await records(page))[0];await apply(page,'up',3);
  await page.locator('#threeContainer canvas').hover();await page.mouse.wheel(0,-120);
  await expect.poll(async()=>JSON.stringify(await camera(page))).not.toBe(JSON.stringify(before.camera));
  const modified=await device(page),modifiedCamera=await camera(page);
  await card(page,'B').click();const saved=(await records(page))[0];
  expect(saved).toMatchObject({id:before.id,name:before.name,created:before.created});expect(saved.updated).toBeTruthy();
  expect(saved.deviceRef).not.toBe(before.deviceRef);expect(saved.thumbRef).toBeTruthy();expect(saved.thumbRef).not.toBe(before.thumbRef);
  sameCamera(saved.camera,modifiedCamera);expect(await records(page)).toHaveLength(2);
  await card(page,'A').click();expect(await device(page)).toEqual(modified);sameCamera(await camera(page),modifiedCamera);
  expect(await page.evaluate(async()=>{const store=await import('/static/js/snapshot-store.js'),{state}=await import('/static/js/core.js');return store.resolveSnapshotThumbnail(state.snapshots[0]).startsWith('data:image/');})).toBe(true);
});

test('shared device references survive pruning and active deletion never restores another device',async({page})=>{
  await start(page);await save(page,'A');await save(page,'B');const initial=await device(page),snapshots=await records(page);
  expect(snapshots[0].deviceRef).toBe(snapshots[1].deviceRef);
  await remove(page,'A');
  expect(await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return (await import('/static/js/snapshot-store.js')).resolveSnapshotDevice(state.snapshots[0]);})).toEqual(initial);
  await apply(page,'up',2);const modified=await device(page);await save(page,'C');
  await card(page,'B').click();expect(await device(page)).toEqual(initial);
  await card(page,'C').click();expect(await device(page)).toEqual(modified);
  await remove(page,'C');expect(await device(page)).toEqual(modified);
  expect(await page.evaluate(async()=>(await import('/static/js/core.js')).state.activeSnapshotId)).toBe(snapshots[1].id);
  await remove(page,'B');expect(await device(page)).toEqual(modified);
  expect(await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return {active:state.activeSnapshotId,devices:state.snapshotDevices,thumbs:state.snapshotThumbnails};})).toEqual({active:null,devices:{},thumbs:{}});
});

test('process undo does not edit snapshots and snapshot activation clears process undo as before',async({page})=>{
  await start(page);await apply(page,'up',2);const a=await device(page);await save(page,'A');
  await apply(page,'up',1);await save(page,'B');const before=await records(page);
  await page.locator('#undoOperationBtn').click();expect(await records(page)).toEqual(before);expect(await device(page)).toEqual(a);
  await card(page,'A').click();expect(await device(page)).toEqual(a);
  expect(await page.evaluate(async()=>(await import('/static/js/core.js')).state.operationUndo)).toEqual([]);
  await expect(page.locator('#undoOperationBtn')).toBeDisabled();
});

test('project replacement uses live snapshot state and does not create another controller',async({page},testInfo)=>{
  await start(page);await apply(page,'up',2);const expected=await device(page);await save(page,'Archive');
  const pending=page.waitForEvent('download');await page.locator('#saveProjectBtn').click();
  const download=await pending,path=testInfo.outputPath('snapshot-roundtrip.json');await download.saveAs(path);
  await remove(page,'Archive');await apply(page,'up',1);
  await page.locator('#openProjectInput').setInputFiles(path);await expect(page.locator('#statusText')).toContainText('Opened snapshot-roundtrip.json');
  await card(page,'Archive').click();expect(await device(page)).toEqual(expected);
  expect(await debug(page)).toMatchObject({instances:1,creates:1,activates:1,restores:1});
  await expect(page.locator('#threeContainer canvas')).toHaveCount(1);
});

test('snapshot diagnostics are absent outside QA',async({page})=>{
  await start(page,'/');await save(page,'Normal');
  expect(await page.evaluate(async()=>Object.hasOwn((await import('/static/js/core.js')).state,'_snapshotControllerDebug'))).toBe(false);
});
