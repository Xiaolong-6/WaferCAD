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
  assert.equal(data.elements.filter(e=>e.layer===3).length,21);
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

test('Fig. 1c peripheral Cr/Au pads are on supported Si and electrically isolated',()=>{
  const data=buildSwxMaskLayout();
  assert.deepEqual(data.statusChecks.peripheralPadNets,['GROUND','SIGNAL']);
  assert.match(data.statusChecks.peripheralPadFootprint,/inferred/);
  assert.match(data.statusChecks.groundAnchorConnections,/all 4 electrically connected/);
  const metal=data.elements.filter(e=>e.layer===3);
  const sign=metal.filter(e=>e.name.includes('SIGNAL')||e.name.endsWith('_CR_AU'));
  const gnd=metal.filter(e=>e.name.includes('GROUND'));
  assert.equal(sign.filter(e=>e.name==='SIGNAL_METAL_PAD').length,1);
  assert.equal(gnd.filter(e=>e.name==='GROUND_METAL_PAD').length,1);
  assert.ok(overlapSAT(get(data,'SIGNAL_METAL_PAD'),get(data,'SIGNAL_PAD_BOX_SUPPORTED_SI')));
  assert.ok(overlapSAT(get(data,'GROUND_METAL_PAD'),get(data,'GROUND_PAD_BOX_SUPPORTED_SI')));
  assert.ok(overlapSAT(get(data,'NORTH_CR_AU'),get(data,'SIGNAL_METAL_ROUTE_0_1')));
  assert.ok(overlapSAT(get(data,'SOUTH_CR_AU'),get(data,'SIGNAL_METAL_ROUTE_1_1')));
  assert.ok(overlapSAT(get(data,'SPRING_ANCHOR_-14_N'),get(data,'GROUND_SI_ROUTE_1_1')));
  assert.ok(overlapSAT(get(data,'SPRING_ANCHOR_-14_S'),get(data,'GROUND_SI_ROUTE_2_1')));
  for(const s of sign)for(const g of gnd){
    assert.equal(overlapSAT(s.points,g.points),false,s.name+' shorted to '+g.name);
  }
  const moving=data.elements.filter(e=>e.part==='moving');
  for(const el of metal)for(const part of moving){
    assert.equal(overlapSAT(el.points,part.points),false,el.name+' contacts moving '+part.name);
  }
});

test('Fig. 1c broad supported Ground/Signal fields are disjoint and connected',()=>{
  const layout=buildSwxMaskLayout(), es=layout.elements;
  assert.equal(layout.statusChecks.broadPadMetalCount,4);
  assert.equal(layout.statusChecks.perimeterPadIsolationUpperUm,5);
  assert.match(layout.statusChecks.peripheralPadFootprint,/inferred/);
  assert.equal(layout.bounds.width,204);
  assert.equal(layout.bounds.height,192);
  const pads=['GROUND_UPPER','GROUND_LEFT','GROUND_LOWER','SIGNAL_RIGHT'];
  for(const id of pads){
    const metal=get(layout,'PERIMETER_'+id+'_CR_AU');
    const support=get(layout,'PERIMETER_'+id+'_SUPPORTED_SI');
    assert.ok(overlapSAT(metal,support),id+' Cr/Au must have supported Si underneath');
  }
  const net=e=> e.name.includes('GROUND')?'ground':
    e.name.includes('SIGNAL')||['NORTH_CR_AU','SOUTH_CR_AU'].includes(e.name)?'signal':null;
  const metals=es.filter(e=>e.layer===3);
  const ground=metals.filter(e=>net(e)==='ground');
  const signal=metals.filter(e=>net(e)==='signal');
  assert.equal(ground.length+signal.length,metals.length,'unassigned conductive metal');
  assert.equal(ground.length,10);
  assert.equal(signal.length,11);
  for(const g of ground)for(const s of signal){
    assert.equal(overlapSAT(g.points,s.points),false,
      g.name+' inadvertently shorts '+s.name);
  }
  const moving=es.filter(e=>e.part==='moving');
  for(const metal of metals)for(const m of moving){
    assert.equal(overlapSAT(metal.points,m.points),false,
      metal.name+' wrongly overlaps mobile Si '+m.name);
  }
  // Require a single conductive component per net. Each polygon in a
  // component must overlap in POSITIVE AREA, never just share a pixel corner.
  function connectedCount(network) {
    const parent=network.map((_,i)=>i);
    const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
    for(let i=0;i<network.length;i++)for(let j=i+1;j<network.length;j++){
      if(overlapSAT(network[i].points,network[j].points)){
        parent[find(i)]=find(j);
      }
    }
    return new Set(network.map((_,i)=>find(i))).size;
  }
  assert.equal(connectedCount(ground),1,'perimeter Ground connectivity incomplete');
  assert.equal(connectedCount(signal),1,'perimeter Signal connectivity incomplete');
  const si=es.filter(e=>e.layer===1);
  const gSi=si.filter(e=>e.name.includes('GROUND'));
  const sSi=si.filter(e=>e.name.includes('SIGNAL'));
  for(const g of gSi)for(const s of sSi) {
    assert.equal(overlapSAT(g.points,s.points),false,
      g.name+' unsupported Si short to '+s.name);
  }
});

test('full 220nm Si has exactly two positive-area connected nets',()=>{
  const layout=buildSwxMaskLayout(),es=layout.elements.filter(e=>e.layer===1);
  const boxes=es.map(e=>e.points.reduce((b,[x,y])=>[
    Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)
  ],[Infinity,Infinity,-Infinity,-Infinity]));
  const parent=es.map((_,i)=>i);
  const find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
  for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++){
    const a=boxes[i],b=boxes[j];
    if(a[0]>=b[2]||b[0]>=a[2]||a[1]>=b[3]||b[1]>=a[3])continue;
    if(overlapSAT(es[i].points,es[j].points))parent[find(i)]=find(j);
  }
  const roots=new Set(es.map((_,i)=>find(i)));
  assert.equal(roots.size,2,
    'Silicon island or undesired short in the full mask (including all 52 SWT teeth)');
  const body=name=>{
    const i=es.findIndex(e=>e.name===name);
    assert.ok(i>=0,name+' absent');
    return find(i);
  };
  const ground=body('PERIMETER_GROUND_UPPER_SUPPORTED_SI'),
    signal=body('PERIMETER_SIGNAL_RIGHT_SUPPORTED_SI');
  assert.notEqual(ground,signal,'Ground and stationary-comb Signal Si must isolate');
  assert.equal(body('SHUTTLE_RAIL_TOP'),ground);
  assert.equal(body('SWX_FIXED_MMI'),ground);
  assert.equal(body('SWX_MOVABLE_MMI'),ground);
  for(const name of ['NORTH_STATIONARY_HANDLE','SOUTH_STATIONARY_HANDLE']){
    assert.equal(body(name),signal,name+' not connected to Signal');
  }
  for(const name of ['SPRING_ANCHOR_-14_N','SPRING_ANCHOR_-14_S',
    'SPRING_ANCHOR_37_N','SPRING_ANCHOR_37_S']){
    assert.equal(body(name),ground,name+' must share grounded mobile/spring Si net');
  }
  for(let i=0;i<26;i++){
    assert.equal(body('SWT_FIXED_'+i),ground);
    assert.equal(body('SWT_MOVABLE_'+i),ground);
  }
});
