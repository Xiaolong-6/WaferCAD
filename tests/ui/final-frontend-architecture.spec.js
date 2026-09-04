import {expect,test} from '@playwright/test';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';

const qa='top-view-wafer-controller-section-view-three-view-process-controller-snapshot-controller';
async function create(page){await page.getByRole('button',{name:'New wafer'}).click();if(await page.locator('#newWaferConfirmDiscard').isVisible())await page.locator('#newWaferConfirmDiscard').click();await page.getByRole('button',{name:'Create',exact:true}).click();await expect(page.locator('#statusText')).toContainText('wafer created');}
async function model(page){return page.evaluate(async()=>{const {state}=await import('/static/js/core.js');return JSON.parse(JSON.stringify({wafer:state.wafer,face:state.activeFace,slice:state.slice,bounds:state.topBounds,solids:state.solids,cuts:state.cuts,dopings:state.dopings,visuals:state.layerVisuals,undo:state.operationUndo,snapshots:state.snapshots,projection:state.gds.committedProjection,selection:[...state._topFaceSelection.selectedSolidIds]}));});}
async function drag(page,locator,dx,dy){const b=await locator.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:4});await page.mouse.up();}

test('one Top view handles pan, zoom, selection and mirrored A-B dragging',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`/?qa=${qa}`);await create(page);
  const initial=await model(page),svg=page.locator('#topSvg'),box=await svg.boundingBox();
  await page.mouse.move(box.x+8,box.y+8);await page.mouse.down();await page.mouse.move(box.x+28,box.y+18,{steps:3});await page.mouse.up();
  expect((await model(page)).bounds).not.toEqual(initial.bounds);
  const panned=(await model(page)).bounds;await svg.hover();await page.mouse.wheel(0,120);
  await expect.poll(async()=>JSON.stringify((await model(page)).bounds)).not.toBe(JSON.stringify(panned));
  await page.locator('#fitWaferBtn').click();await page.locator('#topSvg [data-surface-face]').first().click({position:{x:60,y:60}});
  await expect(page.locator('#selectionInfo')).toContainText('1 exposed surface region selected');
  const front=(await model(page)).slice.a.x;await drag(page,page.locator('[data-slice-handle=A] circle'),18,10);
  expect((await model(page)).slice.a.x).toBeGreaterThan(front);
  await page.locator('#flipFaceBtn').click();const back=(await model(page)).slice.a.x;
  await drag(page,page.locator('[data-slice-handle=A] circle'),18,10);expect((await model(page)).slice.a.x).toBeLessThan(back);
  expect((await model(page)).wafer).toEqual(initial.wafer);expect((await model(page)).selection).toEqual([]);
  const debug=await page.evaluate(async()=>(await import('/static/js/core.js')).state._topViewDebug);
  expect(debug).toMatchObject({instances:1,binds:1,pans:1,selections:1,sliceDrags:2});expect(debug.zooms).toBeGreaterThan(0);expect(errors).toEqual([]);
});

test('wafer UI validates, flips and replaces physical state while retaining snapshots',async({page})=>{
  await page.goto(`/?qa=${qa}`);await create(page);await page.locator('#distanceInput').fill('1');await page.locator('#applyPushPullBtn').click();await expect(page.locator('#applyPushPullBtn')).toHaveText('Apply operation');
  await page.locator('#snapshotBtn').click();await page.locator('#snapshotNameInput').fill('Retained');await page.locator('#snapshotNameForm').getByRole('button',{name:'Save',exact:true}).click();
  await page.locator('#flipFaceBtn').click();const before=await model(page);
  await page.getByRole('button',{name:'New wafer'}).click();await page.locator('#newWaferConfirmDiscard').click();
  await page.locator('#waferShape').selectOption('custom');await page.locator('#waferCoordinates').fill('0,0\n1,1');await page.getByRole('button',{name:'Create',exact:true}).click();
  await expect(page.locator('#waferFormError')).toContainText('at least three');expect(await model(page)).toEqual(before);
  await page.locator('#waferShape').selectOption('rect');await page.locator('#waferWidth').fill('20');await page.locator('#waferHeight').fill('10');await page.locator('#waferThickness').fill('200');await page.getByRole('button',{name:'Create',exact:true}).click();
  const after=await model(page);expect(after.wafer).toMatchObject({shape:'rect',width:20000,height:10000,thickness:200});
  expect(after).toMatchObject({face:'front',solids:[],cuts:[],dopings:[],undo:[],projection:null,selection:[],slice:{a:{x:-6500,y:0},b:{x:6500,y:0}}});
  expect(after.snapshots).toEqual(before.snapshots);expect(Object.keys(after.visuals)).toEqual(['substrate']);
  expect(await page.evaluate(async()=>(await import('/static/js/core.js')).state._waferControllerDebug)).toEqual({instances:1,creates:2,flips:1,resets:0});
  await page.reload();await page.locator('#discardBtn').click();expect((await model(page)).wafer).toBeNull();
  expect(await page.evaluate(async()=>(await import('/static/js/core.js')).state._waferControllerDebug.resets)).toBe(1);
});

test('single module instances, Top cleanup and acyclic dependency direction',async({page})=>{
  const root=path.resolve('static'),files=[];
  function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(file.endsWith('.js'))files.push(file);}}walk(root);
  const graph=new Map(files.map(file=>[file,[...readFileSync(file,'utf8').matchAll(/(?:import|export)\s+[^;]*?from\s*['"]([^'"]+)['"]/g)].map(m=>m[1]).filter(ref=>ref.startsWith('.')).map(ref=>path.resolve(path.dirname(file),ref))]));
  const visiting=new Set(),visited=new Set();function visit(file){expect(visiting.has(file),`cycle at ${file}`).toBe(false);if(visited.has(file))return;visiting.add(file);for(const dep of graph.get(file)||[])visit(dep);visiting.delete(file);visited.add(file);}for(const file of files)visit(file);
  for(const [file,deps] of graph){const relative=path.relative(root,file).replaceAll('\\','/');for(const dep of deps){const target=path.relative(root,dep).replaceAll('\\','/');if(relative.startsWith('js/'))expect(target).not.toBe('app.js');if(relative.startsWith('js/controllers/'))expect(target).not.toMatch(/^js\/views\//);if(relative.startsWith('js/views/'))expect(target).not.toMatch(/^js\/(views|controllers)\//);if(/^js\/(geometry|geometry-api|layer-model|layout-model)\.js$/.test(relative))expect(target).not.toMatch(/^js\/(views|controllers)\//);}}
  await page.goto(`/?qa=${qa}`);await create(page);await expect(page.locator('#threeContainer canvas')).toHaveCount(1);
  const result=await page.evaluate(async()=>{const {state}=await import('/static/js/core.js'),{topView}=await import(document.querySelector('script[type=module]').src);topView.bind();topView.bind();return {counts:[state._topViewDebug.instances,state._sectionViewDebug.instances,state._threeViewDebug.instances,state._processControllerDebug.instances,state._snapshotControllerDebug.instances,state._waferControllerDebug.instances],binds:state._topViewDebug.binds};});
  expect(result).toEqual({counts:[1,1,1,1,1,1],binds:1});
  const before=await model(page);await page.evaluate(async()=>{const {topView}=await import(document.querySelector('script[type=module]').src);topView.destroy();topView.destroy();topView.bind();topView.render();});
  await page.locator('#topSvg').dispatchEvent('wheel',{deltaY:100});expect(await model(page)).toEqual(before);await expect(page.locator('#topSvg path')).toHaveCount(0);
});
