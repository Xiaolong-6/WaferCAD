import {expect,test} from '@playwright/test';
import path from 'node:path';

async function importFixture(page,filename){
  await page.goto('/?qa=playwright-refill-topology');
  await page.getByRole('button',{name:'New wafer'}).click();
  await page.getByRole('button',{name:'Create',exact:true}).click();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/gds/inspect')&&r.request().method()==='POST');
  await page.locator('#gdsInput').setInputFiles(path.resolve('tests/fixtures',filename));
  expect((await response).ok()).toBe(true);
  await expect(page.locator('#statusText')).toContainText(`Loaded ${filename}`);
  await page.getByRole('button',{name:'Pattern Editor'}).click();
  expect(await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return [...state.patternSelectedKeys];})).toEqual([]);
}
function layerRow(page,key){return page.locator('#patLayerList .layer-row2').filter({hasText:`${key} ·`});}
async function commit(page,regions){
  await expect(page.locator('#patApplyBtn')).toBeEnabled();
  await expect(page.locator('#patProjectionSvg [data-uv-exposure]')).toHaveAttribute('data-region-count',String(regions));
  await page.locator('#patApplyBtn').click();
}
async function coverage(page,points){
  return page.evaluate(async points=>{
    const {state}=await import('/static/js/core.js');
    const {pointInPoly,polygonArea}=await import('/static/js/geometry.js');
    const {committedProjectionIsCurrent}=await import('/static/js/layout-model.js');
    const projection=state.gds.committedProjection;
    return {inside:points.map(([x,y])=>projection.regions.some(poly=>pointInPoly({x,y},poly))),area:projection.regions.reduce((sum,poly)=>sum+Math.abs(polygonArea(poly)),0),current:committedProjectionIsCurrent()};
  },points);
}
async function current(page){return page.evaluate(async()=>{const {committedProjectionIsCurrent}=await import('/static/js/layout-model.js');return committedProjectionIsCurrent();});}

test('explicit real frame selection overrides its hint and deselection excludes it',async({page})=>{
  await importFixture(page,'realistic_pattern_projection.gds');
  const frame=layerRow(page,'90/0');
  await expect(frame).toContainText('possible frame/context');
  await expect(frame.getByRole('checkbox')).toBeEnabled();
  await expect(frame.getByRole('checkbox')).not.toBeChecked();
  await layerRow(page,'1/0').getByRole('checkbox').check();
  await commit(page,1);
  expect(await coverage(page,[[-20000,0],[0,17500]])).toMatchObject({inside:[true,false],current:true});
  await page.getByRole('button',{name:'Pattern Editor'}).click();
  await frame.getByRole('checkbox').check();
  expect(await current(page)).toBe(false);
  await commit(page,2);
  expect(await coverage(page,[[-20000,0],[0,17500],[0,0]])).toMatchObject({inside:[true,true,false],current:true});
  // Main's legacy layer controls are hidden, but must share the same semantics.
  const main=page.locator('#layerList .layer-item').filter({hasText:'Layer 90/0'});
  expect(await main.locator('.pat-check input').isEnabled()).toBe(true);
  await expect(main.locator('.pat-check input')).toBeChecked();
  await expect(main).toContainText('possible frame/context');
  expect(await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state.gds.layers.find(l=>l.key==='90/0').fillPattern;})).toBe(false);
  await page.getByRole('button',{name:'Pattern Editor'}).click();
  await frame.getByRole('checkbox').uncheck();
  expect(await current(page)).toBe(false);
  await commit(page,1);
  expect(await coverage(page,[[-20000,0],[0,17500]])).toMatchObject({inside:[true,false],current:true});
});

test('sparse legitimate real GDS devices project despite a frame-like hint',async({page})=>{
  await importFixture(page,'selection_driven_patterns.gds');
  const row=layerRow(page,'10/0');
  expect(await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state.gds.layers.find(l=>l.key==='10/0').isBorderOnly;})).toBe(true);
  await expect(row.getByRole('checkbox')).toBeEnabled();
  await row.getByRole('checkbox').check();
  await commit(page,3);
  expect(await coverage(page,[[-20000,-10000],[0,10000],[20000,-10000],[0,0]])).toEqual({inside:[true,true,true,false],area:12000000,current:true});
});

test('mixed real GDS layer follows clicked components through preview commit and refill',async({page})=>{
  await importFixture(page,'selection_driven_patterns.gds');
  const row=layerRow(page,'20/0');
  const info=await page.evaluate(async()=>{
    const {state}=await import('/static/js/core.js');const layer=state.gds.layers.find(l=>l.key==='20/0');
    return {hint:layer.isBorderOnly,ids:[0,1,2].map(index=>layer.components.find(c=>c.source_polygon_indices.includes(index)).id),count:layer.components.length};
  });
  expect(info.hint).toBe(true);expect(info.count).toBe(6);
  await row.getByRole('checkbox').check();
  const component=id=>page.locator(`#patSvg [data-layer-key="20/0"][data-component-id="${id}"]`);
  await component(info.ids[0]).click();
  await component(info.ids[1]).click({modifiers:['Shift']});
  await commit(page,2);
  const points=[[-11000,0],[8000,0],[0,-17500],[0,17500],[-29500,0],[29500,0]];
  expect(await coverage(page,points)).toEqual({inside:[true,true,false,false,false,false],area:52000000,current:true});
  const selections=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state.gds.committedProjection.componentSelections['20/0'];});
  expect(selections.sort()).toEqual([...info.ids.slice(0,2)].sort());
  for(const mode of ['down','up']){
    await page.locator('#pushMode').selectOption(mode);await page.locator('#distanceInput').fill('2');
    await page.getByRole('button',{name:'Apply operation'}).click();
    await expect(page.locator('#applyPushPullBtn')).toHaveText('Apply operation');
    const op=await page.evaluate(()=>window.wafercadRefillDiagnostics().operation);
    expect(op.outputSurfaceAtoms.length).toBe(2);
    expect(op.outputSurfaceAtoms.reduce((sum,atom)=>sum+atom.area,0)).toBe(52000000);
    for(const atom of op.outputSurfaceAtoms)expect(atom.surface).toBe(mode==='down'?-2:0);
    if(mode==='up')for(const solid of op.createdSolids){expect(solid.zMin).toBe(-2);expect(solid.zMax).toBe(0);}
  }
  await page.getByRole('button',{name:'Pattern Editor'}).click();
  await component(info.ids[2]).click({modifiers:['Shift']});
  expect(await current(page)).toBe(false);
  await commit(page,3);
  expect(await coverage(page,points)).toEqual({inside:[true,true,true,false,false,false],area:112000000,current:true});
  // An empty component set must stay explicit, not be pruned or reset to all.
  await page.getByRole('button',{name:'Pattern Editor'}).click();
  await component(info.ids[0]).click();
  await component(info.ids[0]).click({modifiers:['Shift']});
  await expect(page.locator('#patApplyBtn')).toBeDisabled();
  await expect(row.getByRole('checkbox')).toBeChecked();
  expect(await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state.gds.layers.find(l=>l.key==='20/0').selectedComponentIds;})).toEqual([]);
  expect(await current(page)).toBe(false);
  await row.getByRole('button',{name:'All',exact:true}).click();
  await expect(page.locator('#patApplyBtn')).toBeEnabled();
  await expect(page.locator('#patProjectionSvg [data-uv-exposure]')).toHaveAttribute('data-region-count','3');
});

test('eligibility filters invalid area only and fingerprints all explicit mask choices',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {state}=await import('/static/js/core.js');
    const {normalizeGds,patternLayerIsEligible,patternProjectionEntries,maskProjectionFingerprint,substrateProjectionFingerprint,committedProjectionIsCurrent}=await import('/static/js/layout-model.js');
    const valid=[[0,0],[10,0],[10,10],[0,10]],line=[[0,0],[1,0],[2,0]],invalid=[[0,0],[Infinity,0],[0,1]];
    const layer={key:'1/0',polygons:[line,valid,invalid],isBorderOnly:true,components:[{id:'device',polygon:valid,source_polygon_indices:[1]}]};
    state.gds=normalizeGds({layers:[layer]});state.patternSelectedKeys=new Set([layer.key]);
    const eligible=patternLayerIsEligible(layer),polygons=patternProjectionEntries().map(e=>e.polygon);
    const projection=()=>({regions:[valid],face:'front',sourceFingerprint:maskProjectionFingerprint(),substrateFingerprint:substrateProjectionFingerprint('front')});
    let saved=projection();layer.isBorderOnly=false;const hintDoesNotInvalidate=committedProjectionIsCurrent(saved);
    const invalidated=[];
    for(const mutate of [()=>{layer.mirrored=true;},()=>{layer.fillPattern=true;},()=>{layer.selectedComponentIds=[];},()=>{state.gds.transform.offsetX=10;},()=>{state.patternSelectedKeys.clear();}]){saved=projection();mutate();invalidated.push(!committedProjectionIsCurrent(saved));}
    return {eligible,polygons,hintDoesNotInvalidate,invalidated,emptyEligible:patternLayerIsEligible(layer),lineEligible:patternLayerIsEligible({polygons:[line]}),invalidEligible:patternLayerIsEligible({polygons:[invalid]})};
  });
  expect(result).toEqual({eligible:true,polygons:[[[0,0],[10,0],[10,10],[0,10]]],hintDoesNotInvalidate:true,invalidated:[true,true,true,true,true],emptyEligible:false,lineEligible:false,invalidEligible:false});
});
