/**
 * Hu et al., Nature Communications 16, 331 (2025), DOI 10.1038/s41467-024-55528-9
 * FIRST PASS: Fig. S8a TOP-VIEW TOPOLOGY, read together with Fig. 1c and S6/S7/S9.
 * In physical µm, X transverse / Y actuation. Inferred XY routing is never author GDS.
 * This replaces, rather than tweaks, the rejected ring/stacked-comb mask concept.
 * Stage 1: 220nm Si only. Cr/Au, BOX release and any conformal shared contour deferred.
 */
export const SWX_S8_PROVENANCE = Object.freeze({
  source: 'main Fig1c, supplemental S6-S9; topology prioritized from S8a top view',
  dimensionsFromPaperUm: {
    silicon: 0.22,box:2,shuttleWidth:6,offAirGap:.9,onAirGap:.015,
    swtPeriod:.290,swtDepth:.300,combFingerLength:3.2,
    combFingerWidth:.5,combLateralGap:.3,
    springLong:30,springShort:22,springBeam:.2,springGap:1.5,
    meanderWidth:.4,meanderR1:5,meanderR2:3,meanderStraight:15,
    structuralAlignerLength:7,structuralAlignerWidth:.1
  },
  inferred: ['all global XY coordinates','teeth count and starting phase',
    'spring station separation','comb-to-shuttle link locations',
    'optical taper contour','individual release holes','pad metal boundaries'],
  excludedUntilSiliconVisualAcceptance: [
    'large yellow perimeter as Au','conformal deposited CrAu','BOX cavity undercut',
    '64x64 full Benes array','claimed author-equivalent 95x100um mask']
});

export function buildSwxS8SiliconMask(){
  const elements=[], parts=new Set(['rigidOptical','movableOptical','shuttle','spring','fixedComb','movableComb','anchor','aligner']);
  const add=(name,part,points,evidence='inferred FigS8a')=>{
    if(!parts.has(part)||points.length<3||points.some(q=>q.length!==2||q.some(x=>!Number.isFinite(x))))throw Error('Invalid SWX polygon '+name);
    elements.push({name,part,kind:'polygon',layer:1,datatype:0,
      points:points.map(p=>p.map(v=>Math.round(v*1e6)/1e6)),evidence});
  };
  const rect=(name,part,x,y,w,h,evidence)=>{
    if(!(w>0&&h>0))throw Error('Non-positive rectangle '+name);
    add(name,part,[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],evidence);
  };
  const route=(name,part,points,width,evidence='FigS8a topology; XY inferred')=>{
    for(let i=1;i<points.length;i++){
      const p=points[i-1],q=points[i],dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy);
      if(length<1e-7)throw Error('Zero segment '+name);
      const nx=-dy*width/(2*length),ny=dx*width/(2*length);
      // Ends overlap by 0.5 width for finite-area connectivity.
      const e=.5*width/length;
      add(name+'_'+i,part,[[p[0]-e*dx+nx,p[1]-e*dy+ny],
        [q[0]+e*dx+nx,q[1]+e*dy+ny],
        [q[0]+e*dx-nx,q[1]+e*dy-ny],
        [p[0]-e*dx-nx,p[1]-e*dy-ny]],evidence);
    }
  };
  const arc=(cx,cy,r,a,b,n=20)=>Array.from({length:n+1},(_,i)=>{
    const t=a+(b-a)*i/n;return [cx+r*Math.cos(t),cy+r*Math.sin(t)];
  });

  // Fig S8a: stationary upper V, moving lower V, y-oriented aperture.
  // Tooth tips have 900nm air clearance in OFF; no second fabricated ON mask.
  add('SWX_FIXED_HALF','rigidOptical',
    [[-4,38.3],[4,38.3],[7,40],[0,45],[-7,40]],
    'Fig1a/S8a stationary reflector; apex and XY inferred');
  add('SWX_MOVABLE_HALF','movableOptical',
    [[-4,36.8],[4,36.8],[7,34], [0,29],[-7,34]],
    'FigS6a/S8a moving reflector; apex and XY inferred');
  // Source-defined tooth period/depth, unknown tooth count/phase.
  for(let i=0;i<23;i++){
    const x=(i-11)*.290;
    add('SWT_FIXED_'+i,'rigidOptical',[[x-.10,38.31],[x+.10,38.31],[x,38]],
      '290nm period, 300nm lateral tooth depth; 23 teeth inferred');
    add('SWT_MOVING_'+i,'movableOptical',[[x-.10,36.79],[x+.10,36.79],[x,37.1]],
      '290nm period, 300nm lateral tooth depth; 23 teeth inferred');
  }
  for(const side of [-1,1]){
    const label=side<0?'L':'R';
    // Stationary half is rigidly supported by two straight optical arms.
    route('FIXED_WAVEGUIDE_'+label,'rigidOptical',
      [[side*5.2,40],[side*15,49],[side*21,52]],.4,
      'Fig1c: fixed reflector supported by rigid triangle of optical leads');
    // Fig S6a: movable reflector feeds two compliant optical U-turn paths.
    route('MOVING_V_ARM_'+label,'movableOptical',
      [[side*5.2,34.3],[side*14.2,24],[side*19,20]],.4,
      'Moving reflector rigid shoulder to optical meander');
    const sample1=side<0?arc(-22,17,3,Math.PI/2,3*Math.PI/2):arc(22,17,3,Math.PI/2,-Math.PI/2);
    const sample2=side<0?arc(-33,11,3,Math.PI/2,-Math.PI/2):arc(33,11,3,Math.PI/2,3*Math.PI/2);
    const points=[[side*19,20],[side*22,20],...sample1.slice(1),
      [side*33,14],...sample2.slice(1),[side*41,8]];
    route('S6_MEANDER_'+label,'movableOptical',points,.4,
      'R2=3um turns source; first R1=5um converter shape still inferred');
    rect('OPTICAL_ANCHOR_'+label,'anchor',side<0?-45:40,6,5,4,
      'Inferred fixed optical endpoint; BOX support later');
  }
  // Mechanically compliant lateral aligners link both reflector halves.
  for(const side of [-1,1]){
    const label=side<0?'L':'R',x=side*6.3;
    route('ALIGNER_'+label,'aligner',[[x,40.1],[x+side*1.0,39.3],
      [x+side*1.0,35.8],[x,34.4]],.1,'S7: flexure width 100nm, 7um length');
  }

  // S8a: LONGITUDINAL PERFORATED SHUTTLE down the center, width 6um.
  rect('SHUTTLE_LEFT_RAIL','shuttle',-3, -44,.55,78);
  rect('SHUTTLE_RIGHT_RAIL','shuttle',2.45,-44,.55,78);
  for(let y=-43;y<=31;y+=5){
    rect('SHUTTLE_BRIDGE_'+y,'shuttle',-2.75,y,5.5,.5);
    route('SHUTTLE_X_BRACE_'+y,'shuttle',[[ -2.5,y+.2],[2.5,y+4.6]],.45,
      'Fig1c/S8a perforated shuttle: diagonal bracing with open triangular holes');
  }
  route('REFLECTOR_TO_SHUTTLE','shuttle',[[0,30],[0,35.1]],1.2,
    'Moving reflector only; stationary tooth surface not connected');
  // Two spring stations, BEFORE and AFTER the single paired comb actuator.
  // Four lateral folded spring members link mobile shuttle to anchored frame.
  for(const station of [2,-41]){
    for(const side of [-1,1]){
      const label=side<0?'L':'R',mirror=x=>side*x;
      const pos=[[mirror(2.9),station],[mirror(34),station],
        [mirror(34),station-1.7],[mirror(12),station-1.7],
        [mirror(12),station-3.4],[mirror(39),station-3.4]];
      route('FOLDED_'+station+'_'+label,'spring',pos,.2,
        'S7: 30/22um members, 0.2um beam, 1.5um clearance; global XY inferred');
      rect('SPRING_ANCHOR_'+station+'_'+label,'anchor',
        side<0?-43:38.5,station-5,4.5,4.5,
        'FigS8a: outboard fixed spring anchor, needs BOX retained');
      route('SHUTTLE_SPRING_JOINT_'+station+'_'+label,'spring',
        [[mirror(2.5),station],[mirror(4),station]],1.0);
    }
  }

  // Fig S8a/S9: ONE actuator station; LEFT and RIGHT mirrored interdigitated
  // comb banks on opposite sides of the central shuttle, between springs.
  // +Y translation INCREASES overlap; 20 sites per bank = 40 total.
  const period=1.55;
  for(const side of [-1,1]){
    const label=side<0?'L':'R', x0=side<0?-39:8;
    const xs=i=>x0+i*period;
    rect('MOVING_COMB_HANDLE_'+label,'movableComb',x0-.3,-23.8,30.8,1.7);
    rect('FIXED_COMB_HANDLE_'+label,'fixedComb',x0-.3,-16.7,30.8,1.7);
    for(let i=0;i<20;i++){
      const x=xs(i);
      rect('MOVING_FINGER_'+label+'_'+i,'movableComb',x+.8,-22.4,.5,3.2,
        '3.2x0.5um; 300nm lateral gap from stationary finger');
      rect('FIXED_FINGER_'+label+'_'+i,'fixedComb',x,-19.4,.5,3.2,
        '3.2x0.5um; 300nm lateral gap, +Y increased overlap');
    }
    // Each mobile handle is mechanically attached to the shuttle at y=-23.
    route('COMB_TO_SHUTTLE_'+label,'movableComb',
      [[side*3,-23],[side*8,-23]],1.2);
    // Fixed bus continues towards independent supported silicon at the edge.
    route('FIXED_COMB_TO_PAD_'+label,'fixedComb',
      [[side*38,-14.7],[side*43,-14.7]],1.5);
    rect('FIXED_COMB_PAD_'+label,'fixedComb',side<0?-46:41.5,-16.5,4.5,4,
      'Stationary signal pads; placement inferred, NOT large yellow background');
  }

  const bounds=elements.reduce((r,e)=>{
    for(const p of e.points)r=[Math.min(r[0],p[0]),Math.min(r[1],p[1]),
      Math.max(r[2],p[0]),Math.max(r[3],p[1])];return r;
  },[Infinity,Infinity,-Infinity,-Infinity]);
  return {
    root:'SWX_S8_SILICON_P0',name:'SWX single-cell Fig S8a primary-silicon reconstruction',
    units:{xy:'µm',dbuToMicron:1,hasPhysicalUnits:true},
    stage:'P0_SILICON_ONLY__REQUIRES_REAL_BROWSER_PAPER_COMPARISON',
    contours:{outerYellowMetal:null,release: null},
    masks:[{name:'TOP_SI_KEEP_220NM',layer:1,datatype:0}],
    elements,bounds:{minX:bounds[0],minY:bounds[1],maxX:bounds[2],maxY:bounds[3],
      width:bounds[2]-bounds[0],height:bounds[3]-bounds[1]},
    provenance:SWX_S8_PROVENANCE,
    expectedTopology:{shuttleOrientation:'longitudinal_Y',
      combBanks:['LEFT','RIGHT'],combStations:1,
      springStations:[2,-41],opticalFront:'positive_Y',
      deferred:['BOX release','Cr/Au metallurgy','yellow perimeter']},
  };
}
