import {expect,test} from '@playwright/test';

async function createWafer(page){
  await page.getByRole('button',{name:'New wafer'}).click();
  await page.getByRole('button',{name:'Create'}).click();
  await expect(page.locator('#statusText')).toContainText('wafer created');
}

async function saveSnapshot(page,name){
  await page.locator('#snapshotBtn').click();
  await page.locator('#snapshotNameInput').fill(name);
  await page.locator('#snapshotNameForm').getByRole('button',{name:'Save'}).click();
}

test('app initializes one section view and A-B navigation remains functional',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?qa=section-view');
  await expect.poll(()=>page.evaluate(async()=>({...((await import('/static/js/core.js')).state._sectionViewDebug)}))).toEqual({instances:1,binds:1,controlChanges:0});
  await createWafer(page);
  await expect(page.locator('#sectionSvg [data-substrate-slab]')).toHaveCount(1);

  await page.locator('#sliceAx').fill('-10');
  await page.locator('#sliceAy').fill('0');
  await page.locator('#sliceBx').fill('10');
  await page.locator('#sliceBy').fill('0');
  await page.locator('#applySliceCoordinatesBtn').click();
  await expect(page.locator('#sectionMeta')).toContainText('20.00 mm line');
  expect(await page.evaluate(async()=>({...((await import('/static/js/core.js')).state.slice)}))).toEqual({a:{x:-10000,y:0},b:{x:10000,y:0}});

  const content=page.locator('#sectionContent'),initial=await content.getAttribute('transform');
  await page.locator('#sectionSvg').hover({position:{x:300,y:160}});await page.mouse.wheel(0,-200);
  await expect.poll(()=>content.getAttribute('transform')).not.toBe(initial);
  const zoomed=await content.getAttribute('transform'),box=await page.locator('#sectionSvg').boundingBox();
  await page.mouse.move(box.x+300,box.y+160);await page.mouse.down();await page.mouse.move(box.x+335,box.y+180);await page.mouse.up();
  await expect.poll(()=>content.getAttribute('transform')).not.toBe(zoomed);
  await page.locator('#sectionSvg').dblclick({position:{x:300,y:160}});
  await expect(content).toHaveAttribute('transform','translate(0,0) scale(1)');
  expect(errors).toEqual([]);
});

test('snapshot restore and new wafer keep one section-control binding and one persisted change',async({page})=>{
  await page.goto('/?qa=section-view');await createWafer(page);
  await expect.poll(()=>page.locator('#threeContainer canvas').count()).toBe(1);
  await saveSnapshot(page,'First');
  await page.locator('#zExagNumber').fill('9');await page.locator('#zExagNumber').dispatchEvent('change');
  await saveSnapshot(page,'Second');
  await expect(page.locator('#snapshotTrack .snapshot-card')).toHaveCount(2);
  await page.locator('#snapshotTrack .snapshot-card').first().click();
  await expect(page.locator('#snapshotTrack .snapshot-card').first()).toHaveClass(/active/);

  await page.getByRole('button',{name:'New wafer'}).click();
  await page.locator('#newWaferConfirmDiscard').click();
  await page.getByRole('button',{name:'Create'}).click();
  await page.evaluate(()=>{window.__sectionBreakChanges=0;window.addEventListener('wafercad:state-change',event=>{if(event.detail?.reason==='section-z-break')window.__sectionBreakChanges++;});});
  await page.locator('#sectionBreakFrontKeep').fill('7');
  await page.locator('#sectionBreakFrontKeep').dispatchEvent('change');

  const result=await page.evaluate(async()=>{const core=await import('/static/js/core.js');await core.waitForPersistenceIdle();const request=indexedDB.open('wafercad-local',1),db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}),saved=await new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),get=tx.objectStore('records').get('state');get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);});db.close();return {debug:{...core.state._sectionViewDebug},events:window.__sectionBreakChanges,state:{...core.state.sectionBreak},persisted:{...saved.sectionBreak}};});
  expect(result.debug).toEqual({instances:1,binds:1,controlChanges:1});
  expect(result.events).toBe(1);
  expect(result.state.frontKeep).toBe(7);expect(result.persisted.frontKeep).toBe(7);
});
