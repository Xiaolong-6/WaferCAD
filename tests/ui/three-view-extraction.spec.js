import {expect,test} from '@playwright/test';

async function createWafer(page){
  await page.getByRole('button',{name:'New wafer'}).click();
  const discard=page.locator('#newWaferConfirmDiscard');
  if(await discard.isVisible())await discard.click();
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await expect(page.locator('#statusText')).toContainText('wafer created');
}
async function saveSnapshot(page,name){
  await page.locator('#snapshotBtn').click();
  await page.locator('#snapshotNameInput').fill(name);
  await page.locator('#snapshotNameForm').getByRole('button',{name:'Save',exact:true}).click();
}
async function diagnostics(page){
  return page.evaluate(async()=>{
    const {threeView}=await import(document.querySelector('script[src*="/static/app.js"]').src);
    return threeView.diagnostics();
  });
}

test('one Three instance and canvas survive snapshots, new wafer, workspace switches and project open',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?qa=three-view-memory');
  await expect(page.locator('#threeContainer canvas')).toHaveCount(1);
  expect((await diagnostics(page)).debug).toMatchObject({instances:1,initCalls:1,rendererCreations:1});
  await createWafer(page);
  await saveSnapshot(page,'First camera');
  const savedCamera=await page.evaluate(async()=>(await import('/static/js/core.js')).state.snapshots[0].camera);
  await page.locator('#threeContainer canvas').hover();await page.mouse.wheel(0,-160);
  await expect.poll(async()=>JSON.stringify((await diagnostics(page)).camera)).not.toBe(JSON.stringify(savedCamera));
  await saveSnapshot(page,'Second camera');
  await page.locator('#snapshotTrack .snapshot-card').first().click();
  const restored=(await diagnostics(page)).camera;
  for(const key of ['position','target','up'])for(let i=0;i<3;i++)expect(restored[key][i]).toBeCloseTo(savedCamera[key][i],7);
  await expect(page.locator('#threeContainer canvas')).toHaveCount(1);
  await createWafer(page);
  await page.getByRole('button',{name:'Pattern Editor'}).click();
  expect((await diagnostics(page)).loopRunning).toBe(false);
  await page.getByRole('button',{name:'Main',exact:true}).click();
  await expect.poll(async()=>(await diagnostics(page)).loopRunning).toBe(true);
  const downloadPromise=page.waitForEvent('download');await page.locator('#saveProjectBtn').click();
  const download=await downloadPromise,path=testInfo.outputPath('roundtrip.json');await download.saveAs(path);
  await page.locator('#openProjectInput').setInputFiles(path);
  await expect(page.locator('#statusText')).toContainText('Opened roundtrip.json');
  await expect(page.locator('#threeContainer canvas')).toHaveCount(1);
  expect((await diagnostics(page)).debug).toMatchObject({instances:1,initCalls:1,rendererCreations:1});
  expect(errors).toEqual([]);
});

test('document visibility stops continuous frames and resumes without a second renderer',async({page})=>{
  await page.goto('/?qa=three-view-memory');await createWafer(page);
  await expect.poll(async()=>(await diagnostics(page)).loopRunning).toBe(true);
  // Headless pages do not reliably become hidden on tab switching. Exercise the
  // actual visibility listener with an explicit hidden property, then restore it.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  const stopped=await diagnostics(page);expect(stopped.loopRunning).toBe(false);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect((await diagnostics(page)).debug.frames).toBe(stopped.debug.frames);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(async()=>(await diagnostics(page)).debug.frames).toBeGreaterThan(stopped.debug.frames);
  await expect(page.locator('#threeContainer canvas')).toHaveCount(1);
});

test('init is idempotent and destroy cancels owned resources without changing physical state',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?qa=three-view-memory');await createWafer(page);
  const result=await page.evaluate(async()=>{
    const {threeView}=await import(document.querySelector('script[src*="/static/app.js"]').src);
    const {state}=await import('/static/js/core.js');
    const physical=()=>JSON.stringify([state.wafer,state.solids,state.cuts,state.dopings,state.layerVisuals,state.slice,state.zMapping,state.zExag,state.relativeZScale]);
    const before=physical();await Promise.all([threeView.init(),threeView.init()]);
    const initialized=threeView.diagnostics();
    threeView.scheduleRender();threeView.destroy();threeView.destroy();
    const destroyed=threeView.diagnostics();
    await threeView.init();threeView.scheduleRender();threeView.start();threeView.resize();
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {initialized,destroyed,after:threeView.diagnostics(),samePhysicalState:before===physical()};
  });
  expect(result.initialized.debug).toMatchObject({instances:1,rendererCreations:1});
  expect(result.destroyed).toMatchObject({destroyed:true,memory:null,loopRunning:false,render3D:{scheduled:false},debug:{instances:0}});
  expect(result.after.debug.frames).toBe(result.destroyed.debug.frames);
  expect(result.after.debug.rendererCreations).toBe(1);
  expect(result.samePhysicalState).toBe(true);
  await expect(page.locator('#threeContainer canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('destroy during asynchronous init does not resurrect a canvas',async({page})=>{
  await page.goto('/?qa=three-view-memory');
  await expect(page.locator('#threeContainer canvas')).toHaveCount(1);
  const result=await page.evaluate(async()=>{
    const {createThreeView}=await import('/static/js/views/three-view.js');
    const view=createThreeView({getSubstrateSlabs:()=>[],ensureSubstrateSlabs:()=>{},getSubstrateZBounds:()=>[],mainWorkspaceVisible:()=>true});
    const first=view.init(),second=view.init(),samePromise=first===second;
    view.destroy();await Promise.all([first,second]);
    return {samePromise,diagnostics:view.diagnostics()};
  });
  expect(result.samePromise).toBe(true);
  expect(result.diagnostics).toMatchObject({destroyed:true,memory:null,loopRunning:false,debug:{instances:1,rendererCreations:1}});
  await expect(page.locator('#threeContainer canvas')).toHaveCount(1);
});
