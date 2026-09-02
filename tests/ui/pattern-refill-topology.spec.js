import {expect,test} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const fixture=JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/realistic_pattern_projection.json'),'utf8'));

async function createWafer(page){await page.getByRole('button',{name:'New wafer'}).click();await page.getByRole('button',{name:'Create'}).click();}
async function applyOperation(page,mode,distance){await page.locator('#pushMode').selectOption(mode);await page.locator('#distanceInput').fill(String(distance));await page.getByRole('button',{name:'Apply operation'}).click();await expect(page.locator('#applyPushPullBtn')).toHaveText('Apply operation');}
async function installFixture(page){await page.evaluate(data=>{window.localStorage.clear();return import('/static/js/core.js').then(async({state})=>{const {normalizeGds}=await import('/static/js/layout-model.js');state.gds=normalizeGds(structuredClone(data));state.patternSelectedKeys=new Set(state.gds.layers.map(layer=>layer.key));state._gdsFileName=data.filename;window.patReset?.();});},fixture);}

test('canonical projection excludes context border but keeps valid rectangles, rings, and islands',async({page})=>{
  await page.goto('/?qa=playwright-refill-topology');await createWafer(page);await installFixture(page);
  const fingerprint=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js');const {committedProjectionIsCurrent,maskProjectionFingerprint,patternProjectionEntries,substrateProjectionFingerprint}=await import('/static/js/layout-model.js');const border=state.gds.layers.find(layer=>layer.key==='90/0'),device=state.gds.layers.find(layer=>layer.key==='1/0');state.patternSelectedKeys.add(border.key);const committed=()=>({regions:[[[0,0],[1,0],[1,1]]],face:'front',sourceFingerprint:maskProjectionFingerprint(),substrateFingerprint:substrateProjectionFingerprint('front')});const base=maskProjectionFingerprint(),mirrorProjection=committed();device.mirrored=true;const mirror=maskProjectionFingerprint(),mirrorInvalid=!committedProjectionIsCurrent(mirrorProjection);device.mirrored=false;const componentProjection=committed();device.selectedComponentIds=[];const components=maskProjectionFingerprint(),componentsInvalid=!committedProjectionIsCurrent(componentProjection);delete device.selectedComponentIds;const fillProjection=committed();border.fillPattern=true;const fill=maskProjectionFingerprint(),fillInvalid=!committedProjectionIsCurrent(fillProjection),fillEligible=patternProjectionEntries().some(entry=>entry.layer.key===border.key);border.fillPattern=false;return {eligibleKeys:[...new Set(patternProjectionEntries().map(entry=>entry.layer.key))],different:new Set([base,mirror,components,fill]).size,mirrorInvalid,componentsInvalid,fillInvalid,fillEligible};});
  expect(fingerprint.eligibleKeys.sort()).toEqual(['1/0','2/0','3/0']);expect(fingerprint).toMatchObject({different:4,mirrorInvalid:true,componentsInvalid:true,fillInvalid:true,fillEligible:true});

  await page.getByRole('button',{name:'Pattern Editor'}).click();
  const borderRow=page.locator('#patLayerList .layer-row2').filter({hasText:'90/0'});
  await expect(borderRow.locator('input[type="checkbox"]')).toBeDisabled();await expect(borderRow).toContainText('context only');
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
