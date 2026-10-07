import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { applyOperation } = await import('../model.js');
const { validateProcessModel } = await import('../project-schema.js');

const packageRoot = new URL('../../examples/projects/m3d-selfpowered-2026-candidate/', import.meta.url);
async function text(relative){return readFile(new URL(relative,packageRoot),'utf8');}
function rects(svg){return [...svg.matchAll(/<rect\s([^>]+)>?/g)].map(m=>{const a=Object.fromEntries([...m[1].matchAll(/([\w]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));return {x:+a.x,y:+a.y,w:+a.width,h:+a.height};});}
function overlap(a,b){return Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y);}
function contains(a,b,e=1e-9){return a.x<=b.x+e&&a.y<=b.y+e&&a.x+a.w>=b.x+b.w-e&&a.y+a.h>=b.y+b.h-e;}

test('M3D v2 masks keep published channels and corrected electrical landings',async()=>{
 const [pvm,rail,via,gate,open,wse,mos,wseSd,bridge,via2,graphene]=await Promise.all([
  text('masks/PVM_M01_Si_channel_etch.svg'),text('masks/M3D_M04_power_rail.svg'),text('masks/M3D_M05_power_via_open_ILD1.svg'),
  text('masks/M3D_M06_local_back_gate.svg'),text('masks/M3D_M07_HfO2_open.svg'),text('masks/M3D_M08_WSe2_channel.svg'),
  text('masks/M3D_M11_MoS2_channel.svg'),text('masks/M3D_M09_WSe2_SD.svg'),text('masks/M3D_M12_MoS2_SD_bridge.svg'),
  text('masks/M3D_M13_ILD2_data_power_via_open.svg'),text('masks/M3D_M15_graphene_SD_via_connect.svg')
 ]);
 const pvmRects=rects(pvm),rails=rects(rail),vias=rects(via),gates=rects(gate),opens=rects(open),wseCh=rects(wse),mosCh=rects(mos),wseMetal=rects(wseSd),bridgeMetal=rects(bridge),tier3=rects(via2),grapheneMetal=rects(graphene);
 assert.equal(pvmRects.length,4,'PVM M01 must describe the removable frame, not the retained island');
 for(const v of vias) assert.ok(rails.some(r=>contains(r,v)),'each 5 x 5 um power via needs a full Pt landing');
 for(const o of opens.slice(2)) assert.ok(gates.some(g=>contains(g,o)),'HfO2 gate-pad opening must remain inside gate metal');
 for(const ch of [...wseCh,...mosCh]){assert.equal(ch.w,0.2);assert.equal(ch.h,0.5);}
 assert.ok(bridgeMetal.some(a=>wseMetal.some(b=>overlap(a,b))),'bridge must overlap WSe2 landing metal');
 assert.ok(bridgeMetal.some(a=>vias.some(b=>overlap(a,b))),'bridge must overlap tier-1 power-via footprint');
 assert.ok(bridgeMetal.some(a=>overlap(a,tier3[0])),'bridge must overlap central data-via footprint');
 assert.ok(grapheneMetal.some(a=>overlap(a,tier3[0])),'graphene metal must overlap central data via');
 assert.ok(grapheneMetal.some(a=>overlap(a,tier3[1])),'graphene metal must overlap lower power via');
 assert.ok(grapheneMetal.some(a=>overlap(a,tier3[2])),'graphene metal must overlap upper power via');
});

test('S24 local topology accepts the 70 nm final conformal Al2O3 regression step',async()=>{
 const encoded=(await readFile(new URL('../../tests/fixtures/m3d-selfpowered/s24-conformal-roi.json.zlib.base64',import.meta.url),'utf8')).trim();
 const model=JSON.parse(inflateSync(Buffer.from(encoded,'base64')).toString('utf8'));
 validateProcessModel(model);
 const result=applyOperation(model,{type:'add',name:'Final Al2O3 regression',thickness:.07,face:'front',area:model.boundary,growth:'conformal'});
 assert.equal(result.changed,true,result.error);
 validateProcessModel(model);
});
