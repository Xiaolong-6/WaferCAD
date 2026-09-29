import {expect,test} from '@playwright/test';
import path from 'node:path';

async function setup(page,file='selection_driven_patterns.gds',key='20/0'){
  await page.goto('/?qa=playwright-refill-topology');
  await page.getByRole('button',{name:'New wafer'}).click();await page.getByRole('button',{name:'Create',exact:true}).click();
  await page.locator('#gdsInput').setInputFiles(path.resolve('tests/fixtures',file));
  await expect(page.locator('#statusText')).toContainText(`Loaded ${file}`);
  await page.getByRole('button',{name:'Pattern Editor'}).click();
  await row(page,key).getByRole('checkbox').check();
  return page.evaluate(async key=>{const {state}=await import('/static/js/core.js');const layer=state.gds.layers.find(l=>l.key===key);return layer.polygons.map((_,index)=>layer.components.find(c=>c.source_polygon_indices.includes(index)).id);},key);
}
function row(page,key='20/0'){return page.locator('#patLayerList .layer-row2').filter({hasText:`${key} ·`});}
function component(page,id){return page.locator(`#patSvg [data-component-id="${id}"]`);}
async function fill(page,enabled,key='20/0'){
  // Fill currently lives in hidden legacy Main controls. Dispatch the actual
  // checkbox change handler rather than assigning fill/cache state directly.
  await page.locator('#layerList .layer-item').filter({hasText:`Layer ${key}`}).locator('label').filter({hasText:'Fill pattern'}).locator('input').evaluate((input,enabled)=>{input.checked=enabled;input.dispatchEvent(new Event('change',{bubbles:true}));},enabled);
}
async function ready(page,count){
  await expect(page.locator('#patApplyBtn')).toBeEnabled();
  await expect(page.locator('#patProjectionSvg [data-uv-exposure]')).toHaveAttribute('data-region-count',String(count));
}
async function inspect(page,key='20/0'){
  return page.evaluate(async key=>{
    const {state}=await import('/static/js/core.js');
    const {effectiveLayerPolygons,selectedLayerSourcePolygons,selectedSourceFingerprint,committedProjectionIsCurrent}=await import('/static/js/layout-model.js');
    const {polygonArea,pointInPoly}=await import('/static/js/geometry.js');
    const layer=state.gds.layers.find(l=>l.key===key),sources=selectedLayerSourcePolygons(layer),effective=effectiveLayerPolygons(layer);
    const points=[[-11000,0],[8000,0],[0,-17500],[0,17500],[-29500,0],[29500,0]];
    return {sources:sources.length,effective:effective.length,area:effective.reduce((sum,p)=>sum+Math.abs(polygonArea(p)),0),inside:points.map(([x,y])=>effective.some(p=>pointInPoly({x,y},p))),cacheCurrent:layer.filledSelectionFingerprint===selectedSourceFingerprint(layer),fill:layer.fillPattern===true,selection:layer.selectedComponentIds??null,current:committedProjectionIsCurrent()};
  },key);
}
async function commitCoverage(page,inside){
  await page.locator('#patApplyBtn').click();
  const result=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');const {pointInPoly}=await import('/static/js/geometry.js');return [[-11000,0],[8000,0],[0,-17500],[0,17500],[-29500,0],[29500,0]].map(([x,y])=>state.gds.committedProjection.regions.some(p=>pointInPoly({x,y},p)));});
  expect(result).toEqual(inside);
  await page.getByRole('button',{name:'Pattern Editor'}).click();
}

test('real mixed layer fills only A/B, then recomputes for adding/removing C',async({page})=>{
  const ids=await setup(page),requests=[];
  page.on('request',request=>{if(request.url().endsWith('/api/geometry/fill-holes'))requests.push(request.postDataJSON());});
  await component(page,ids[0]).click();await component(page,ids[1]).click({modifiers:['Shift']});
  await ready(page,2);
  await commitCoverage(page,[true,true,false,false,false,false]);
  await fill(page,true);await ready(page,2);
  expect(await inspect(page)).toMatchObject({sources:2,effective:2,area:52000000,cacheCurrent:true,fill:true,selection:ids.slice(0,2),current:false});
  expect(requests).toHaveLength(1);expect(requests[0].subjects).toHaveLength(2);
  await commitCoverage(page,[true,true,false,false,false,false]);
  await component(page,ids[2]).click({modifiers:['Shift']});await ready(page,3);
  expect(await inspect(page)).toMatchObject({sources:3,effective:3,area:112000000,cacheCurrent:true,current:false});
  expect(requests).toHaveLength(2);expect(requests[1].subjects).toHaveLength(3);
  await commitCoverage(page,[true,true,true,false,false,false]);
  await component(page,ids[2]).click({modifiers:['Shift']});await ready(page,2);
  expect(requests).toHaveLength(3);expect(requests[2].subjects).toHaveLength(2);
  await commitCoverage(page,[true,true,false,false,false,false]);
  await fill(page,false);await ready(page,2);
  expect(await inspect(page)).toMatchObject({sources:2,effective:2,fill:false,selection:ids.slice(0,2)});
  expect(requests).toHaveLength(3);
});

test('Fill ON distinguishes explicit none from All and rejects a legacy whole-layer cache',async({page})=>{
  const ids=await setup(page);
  await fill(page,true);await ready(page,1);
  // Fill returns the filled frame plus the two internal device polygons;
  // projection composition unions their overlap into one exposed region.
  expect(await inspect(page)).toMatchObject({sources:6,effective:3,area:2212000000,selection:null});
  await component(page,ids[0]).click();await ready(page,1);
  await component(page,ids[0]).click({modifiers:['Shift']});
  await expect(page.locator('#patApplyBtn')).toBeDisabled();
  await expect(page.locator('#patProjectionSvg [data-uv-exposure]')).toHaveCount(0);
  expect(await inspect(page)).toMatchObject({sources:0,effective:0,area:0,selection:[],fill:true});
  // Simulate a saved legacy cache without its selected-source fingerprint.
  expect(await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');const {effectiveLayerPolygons}=await import('/static/js/layout-model.js');const layer=state.gds.layers.find(l=>l.key==='20/0');layer.filledPolygons=[layer.polygons[2]];delete layer.filledSelectionFingerprint;return effectiveLayerPolygons(layer);})).toEqual([]);
  await row(page).getByRole('button',{name:'All',exact:true}).click();await ready(page,1);
  expect(await inspect(page)).toMatchObject({sources:6,effective:3,area:2212000000,selection:null,cacheCurrent:true});
  await page.locator('#patApplyBtn').click();
  expect(await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');const {polygonArea}=await import('/static/js/geometry.js');return state.gds.committedProjection.regions.reduce((sum,p)=>sum+Math.abs(polygonArea(p)),0);})).toBe(2160000000);
  await page.getByRole('button',{name:'Pattern Editor'}).click();
  await fill(page,false);await ready(page,3);
  expect(await inspect(page)).toMatchObject({sources:6,effective:6,area:240000000,selection:null,fill:false});
});

test('Fill unions selected touching components and fills a selected closed ring',async({page})=>{
  const ids=await setup(page,'realistic_pattern_projection.gds','2/0');
  await component(page,ids[0]).click();await component(page,ids[2]).click({modifiers:['Shift']});
  await ready(page,1);expect(await inspect(page,'2/0')).toMatchObject({sources:2,effective:2,area:96000000});
  await fill(page,true,'2/0');await ready(page,1);
  expect(await inspect(page,'2/0')).toMatchObject({sources:2,effective:1,area:96000000,cacheCurrent:true});
  await row(page,'2/0').getByRole('button',{name:'All',exact:true}).click();await ready(page,1);
  expect(await inspect(page,'2/0')).toMatchObject({sources:4,effective:1,area:256000000,cacheCurrent:true});
  await fill(page,false,'2/0');await ready(page,1);
  expect(await inspect(page,'2/0')).toMatchObject({sources:4,effective:4,area:192000000});
});

test('slow obsolete Fill cannot overwrite a newer selection or commit stale preview',async({page})=>{
  const ids=await setup(page);
  await component(page,ids[0]).click();await component(page,ids[1]).click({modifiers:['Shift']});await ready(page,2);
  await commitCoverage(page,[true,true,false,false,false,false]);
  let held,release;const arrived=new Promise(resolve=>held=resolve),gate=new Promise(resolve=>release=resolve);
  await page.route('**/api/geometry/fill-holes',async route=>{
    if(route.request().postDataJSON().subjects.length===2){const response=await route.fetch();held();await gate;await route.fulfill({response});}
    else await route.continue();
  });
  await fill(page,true);await arrived;
  await expect(page.locator('#patApplyBtn')).toBeDisabled();
  expect(await inspect(page)).toMatchObject({effective:0,current:false});
  const saved=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return JSON.stringify(state.gds.committedProjection);});
  await page.locator('#patApplyBtn').dispatchEvent('click');
  expect(await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return JSON.stringify(state.gds.committedProjection);})).toBe(saved);
  await component(page,ids[2]).click({modifiers:['Shift']});await ready(page,3);
  expect(await inspect(page)).toMatchObject({sources:3,effective:3,area:112000000,cacheCurrent:true});
  release();await expect(page.locator('#statusText')).toContainText('filled closed patterns');
  expect(await inspect(page)).toMatchObject({sources:3,effective:3,area:112000000,cacheCurrent:true});
  await commitCoverage(page,[true,true,true,false,false,false]);
});

test('Fill cache tracks source edits and component mapping but ignores view/mirror/transform changes',async({page})=>{
  const ids=await setup(page),requests=[];
  page.on('request',r=>{if(r.url().endsWith('/api/geometry/fill-holes'))requests.push(r.postDataJSON());});
  await component(page,ids[0]).click();await component(page,ids[1]).click({modifiers:['Shift']});
  await fill(page,true);await ready(page,2);expect(requests).toHaveLength(1);
  await page.getByRole('button',{name:'Fit mask',exact:true}).click();
  await page.locator('#patOffX').fill('100');await page.locator('#patOffX').press('Tab');await ready(page,2);
  await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');state.gds.layers.find(l=>l.key==='20/0').mirrored=true;window.patRender();});await ready(page,2);
  await page.locator('#patPreviewBtn').click();await ready(page,2);expect(requests).toHaveLength(1);
  const changed=await page.evaluate(async()=>{
    const {state}=await import('/static/js/core.js');const {effectiveLayerPolygons,maskProjectionFingerprint}=await import('/static/js/layout-model.js');
    const layer=state.gds.layers.find(l=>l.key==='20/0'),before=maskProjectionFingerprint();layer.polygons[0][0][0]-=100;
    const result={stale:effectiveLayerPolygons(layer).length,changed:before!==maskProjectionFingerprint()};window.patRender();return result;
  });
  expect(changed).toEqual({stale:0,changed:true});await ready(page,2);expect(requests).toHaveLength(2);
  await page.evaluate(async id=>{const {state}=await import('/static/js/core.js');const layer=state.gds.layers.find(l=>l.key==='20/0');layer.components.find(c=>c.id===id).source_polygon_indices=[2];window.patRender();},ids[1]);
  await ready(page,2);expect(requests).toHaveLength(3);
  expect(await inspect(page)).toMatchObject({cacheCurrent:true,inside:[true,false,true,false,false,false]});
});

test('real GDS replacement invalidates Fill cache even when layer keys are reused',async({page})=>{
  const ids=await setup(page),requests=[];
  page.on('request',r=>{if(r.url().endsWith('/api/geometry/fill-holes'))requests.push(r.postDataJSON());});
  await component(page,ids[0]).click();await component(page,ids[1]).click({modifiers:['Shift']});
  await fill(page,true);await ready(page,2);expect(requests).toHaveLength(1);
  await page.locator('#gdsInput').setInputFiles(path.resolve('tests/fixtures/selection_driven_patterns.gds'));
  await expect(page.locator('#statusText')).toContainText('Loaded selection_driven_patterns.gds');
  await expect(row(page).getByRole('checkbox')).not.toBeChecked();
  expect(requests).toHaveLength(2);expect(requests[1].subjects).toHaveLength(6);
  await row(page).getByRole('checkbox').check();await ready(page,1);
  expect(await inspect(page)).toMatchObject({selection:null,fill:true,sources:6,cacheCurrent:true});
  await component(page,ids[0]).click();await component(page,ids[1]).click({modifiers:['Shift']});await ready(page,2);
  expect(await inspect(page)).toMatchObject({sources:2,area:52000000,cacheCurrent:true});
});

test('obsolete failed Fill does not roll back a newer valid Fill selection',async({page})=>{
  const ids=await setup(page);
  await component(page,ids[0]).click();await component(page,ids[1]).click({modifiers:['Shift']});await ready(page,2);
  let arrived,release;const held=new Promise(resolve=>arrived=resolve),gate=new Promise(resolve=>release=resolve);
  await page.route('**/api/geometry/fill-holes',async route=>{
    if(route.request().postDataJSON().subjects.length===2){arrived();await gate;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({detail:'obsolete request failed'})});}
    else await route.continue();
  });
  await fill(page,true);await held;
  await component(page,ids[2]).click({modifiers:['Shift']});await ready(page,3);
  release();await expect(page.locator('#statusText')).toContainText('filled closed patterns');
  expect(await inspect(page)).toMatchObject({fill:true,sources:3,effective:3,area:112000000,cacheCurrent:true});
  await commitCoverage(page,[true,true,true,false,false,false]);
});
