import {expect,test} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const fixture=JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/realistic_pattern_projection.json'),'utf8'));

async function createWafer(page){await page.getByRole('button',{name:'New wafer'}).click();await page.getByRole('button',{name:'Create'}).click();}
async function applyOperation(page,mode,distance){await page.locator('#pushMode').selectOption(mode);await page.locator('#distanceInput').fill(String(distance));await page.getByRole('button',{name:'Apply operation'}).click();await expect(page.locator('#applyPushPullBtn')).toHaveText('Apply operation');}
async function installFixture(page){await page.evaluate(data=>{window.localStorage.clear();return import('/static/js/core.js').then(async({state})=>{const {normalizeGds}=await import('/static/js/layout-model.js');state.gds=normalizeGds(structuredClone(data));state.patternSelectedKeys=new Set(['1/0','2/0','3/0']);state._gdsFileName=data.filename;window.patReset?.();});},fixture);}

test('canonical projection excludes context border but keeps valid rectangles, rings, and islands',async({page})=>{
  await page.goto('/?qa=playwright-refill-topology');await createWafer(page);await installFixture(page);
  const fingerprint=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');const {committedProjectionIsCurrent,maskProjectionFingerprint,patternProjectionEntries,substrateProjectionFingerprint}=await import('/static/js/layout-model.js');const border=state.gds.layers.find(layer=>layer.key==='90/0'),device=state.gds.layers.find(layer=>layer.key==='1/0');state.patternSelectedKeys.add(border.key);const committed=()=>({regions:[[[0,0],[1,0],[1,1]]],face:'front',sourceFingerprint:maskProjectionFingerprint(),substrateFingerprint:substrateProjectionFingerprint('front')});const base=maskProjectionFingerprint(),mirrorProjection=committed();device.mirrored=true;const mirror=maskProjectionFingerprint(),mirrorInvalid=!committedProjectionIsCurrent(mirrorProjection);device.mirrored=false;const componentProjection=committed();device.selectedComponentIds=[];const components=maskProjectionFingerprint(),componentsInvalid=!committedProjectionIsCurrent(componentProjection);delete device.selectedComponentIds;const fillProjection=committed();border.fillPattern=true;await (await import('/static/js/pattern-fill.js')).ensureLayerFilledPolygons(border);const fill=maskProjectionFingerprint(),fillInvalid=!committedProjectionIsCurrent(fillProjection),fillEligible=patternProjectionEntries().some(entry=>entry.layer.key===border.key);border.fillPattern=false;return {eligibleKeys:[...new Set(patternProjectionEntries().map(entry=>entry.layer.key))],different:new Set([base,mirror,components,fill]).size,mirrorInvalid,componentsInvalid,fillInvalid,fillEligible};});
  expect(fingerprint.eligibleKeys.sort()).toEqual(['1/0','2/0','3/0','90/0']);expect(fingerprint).toMatchObject({different:4,mirrorInvalid:true,componentsInvalid:true,fillInvalid:true,fillEligible:true});

  await page.getByRole('button',{name:'Pattern Editor'}).click();
  const borderRow=page.locator('#patLayerList .layer-row2').filter({hasText:'90/0'});
  await expect(borderRow.locator('input[type="checkbox"]')).toBeEnabled();await expect(borderRow).toContainText('possible frame/context');
  await borderRow.locator('input[type="checkbox"]').uncheck();
  await expect(page.locator('#patSvg [data-context-layer="90/0"]')).toHaveCount(1);
  await expect(page.locator('#patApplyBtn')).toBeEnabled();await page.locator('#patApplyBtn').click();
  const projection=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');const {pointInPoly}=await import('/static/js/geometry.js');const contains=point=>state.gds.committedProjection.regions.some(poly=>pointInPoly({x:point[0],y:point[1]},poly));return {selected:[...state.patternSelectedKeys],containsDevice:contains([-20000,0]),containsBorder:contains([0,17500]),containsRingArm:contains([0,6000]),containsRingHole:contains([0,0]),regions:state.gds.committedProjection.regions.length};});
  expect(projection.selected).not.toContain('90/0');expect(projection.containsDevice).toBe(true);expect(projection.containsBorder).toBe(false);expect(projection.containsRingArm).toBe(true);expect(projection.containsRingHole).toBe(false);expect(projection.regions).toBeGreaterThanOrEqual(4);
  await expect(page.locator('#topSvg [data-committed-projection]')).toHaveCount(1);
});

test('complex committed projection Push2 then Pull2 is physically and visually flush',async({page})=>{
  await page.goto('/?qa=playwright-refill-topology');await createWafer(page);await installFixture(page);await page.getByRole('button',{name:'Pattern Editor'}).click();await expect(page.locator('#patApplyBtn')).toBeEnabled();await page.locator('#patApplyBtn').click();
  await applyOperation(page,'down',2);
  const pushed=await page.evaluate(()=>window.wafercadRefillDiagnostics());
  expect(pushed.operation.inputSurfaceAtoms.length).toBeGreaterThan(0);expect(pushed.operation.outputSurfaceAtoms.length).toBeGreaterThan(0);expect(pushed.operation.outputSurfaceAtoms.every(atom=>Math.abs(atom.surface+2)<1e-7)).toBe(true);expect(pushed.operation.outputSurfaceAtoms.some(atom=>Math.abs(atom.surface)<1e-7)).toBe(false);
  const inputArea=pushed.operation.inputSurfaceAtoms.reduce((sum,atom)=>sum+atom.area,0),outputArea=pushed.operation.outputSurfaceAtoms.reduce((sum,atom)=>sum+atom.area,0);expect(outputArea).toBeCloseTo(inputArea,4);

  await page.locator('#pushMode').selectOption('up');await page.locator('#materialInput').fill('Exact refill');await applyOperation(page,'up',2);
  const physical=await page.evaluate(()=>window.wafercadRefillDiagnostics());
  expect(physical.operation.createdSolids.length).toBeGreaterThanOrEqual(4);expect(physical.operation.createdSolids.every(solid=>Math.abs(solid.zMin+2)<1e-7&&Math.abs(solid.zMax)<1e-7)).toBe(true);expect(physical.operation.outputSurfaceAtoms.every(atom=>Math.abs(atom.surface)<1e-7)).toBe(true);expect(physical.operation.createdSolids.some(solid=>solid.zMax>1e-7)).toBe(false);
  expect(physical.renderBounds.every(entry=>Math.abs(entry.mapped.max)<1e-7&&Math.abs(entry.geometry.max)<1e-7)).toBe(true);
  const physicalIntervals=new Set(physical.renderBounds.map(entry=>`${entry.mapped.min.toFixed(9)}|${entry.mapped.max.toFixed(9)}`));expect(physicalIntervals.size).toBe(1);

  await page.locator('#zMapping').selectOption('relative');
  await expect.poll(()=>page.evaluate(()=>window.wafercadRefillDiagnostics().renderBounds.length)).toBeGreaterThanOrEqual(4);
  const relative=await page.evaluate(()=>window.wafercadRefillDiagnostics());
  expect(relative.renderBounds.every(entry=>Math.abs(entry.mapped.max)<1e-7&&Math.abs(entry.geometry.max)<1e-7)).toBe(true);
  const relativeIntervals=new Set(relative.renderBounds.map(entry=>`${entry.mapped.min.toFixed(9)}|${entry.mapped.max.toFixed(9)}`));expect(relativeIntervals.size).toBe(1);
  expect(relative.section.solids.length).toBeGreaterThanOrEqual(2);expect(relative.section.solids.reduce((sum,entry)=>sum+entry.intervals.length,0)).toBeGreaterThanOrEqual(3);expect(relative.section.solids.every(entry=>Math.abs(entry.physical.max)<1e-7&&Math.abs(entry.mapped.max)<1e-7)).toBe(true);
});

test('canonical topology preserves a Boolean ring hole for solid extrusion',async({page})=>{
  await page.goto('/?qa=playwright-refill-topology');
  const result=await page.evaluate(async()=>{const {composeMaskRegions}=await import('/static/js/geometry-api.js');const {polygonTopologies}=await import('/static/js/geometry.js');const rectangles=[[[ -8,-8],[8,-8],[8,-4],[-8,-4]],[[-8,4],[8,4],[8,8],[-8,8]],[[-8,-4],[-4,-4],[-4,4],[-8,4]],[[4,-4],[8,-4],[8,4],[4,4]]];const composed=await composeMaskRegions(rectangles);return {regions:composed.regions.length,topologies:composed.regions.flatMap(polygonTopologies).map(topology=>({outer:topology.outer.length,holes:topology.holes.length}))};});
  expect(result.regions).toBe(1);expect(result.topologies).toHaveLength(1);expect(result.topologies[0].outer).toBeGreaterThanOrEqual(4);expect(result.topologies[0].holes).toBe(1);
});

test('real GDS import preserves eligible projection and exact Push2 Pull2 refill',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?qa=playwright-refill-topology');await createWafer(page);
  const inspected=page.waitForResponse(response=>response.url().endsWith('/api/gds/inspect')&&response.request().method()==='POST');
  await page.locator('#gdsInput').setInputFiles(path.resolve('tests/fixtures/realistic_pattern_projection.gds'));
  expect((await inspected).ok()).toBe(true);
  await expect(page.locator('#statusText')).toContainText('4 layer/datatype pairs');
  const classification=await page.evaluate(async()=>{
    const {state}=await import('/static/js/core.js');
    const {patternLayerIsEligible}=await import('/static/js/layout-model.js');
    return Object.fromEntries(state.gds.layers.map(layer=>[layer.key,{isBorderOnly:layer.isBorderOnly,eligible:patternLayerIsEligible(layer),components:layer.components.length}]));
  });
  // The density heuristic supplies a hint, never process permission.
  expect(classification).toEqual({
    '1/0':{isBorderOnly:false,eligible:true,components:1},
    '2/0':{isBorderOnly:false,eligible:true,components:4},
    '3/0':{isBorderOnly:false,eligible:true,components:2},
    '90/0':{isBorderOnly:true,eligible:true,components:4},
  });
  await page.getByRole('button',{name:'Pattern Editor'}).click();
  const rows=page.locator('#patLayerList .layer-row2');
  await expect(rows.filter({hasText:'90/0'}).locator('input[type="checkbox"]')).toBeEnabled();
  await expect(rows.filter({hasText:'90/0'}).locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(rows.filter({hasText:'90/0'})).toContainText('possible frame/context');
  for(const key of ['1/0','2/0','3/0'])await rows.filter({hasText:key}).locator('input[type="checkbox"]').check();
  await expect(page.locator('#patApplyBtn')).toBeEnabled();
  await expect(page.locator('#patSvg [data-context-layer="90/0"]')).toHaveCount(1);
  const preview=await page.locator('#patProjectionSvg clipPath path').getAttribute('d');expect(preview).toBeTruthy();
  await page.locator('#patApplyBtn').click();
  const projection=await page.evaluate(async()=>{
    const {state}=await import('/static/js/core.js');const {pointInPoly,polygonArea,polygonTopologies}=await import('/static/js/geometry.js');
    const regions=state.gds.committedProjection.regions,contains=(x,y)=>regions.some(poly=>pointInPoly({x,y},poly));
    return {device:contains(-20000,0),border:contains(0,17500),ring:contains(0,6000),hole:contains(0,0),islandA:contains(19000,-4000),islandB:contains(23000,4000),area:regions.reduce((sum,poly)=>sum+Math.abs(polygonArea(poly)),0),holes:regions.flatMap(polygonTopologies).reduce((sum,topology)=>sum+topology.holes.length,0),regions};
  });
  expect(projection).toMatchObject({device:true,border:false,ring:true,hole:false,islandA:true,islandB:true,holes:1});
  expect(projection.area).toBeCloseTo(328000000,2);
  await expect(page.locator('#topSvg [data-committed-projection]')).toHaveCount(1);
  await applyOperation(page,'down',2);
  const push=await page.evaluate(()=>window.wafercadRefillDiagnostics().operation);
  expect(push.outputSurfaceAtoms.length).toBeGreaterThan(0);
  for(const atom of push.outputSurfaceAtoms)expect(atom.surface).toBeCloseTo(-2,7);
  expect(push.outputSurfaceAtoms.reduce((sum,atom)=>sum+atom.area,0)).toBeCloseTo(projection.area,2);
  await page.locator('#pushMode').selectOption('up');await page.locator('#materialInput').fill('Exact refill');await applyOperation(page,'up',2);
  const pull=await page.evaluate(()=>window.wafercadRefillDiagnostics().operation);
  expect(pull.createdSolids.length).toBe(4);
  for(const solid of pull.createdSolids){expect(solid.zMin).toBe(-2);expect(solid.zMax).toBe(0);}
  expect(pull.inputSurfaceAtoms.reduce((sum,atom)=>sum+atom.area,0)).toBeCloseTo(projection.area,2);
  for(const atom of pull.outputSurfaceAtoms)expect(atom.surface).toBe(0);
  expect(await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state.gds.committedProjection.regions;})).toEqual(projection.regions);
  const views={};
  for(const mode of ['linear','relative']){
    await page.locator('#zMapping').selectOption(mode);
    await expect.poll(()=>page.evaluate(()=>window.wafercadRefillDiagnostics().renderBounds.length)).toBe(4);
    const view=await page.evaluate(()=>window.wafercadRefillDiagnostics());views[mode]=view;
    for(const bounds of view.renderBounds){expect(bounds.mapped.max).toBeCloseTo(0,7);expect(bounds.geometry.max).toBeCloseTo(0,7);expect(bounds.geometry.min).toBeCloseTo(bounds.mapped.min,7);}
    expect(view.section.solids.length).toBe(2);
    expect(view.section.solids.reduce((sum,entry)=>sum+entry.intervals.length,0)).toBe(3);
    for(const entry of view.section.solids){expect(entry.physical.max).toBe(0);expect(entry.mapped.max).toBe(0);}
    await expect(page.locator('#sectionSvg [data-layer-id]').first()).toBeVisible();
    if(process.env.WAFERCAD_VISUAL_QA){fs.mkdirSync('output/playwright',{recursive:true});await page.screenshot({path:`output/playwright/real-import-${mode}.png`,fullPage:true});}
  }
  await testInfo.attach('real-import-diagnostics',{body:JSON.stringify({classification,projection,push,pull,views},null,2),contentType:'application/json'});
  expect(errors).toEqual([]);
});

test('refill render-bound collection is absent normally and available under QA',async({page})=>{
  for(const enabled of [false,true]){
    await page.goto(enabled?'/?qa=playwright-refill-topology':'/');await createWafer(page);await applyOperation(page,'up',2);
    for(const mode of ['linear','relative']){
      await page.locator('#zMapping').selectOption(mode);
      await expect.poll(()=>page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return state._renderStats?.solidRegions;})).toBe(1);
      const diagnostics=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return {present:Object.prototype.hasOwnProperty.call(state,'_solidRenderBounds'),count:state._solidRenderBounds?.length||0,accessor:typeof window.wafercadRefillDiagnostics};});
      expect(diagnostics).toEqual(enabled?{present:true,count:1,accessor:'function'}:{present:false,count:0,accessor:'undefined'});
    }
  }
});
