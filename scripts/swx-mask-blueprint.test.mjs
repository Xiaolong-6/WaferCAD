import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSwxMaskLayout } from './swx-mask-blueprint.mjs';

// Every element is a convex quad or SWT triangle; SAT measures planar
// overlap, NOT touching-only boundaries. Spring-to-anchor overlap is
// intentional: those are the lithographic mechanical fixed terminals.
function overlapSAT(a,b) {
  for (const ring of [a,b]) for(let i=0;i<ring.length;i++) {
    const p=ring[i],q=ring[(i+1)%ring.length],ax=p[1]-q[1],ay=q[0]-p[0];
    const a0=a.map(pt=>pt[0]*ax+pt[1]*ay),
      b0=b.map(pt=>pt[0]*ax+pt[1]*ay);
    if (Math.max(...a0)<=Math.min(...b0)+1e-8 ||
        Math.max(...b0)<=Math.min(...a0)+1e-8) return false;
  }
  return true;
}
function get(mask,id){
  const result=mask.elements.find(x=>x.name===id);
  assert.ok(result,'Missing polygon: '+id);
  return result.points;
}
function polygonArea(points){
  return Math.abs(points.reduce((sum,p,i)=>{
    const q=points[(i+1)%points.length];
    return sum+p[0]*q[1]-q[0]*p[1];
  },0)/2);
}

test('SWX paper dimensions and mask completeness (not author GDS)',()=>{
  const data=buildSwxMaskLayout(),p=data.parametersUm;
  assert.equal(p.topSi,.220);
  assert.equal(p.box,2);
  assert.equal(p.swtPeriod,.290);
  assert.equal(p.swtLateralDepth,.300);
  assert.equal(p.offToothTipGap,.900);
  assert.equal(p.onGap,.015);
  assert.ok(Math.abs((p.offToothTipGap-p.actuatorTravel)-p.onGap)<1e-9);
  assert.equal(p.combFingerWidth,.5);
  assert.equal(p.combFingerLength,3.2);
  assert.equal(p.combLateralClearance,.3);
  assert.equal(data.elements.filter(e=>e.name.includes('_FIXED_FINGER_')).length,40);
  assert.equal(data.elements.filter(e=>e.name.includes('_MOVING_FINGER_')).length,40);
  assert.equal(data.elements.filter(e=>e.name.startsWith('ALIGNER_')).length,6);
  assert.equal(data.elements.filter(e=>e.name.startsWith('S6_MOVABLE_MEANDER_')).length,102);
  assert.equal(data.elements.filter(e=>e.layer===3).length,2);
  assert.equal(data.elements.filter(e=>e.layer===2).length,0); // array-only ridge: intentionally deferred
  for (const element of data.elements) {
    assert.equal(element.kind,'polygon');
    assert.ok(element.points.length>=3);
    assert.ok(element.points.every(p=>p.every(Number.isFinite)));
    assert.ok(polygonArea(element.points)>1e-10,element.name+' degenerate');
  }
});

test('SWX fixed-mobile facets separate; stoppers and bridge attach in area',()=>{
  const data=buildSwxMaskLayout();
  assert.ok(overlapSAT(get(data,'MOVING_SWX_TO_SHUTTLE_1'),get(data,'SWX_MOVABLE_MMI')));
  for(const i of [0,1]){
    assert.ok(overlapSAT(get(data,'STOP_FIXED_'+i),get(data,'SWX_FIXED_MMI')));
    assert.ok(overlapSAT(get(data,'STOP_MOVING_'+i),get(data,'SWX_MOVABLE_MMI')));
  }
  const fixed=data.elements.filter(x=>x.part==='fixed'&&!x.name.startsWith('SPRING_ANCHOR')),
    moving=data.elements.filter(x=>x.part==='moving');
  for(const f of fixed)for(const m of moving) {
    assert.equal(overlapSAT(f.points,m.points),false, f.name+' intersects '+m.name);
  }
});

test('both comb banks gain overlap as movable Si travels along SWX +Y',()=>{
  const data=buildSwxMaskLayout();
  const span=e=>[Math.min(...e.map(p=>p[1])),Math.max(...e.map(p=>p[1]))];
  const intersect=(a,b)=>Math.max(0,Math.min(a[1],b[1])-Math.max(a[0],b[0]));
  const moved=([y0,y1],dy)=>[y0+dy,y1+dy];
  for(const bank of ['NORTH','SOUTH']){
    const fixed=span(get(data,bank+'_FIXED_FINGER_0')),
      mobile=span(get(data,bank+'_MOVING_FINGER_0'));
    assert.ok(Math.abs(intersect(fixed,mobile)-.2)<1e-6);
    assert.ok(Math.abs(intersect(fixed,moved(mobile,.885))-1.085)<1e-6);
    const fX=data.elements.find(e=>e.name===bank+'_STATIONARY_HANDLE').points.map(p=>p[0]);
    assert.equal(Math.min(...fX),-5);
    assert.equal(Math.max(...fX),28);
    assert.ok(overlapSAT(get(data,bank+'_STATIONARY_HANDLE'),get(data,bank+'_FIXED_PAD')));
  }
});

test('folded spring topology has both axial stations and both lateral sides',()=>{
  const data=buildSwxMaskLayout();
  for(const x of [-14,37])for(const side of ['N','S']){
    const tag='FOLDED_SPRING_'+x+'_'+side+'_';
    assert.equal(data.elements.filter(e=>e.name.startsWith(tag)).length,7);
    assert.ok(data.elements.some(e=>e.name==='SPRING_ANCHOR_'+x+'_'+side));
  }
});
