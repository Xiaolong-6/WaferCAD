import { expect, test } from '@playwright/test';

async function createWafer(page){
  await page.getByRole('button',{name:'New wafer'}).click();
  if(await page.locator('#newWaferConfirmDialog').evaluate(dialog=>dialog.open).catch(()=>false)){
    await page.locator('#newWaferConfirmDiscard').click();
  }
  await page.getByRole('button',{name:'Create'}).click();
}

async function applyOperation(page,mode,distance){
  await page.locator('#pushMode').selectOption(mode);
  await page.locator('#distanceInput').fill(String(distance));
  await page.getByRole('button',{name:'Apply operation'}).click();
  await expect(page.locator('#applyPushPullBtn')).toHaveText('Apply operation');
}

async function rerender(page){
  const input=page.locator('#zExagNumber');
  const value=Number(await input.inputValue());
  await input.fill(String(value===8?9:8));
  await input.dispatchEvent('change');
  await input.blur();
}

test('whole-face and edge-touching cuts use remaining substrate slabs without degenerate holes',async({page})=>{
  await page.goto('/?qa=playwright-substrate-slabs');
  await createWafer(page);

  await applyOperation(page,'down',1);
  await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._substrateSlabRegions?.find(s=>s.zMin===-1&&s.zMax===0);})).toMatchObject({remainingCount:0,isEmpty:true,useHoles:false});
  await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._renderStats;})).toMatchObject({substrateSlabs:2,substrateMeshes:1,substratePendingSlabs:0});

  await applyOperation(page,'up',1);
  const flush=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return {solid:state.solids[0],topSlab:state._substrateSlabRegions.find(s=>s.zMin===-1&&s.zMax===0),stats:state._renderStats};});
  expect(flush.solid.zMin).toBeCloseTo(-1,8);
  expect(flush.solid.zMax).toBeCloseTo(0,8);
  expect(flush.topSlab).toMatchObject({remainingCount:0,isEmpty:true,useHoles:false});
  expect(flush.stats.substrateMeshes).toBe(1);

  await page.evaluate(async()=>{
    const {state}=await import('/static/js/core.js');
    const {waferOutline}=await import('/static/js/geometry.js');
    state.solids=[];
    state.cuts=[{id:'legacy-whole-cut',side:'front',footprint:waferOutline(),zMin:-1,zMax:0,target:'substrate',sourceFaceId:null,wholeFace:false,profile:'vertical',lateralRadius:0}];
  });
  await rerender(page);
  await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._substrateSlabRegions?.find(s=>s.zMin===-1&&s.zMax===0);})).toMatchObject({remainingCount:0,isEmpty:true,useHoles:false});

  await page.evaluate(async()=>{
    const {state}=await import('/static/js/core.js');
    state.solids=[];
    state.cuts=[{id:'edge-cut',side:'front',footprint:[[-50000,-4000],[0,-4000],[0,4000],[-50000,4000]],zMin:-1,zMax:0,target:'substrate',sourceFaceId:null,wholeFace:false,profile:'vertical',lateralRadius:0}];
  });
  await rerender(page);
  await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._substrateSlabRegions?.find(s=>s.zMin===-1&&s.zMax===0);})).toMatchObject({isEmpty:false,useHoles:false});
  const edge=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return {slab:state._substrateSlabRegions.find(s=>s.zMin===-1&&s.zMax===0),stats:state._renderStats};});
  expect(edge.slab.remainingCount).toBeGreaterThan(0);
  expect(edge.stats.substratePendingSlabs).toBe(0);
});

test('Push depth preflight allows through-etch and rejects over-depth atomically',async({page})=>{
  await page.goto('/?qa=playwright-push-depth-preflight');
  await createWafer(page);

  await applyOperation(page,'down',499);
  expect(await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state.cuts[0].zMin;})).toBeCloseTo(-499,8);

  await createWafer(page);
  await applyOperation(page,'down',500);
  await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._substrateSlabRegions?.[0]?.isEmpty;})).toBe(true);

  await createWafer(page);
  const before=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return {solids:JSON.stringify(state.solids),cuts:JSON.stringify(state.cuts),dopings:JSON.stringify(state.dopings),undo:JSON.stringify(state.operationUndo),revision:state._revision};});
  await applyOperation(page,'down',501);
  await expect(page.locator('#statusText')).toContainText('exceeds the available material thickness of 500 µm');
  const after=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return {solids:JSON.stringify(state.solids),cuts:JSON.stringify(state.cuts),dopings:JSON.stringify(state.dopings),undo:JSON.stringify(state.operationUndo),revision:state._revision};});
  expect(after).toEqual(before);

  await createWafer(page);
  await applyOperation(page,'up',2);
  await applyOperation(page,'down',501);
  const filmPath=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return {solids:state.solids.length,cutMin:state.cuts[0]?.zMin,status:document.querySelector('#statusText').textContent};});
  expect(filmPath.status).toContain('Pushed inward');
  expect(filmPath.solids).toBe(0);
  expect(filmPath.cutMin).toBeCloseTo(-499,8);

  await createWafer(page);
  await page.locator('#flipFaceBtn').click();
  await applyOperation(page,'up',2);
  await page.locator('#flipFaceBtn').click();
  await applyOperation(page,'down',501);
  const oppositeFilmPath=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return {solid:state.solids[0],cut:state.cuts[0]};});
  expect(oppositeFilmPath.solid.side).toBe('back');
  expect(oppositeFilmPath.solid.zMin).toBeCloseTo(-502,8);
  expect(oppositeFilmPath.solid.zMax).toBeCloseTo(-501,8);
  expect(oppositeFilmPath.cut.zMin).toBeCloseTo(-500,8);
  expect(oppositeFilmPath.cut.zMax).toBeCloseTo(0,8);

  await createWafer(page);
  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.cuts=[{id:'back-thin',side:'back',footprint:[[-50000,-50000],[50000,-50000],[50000,50000],[-50000,50000]],zMin:-500,zMax:-400,target:'substrate'}];});
  await rerender(page);
  await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._renderStats?.substratePendingSlabs;})).toBe(0);
  await page.waitForTimeout(100);
  const mixedBefore=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');window.__preflightChanges=[];window.addEventListener('wafercad:state-change',event=>window.__preflightChanges.push(event.detail));return JSON.stringify({solids:state.solids,cuts:state.cuts,dopings:state.dopings,undo:state.operationUndo,revision:state._revision});});
  await applyOperation(page,'down',401);
  await expect(page.locator('#statusText')).toContainText('available material thickness of 400 µm');
  const mixedAfter=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return {snapshot:JSON.stringify({solids:state.solids,cuts:state.cuts,dopings:state.dopings,undo:state.operationUndo,revision:state._revision}),changes:window.__preflightChanges};});
  expect(mixedAfter.changes).toEqual([]);
  expect(mixedAfter.snapshot).toBe(mixedBefore);

  await createWafer(page);
  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.cuts=[{id:'back-half',side:'back',footprint:[[-50000,-50000],[0,-50000],[0,50000],[-50000,50000]],zMin:-500,zMax:-400,target:'substrate'}];});
  await rerender(page);
  await applyOperation(page,'down',450);
  await expect(page.locator('#statusText')).toContainText('minimum available thickness of 400 µm across the selected regions');
  expect(await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state.cuts.length;})).toBe(1);

  await createWafer(page);
  await page.locator('#flipFaceBtn').click();
  await applyOperation(page,'down',501);
  await expect(page.locator('#statusText')).toContainText('available material thickness of 500 µm');
  expect(await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state.cuts.length;})).toBe(0);
});

test('Surface section break follows current A-B material envelope while coordinates stay absolute',async({page})=>{
  await page.goto('/?qa=playwright-current-section-envelope');
  await createWafer(page);
  await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._sectionEnvelope;})).toMatchObject({top:0,bottom:-500,thickness:500});

  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.cuts=[{id:'front-100',side:'front',footprint:[[-50000,-50000],[50000,-50000],[50000,50000],[-50000,50000]],zMin:-100,zMax:0,target:'substrate'}];});
  await rerender(page);
  await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._sectionEnvelope;})).toMatchObject({top:-100,bottom:-500,thickness:400});
  await expect(page.locator('#sectionBreakFrom')).toHaveValue('-495');
  await expect(page.locator('#sectionBreakTo')).toHaveValue('-105');

  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.cuts=[{id:'front-half',side:'front',footprint:[[-50000,-50000],[0,-50000],[0,50000],[-50000,50000]],zMin:-100,zMax:0,target:'substrate'}];state.slice={a:{x:-30000,y:0},b:{x:30000,y:0}};});
  await rerender(page);
  await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._sectionEnvelope;})).toMatchObject({top:0,bottom:-500});

  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.slice={a:{x:-40000,y:0},b:{x:-10000,y:0}};});
  await rerender(page);
  await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._sectionEnvelope;})).toMatchObject({top:-100,bottom:-500});

  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.cuts=[];state.solids=[{id:'film',layerId:'film',side:'front',material:'Film',footprint:[[-50000,-50000],[50000,-50000],[50000,50000],[-50000,50000]],zMin:0,zMax:1}];state.layerVisuals.film={name:'Film',color:'#f00',scale:1,baseThickness:1};});
  await rerender(page);
  await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._sectionEnvelope;})).toMatchObject({top:1,bottom:-500,thickness:501});

  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.solids=[];state.cuts=[{id:'back-100',side:'back',footprint:[[-50000,-50000],[50000,-50000],[50000,50000],[-50000,50000]],zMin:-500,zMax:-400,target:'substrate'}];});
  await rerender(page);
  await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._sectionEnvelope;})).toMatchObject({top:0,bottom:-400,thickness:400});

  await page.locator('#sectionBreakMode').selectOption('coordinates');
  await page.locator('#sectionBreakFrom').fill('-300');
  await page.locator('#sectionBreakFrom').press('Enter');
  await page.locator('#sectionBreakTo').fill('-20');
  await page.locator('#sectionBreakTo').press('Enter');
  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.cuts=[{id:'front-50',side:'front',footprint:[[-50000,-50000],[50000,-50000],[50000,50000],[-50000,50000]],zMin:-50,zMax:0,target:'substrate'}];});
  await rerender(page);
  const coordinateBreak=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state.sectionBreak;});
  expect(coordinateBreak.mode).toBe('coordinates');
  expect(coordinateBreak.from).toBe(-300);
  expect(coordinateBreak.to).toBe(-20);
});
