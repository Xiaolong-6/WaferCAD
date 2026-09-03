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

async function rerenderStable(page){
  const input=page.locator('#zExagNumber');
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

  await page.evaluate(async()=>{
    const {state}=await import('/static/js/core.js');
    state.cuts=[
      {id:'edge-notch',side:'front',footprint:[[-50000,-5000],[0,-5000],[0,5000],[-50000,5000]],zMin:-1,zMax:0,target:'substrate',wholeFace:false,profile:'vertical',lateralRadius:0},
      {id:'internal-hole',side:'front',footprint:[[10000,-5000],[20000,-5000],[20000,5000],[10000,5000]],zMin:-1,zMax:0,target:'substrate',wholeFace:false,profile:'vertical',lateralRadius:0},
    ];
  });
  await rerender(page);
  await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._substrateSlabRegions?.find(s=>s.zMin===-1&&s.zMax===0);})).toMatchObject({remainingCount:1,holeCount:1,isEmpty:false,useHoles:false});
  const mixedTopology=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._renderStats;});
  expect(mixedTopology).toMatchObject({substrateMeshes:2,substratePendingSlabs:0,substrateTopologyHoles:1});
});

test('through-etch is compositional and exposes opposite-origin material in Top View',async({page})=>{
  await page.goto('/?qa=playwright-through-etch-composition');
  await createWafer(page);
  const installBackFilm=()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');const {waferOutline}=await import('/static/js/geometry.js');state.activeFace='front';state.solids=[{id:'back-film',layerId:'back-layer',side:'back',material:'Back film',footprint:waferOutline(),zMin:-502,zMax:-500}];state.cuts=[];state.dopings=[];state.layerVisuals['back-layer']={name:'Back film',color:'#12ab34',scale:1,baseThickness:2};});
  const physicalState=()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');const clean=item=>{const copy=structuredClone(item);delete copy.id;delete copy.sourceFaceId;delete copy.partitionBatchId;return copy;};const {partitionTopSurface}=await import('/static/js/geometry-api.js');return {solids:state.solids.map(clean),cuts:state.cuts.map(clean),dopings:state.dopings.map(clean),front:(await partitionTopSurface([], 'front')).map(atom=>({kind:atom.kind,layerId:atom.layerId,surface:atom.surface,zMin:atom.zMin,zMax:atom.zMax}))};});

  await installBackFilm();await rerender(page);await applyOperation(page,'down',501);const single=await physicalState();
  await createWafer(page);await installBackFilm();await rerender(page);await applyOperation(page,'down',500);
  const exposed=await page.evaluate(async()=>{const {partitionTopSurface}=await import('/static/js/geometry-api.js');return (await partitionTopSurface([], 'front')).map(atom=>({kind:atom.kind,layerId:atom.layerId,surface:atom.surface}));});
  expect(exposed).toEqual([{kind:'solid',layerId:'back-layer',surface:-500}]);
  await expect.poll(()=>page.locator('#topSvg [data-model-layer="back-layer"]').count()).toBe(1);
  await applyOperation(page,'down',1);const split=await physicalState();expect(split).toEqual(single);

  const mismatch=await page.evaluate(async()=>{const {availableMaterialDepth}=await import(document.querySelector('script[src*="/static/app.js"]').src);const atom=id=>({geometryId:id,surface:id==='a'?1:0});return {frontOnly:availableMaterialDepth([atom('a')],[]),backOnly:availableMaterialDepth([],[atom('a')]),different:availableMaterialDepth([atom('a')],[atom('b')])};});
  expect(mismatch).toEqual({frontOnly:null,backOnly:null,different:null});

  await createWafer(page);
  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');const {waferOutline}=await import('/static/js/geometry.js');state.activeFace='back';state.solids=[{id:'front-film',layerId:'front-layer',side:'front',material:'Front film',footprint:waferOutline(),zMin:0,zMax:2}];state.cuts=[];state.layerVisuals['front-layer']={name:'Front film',color:'#ab1234',scale:1,baseThickness:2};});
  await rerender(page);await applyOperation(page,'down',500);
  const symmetric=await page.evaluate(async()=>{const {partitionTopSurface}=await import('/static/js/geometry-api.js');return (await partitionTopSurface([], 'back')).map(atom=>({kind:atom.kind,layerId:atom.layerId,surface:atom.surface}));});
  expect(symmetric).toEqual([{kind:'solid',layerId:'front-layer',surface:0}]);
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

test('Cross Section vertical viewport only includes A-B intersected solids and dopings',async({page})=>{
  await page.goto('/?qa=playwright-local-section-scale');await createWafer(page);
  await page.locator('#zMapping').selectOption('linear');
  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.slice={a:{x:-30000,y:0},b:{x:30000,y:0}};state.solids=[];state.dopings=[];});await rerenderStable(page);
  const baseline=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._sectionViewport;});
  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.solids=[{id:'remote-film',layerId:'remote-film',side:'front',material:'Tall',footprint:[[-10000,18000],[10000,18000],[10000,22000],[-10000,22000]],zMin:0,zMax:1000}];state.layerVisuals['remote-film']={name:'Remote',color:'#f00',scale:1,baseThickness:1000};});await rerenderStable(page);
  const offSolid=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._sectionViewport;});expect(offSolid).toEqual(baseline);
  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.slice={a:{x:-30000,y:20000},b:{x:30000,y:20000}};});await rerenderStable(page);
  const onSolid=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._sectionViewport;});expect(onSolid.rawMax).toBeGreaterThan(baseline.rawMax);expect(onSolid.solidCount).toBe(1);
  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.solids=[];state.dopings=[{id:'remote-doping',layerId:'remote-doping',targetLayerId:'substrate',dopant:'B',position:'upper',footprint:[[-10000,18000],[10000,18000],[10000,22000],[-10000,22000]],zMin:-10,zMax:1000}];state.layerVisuals['remote-doping']={name:'Remote doping',color:'#0f0',scale:1,gradient:true};state.slice={a:{x:-30000,y:0},b:{x:30000,y:0}};});await rerenderStable(page);
  const offDoping=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._sectionViewport;});expect(offDoping.rawMin).toBe(baseline.rawMin);expect(offDoping.rawMax).toBe(baseline.rawMax);expect(offDoping.dopingCount).toBe(0);
  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.slice={a:{x:-30000,y:20000},b:{x:30000,y:20000}};});await rerenderStable(page);
  const onDoping=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._sectionViewport;});expect(onDoping.rawMax).toBeGreaterThan(baseline.rawMax);expect(onDoping.dopingCount).toBe(1);
});
