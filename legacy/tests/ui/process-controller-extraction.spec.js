import {expect,test} from '@playwright/test';

async function createWafer(page){
  await page.getByRole('button',{name:'New wafer'}).click();
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await expect(page.locator('#statusText')).toContainText('wafer created');
}
async function apply(page,mode,distance){
  await page.locator('#pushMode').selectOption(mode);
  await page.locator('#distanceInput').fill(String(distance));
  await page.locator('#applyPushPullBtn').click();
  await expect(page.locator('#applyPushPullBtn')).toHaveText('Apply operation');
}
async function model(page){
  return page.evaluate(async()=>{
    const {state,waitForPersistenceIdle}=await import('/static/js/core.js');
    await waitForPersistenceIdle();
    return JSON.parse(JSON.stringify({wafer:state.wafer,face:state.activeFace,solids:state.solids,cuts:state.cuts,dopings:state.dopings,layerVisuals:state.layerVisuals,undo:state.operationUndo,snapshots:state.snapshots,revision:state._revision}));
  });
}
async function debug(page){return page.evaluate(async()=>({...((await import('/static/js/core.js')).state._processControllerDebug)}));}
function physical(value){const {revision,...rest}=value;return rest;}

for(const face of ['front','back'])test(`UI uses one process controller for ${face} refill, undo and atomic depth validation`,async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?qa=process-controller-refill');await createWafer(page);
  if(face==='back')await page.locator('#flipFaceBtn').click();
  const initial=await model(page);
  expect(await debug(page)).toEqual({instances:1,pushPullCalls:0,dopingCalls:0,undoCalls:0});
  await apply(page,'down',2);
  const pushed=await model(page);
  expect(pushed.cuts).toHaveLength(1);
  expect(pushed.cuts[0]).toMatchObject(face==='front'?{zMin:-2,zMax:0}:{zMin:-500,zMax:-498});
  const pushedSurface=await page.evaluate(()=>window.wafercadRefillDiagnostics().operation.outputSurfaceAtoms);
  expect(pushedSurface.length).toBeGreaterThan(0);
  for(const atom of pushedSurface)expect(atom.surface).toBe(face==='front'?-2:-498);
  expect((await debug(page)).pushPullCalls).toBe(1);
  await apply(page,'up',2);
  const refilled=await model(page);
  expect(refilled.solids).toHaveLength(1);
  expect(refilled.solids[0]).toMatchObject(face==='front'?{zMin:-2,zMax:0}:{zMin:-500,zMax:-498});
  const finalSurface=await page.evaluate(()=>window.wafercadRefillDiagnostics().operation.outputSurfaceAtoms);
  for(const atom of finalSurface)expect(atom.surface).toBe(face==='front'?0:-500);
  await page.locator('#undoOperationBtn').click();expect(physical(await model(page))).toEqual(physical(pushed));
  await page.locator('#undoOperationBtn').click();expect(physical(await model(page))).toEqual(physical(initial));
  const beforeReject=await model(page);
  await apply(page,'down',501);
  await expect(page.locator('#statusText')).toContainText('exceeds the available material thickness');
  expect(await model(page)).toEqual(beforeReject);
  await apply(page,'down',500);
  const through=await model(page);expect(through.cuts).toHaveLength(1);
  expect(through.cuts[0]).toMatchObject({zMin:-500,zMax:0,wholeFace:true});
  expect(through.undo).toHaveLength(1);
  expect(await debug(page)).toEqual({instances:1,pushPullCalls:4,dopingCalls:0,undoCalls:2});
  expect(errors).toEqual([]);
});

test('failed material consumption after a completed solid split leaves physical state and undo untouched',async({page})=>{
  await page.goto('/?qa=process-controller');await createWafer(page);
  await apply(page,'up',2);
  const film=(await model(page)).solids[0];
  await page.locator('#pushMode').selectOption('doping');
  await page.locator('#dopingTargetLayer').selectOption(film.layerId);
  await apply(page,'doping',1);
  const before=await model(page);expect(before.dopings).toHaveLength(1);
  expect((await debug(page)).dopingCalls).toBe(1);
  let splits=0;
  await page.route('**/api/geometry/jobs',async route=>{
    if(route.request().method()==='POST'&&route.request().postDataJSON().operation==='split-by-mask'&&++splits===2){
      await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({detail:'forced staged-consumption failure'})});
    }else await route.continue();
  });
  await apply(page,'down',1);
  expect(splits).toBe(2);
  await expect(page.locator('#statusText')).toContainText('forced staged-consumption failure');
  expect(await model(page)).toEqual(before);
  expect(await debug(page)).toMatchObject({instances:1,pushPullCalls:3,dopingCalls:1,undoCalls:0});
});

test('process-controller debug state is absent outside QA mode',async({page})=>{
  await page.goto('/');await createWafer(page);await apply(page,'down',2);
  expect(await page.evaluate(async()=>Object.hasOwn((await import('/static/js/core.js')).state,'_processControllerDebug'))).toBe(false);
});
