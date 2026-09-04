import {$,UNIT_TO_UM,state,status} from '../core.js';
import {bboxPolys,isPolyInViewport,viewAspectBounds,waferBounds,waferOutline} from '../geometry.js';
import {layerVisual} from '../layer-model.js';
import {committedProjectionIsCurrent,transformedGdsBounds} from '../layout-model.js';
import {clearSvg,makeSvg} from '../svg.js';

export function createTopView({getTopSurfaceAtoms,getCurrentTopSurfaceAtoms,ensureTopSurfacePartition,isTopFaceSelection,isPatternsSelection,onSelectionChanged,onSliceChanged,qa=false}){
  let sliceCoordinateUnit='mm',topPan=null,sliceDragFrame=null,sliceDragName=null,bound=false,destroyed=false;
  const lifetime=new AbortController();
  const debug=qa?(state._topViewDebug||(state._topViewDebug={instances:0,binds:0,renders:0,pans:0,zooms:0,selections:0,sliceDrags:0})):null;
  if(debug)debug.instances++;
  function groupBy(items,keyOf){const groups=new Map();for(const item of items){const key=keyOf(item),group=groups.get(key);if(group)group.push(item);else groups.set(key,[item]);}return groups;}
  function convertFields(ids,fromUnit,toUnit){const ratio=UNIT_TO_UM[fromUnit]/UNIT_TO_UM[toUnit];for(const id of ids){const el=$(id),v=Number(el.value);if(Number.isFinite(v))el.value=String(Number((v*ratio).toPrecision(10)));}}
  function fitWafer(){state.topBounds=state.wafer?viewAspectBounds(waferBounds()):[-1,-1,1,1];renderTop();}
  function fitLayout(){
    let bb=transformedGdsBounds() || bboxPolys(state.imprintedFaces.map(f=>f.polygon));
    if(!bb){fitWafer();return;}
    const w=Math.max(bb[2]-bb[0],1), h=Math.max(bb[3]-bb[1],1), pad=Math.max(w,h)*0.15;
    state.topBounds=viewAspectBounds([bb[0]-pad,bb[1]-pad,bb[2]+pad,bb[3]+pad],0); renderTop();
  }
  function modelToSvg(x,y){
    const [x0,y0,x1,y1]=state.topBounds || [-1,-1,1,1];
    const W=600,H=420; let sx=(x-x0)/(x1-x0)*W; const sy=H-(y-y0)/(y1-y0)*H;if(state.activeFace==='back')sx=W-sx; return [sx,sy];
  }
  function svgToModel(sx,sy){
    const [x0,y0,x1,y1]=state.topBounds || [-1,-1,1,1];
    if(state.activeFace==='back')sx=600-sx;return {x:x0+sx/600*(x1-x0),y:y0+(1-sy/420)*(y1-y0)};
  }
  function polyPath(poly){ return poly.map((p,i)=>{const [x,y]=modelToSvg(p[0],p[1]); return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`}).join(' ')+' Z'; }
  function niceScaleDistance(target){if(!(target>0))return 1;const power=10**Math.floor(Math.log10(target)),normalized=target/power;return (normalized>=5?5:normalized>=2?2:1)*power;}
  function appendTopScaleBar(svg){
    if(!state.topBounds)return;const span=state.topBounds[2]-state.topBounds[0],distance=niceScaleDistance(span*.16),pixels=distance/span*600,x=18,y=392,label=distance>=1000?`${Number((distance/1000).toPrecision(3))} mm`:`${Number(distance.toPrecision(3))} µm`,group=makeSvg('g',{'data-scale-bar':'top','pointer-events':'none'});
    group.appendChild(makeSvg('rect',{x:x-7,y:y-24,width:pixels+14,height:31,rx:4,fill:'#fff','fill-opacity':'.82'}));group.appendChild(makeSvg('line',{x1:x,y1:y,x2:x+pixels,y2:y,stroke:'#27313b','stroke-width':'3'}));group.appendChild(makeSvg('line',{x1:x,y1:y-5,x2:x,y2:y+5,stroke:'#27313b','stroke-width':'2'}));group.appendChild(makeSvg('line',{x1:x+pixels,y1:y-5,x2:x+pixels,y2:y+5,stroke:'#27313b','stroke-width':'2'}));const text=makeSvg('text',{x:x+pixels/2,y:y-8,'text-anchor':'middle','font-size':'11','font-weight':'700',fill:'#27313b'});text.textContent=label;group.appendChild(text);svg.appendChild(group);
  }
  function formatSliceInput(value){const decimals={nm:1,um:3,mm:4,cm:5}[sliceCoordinateUnit]??4;return String(Number(Number(value).toFixed(decimals)));}
  function updateSliceInputs(){const focused=document.activeElement;if(!state.slice){for(const id of ['sliceAx','sliceAy','sliceBx','sliceBy']){$(id).value='';$(id).disabled=true;}$('applySliceCoordinatesBtn').disabled=true;return;}const scale=UNIT_TO_UM[sliceCoordinateUnit],values={sliceAx:state.slice.a.x/scale,sliceAy:state.slice.a.y/scale,sliceBx:state.slice.b.x/scale,sliceBy:state.slice.b.y/scale};for(const [id,value] of Object.entries(values)){const input=$(id);input.disabled=false;if(focused!==input)input.value=formatSliceInput(value);}$('applySliceCoordinatesBtn').disabled=false;$('sliceCoordinateUnit').value=sliceCoordinateUnit;}

  function renderTop(){
    if(destroyed)return;if(debug)debug.renders++;
    const svg=$('topSvg'); clearSvg(svg);
    if(!state.wafer&&!state.gds.layers.length){updateSliceInputs();return;}
    if(!state.topBounds) fitWafer();
    if(state.wafer)void ensureTopSurfacePartition();
    if(state.wafer){
      svg.appendChild(makeSvg('path',{d:polyPath(waferOutline()),fill:'#f0f1f2',stroke:'#626b75','stroke-width':'1.5'}));
    }
    // Inverted hatch pattern for preview
    const defsHatch=makeSvg('defs');
    const patHatch=makeSvg('pattern',{id:'inverted-hatch', width:'8', height:'8', patternUnits:'userSpaceOnUse', patternTransform:'rotate(45)', 'patternContentUnits':'userSpaceOnUse'});
    patHatch.appendChild(makeSvg('rect',{width:'8', height:'8', fill:'#fff7ed'}));
    patHatch.appendChild(makeSvg('line',{x1:'0', y1:'0', x2:'0', y2:'8', stroke:'#f59e0b', 'stroke-width':'1.4', opacity:'0.75'}));
    defsHatch.appendChild(patHatch);
    const cutHatch=makeSvg('pattern',{id:'model-cut-hatch',width:'7',height:'7',patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'});
    cutHatch.appendChild(makeSvg('rect',{width:'7',height:'7',fill:'#f8fafc'}));
    cutHatch.appendChild(makeSvg('line',{x1:'0',y1:'0',x2:'0',y2:'7',stroke:'#94a3b8','stroke-width':'1',opacity:'0.7'}));
    defsHatch.appendChild(cutHatch);
    svg.appendChild(defsHatch);

    // The Top view is always a projection of the current physical model.  GDS
    // masks and selection affordances are overlays, not substitutes for solids,
    // cuts and doping already visible in the derived 3D scene.
    const viewport=state.topBounds;
    if(state.wafer){
      const activeCuts=state.cuts.filter(c=>(c.side||'front')===state.activeFace&&isPolyInViewport(c.footprint,viewport));
      if(activeCuts.length){
        svg.appendChild(makeSvg('path',{d:activeCuts.map(cut=>polyPath(cut.footprint)).join(' '),fill:'url(#model-cut-hatch)',stroke:'#64748b','stroke-width':'1.2','stroke-dasharray':'3 2','pointer-events':'none','fill-rule':'nonzero','data-model-cut':'batch','data-region-count':activeCuts.length}));
      }
      const currentSurfaceAtoms=getCurrentTopSurfaceAtoms();
      const exposedSolidAtoms=currentSurfaceAtoms?.filter(atom=>atom.side===state.activeFace&&atom.kind==='solid'&&isPolyInViewport(atom.polygon,viewport))||[];
      const solidsByLayer=groupBy(exposedSolidAtoms,atom=>atom.layerId);
      for(const [layerId,atoms] of solidsByLayer){
        const color=layerVisual(layerId).color;
        svg.appendChild(makeSvg('path',{d:atoms.map(atom=>polyPath(atom.polygon)).join(' '),fill:color,'fill-opacity':'0.72',stroke:color,'stroke-opacity':'0.95','stroke-width':'1.2','pointer-events':'none','fill-rule':'nonzero','data-model-solid':'batch','data-model-layer':layerId,'data-region-count':atoms.length}));
      }
      const dopingsByLayer=groupBy(state.dopings.filter(doping=>isPolyInViewport(doping.footprint,viewport)),doping=>doping.layerId);
      for(const [layerId,dopings] of dopingsByLayer){
        const color=layerVisual(layerId).color;
        svg.appendChild(makeSvg('path',{d:dopings.map(doping=>polyPath(doping.footprint)).join(' '),fill:color,'fill-opacity':'0.24',stroke:color,'stroke-opacity':'0.8','stroke-width':'1.1','stroke-dasharray':'2 2','pointer-events':'none','fill-rule':'nonzero','data-model-doping':'batch','data-model-layer':layerId,'data-region-count':dopings.length}));
      }
    }

    const patternsMode=isPatternsSelection();
    // Main Top View never displays raw mask/GDS geometry.  It only displays the
    // committed, substrate-clipped projection produced by Pattern Editor.
    if(patternsMode&&committedProjectionIsCurrent()&&(state.gds.committedProjection?.face||'front')===state.activeFace&&Array.isArray(state.gds.committedProjection?.regions)){
      const rawOpacity=Number(state.maskBaseOpacity),maskOpacity=Number.isFinite(rawOpacity)?Math.min(1,Math.max(0,rawOpacity)):.35,visibleRegions=state.gds.committedProjection.regions.filter(region=>isPolyInViewport(region,viewport));
      if(maskOpacity>0){
        svg.appendChild(makeSvg('path',{d:polyPath(waferOutline()),fill:'#cbd5e1','fill-opacity':String(maskOpacity),stroke:'none','pointer-events':'none','data-mask-veil':'true'}));
        if(visibleRegions.length)svg.appendChild(makeSvg('path',{d:visibleRegions.map(region=>polyPath(region)).join(' '),fill:'#f59e0b','fill-opacity':String(maskOpacity),stroke:'#b45309','stroke-opacity':String(maskOpacity),'stroke-width':'1.7','pointer-events':'none','fill-rule':'nonzero','data-committed-projection':'true','data-region-count':visibleRegions.length}));
      }
    }
    if($('viewportCullInfo'))$('viewportCullInfo').textContent='';

    if(isTopFaceSelection()){
      // Each selectable path is one exact atom of the exposed planar surface.
      for(const atom of getTopSurfaceAtoms()){
        if(atom.side!==state.activeFace||!isPolyInViewport(atom.polygon,viewport))continue;
        const selected=state._topFaceSelection.selectedSolidIds.has(atom.id);
        const path=makeSvg('path',{d:polyPath(atom.polygon),fill:selected?'#f59e0b':atom.kind==='substrate'?'#ffffff':'#60a5fa','fill-opacity':selected?'0.42':atom.kind==='substrate'?'0.05':'0.18',stroke:selected?'#d97706':atom.kind==='substrate'?'#64748b':'#2563eb','stroke-opacity':atom.kind==='substrate'?'0.35':'1','stroke-width':selected?'2.2':'1.2','data-surface-face':atom.id,'data-source-id':atom.sourceId,'data-surface-kind':atom.kind});
        path.style.cursor='pointer';
        path.addEventListener('click',(ev)=>{ev.stopPropagation();if(debug)debug.selections++;if(state._topFaceSelection.selectedSolidIds.has(atom.id))state._topFaceSelection.selectedSolidIds.delete(atom.id);else state._topFaceSelection.selectedSolidIds.add(atom.id);onSelectionChanged();renderTop();});
        svg.appendChild(path);
      }
    } else if(patternsMode){
      // Patterns mode: selection is via checkboxes/layer clicks; no imprinted faces drawn as selectable
      // (selected layers already highlighted above)
    } else {
      for(const face of state.imprintedFaces.filter(face=>(face.side||'front')===state.activeFace)){
        if(!isPolyInViewport(face.polygon, viewport)) continue;
        const selected=state.selectedFaceIds.has(face.id);
        const path=makeSvg('path',{d:polyPath(face.polygon),fill:selected?'#f59e0b':'#ffffff','fill-opacity':selected?'0.42':'0.08',stroke:selected?'#d97706':'#111827','stroke-width':selected?'2.2':'1.2','data-face':face.id});
        path.style.cursor='pointer';
        path.addEventListener('click',(ev)=>{ev.stopPropagation(); if(state.selectedFaceIds.has(face.id)) state.selectedFaceIds.delete(face.id); else state.selectedFaceIds.add(face.id); onSelectionChanged(); renderTop();});
        svg.appendChild(path);
      }
    }

    if(!state.slice){appendTopScaleBar(svg);updateSliceInputs();return;}
    const [ax,ay]=modelToSvg(state.slice.a.x,state.slice.a.y), [bx,by]=modelToSvg(state.slice.b.x,state.slice.b.y);
    svg.appendChild(makeSvg('line',{x1:ax,y1:ay,x2:bx,y2:by,stroke:'#111827','stroke-width':'2','stroke-dasharray':'5 4'}));
    for(const [name,p,sx,sy] of [['A',state.slice.a,ax,ay],['B',state.slice.b,bx,by]]){
      const g=makeSvg('g',{'data-slice-handle':name}); g.style.cursor='grab';
      g.appendChild(makeSvg('circle',{cx:sx,cy:sy,r:7,fill:'#fff',stroke:'#111827','stroke-width':'2'}));
      const t=makeSvg('text',{x:sx+(name==='A'?-17:10),y:sy-10,'font-size':'13','font-weight':'700',fill:'#111827'});t.textContent=name;g.appendChild(t);svg.appendChild(g);
      bindSliceDrag(g,name);
    }
    appendTopScaleBar(svg);
    updateSliceInputs();
  }

  function bindSliceDrag(g,name){
    g.addEventListener('pointerdown',(ev)=>{sliceDragName=name;if(debug)debug.sliceDrags++;ev.preventDefault();ev.stopPropagation();});
  }
  function bindTopNavigation(){
    if(bound||destroyed)return;bound=true;if(debug)debug.binds++;
    const svg=$('topSvg'),signal=lifetime.signal;
    const listen=(target,event,handler,options={})=>target.addEventListener(event,handler,{...options,signal});
    listen(svg,'wheel',(ev)=>{if(!state.topBounds)return;ev.preventDefault();if(debug)debug.zooms++;const rect=svg.getBoundingClientRect(),sx=(ev.clientX-rect.left)/rect.width*600,sy=(ev.clientY-rect.top)/rect.height*420,anchor=svgToModel(sx,sy),factor=Math.exp(Math.max(-500,Math.min(500,ev.deltaY))*.0015),[x0,y0,x1,y1]=state.topBounds;state.topBounds=[anchor.x+(x0-anchor.x)*factor,anchor.y+(y0-anchor.y)*factor,anchor.x+(x1-anchor.x)*factor,anchor.y+(y1-anchor.y)*factor];renderTop();},{passive:false});
    listen(svg,'pointerdown',(ev)=>{if(ev.button!==0||ev.target!==svg||!state.topBounds)return;svg.setPointerCapture(ev.pointerId);if(debug)debug.pans++;topPan={x:ev.clientX,y:ev.clientY,bounds:[...state.topBounds]};svg.style.cursor='grabbing';});
    listen(window,'pointermove',(ev)=>{if(!sliceDragName||!state.slice)return;const rect=svg.getBoundingClientRect(),sx=(ev.clientX-rect.left)/rect.width*600,sy=(ev.clientY-rect.top)/rect.height*420;state.slice[sliceDragName.toLowerCase()]=svgToModel(sx,sy);if(!sliceDragFrame)sliceDragFrame=requestAnimationFrame(()=>{sliceDragFrame=null;renderTop();onSliceChanged('drag');});});
    listen(svg,'pointermove',(ev)=>{if(sliceDragName||!topPan)return;const rect=svg.getBoundingClientRect(),[x0,y0,x1,y1]=topPan.bounds,dx=(ev.clientX-topPan.x)/rect.width*(x1-x0),dy=(ev.clientY-topPan.y)/rect.height*(y1-y0),mx=state.activeFace==='back'?dx:-dx;state.topBounds=[x0+mx,y0+dy,x1+mx,y1+dy];renderTop();});
    const end=()=>{topPan=null;svg.style.cursor='';};listen(svg,'pointerup',end);listen(svg,'pointercancel',end);
    const endSlice=()=>{if(!sliceDragName)return;sliceDragName=null;onSliceChanged('end');};listen(window,'pointerup',endSlice);listen(window,'pointercancel',endSlice);
    listen(svg,'dblclick',()=>fitLayout());
    listen($('sliceCoordinateUnit'),'change',()=>{const next=$('sliceCoordinateUnit').value;convertFields(['sliceAx','sliceAy','sliceBx','sliceBy'],sliceCoordinateUnit,next);sliceCoordinateUnit=next;});
    listen($('applySliceCoordinatesBtn'),'click',()=>{if(!state.slice)return;const values=['sliceAx','sliceAy','sliceBx','sliceBy'].map(id=>Number($(id).value));if(values.some(v=>!Number.isFinite(v))){status('A–B coordinates must be valid numbers.');return;}if(values[0]===values[2]&&values[1]===values[3]){status('A and B must be different points.');return;}const scale=UNIT_TO_UM[sliceCoordinateUnit];state.slice={a:{x:values[0]*scale,y:values[1]*scale},b:{x:values[2]*scale,y:values[3]*scale}};renderTop();onSliceChanged('coordinates');status('Applied A–B section coordinates.');});
  }


  function destroy(){if(destroyed)return;destroyed=true;lifetime.abort();if(sliceDragFrame)cancelAnimationFrame(sliceDragFrame);sliceDragFrame=null;sliceDragName=null;topPan=null;bound=false;const svg=$('topSvg');svg.style.cursor='';clearSvg(svg);}
  function diagnostics(){return {bound,destroyed,debug:debug?{...debug}:null};}
  return {bind:bindTopNavigation,render:renderTop,fitWafer,fitLayout,destroy,diagnostics};
}
