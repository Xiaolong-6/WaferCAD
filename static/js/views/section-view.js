import {$,formatDisplayNumber,persistSharedState,state,status} from '../core.js';
import {linePolyIntervals} from '../geometry.js';
import {createLayerMappingContext,displayZ,layerVisual,mappedCutBounds,mappedDopingBounds,mappedSolidBounds,solidLayerDescriptors} from '../layer-model.js';
import {clearSvg,makeSvg} from '../svg.js';

export function createSectionView({getSubstrateSlabs,ensureSubstrateSlabs}){
  let sectionPan=null,sectionScale=1,sectionTx=0,sectionTy=0,bound=false;
  const qa=new URLSearchParams(location.search).get('qa')||'',debugEnabled=qa.includes('section-view');
  const debug=debugEnabled?(state._sectionViewDebug||(state._sectionViewDebug={instances:0,binds:0,controlChanges:0})):null;
  if(debug)debug.instances++;

  function defaultBreak(wafer=state.wafer,enabled=true){
    const thickness=Number(wafer?.thickness)||0,edge=Math.min(5,thickness*.1);
    return {enabled:enabled&&thickness>edge*2+1,mode:'surfaces',frontKeep:edge,backKeep:edge,from:-thickness+edge,to:-edge};
  }
  function solidEntries(a,b,layerDescriptors,mappingContext){const entries=[];for(const solid of state.solids){const intervals=linePolyIntervals(a,b,solid.footprint);if(intervals.length)entries.push({solid,intervals,mapped:mappedSolidBounds(solid,layerDescriptors,mappingContext)});}return entries;}
  function dopingEntries(a,b,layerDescriptors,mappingContext){const entries=[];for(const doping of state.dopings){const intervals=linePolyIntervals(a,b,doping.footprint);if(intervals.length)entries.push({doping,intervals,mapped:mappedDopingBounds(doping,layerDescriptors,mappingContext)});}return entries;}
  function debugEntries(){if(!state.wafer||!state.slice)return {solids:[],dopings:[]};const {a,b}=state.slice,layerDescriptors=solidLayerDescriptors(),mappingContext=createLayerMappingContext();return {solids:solidEntries(a,b,layerDescriptors,mappingContext).map(({solid,intervals,mapped})=>({id:solid.id,layerId:solid.layerId,physical:{min:Number(solid.zMin),max:Number(solid.zMax)},mapped:{min:mapped.zMin,max:mapped.zMax},intervals})),dopings:dopingEntries(a,b,layerDescriptors,mappingContext).map(({doping,intervals,mapped})=>({id:doping.id,layerId:doping.layerId,physical:{min:Number(doping.zMin),max:Number(doping.zMax)},mapped:{min:mapped.zMin,max:mapped.zMax},intervals}))};}
  function physicalEnvelope(localSolidEntries=null){
    if(!state.wafer||!state.slice)return null;
    const {a,b}=state.slice;let top=-Infinity,bottom=Infinity;
    const slabs=getSubstrateSlabs();
    if(slabs)for(const slab of slabs){if(slab.isEmpty)continue;if(slab.remainingRegions.some(region=>linePolyIntervals(a,b,region).length)){top=Math.max(top,slab.zMax);bottom=Math.min(bottom,slab.zMin);}}
    if(localSolidEntries){for(const {solid} of localSolidEntries){top=Math.max(top,Number(solid.zMax));bottom=Math.min(bottom,Number(solid.zMin));}}
    else for(const solid of state.solids)if(linePolyIntervals(a,b,solid.footprint).length){top=Math.max(top,Number(solid.zMax));bottom=Math.min(bottom,Number(solid.zMin));}
    const envelope=Number.isFinite(top)&&Number.isFinite(bottom)&&top>bottom?{top,bottom,thickness:top-bottom}:null;
    state._sectionEnvelope=envelope;
    return envelope;
  }
  function activeBreak(envelope=physicalEnvelope()){
    const config=state.sectionBreak;
    if(!state.wafer||config?.enabled!==true)return null;
    let from=Number(config.from),to=Number(config.to);
    if(config.mode!=='coordinates'){
      const frontKeep=Number(config.frontKeep),backKeep=Number(config.backKeep);
      if(!envelope||!Number.isFinite(frontKeep)||!Number.isFinite(backKeep)||frontKeep<0||backKeep<0||frontKeep+backKeep>=envelope.thickness)return null;
      from=envelope.bottom+backKeep;to=envelope.top-frontKeep;config.from=from;config.to=to;
    }else if(!envelope||!Number.isFinite(from)||!Number.isFinite(to)||from>=to||from<=envelope.bottom||to>=envelope.top)return null;
    if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to)return null;
    return {from,to};
  }
  function render(){
    const svg=$('sectionSvg');clearSvg(svg);$('sectionMeta').textContent='';
    if(!state.wafer||!state.slice)return;
    const a=state.slice.a,b=state.slice.b,back=state.activeFace==='back',layerDescriptors=solidLayerDescriptors(),mappingContext=createLayerMappingContext(),solids=solidEntries(a,b,layerDescriptors,mappingContext),dopings=dopingEntries(a,b,layerDescriptors,mappingContext),envelope=physicalEnvelope(solids);
    const rawMin=Math.min(envelope?displayZ(envelope.bottom):displayZ(-state.wafer.thickness),...solids.map(entry=>entry.mapped.zMin),...dopings.map(entry=>entry.mapped.zMin)),rawMax=Math.max(envelope?displayZ(envelope.top):displayZ(0),...solids.map(entry=>entry.mapped.zMax),...dopings.map(entry=>entry.mapped.zMax));
    state._sectionViewport={rawMin,rawMax,solidCount:solids.length,dopingCount:dopings.length};
    const sectionBreak=activeBreak(envelope),breakLow=sectionBreak?displayZ(sectionBreak.from):null,breakHigh=sectionBreak?displayZ(sectionBreak.to):null,removedSpan=sectionBreak?breakHigh-breakLow:0,keptSpan=Math.max(rawMax-rawMin-removedSpan,1e-9),breakGap=sectionBreak?Math.max(keptSpan*.14,(rawMax-rawMin)*.012):0;
    const sectionCoordinate=z=>!sectionBreak||z<=breakLow?z:z>=breakHigh?z-removedSpan+breakGap:breakLow+(z-breakLow)/removedSpan*breakGap;
    const compressedMin=sectionCoordinate(rawMin),compressedMax=sectionCoordinate(rawMax),pad=(compressedMax-compressedMin)*.04+.02,yMin=compressedMin-pad,yMax=compressedMax+pad,mapX=t=>back?555-t*510:45+t*510,mapDisplayY=z=>{const compressed=sectionCoordinate(z);return back?12+(compressed-yMin)/(yMax-yMin)*296:308-(compressed-yMin)/(yMax-yMin)*296;},rectX=(t0,t1)=>{const x0=mapX(t0),x1=mapX(t1);return {x:Math.min(x0,x1),width:Math.abs(x1-x0)};},rectY=(z0,z1)=>{const y0=mapDisplayY(z0),y1=mapDisplayY(z1);return {y:Math.min(y0,y1),height:Math.abs(y1-y0)};};
    const content=makeSvg('g',{id:'sectionContent',transform:`translate(${sectionTx},${sectionTy}) scale(${sectionScale})`});
    content.appendChild(makeSvg('line',{x1:45,y1:mapDisplayY(0),x2:555,y2:mapDisplayY(0),stroke:'#b6bbc2','stroke-width':'1'}));
    const substrateSlabs=getSubstrateSlabs();
    if(substrateSlabs){for(const slab of substrateSlabs){if(slab.isEmpty)continue;const mapped=mappedCutBounds(slab.zMin,slab.zMax);for(const region of slab.remainingRegions)for(const [t0,t1] of linePolyIntervals(a,b,region)){const xr=rectX(t0,t1),yr=rectY(mapped.zMin,mapped.zMax);content.appendChild(makeSvg('rect',{...xr,...yr,fill:layerVisual('substrate').color,stroke:'#6b7280','data-layer-id':'substrate','data-substrate-slab':`${slab.zMin}|${slab.zMax}`}));}}}
    else void ensureSubstrateSlabs();
    for(const cut of state.cuts)for(const [t0,t1] of linePolyIntervals(a,b,cut.footprint)){const xr=rectX(t0,t1),yr=(()=>{const bounds=mappedCutBounds(cut.zMin,cut.zMax);return rectY(bounds.zMin,bounds.zMax);})();content.appendChild(makeSvg('rect',{...xr,...yr,fill:'#fbfbfc',stroke:'#9ca3af','stroke-dasharray':'3 2'}));}
    for(const {solid,intervals,mapped} of solids)for(const [t0,t1] of intervals){const xr=rectX(t0,t1),yr=rectY(mapped.zMin,mapped.zMax);content.appendChild(makeSvg('rect',{...xr,...yr,fill:layerVisual(solid.layerId).color,stroke:'#4b5563','data-layer-id':solid.layerId}));}
    const defs=makeSvg('defs');content.appendChild(defs);
    for(const {doping,intervals,mapped} of dopings){const color=layerVisual(doping.layerId).color,gradientId=`gradient_${doping.layerId}`,highAtTop=(doping.position==='upper')!==back,gradient=makeSvg('linearGradient',{id:gradientId,x1:'0%',x2:'0%',y1:highAtTop?'100%':'0%',y2:highAtTop?'0%':'100%'});gradient.append(makeSvg('stop',{offset:'0%','stop-color':color,'stop-opacity':'0.08'}),makeSvg('stop',{offset:'100%','stop-color':color,'stop-opacity':'0.9'}));defs.appendChild(gradient);for(const [t0,t1] of intervals){const xr=rectX(t0,t1),yr=rectY(mapped.zMin,mapped.zMax);content.appendChild(makeSvg('rect',{...xr,...yr,fill:`url(#${gradientId})`,stroke:color,'stroke-opacity':'.65','data-layer-id':doping.layerId,'data-doping':'true'}));}}
    if(sectionBreak){
      const y0=mapDisplayY(breakLow),y1=mapDisplayY(breakHigh),top=Math.min(y0,y1),height=Math.abs(y1-y0),mid=top+height/2;
      content.appendChild(makeSvg('rect',{x:42,y:top-1,width:516,height:height+2,fill:'#f8fafc','data-section-break':'true'}));
      const breakLine=y=>`M42 ${y} H178 l7 -3 l7 6 l7 -6 l7 3 H558`;
      content.append(makeSvg('path',{d:breakLine(top+1),fill:'none',stroke:'#94a3b8','stroke-width':'1'}),makeSvg('path',{d:breakLine(top+height-1),fill:'none',stroke:'#94a3b8','stroke-width':'1'}));
      const label=makeSvg('text',{x:300,y:mid+3,'text-anchor':'middle','font-size':'8',fill:'#64748b'});label.textContent=`Z ${formatDisplayNumber(sectionBreak.from)} … ${formatDisplayNumber(sectionBreak.to)} µm hidden`;content.appendChild(label);
    }
    const labelY=back?17:310,ta=makeSvg('text',{x:back?558:35,y:labelY,'font-size':'12','font-weight':'700'});ta.textContent='A';content.appendChild(ta);const tb=makeSvg('text',{x:back?35:558,y:labelY,'font-size':'12','font-weight':'700'});tb.textContent='B';content.appendChild(tb);
    svg.appendChild(content);
    const len=Math.hypot(b.x-a.x,b.y-a.y),breakMeta=sectionBreak?` · Z break ${(sectionBreak.to-sectionBreak.from).toFixed(1)} µm`:'',mappingMeta=state.zMapping==='relative'?'relative thickness':'physical Z';$('sectionMeta').textContent=`${(len/1000).toFixed(2)} mm line${breakMeta} · ${back?'backside flipped · ':''}${mappingMeta}`;
  }
  function syncControls(){
    const config=state.sectionBreak||defaultBreak(state.wafer,false),enabled=config.enabled===true,mode=config.mode==='coordinates'?'coordinates':'surfaces',frontKeep=Number.isFinite(Number(config.frontKeep))?Number(config.frontKeep):5,backKeep=Number.isFinite(Number(config.backKeep))?Number(config.backKeep):5,envelope=mode==='surfaces'?physicalEnvelope():null;
    if(envelope&&frontKeep>=0&&backKeep>=0&&frontKeep+backKeep<envelope.thickness){config.from=envelope.bottom+backKeep;config.to=envelope.top-frontKeep;}
    const from=Number(config.from)||0,to=Number(config.to)||0;
    if($('sectionBreakEnabled'))$('sectionBreakEnabled').checked=enabled;
    if($('sectionBreakControls'))$('sectionBreakControls').classList.toggle('hidden',!enabled);
    if($('sectionBreakMode'))$('sectionBreakMode').value=mode;
    if($('sectionBreakSurfaceFields'))$('sectionBreakSurfaceFields').classList.toggle('hidden',mode!=='surfaces');
    if($('sectionBreakCoordinateFields'))$('sectionBreakCoordinateFields').classList.toggle('hidden',mode!=='coordinates');
    if($('sectionBreakFrontKeep'))$('sectionBreakFrontKeep').value=formatDisplayNumber(frontKeep);
    if($('sectionBreakBackKeep'))$('sectionBreakBackKeep').value=formatDisplayNumber(backKeep);
    if($('sectionBreakFrom'))$('sectionBreakFrom').value=formatDisplayNumber(from);
    if($('sectionBreakTo'))$('sectionBreakTo').value=formatDisplayNumber(to);
  }
  function applyControls(){
    if(!state.wafer)return;
    const mode=$('sectionBreakMode').value==='coordinates'?'coordinates':'surfaces',envelope=physicalEnvelope();
    let from,to,frontKeep,backKeep;
    if(mode==='surfaces'){
      frontKeep=Number($('sectionBreakFrontKeep').value);backKeep=Number($('sectionBreakBackKeep').value);
      if(!envelope){status('The current A–B line does not intersect a physical material envelope.');syncControls();return;}
      if(!Number.isFinite(frontKeep)||!Number.isFinite(backKeep)||frontKeep<0||backKeep<0||frontKeep+backKeep>=envelope.thickness){status(`Front + back retained thickness must be less than the current A–B material thickness of ${formatDisplayNumber(envelope.thickness)} µm.`);syncControls();return;}
      from=envelope.bottom+backKeep;to=envelope.top-frontKeep;
    }else{
      from=Number($('sectionBreakFrom').value);to=Number($('sectionBreakTo').value);
      if(!envelope){status('The current A–B line does not intersect a physical material envelope.');syncControls();return;}
      if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to||from<=envelope.bottom||to>=envelope.top){status(`Z break must satisfy ${formatDisplayNumber(envelope.bottom)} < start < end < ${formatDisplayNumber(envelope.top)} µm for the current A–B material envelope.`);syncControls();return;}
      frontKeep=envelope.top-to;backKeep=from-envelope.bottom;
    }
    state.sectionBreak={enabled:true,mode,frontKeep,backKeep,from,to};syncControls();render();persistSharedState('section-z-break');status(mode==='surfaces'?`Cross section keeps ${formatDisplayNumber(frontKeep)} µm at the front and ${formatDisplayNumber(backKeep)} µm at the back.`:`Cross section skips Z ${formatDisplayNumber(from)} to ${formatDisplayNumber(to)} µm.`);
  }
  function resetNavigation(){sectionPan=null;sectionScale=1;sectionTx=0;sectionTy=0;const content=$('sectionContent');if(content)content.setAttribute('transform','translate(0,0) scale(1)');}
  function bind(){
    if(bound)return;bound=true;if(debug)debug.binds++;
    const svg=$('sectionSvg');
    if(svg){
      svg.style.cursor='grab';
      svg.addEventListener('wheel',event=>{event.preventDefault();const rect=svg.getBoundingClientRect(),cx=(event.clientX-rect.left)/rect.width*600,cy=(event.clientY-rect.top)/rect.height*320,factor=Math.exp(-event.deltaY*.0015),newScale=Math.min(8,Math.max(.5,sectionScale*factor));sectionTx=cx-(cx-sectionTx)*(newScale/sectionScale);sectionTy=cy-(cy-sectionTy)*(newScale/sectionScale);sectionScale=newScale;const content=$('sectionContent');if(content)content.setAttribute('transform',`translate(${sectionTx},${sectionTy}) scale(${sectionScale})`);},{passive:false});
      svg.addEventListener('pointerdown',event=>{if(event.button!==0)return;sectionPan={x:event.clientX,y:event.clientY,tx:sectionTx,ty:sectionTy};svg.setPointerCapture(event.pointerId);svg.style.cursor='grabbing';});
      svg.addEventListener('pointermove',event=>{if(!sectionPan)return;sectionTx=sectionPan.tx+(event.clientX-sectionPan.x);sectionTy=sectionPan.ty+(event.clientY-sectionPan.y);const content=$('sectionContent');if(content)content.setAttribute('transform',`translate(${sectionTx},${sectionTy}) scale(${sectionScale})`);});
      const end=()=>{sectionPan=null;svg.style.cursor='grab';};svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);svg.addEventListener('dblclick',resetNavigation);
    }
    $('sectionBreakEnabled')?.addEventListener('change',()=>{if(debug)debug.controlChanges++;if(!state.wafer){$('sectionBreakEnabled').checked=false;return;}if($('sectionBreakEnabled').checked){state.sectionBreak=activeBreak()?{...state.sectionBreak,enabled:true}:defaultBreak(state.wafer,true);}else state.sectionBreak={...(state.sectionBreak||defaultBreak(state.wafer,false)),enabled:false};syncControls();render();persistSharedState('section-z-break');});
    for(const id of ['sectionBreakMode','sectionBreakFrontKeep','sectionBreakBackKeep','sectionBreakFrom','sectionBreakTo'])$(id)?.addEventListener('change',()=>{if(debug)debug.controlChanges++;applyControls();});
    $('sectionBreakAuto')?.addEventListener('click',()=>{if(debug)debug.controlChanges++;if(!state.wafer)return;const envelope=physicalEnvelope();if(!envelope){status('The current A–B line does not intersect a physical material envelope.');return;}const edge=Math.min(5,envelope.thickness*.1);state.sectionBreak={enabled:envelope.thickness>edge*2+1,mode:'surfaces',frontKeep:edge,backKeep:edge,from:envelope.bottom+edge,to:envelope.top-edge};syncControls();render();persistSharedState('section-z-break');status('Cross section keeps 5 µm at each current A–B material surface (or 10% for a very thin envelope).');});
  }
  return {render,syncControls,fit:resetNavigation,bind,physicalEnvelope,defaultBreak,debugEntries};
}
