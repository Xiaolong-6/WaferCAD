import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSwxS8SiliconMask, SWX_S8_PROVENANCE } from './swx-s8-primary-silicon.mjs';

function overlap(A,B){
  for(const poly of [A,B])for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],
      dx=a[1]-b[1],dy=b[0]-a[0],
      p=A.map(v=>v[0]*dx+v[1]*dy),q=B.map(v=>v[0]*dx+v[1]*dy);
    if(Math.max(...p)<=Math.min(...q)+1e-8 ||
       Math.max(...q)<=Math.min(...p)+1e-8)return false;
  }
  return true;
}
function connectedComponents(elements){
  const parent=elements.map((_,i)=>i);
  const find=i=>parent[i]===i?i:parent[i]=find(parent[i]);
  for(let i=0;i<elements.length;i++)for(let j=i+1;j<elements.length;j++)
    if(overlap(elements[i].points,elements[j].points))parent[find(i)]=find(j);
  const roots=new Set(elements.map((_,i)=>find(i)));
  const byName=name=>{
    const index=elements.findIndex(e=>e.name===name);
    assert.ok(index>=0,'missing polygon '+name);
    return find(index);
  };
  return { count:roots.size,byName };
}
test('S8: scale, axis and source provenance',()=>{
  const m=buildSwxS8SiliconMask(),p=SWX_S8_PROVENANCE.dimensionsFromPaperUm;
  assert.equal(p.shuttleWidth,6);
  assert.equal(p.springLong,30);
  assert.equal(p.springShort,22);
  assert.equal(p.combFingerLength,3.2);
  assert.equal(p.combFingerWidth,.5);
  assert.equal(p.combLateralGap,.3);
  assert.equal(p.meanderR2,3);
  assert.equal(m.expectedTopology.shuttleOrientation,'longitudinal_Y');
  assert.deepEqual(m.expectedTopology.combBanks,['LEFT','RIGHT']);
  assert.deepEqual(m.expectedTopology.springStations,[2,-41]);
  assert.equal(m.expectedTopology.combStations,1);
  assert.ok(m.bounds.width>=90&&m.bounds.width<=95);
  assert.ok(m.bounds.height>=95&&m.bounds.height<=100);
  assert.ok(m.elements.every(e=>e.layer===1));
  assert.equal(m.contours.outerYellowMetal,null);
});
test('S8: left-right mirrored combs flank shuttle and stay electrically isolated',()=>{
  const m=buildSwxS8SiliconMask(),e=m.elements,components=connectedComponents(e);
  const n=prefix=>e.filter(t=>t.name.startsWith(prefix)).length;
  for(const side of ['L','R']){
    assert.equal(n('FIXED_FINGER_'+side+'_'),20);
    assert.equal(n('MOVING_FINGER_'+side+'_'),20);
    const first=e.find(z=>z.name==='FIXED_FINGER_'+side+'_0'),
      other=e.find(z=>z.name==='MOVING_FINGER_'+side+'_0');
    assert.ok(!overlap(first.points,other.points),'fixed/moving interdigitation short');
  }
  assert.equal(components.count,3,
    'expect one grounded optomechanical network and two fixed signal comb banks');
  const ground=components.byName('SHUTTLE_LEFT_RAIL');
  assert.equal(components.byName('SWX_FIXED_HALF'),ground,
    'S7 aligner must join fixed and movable optics mechanically');
  assert.equal(components.byName('SWX_MOVABLE_HALF'),ground);
  assert.equal(components.byName('MOVING_COMB_HANDLE_L'),ground);
  assert.equal(components.byName('MOVING_COMB_HANDLE_R'),ground);
  for(const side of ['L','R']){
    assert.notEqual(components.byName('FIXED_COMB_HANDLE_'+side),ground);
    assert.equal(components.byName('FIXED_FINGER_'+side+'_0'),
      components.byName('FIXED_COMB_HANDLE_'+side));
  }
  assert.notEqual(components.byName('FIXED_COMB_HANDLE_L'),
    components.byName('FIXED_COMB_HANDLE_R'),
    'Do not fabricate unproven inter-bank signal metal');
});
test('S8: two folded spring stations, both lateral ends supported',()=>{
  const m=buildSwxS8SiliconMask(),es=m.elements,c=connectedComponents(es),g=c.byName('SHUTTLE_LEFT_RAIL');
  for(const y of [2,-41])for(const side of ['L','R']){
    const prefix='FOLDED_'+y+'_'+side+'_';
    assert.equal(es.filter(e=>e.name.startsWith(prefix)).length,5);
    assert.equal(c.byName('SPRING_ANCHOR_'+y+'_'+side),g,
      'The compliant spring must join shuttle and anchor');
  }
});
test('SWT: true tip clearance (0.9um), fabricated OFF only',()=>{
  const m=buildSwxS8SiliconMask(),e=m.elements;
  assert.equal(e.filter(z=>z.name.startsWith('SWT_FIXED_')).length,23);
  assert.equal(e.filter(z=>z.name.startsWith('SWT_MOVING_')).length,23);
  const fixed=e.filter(z=>z.name.startsWith('SWT_FIXED_')),
    mobile=e.filter(z=>z.name.startsWith('SWT_MOVING_'));
  const tipFixed=Math.min(...fixed.flatMap(z=>z.points.map(p=>p[1]))),
    tipMobile=Math.max(...mobile.flatMap(z=>z.points.map(p=>p[1])));
  assert.ok(Math.abs(tipFixed-tipMobile-.9)<1e-8);
  assert.equal(m.expectedTopology.opticalFront,'positive_Y');
  assert.equal(m.provenance.dimensionsFromPaperUm.onAirGap,.015);
});
