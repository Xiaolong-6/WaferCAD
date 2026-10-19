// Hu et al. Nature Communications (2025) 16:331, DOI 10.1038/s41467-024-55528-9
// Source-constrained, intentionally PROVISIONAL parametric OFF-mask geometry.
// The old 2026-10-14 branch is reference only. No original GDS is claimed.
// Positive mask layer 1 retains Si. Layer 2 is reserved for later array ridge links.
// S6 U-bends and S7 aligners included. R1 optical transition still missing.

export function buildSwxMaskLayout() {
  const doi = "10.1038/s41467-024-55528-9";
  const layers = Object.freeze({
    SI_220_KEEP: 1,
    RIDGE_150_ETCH: 2,
    CR_AU_ELECTRODE: 3,
    BOX_RELEASE_GUIDE_NONFAB: 90
  });
  const elements = [];
  const annotations = [];
  const put = (name,layer,part,points,evidence="inferred") => {
    if(points.length<3 || points.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n)))) throw Error("Invalid mask "+name);
    elements.push({kind:"polygon",sourceCell:"SWX_UNIT_MASK_V0",layer,datatype:0,points:points.map(p=>p.map(n=>+n.toFixed(6))),name,part,evidence});
  };
  const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  const path=(pts,w,name,part,layer=1,evidence="inferred")=>{
    for(let i=1;i<pts.length;i++){
      const [a,b]=[pts[i-1],pts[i]], dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
      if(len<.0001)throw Error("Zero-length segment");
      const nx=-dy*w/(2*len),ny=dx*w/(2*len);
      const ext=.5*w/len;
      put(`${name}_${i}`,layer,part,[
        [a[0]-dx*ext+nx,a[1]-dy*ext+ny],
        [b[0]+dx*ext+nx,b[1]+dy*ext+ny],
        [b[0]+dx*ext-nx,b[1]+dy*ext-ny],
        [a[0]-dx*ext-nx,a[1]-dy*ext-ny]
      ],evidence);
    }
  };
  const addRect=(name,layer,part,x,y,w,h,ev="inferred")=>put(name,layer,part,rect(x,y,w,h),ev);
  // Local +Y is the mechanical travel axis (the paper's +Y). Z is out of plane.
  // The OFF tooth-tip gap is 0.900 um. ON is a separate post-release pose, NOT another mask.
  put("SWX_FIXED_MMI",1,"fixed",[
    [-46,0.75],[-34,0.75],[-32.2,3.0],[-47.8,3.0]
  ]);
  put("SWX_MOVABLE_MMI",1,"moving",[
    [-46,-0.75],[-34,-0.75],[-32.2,-3.0],[-47.8,-3.0]
  ]);
  // Two V waveguide halves; terminal placement interpolated from Fig. 1c/3a, not author GDS.
  for(const s of [1,-1]) {
    const part=s>0?"fixed":"moving", c=[-40,s*2.0];
    path([[-60,s*15],[-54,s*13],c],0.4,`OPTICAL_${part}_LEFT`,part);
    path([c,[-26,s*13],[-21,s*15]],0.4,`OPTICAL_${part}_RIGHT`,part);
    // Taper to MMI along both arms: illustrative polygon envelopes.
    put(`TAPER_${part}_LEFT`,1,part,[
      [-52,s*12.15],[-51.65,s*12.5],[-42.7,s*2.4],[-44.5,s*2.4]
    ]);
    put(`TAPER_${part}_RIGHT`,1,part,[
      [-37,s*2.4],[-35.4,s*2.4],[-27.85,s*12.5],[-28.2,s*12.15]
    ]);
  }
  // Flexible waveguides: two true-3um-radius 180-degree bends per side (S6).
  // R1=5um near-reflector transition, actual converter positions and routing
  // remain unverified; do not mistake this drawing for the author's GDS.
  const arc=(cx,cy,r,a,b,n=24)=>Array.from({length:n+1},(_,i)=>{
    const t=a+(b-a)*i/n;return [cx+r*Math.cos(t),cy+r*Math.sin(t)];
  });
  path([
    [-60,-15],[-66,-15],...arc(-66,-18,3,Math.PI/2,3*Math.PI/2).slice(1),
    [-54,-21],...arc(-54,-24,3,Math.PI/2,-Math.PI/2).slice(1),[-69,-27]
  ],.4,"S6_MOVABLE_MEANDER_LEFT","moving",1,
    "R2=3um 180-degree bends, L=15um; inferred XY positions");
  path([
    [-21,-15],[-24,-15],...arc(-24,-18,3,Math.PI/2,3*Math.PI/2).slice(1),
    [-38,-21],...arc(-38,-24,3,Math.PI/2,3*Math.PI/2).slice(1),[-23,-27]
  ],.4,"S6_MOVABLE_MEANDER_RIGHT","moving",1,
    "R2=3um 180-degree bends, L=15um; inferred XY positions");
  // Structural aligner pair (S7). One thin 7um x 0.1um flexure each, with
  // 1um truss ends. The optical facets themselves do not contact.
  for(const [side,x,inset] of [["LEFT",-49,-46],["RIGHT",-31,-34]]){
    path([[x,-3.5],[x,3.5]],.1,`ALIGNER_${side}_BEAM`,"compliant",1,
      "7um x 0.1um source; location inferred");
    path([[x,3.5],[inset,2.65]],1,`ALIGNER_${side}_FIXED_TRUSS`,"compliant",1,
      "1um source width; inferred truss connection");
    path([[x,-3.5],[inset,-2.65]],1,`ALIGNER_${side}_MOBILE_TRUSS`,"compliant",1,
      "1um source width; inferred truss connection");
  }
  // Teeth on two facing in-plane edges: 290 nm pitch, 300 nm lateral depth.
  // Their arbitrary count and starting phase are NOT reported by the paper.
  const toothCount=26, pitch=.290, toothX0=-43.77;
  for(let i=0;i<toothCount;i++){
    const x=toothX0+i*pitch, half=.105;
    put(`SWT_FIXED_${i}`,1,"fixed",[[x-half,.75],[x+half,.75],[x,.45]],"pitch-depth-source;count-phase-inferred");
    put(`SWT_MOVABLE_${i}`,1,"moving",[[x-half,-.75],[x+half,-.75],[x,-.45]],"pitch-depth-source;count-phase-inferred");
  }
  // Explicit stop-pair tips at the reported OFF clearance. Contact under 885 nm
  // actuation defines a 15 nm final gap; lithographic stop profile is not reported.
  for(const [i,x] of [-44.7,-35.0].entries()){
    addRect(`STOP_FIXED_${i}`,1,"fixed",x,.45,.2,.40,"15nm-ON-gap-source;shape-inferred");
    addRect(`STOP_MOVING_${i}`,1,"moving",x,-.85,.2,.40,"15nm-ON-gap-source;shape-inferred");
  }
  // Shuttle, 6 um envelope. Open triangular pockets are formed by rails,
  // crossbars and diagonal braces (not filled solid).
  const beamA=-27,beamB=44,beamHalf=3;
  addRect("SHUTTLE_RAIL_TOP",1,"moving",beamA,2.55,beamB-beamA,.45);
  addRect("SHUTTLE_RAIL_BOTTOM",1,"moving",beamA,-3,beamB-beamA,.45);
  for(let x=beamA;x<=beamB+.0001;x+=4){
    addRect(`SHUTTLE_CROSSBAR_${Math.round(x-beamA)}`,1,"moving",x,-2.55,.45,5.1);
  }
  for(let x=beamA;x<beamB-4;x+=4){
    const flip=(Math.round((x-beamA)/4)%2===0);
    path([[x+.5,flip?-2.5:2.5],[x+3.8,flip?2.5:-2.5]],.45,`SHUTTLE_BRACE_${x}`,"moving");
  }
  // Physical bridging from mobile reflector to shuttle. Top/fixed MMI is isolated.
  path([[-35,-1.2],[-31,-2.2],[-27.2,-2.2]],.65,"MOVING_SWX_TO_SHUTTLE","moving");
  // The reflector gap closes along local +Y, as in the paper. The comb fingers
  // MUST also gain overlap on +Y actuation (not +X). Both banks are axially
  // co-registered in X with 20 opposing finger PAIRS each. Their specific
  // handles and electrical feed geometry are engineering reconstructions.
  const pairsPerBank=20,combPitch=1.6,fingerWidth=.5,firstFingerX=-4;
  for(const bank of ["NORTH","SOUTH"]){
    const north=bank==="NORTH";
    const fBusY=north?17.9:-14.1;
    const mBusY=north?9:-23;
    addRect(`${bank}_MOVING_HANDLE`,1,"moving",-5,mBusY,33,2.9);
    addRect(`${bank}_STATIONARY_HANDLE`,1,"fixed",-5,fBusY,33,6.1);
    for(let i=0;i<pairsPerBank;i++){
      const x=firstFingerX+i*combPitch;
      addRect(`${bank}_FIXED_FINGER_${i}`,1,"fixed",x,north?14.8:-17.2,
        fingerWidth,3.2,
        "3.2um length, 0.5um width, 0.3um side gap; XY placement inferred");
      addRect(`${bank}_MOVING_FINGER_${i}`,1,"moving",x+.8,north?11.8:-20.2,
        fingerWidth,3.2,
        "3.2um length, 0.5um width, 0.3um side gap; XY placement inferred");
    }
    addRect(`${bank}_FIXED_PAD`,1,"fixed",-12,fBusY,7.15,6.1,
      "BOX-supported pad placement inferred");
    addRect(`${bank}_CR_AU`,3,"metal",-11,fBusY+1.1,5,3.9,
      "50nm Cr/300nm Au; pad shape inferred");
  }
  // Upper moving handle ties directly to shuttle. The lower moving comb
  // must detour around its intervening fixed comb bus (no electrical short).
  path([[27.7,10.4],[30,10],[30,2.65]],.75,"NORTH_SHUTTLE_LINK","moving");
  path([[27.7,-21.5],[31,-20],[31,-3.2],[30,-2.65]],.7,
    "SOUTH_SHUTTLE_LINK","moving");
  // Two spring stations straddle the combs along the travel axis. Each station
  // has a top/bottom folded member. Vertical 30/22um runs, 0.2um beam width,
  // 1.5um clearance; exact attachment routing and anchors inferred.
  for(const axialX of [-14,37]){
    for(const sign of [1,-1]){
      const side=sign>0?"N":"S",stem=axialX;
      const S=p=>p.map(([x,y])=>[x,sign*y]);
      const pts=S([
        [stem,2.8],[stem,7.8],[stem-4,7.8],[stem-4,37.8],
        [stem-2.3,37.8],[stem-2.3,15.8],
        [stem-.6,15.8],[stem-.6,41.2]
      ]);
      path(pts,.2,`FOLDED_SPRING_${axialX}_${side}`,"moving");
      addRect(`SPRING_ANCHOR_${axialX}_${side}`,1,"fixed",
        stem-2.6,sign>0?41.2:-49,3.0,7.8,
        "anchor-body-inferred;BOX-support-required");
      annotations.push({kind:"joint",x:stem-.6,y:sign*41.2,
        note:"Compliant spring fixed endpoint: requires connectivity/undercut check"});
    }
  }

  // Contact pad topology from Fig. 1c: the outer two metal lands are SIGNAL
  // and GROUND, NOT one shared electrode. The reported material is Cr 50nm
  // + Au 300nm. Absolute pad size/placement and lead paths are NOT disclosed.
  // These polygons are therefore provisional electrical-access Mask context.
  const pads={
    groundSupport:[72,65,24,23], signalSupport:[72,-88,24,23],
    groundAuCr:[75,68,18,17], signalAuCr:[75,-85,18,17],
    siRouteWidth:1.2, electrodeRouteWidth:.6
  };
  const inferredSi="Fig.1c electrical net inferred; must retain BOX under pad/lead";
  const inferredMetal="Cr=50nm Au=300nm (Methods); XY/width inferred from Fig.1c";
  addRect("GROUND_PAD_BOX_SUPPORTED_SI",1,"fixed",...pads.groundSupport,inferredSi);
  addRect("SIGNAL_PAD_BOX_SUPPORTED_SI",1,"fixed",...pads.signalSupport,inferredSi);
  // Place the GND return outside the suspended Si envelope. Only the
  // two left-side spring anchors are linked at this stage. The right
  // two spring-anchor GND links remain open design requirements.
  const gndRoutes=[
    [[78,69],[78,62],[-81,62],[-81,-62],[-15,-62]],
    [[-15,62],[-15,48]],
    [[-15,-62],[-15,-48]]
  ];
  for(let i=0;i<gndRoutes.length;i++){
    path(gndRoutes[i],pads.siRouteWidth,`GROUND_SI_ROUTE_${i}`,"fixed",1,inferredSi);
    path(gndRoutes[i],pads.electrodeRouteWidth,`GROUND_METAL_ROUTE_${i}`,"metal",3,inferredMetal);
  }
  // Signal drives both stationary comb buses while avoiding the moving
  // shuttle/springs and remaining electrically separate from GND.
  const sigRoutes=[
    [[-9,21],[-9,55],[58,55],[58,-55],[78,-55],[78,-69]],
    [[-9,-11],[-9,-55],[58,-55]]
  ];
  for(let i=0;i<sigRoutes.length;i++){
    path(sigRoutes[i],pads.siRouteWidth,`SIGNAL_SI_ROUTE_${i}`,"fixed",1,inferredSi);
    path(sigRoutes[i],pads.electrodeRouteWidth,`SIGNAL_METAL_ROUTE_${i}`,"metal",3,inferredMetal);
  }
  addRect("GROUND_METAL_PAD",3,"metal",...pads.groundAuCr,inferredMetal);
  addRect("SIGNAL_METAL_PAD",3,"metal",...pads.signalAuCr,inferredMetal);
  // Broad yellow Fig.1c perimeter is TWO independently patterned electrode
  // regions on BOX-supported Si, not one continuous yellow metal film.
  // Dimensions/contours are engineering inferences; paper names Ground and
  // Signal pads but does not publish lithographic boundaries or pad XY size.
  // GROUND: top, left and bottom-left frame. SIGNAL: right/lower panel.
  // Preserve an insulating slot between both metal AND Si supported regions.
  const broadPads=[
    {id:"GROUND_UPPER",net:"GROUND",si:[-92,60,204,37],metal:[-91,61,201,35]},
    {id:"GROUND_LEFT",net:"GROUND",si:[-92,-95,14,192],metal:[-91,-94,12,190]},
    {id:"GROUND_LOWER",net:"GROUND",si:[-92,-95,79,31],metal:[-91,-94,77,29]},
    {id:"SIGNAL_RIGHT",net:"SIGNAL",si:[57,-92,50,149],metal:[58,-90,47,146]}
  ];
  for(const pad of broadPads){
    addRect(`PERIMETER_${pad.id}_SUPPORTED_SI`,1,"fixed",...pad.si,
      "BOX-supported peripheral Si contact foundation; bounds inferred Fig.1c");
    addRect(`PERIMETER_${pad.id}_CR_AU`,3,"metal",...pad.metal,
      "Fig.1c yellow field represents distinct pads; Cr50/Au300 source, XY inferred");
  }
  annotations.push({kind:"pad-isolation",netA:"GROUND",netB:"SIGNAL",
    note:"Upper metal gap nominal 5um, Si gap 3um: both INFERRED, not paper dimensions"});
  // Ridge 150nm process is confined to array shuffles; no fabricated array
  // routing is asserted here. Layer 2 intentionally empty in this unit mask.
  annotations.push({kind:"source",x:-40,y:0,note:"Fig.1c/3a & Supp. Figs S2,S6-S9"});
  const required=["SI_220_KEEP","RIDGE_150_ETCH","CR_AU_ELECTRODE"];
  const fingerFixed=elements.filter(e=>/_FIXED_FINGER_/.test(e.name));
  const fingerMoving=elements.filter(e=>/_MOVING_FINGER_/.test(e.name));
  if(fingerFixed.length!==40||fingerMoving.length!==40)throw Error("40 comb pairs not formed");
  if(toothCount*pitch>8)throw Error("SWT facet overflow");
  const bounds=elements.reduce((b,e)=>{
    for(const [x,y] of e.points){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}
    return b;
  },[Infinity,Infinity,-Infinity,-Infinity]);
  return {
    name:"Hu 2025 SWX / first-pass OFF-state mask blueprint (not author GDS)",
    root:"SWX_UNIT_MASK_V0",
    units:{xy:"µm",dbuToMicron:1,hasPhysicalUnits:true},
    layoutStatus:"DRAFT_REQUIRES_SCIENCE_AND_CHROMIUM_ACCEPTANCE",
    paper:{doi,figureBasis:["Fig. 1c","Fig. 3a-b","Supplementary Figs. S2","S6","S7","S8","S9"]},
    masks:required.map(name=>({name,layer:layers[name],polarity:name==="SI_220_KEEP"?"positive-silicon-retain":name==="RIDGE_150_ETCH"?"openings-to-etch-150nm":"Cr50-Au300-liftoff"})),
    parametersUm:{topSi:.220,box:2,ridgeEtch:.150,fullEtch:.220,
      swxFootprint:[23,23],offToothTipGap:.900,onGap:.015,actuatorTravel:.885,
      swtPeriod:pitch,swtLateralDepth:.300,
      combFingerLength:3.2,combFingerWidth:.5,combLateralClearance:.3,combOffOverlap:.2,
      combPairsPerBank:pairsPerBank,foldedBeamWidth:.2,foldedLong:30,foldedShort:22},
    elements,annotations,
    combos:required.map(name=>({key:`SWX_UNIT_MASK_V0|${layers[name]}|0`,cell:"SWX_UNIT_MASK_V0",layer:layers[name],datatype:0,
      count:elements.filter(e=>e.layer===layers[name]).length})),
    bounds:{minX:bounds[0],minY:bounds[1],maxX:bounds[2],maxY:bounds[3],
      width:bounds[2]-bounds[0],height:bounds[3]-bounds[1]},
    statusChecks:{
      nominalOFFGapUm:.900,
      inferredONTranslationUm:.885,
      inferredONGapUm:.015,
      combCellPairs:40,axialCombRegistration:true,springStations:[-14,37],
      peripheralPadNets:["GROUND","SIGNAL"],
      peripheralPadFootprint:"four large-area perimeter polygons inferred from Fig.1c; NOT author GDS",
      broadPadMetalCount:4,perimeterPadIsolationUpperUm:5,
      broadPadMaterial:"Cr 50nm / Au 300nm on BOX-supported Si",
      groundAnchorConnections:"2 of 4 spring anchors routed; other 2 require topology redesign",
      lithographicUnknowns:"SWT count/phase; waveguide contour; pad boundaries; actual release undercut; exact full-unit footprint",
      boxRelease:"not generated as a photomask; requires selective HF undercut Kernel stage",
      realBrowserVerified:false,mechanicalFEMVerified:false,authorGdsMatched:false
    }
  };
}

export function renderSwxMaskSvg(layout){
  const [w,h]=[1500,1120];
  // Fit the complete mask, including external electrical pads; no clipping.
  const b=layout.bounds;
  const sx=Math.min(1320/Math.max(1,b.width),850/Math.max(1,b.height));
  const originX=750-sx*(b.minX+b.maxX)/2,
        originY=565+sx*(b.minY+b.maxY)/2;
  const plot=([x,y])=>[+(originX+x*sx).toFixed(2),+(originY-y*sx).toFixed(2)];
  const fillBy={fixed:"#5689C6",moving:"#0D9488",compliant:"#8B69B3",metal:"#E5A33D"};
  const title="SWX 2x2 MEMS / source-constrained MASK DRAFT";
  const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
  const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">`,
    `<rect width="100%" height="100%" fill="#F8FAFC"/>`,
    `<text x="64" y="53" fill="#10253B" font-size="30" font-family="sans-serif" font-weight="bold">${title}</text>`,
    `<text x="64" y="83" fill="#52657B" font-size="17" font-family="sans-serif">Local Y is paper +Y actuation direction · coordinates in µm · OFF state mask, no post-release deformation</text>`,
    `<rect x="50" y="109" width="1400" height="921" fill="#FFFFFF" stroke="#CBD5E1" rx="14"/>`,
    `<g stroke="#E2E8F0" stroke-width=".6">`];
  for(let x=-60;x<=50;x+=10) {
    const [px]=plot([x,0]);out.push(`<line x1="${px}" y1="117" x2="${px}" y2="1028"/>`);
    out.push(`<text x="${px+3}" y="1023" font-size="10" fill="#8091A7" stroke="none">${x}</text>`);
  }
  for(let y=-50;y<=50;y+=10){
    const [,py]=plot([0,y]);out.push(`<line x1="55" y1="${py}" x2="1440" y2="${py}"/>`);
  }
  out.push(`</g><g fill-opacity=".77" stroke-opacity=".8" stroke-linejoin="round" stroke-width=".65">`);
  const ord={fixed:0,moving:1,compliant:2,metal:3};
  for(const e of [...layout.elements].sort((a,b)=>(ord[a.part]??10)-(ord[b.part]??10))){
    const pts=e.points.map(p=>plot(p).join(",")).join(" ");
    out.push(`<polygon points="${pts}" fill="${fillBy[e.part]||"#888"}" stroke="${fillBy[e.part]||"#888"}"><title>${esc(e.name)} · ${esc(e.evidence)}</title></polygon>`);
  }
  out.push(`</g>`);
  const [cx,cy]=plot([-40,0]);out.push(`<circle cx="${cx}" cy="${cy}" r="${(12.5*sx).toFixed(2)}" fill="none" stroke="#BE4A3A" stroke-width="2.2" stroke-dasharray="9,7"/>`);
  out.push(`<text x="93" y="1062" font-family="sans-serif" font-size="15" fill="#334155">Blue: supported/fixed Si · Green: movable Si · Purple: aligners · Gold: Signal/Ground Cr/Au</text>`);
  out.push(`<text x="93" y="1090" font-family="sans-serif" font-size="14" fill="#B45309">Scientific status: geometry proposal, NOT author GDS, NOT fabricated-mask verified, NOT native WaferCAD Chromium acceptance</text>`);
  out.push(`</svg>`);
  return out.join("\n");
}
