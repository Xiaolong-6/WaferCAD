import {$,DEFAULT_WAFER,UNIT_TO_UM,clone,formatDisplayNumber,palette,persistSharedState,loadSharedState,rgbHexToInt,state,status,uid} from './js/core.js';
import {bboxPolys,centroid,detectBorderOnly,isPolyInViewport,isSimplePolygon,linePolyIntervals,normalizeWafer,pointInPoly,polygonArea,viewAspectBounds,waferBounds,waferFlatLengthMm,waferNotchDepthMm,waferOutline,waferXYScale} from './js/geometry.js';
import {clipPolygonsToWafer,isotropicOffset,resolveMaskRegions,splitPolygonsByMask} from './js/geometry-api.js';
import {displayZ,ensureLayerVisuals,layerVisual,mappedDopingBounds,mappedSolidBounds,materialColor,nextLayerName,physicalLayerOptions,solidLayerDescriptors} from './js/layer-model.js';
import {createLegendController} from './js/legend-controller.js';
import {effectiveLayerPolygons,normalizeGds,patternHasBlockedBorder,patternRawMaskPolygons,patternSelectedLayers,transformedGdsBounds,transformedLayerPolygon} from './js/layout-model.js';
import {clearSvg,makeSvg} from './js/svg.js';

let THREE = null, OrbitControls = null;
let renderer = null, scene = null, camera = null, controls = null, deviceGroup = null, axesGroup = null;
let cameraFlipAnimation = null;
let resizeObserver = null;
let waferDialogLateralUnit = 'mm', waferDialogThicknessUnit = 'um';
let gdsSourceFile = null, gdsAlignmentUnit = 'mm';
let sliceCoordinateUnit = 'mm', topPan = null, sliceDragFrame = null, sliceDragName = null;
let sectionPan = null, sectionScale = 1, sectionTx = 0, sectionTy = 0;
let snapshotNamePurpose = 'snapshot';
const legendController=createLegendController({recordOperationUndo:()=>recordOperationUndo(),updateSelectionInfo:()=>updateSelectionInfo(),renderAll:()=>renderAll()});
const renderFigureLegend=()=>legendController.render();
function renderHierarchy(){
  const panel=$('hierarchyPanel'), tree=$('hierarchyTree'), meta=$('hierarchyMeta');
  if(!panel||!tree) return;
  // Only visible in Patterns mode per spec
  if(!isPatternsSelection()){panel.classList.add('hidden');return;}
  const h=state.gds.hierarchy||[];
  if(!h.length){panel.classList.add('hidden');return;}
  panel.classList.remove('hidden');
  meta.textContent=`${h.length} cells`;
  tree.innerHTML='';
  const topSet=new Set(state.gds.topCells||[]);
  for(const cell of h){
    const row=document.createElement('button');row.type='button';row.className='hierarchy-row'+(cell.name===state.gds.activeTopCell?' active':'');
    row.disabled=!gdsSourceFile;
    row.title=!gdsSourceFile?'No layout file loaded':`Load ${cell.name} as active cell (flattened preview)`;
    const head=document.createElement('div');head.className='hierarchy-head';
    const name=document.createElement('span');name.className='hierarchy-name';name.textContent=cell.name + (topSet.has(cell.name)?' ★':'');
    const cnt=document.createElement('span');cnt.className='muted';cnt.textContent=`${cell.local_polygon_count} polys`;
    head.append(name,cnt); row.appendChild(head);
    if(cell.layers?.length){
      const layers=document.createElement('div');layers.className='hierarchy-layers';
      for(const l of cell.layers){const s=document.createElement('span');s.className='hierarchy-layer';s.textContent=`${l.layer}/${l.datatype}:${l.count}`;layers.appendChild(s);}
      row.appendChild(layers);
    }
    if(cell.references?.length){
      const refs=document.createElement('div');refs.className='hierarchy-refs';
      for(const r of cell.references){
        const rr=document.createElement('div');rr.className='hierarchy-ref';
        rr.textContent=`→ ${r.cell} @(${r.origin[0].toFixed(1)},${r.origin[1].toFixed(1)})${r.rotation?` ${r.rotation}°`:''}${r.x_reflection?' mirror':''}`;
        refs.appendChild(rr);
      }
      row.appendChild(refs);
    }
    row.addEventListener('click', async()=>{
      if(!gdsSourceFile){status('No layout file loaded.');return;}
      if(cell.name===state.gds.activeTopCell) return;
      await importGds(gdsSourceFile, cell.name, true);
    });
    tree.appendChild(row);
  }
}
function setDefaultSlice(){if(!state.wafer){state.slice=null;return;}const [x0,y0,x1,y1]=waferBounds(),cy=(y0+y1)/2;state.slice={a:{x:x0+(x1-x0)*.175,y:cy},b:{x:x1-(x1-x0)*.175,y:cy}};}
function currentDeviceSnapshot(){ensureLayerVisuals();return clone({wafer:state.wafer,activeFace:state.activeFace,solids:state.solids,cuts:state.cuts,dopings:state.dopings,layerVisuals:state.layerVisuals,imprintedFaces:state.imprintedFaces});}
function captureCameraState(){
  if(!camera || !controls) return null;
  return { position: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray() };
}
function restoreCameraState(cam){
  if(!cam || !camera || !controls) return;
  try{
    if(Array.isArray(cam.position)) camera.position.fromArray(cam.position);
    if(Array.isArray(cam.target)) controls.target.fromArray(cam.target);
    if(Array.isArray(cam.up)) camera.up.fromArray(cam.up);
    controls.update();
  }catch(e){ console.warn('restore camera failed',e); }
}
function restoreDeviceSnapshot(s){state.wafer=s.wafer?normalizeWafer(clone(s.wafer)):null;state.activeFace=s.activeFace||'front';state.solids=clone(s.solids||[]);state.cuts=clone(s.cuts||[]);state.dopings=clone(s.dopings||[]);state.layerVisuals=clone(s.layerVisuals||{});state.imprintedFaces=clone(s.imprintedFaces||[]);state.operationUndo=[];ensureLayerVisuals();state.selectedFaceIds.clear();clearPatternSelection();clearTopSelection();setDefaultSlice();state.topBounds=null;updateActiveFaceUi();updateSelectionInfo();updateLayoutSectionVisibility();renderAll();}

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
function placeCameraOnActiveFace(){if(!camera)return;const back=state.activeFace==='back';camera.position.x=back?-Math.abs(camera.position.x):Math.abs(camera.position.x);camera.position.z=back?-Math.abs(camera.position.z):Math.abs(camera.position.z);controls?.update();}
function updateActiveFaceUi(syncCamera=true){const back=state.activeFace==='back';$('activeFaceLabel').textContent=back?'Back face':'Front face';$('flipFaceBtn').textContent=back?'Back':'Front';$('flipFaceBtn').disabled=!state.wafer;if(syncCamera)placeCameraOnActiveFace();}
function startCameraFaceFlip(){if(!camera||!controls)return;const target=controls.target.clone(),relative=camera.position.clone().sub(target);cameraFlipAnimation={started:performance.now(),duration:720,target,relative};controls.enabled=false;}
function updateCameraFaceFlip(now){if(!cameraFlipAnimation)return;const a=cameraFlipAnimation,t=Math.min(1,(now-a.started)/a.duration),eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,angle=Math.PI*eased,c=Math.cos(angle),s=Math.sin(angle),r=a.relative;camera.position.set(a.target.x+r.x*c+r.z*s,a.target.y+r.y,a.target.z-r.x*s+r.z*c);camera.lookAt(a.target);if(t>=1){cameraFlipAnimation=null;controls.enabled=true;controls.update();}}
function flipActiveFace(){if(!state.wafer)return;state.activeFace=state.activeFace==='front'?'back':'front';state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();updateActiveFaceUi(false);startCameraFaceFlip();renderAll();status(`Active processing face: ${state.activeFace}. The 3D camera is flipping to the ${state.activeFace} side.`);}
function updateSliceInputs(){const focused=document.activeElement;if(!state.slice){for(const id of ['sliceAx','sliceAy','sliceBx','sliceBy']){$(id).value='';$(id).disabled=true;}$('applySliceCoordinatesBtn').disabled=true;return;}const scale=UNIT_TO_UM[sliceCoordinateUnit],values={sliceAx:state.slice.a.x/scale,sliceAy:state.slice.a.y/scale,sliceBx:state.slice.b.x/scale,sliceBy:state.slice.b.y/scale};for(const [id,value] of Object.entries(values)){const input=$(id);input.disabled=false;if(focused!==input)input.value=formatDisplayNumber(value);}$('applySliceCoordinatesBtn').disabled=false;$('sliceCoordinateUnit').value=sliceCoordinateUnit;}

function renderTop(){
  const svg=$('topSvg'); clearSvg(svg);
  if(!state.wafer&&!state.gds.layers.length){updateSliceInputs();return;}
  if(!state.topBounds) fitWafer();
  if(state.wafer){
    svg.appendChild(makeSvg('path',{d:polyPath(waferOutline()),fill:'#f0f1f2',stroke:'#626b75','stroke-width':'1.5'}));
    // Mask veil for alignment: semi-transparent overlay on empty wafer area, adjustable
    const veilOpacity=Math.min(0.6, Math.max(0, Number(state.maskBaseOpacity)||0.35)*0.7);
    if(veilOpacity>0.01){
      const veil=makeSvg('path',{d:polyPath(waferOutline()),fill:'#cbd5e1','fill-opacity': String(veilOpacity), stroke:'none', 'pointer-events':'none'});
      svg.appendChild(veil);
    }
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
    const activeCuts=state.cuts.filter(c=>(c.side||'front')===state.activeFace);
    for(const cut of activeCuts){
      if(!isPolyInViewport(cut.footprint,viewport))continue;
      svg.appendChild(makeSvg('path',{d:polyPath(cut.footprint),fill:'url(#model-cut-hatch)',stroke:'#64748b','stroke-width':'1.2','stroke-dasharray':'3 2','pointer-events':'none','data-model-cut':cut.id}));
    }
    const back=state.activeFace==='back';
    const modelSolids=state.solids.filter(s=>(s.side||'front')===state.activeFace).sort((a,b)=>back?b.zMin-a.zMin:a.zMax-b.zMax);
    for(const solid of modelSolids){
      if(!isPolyInViewport(solid.footprint,viewport))continue;
      const color=layerVisual(solid.layerId).color;
      svg.appendChild(makeSvg('path',{d:polyPath(solid.footprint),fill:color,'fill-opacity':'0.72',stroke:color,'stroke-opacity':'0.95','stroke-width':'1.2','pointer-events':'none','data-model-solid':solid.id,'data-model-layer':solid.layerId}));
    }
    for(const doping of state.dopings){
      if(!isPolyInViewport(doping.footprint,viewport))continue;
      const color=layerVisual(doping.layerId).color;
      svg.appendChild(makeSvg('path',{d:polyPath(doping.footprint),fill:color,'fill-opacity':'0.24',stroke:color,'stroke-opacity':'0.8','stroke-width':'1.1','stroke-dasharray':'2 2','pointer-events':'none','data-model-doping':doping.id}));
    }
  }

  // Imported layout layers remain visually distinct by layer/datatype.
  // Viewport culling: skip polys entirely outside topBounds (major win near 20k cap when zoomed/panned)
  let culled=0, drawn=0;
  const patternsMode=isPatternsSelection();
  for(const layer of state.gds.layers){
    if(layer.visible===false) continue;
    const isPatSel=patternsMode && state.patternSelectedKeys.has(layer.key);
    const isBorder=!!layer.isBorderOnly && !layer.fillPattern;
    // Border-only without fill is shown as dashed inactive preview, not as active mask
    const willBeActive=isPatSel && !isBorder;
    for(const sourcePoly of effectiveLayerPolygons(layer)){
      const poly=transformedLayerPolygon(layer,sourcePoly);
      if(!isPolyInViewport(poly, viewport)){culled++; continue;}
      drawn++;
      const isInvertedActive=willBeActive && layer.inverted===true;
      const path=makeSvg('path',{
        d:polyPath(poly),
        fill:isInvertedActive?'url(#inverted-hatch)':(willBeActive?'#f59e0b':(isBorder?'#94a3b8':layer.color)),
        'fill-opacity':isInvertedActive?'0.9':(willBeActive?'0.38':(isBorder?'0.04':'0.10')),
        stroke:isInvertedActive?'#b45309':(willBeActive?'#b45309':(isBorder?'#64748b':layer.color)),
        'stroke-opacity':isInvertedActive?'0.9':(willBeActive?'0.95':(isBorder?'0.5':'0.45')),
        'stroke-width':isInvertedActive?'1.6':(willBeActive?'1.7':'1'),
        'stroke-dasharray':isBorder?'4 3':(isInvertedActive?'6 3':null),
        'data-layer':layer.key
      });
      if(isBorder) path.setAttribute('data-border','true');
      if(isInvertedActive) path.setAttribute('data-inverted','true');
      if(patternsMode && !isBorder){
        path.style.cursor='pointer';
        path.addEventListener('click',(ev)=>{
          ev.stopPropagation();
          if(state.patternSelectedKeys.has(layer.key)) state.patternSelectedKeys.delete(layer.key);
          else state.patternSelectedKeys.add(layer.key);
          updateSelectionInfo(); renderLayerList(); renderTop();
        });
      } else if(patternsMode && isBorder){
        path.style.cursor='not-allowed';
        path.setAttribute('title','Closed border without fill — enable Fill pattern to use as mask');
      }
      svg.appendChild(path);
    }
  }
  if(culled>0) $('viewportCullInfo') && ($('viewportCullInfo').textContent=`${drawn} shown · ${culled} culled outside viewport`);
  else if($('viewportCullInfo')) $('viewportCullInfo').textContent='';

  if(isTopFaceSelection()){
    // Draw top-face model regions (solids covering active face) as selectable
    const solidsOnFace=state.solids.filter(s=>(s.side||'front')===state.activeFace);
    for(const solid of solidsOnFace){
      if(!isPolyInViewport(solid.footprint, viewport)) continue;
      const isTop=topLayerAt(centroid(solid.footprint), state.activeFace)?.id===solid.id;
      if(!isTop) continue;
      const selected=state._topFaceSelection.selectedSolidIds.has(solid.id);
      const path=makeSvg('path',{d:polyPath(solid.footprint),fill:selected?'#f59e0b':'#60a5fa','fill-opacity':selected?'0.42':'0.18',stroke:selected?'#d97706':'#2563eb','stroke-width':selected?'2.2':'1.4','data-solid':solid.id});
      path.style.cursor='pointer';
      path.addEventListener('click',(ev)=>{ev.stopPropagation(); if(state._topFaceSelection.selectedSolidIds.has(solid.id)) state._topFaceSelection.selectedSolidIds.delete(solid.id); else state._topFaceSelection.selectedSolidIds.add(solid.id); updateSelectionInfo(); renderTop();});
      svg.appendChild(path);
    }
    // substrate top region: click empty wafer area to select substrate top face
    // handled via svg background click below
  } else if(patternsMode){
    // Patterns mode: selection is via checkboxes/layer clicks; no imprinted faces drawn as selectable
    // (selected layers already highlighted above)
  } else {
    for(const face of state.imprintedFaces.filter(face=>(face.side||'front')===state.activeFace)){
      if(!isPolyInViewport(face.polygon, viewport)) continue;
      const selected=state.selectedFaceIds.has(face.id);
      const path=makeSvg('path',{d:polyPath(face.polygon),fill:selected?'#f59e0b':'#ffffff','fill-opacity':selected?'0.42':'0.08',stroke:selected?'#d97706':'#111827','stroke-width':selected?'2.2':'1.2','data-face':face.id});
      path.style.cursor='pointer';
      path.addEventListener('click',(ev)=>{ev.stopPropagation(); if(state.selectedFaceIds.has(face.id)) state.selectedFaceIds.delete(face.id); else state.selectedFaceIds.add(face.id); updateSelectionInfo(); renderTop();});
      svg.appendChild(path);
    }
  }

  if(!state.slice){updateSliceInputs();return;}
  const [ax,ay]=modelToSvg(state.slice.a.x,state.slice.a.y), [bx,by]=modelToSvg(state.slice.b.x,state.slice.b.y);
  svg.appendChild(makeSvg('line',{x1:ax,y1:ay,x2:bx,y2:by,stroke:'#111827','stroke-width':'2','stroke-dasharray':'5 4'}));
  for(const [name,p,sx,sy] of [['A',state.slice.a,ax,ay],['B',state.slice.b,bx,by]]){
    const g=makeSvg('g',{'data-slice-handle':name}); g.style.cursor='grab';
    g.appendChild(makeSvg('circle',{cx:sx,cy:sy,r:7,fill:'#fff',stroke:'#111827','stroke-width':'2'}));
    const t=makeSvg('text',{x:sx+(name==='A'?-17:10),y:sy-10,'font-size':'13','font-weight':'700',fill:'#111827'});t.textContent=name;g.appendChild(t);svg.appendChild(g);
    bindSliceDrag(g,name);
  }
  updateSliceInputs();
}

function bindSliceDrag(g,name){
  g.addEventListener('pointerdown',(ev)=>{sliceDragName=name;ev.preventDefault();ev.stopPropagation();});
}
function bindTopNavigation(){
  const svg=$('topSvg');
  svg.addEventListener('wheel',(ev)=>{if(!state.topBounds)return;ev.preventDefault();const rect=svg.getBoundingClientRect(),sx=(ev.clientX-rect.left)/rect.width*600,sy=(ev.clientY-rect.top)/rect.height*420,anchor=svgToModel(sx,sy),factor=Math.exp(Math.max(-500,Math.min(500,ev.deltaY))*.0015),[x0,y0,x1,y1]=state.topBounds;state.topBounds=[anchor.x+(x0-anchor.x)*factor,anchor.y+(y0-anchor.y)*factor,anchor.x+(x1-anchor.x)*factor,anchor.y+(y1-anchor.y)*factor];renderTop();},{passive:false});
  svg.addEventListener('pointerdown',(ev)=>{if(ev.button!==0||ev.target!==svg||!state.topBounds)return;svg.setPointerCapture(ev.pointerId);topPan={x:ev.clientX,y:ev.clientY,bounds:[...state.topBounds]};svg.style.cursor='grabbing';});
  window.addEventListener('pointermove',(ev)=>{if(!sliceDragName||!state.slice)return;const rect=svg.getBoundingClientRect(),sx=(ev.clientX-rect.left)/rect.width*600,sy=(ev.clientY-rect.top)/rect.height*420;state.slice[sliceDragName.toLowerCase()]=svgToModel(sx,sy);if(!sliceDragFrame)sliceDragFrame=requestAnimationFrame(()=>{sliceDragFrame=null;renderTop();renderSection();});});
  svg.addEventListener('pointermove',(ev)=>{if(sliceDragName||!topPan)return;const rect=svg.getBoundingClientRect(),[x0,y0,x1,y1]=topPan.bounds,dx=(ev.clientX-topPan.x)/rect.width*(x1-x0),dy=(ev.clientY-topPan.y)/rect.height*(y1-y0),mx=state.activeFace==='back'?dx:-dx;state.topBounds=[x0+mx,y0+dy,x1+mx,y1+dy];renderTop();});
  const end=()=>{topPan=null;svg.style.cursor='';};svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
  const endSlice=()=>{if(!sliceDragName)return;sliceDragName=null;render3D();};window.addEventListener('pointerup',endSlice);window.addEventListener('pointercancel',endSlice);
}

function renderSection(){
  const svg=$('sectionSvg');clearSvg(svg);$('sectionMeta').textContent='';if(!state.wafer||!state.slice)return;const a=state.slice.a,b=state.slice.b,back=state.activeFace==='back',waferIntervals=linePolyIntervals(a,b,waferOutline()),layerDescriptors=solidLayerDescriptors(),mappedSolids=state.solids.map(s=>mappedSolidBounds(s,layerDescriptors)),mappedDopings=state.dopings.map(d=>mappedDopingBounds(d,layerDescriptors));
  const rawMin=Math.min(displayZ(-state.wafer.thickness),...mappedSolids.map(s=>s.zMin),...mappedDopings.map(s=>s.zMin),0), rawMax=Math.max(displayZ(0),...mappedSolids.map(s=>s.zMax),...mappedDopings.map(s=>s.zMax)), pad=(rawMax-rawMin)*0.04+0.02, yMin=rawMin-pad, yMax=rawMax+pad, mapX=t=>back?555-t*510:45+t*510,mapDisplayY=z=>back?12+(z-yMin)/(yMax-yMin)*296:308-(z-yMin)/(yMax-yMin)*296,mapY=z=>mapDisplayY(displayZ(z)),rectX=(t0,t1)=>{const x0=mapX(t0),x1=mapX(t1);return {x:Math.min(x0,x1),width:Math.abs(x1-x0)};},rectY=(z0,z1)=>{const y0=mapDisplayY(z0),y1=mapDisplayY(z1);return {y:Math.min(y0,y1),height:Math.abs(y1-y0)};};
  const content=makeSvg('g',{id:'sectionContent',transform:`translate(${sectionTx},${sectionTy}) scale(${sectionScale})`});
  content.appendChild(makeSvg('line',{x1:45,y1:mapDisplayY(0),x2:555,y2:mapDisplayY(0),stroke:'#b6bbc2','stroke-width':'1'}));
  for(const waferI of waferIntervals){const xr=rectX(waferI[0],waferI[1]),yr=rectY(displayZ(-state.wafer.thickness),displayZ(0));content.appendChild(makeSvg('rect',{...xr,...yr,fill:layerVisual('substrate').color,stroke:'#6b7280','data-layer-id':'substrate'}));}
  for(const cut of state.cuts)for(const [t0,t1] of linePolyIntervals(a,b,cut.footprint)){const xr=rectX(t0,t1),yr=rectY(displayZ(cut.zMin),displayZ(cut.zMax));content.appendChild(makeSvg('rect',{...xr,...yr,fill:'#fbfbfc',stroke:'#9ca3af','stroke-dasharray':'3 2'}));}
  for(const solid of state.solids)for(const [t0,t1] of linePolyIntervals(a,b,solid.footprint)){const mapped=mappedSolidBounds(solid,layerDescriptors),xr=rectX(t0,t1),yr=rectY(mapped.zMin,mapped.zMax);content.appendChild(makeSvg('rect',{...xr,...yr,fill:layerVisual(solid.layerId).color,stroke:'#4b5563','data-layer-id':solid.layerId}));}
  const defs=makeSvg('defs');content.appendChild(defs);
  for(const doping of state.dopings){const color=layerVisual(doping.layerId).color,gradientId=`gradient_${doping.layerId}`,highAtTop=(doping.position==='upper')!==back,gradient=makeSvg('linearGradient',{id:gradientId,x1:'0%',x2:'0%',y1:highAtTop?'100%':'0%',y2:highAtTop?'0%':'100%'});gradient.append(makeSvg('stop',{offset:'0%','stop-color':color,'stop-opacity':'0.08'}),makeSvg('stop',{offset:'100%','stop-color':color,'stop-opacity':'0.9'}));defs.appendChild(gradient);for(const [t0,t1] of linePolyIntervals(a,b,doping.footprint)){const mapped=mappedDopingBounds(doping,layerDescriptors),xr=rectX(t0,t1),yr=rectY(mapped.zMin,mapped.zMax);content.appendChild(makeSvg('rect',{...xr,...yr,fill:`url(#${gradientId})`,stroke:color,'stroke-opacity':'.65','data-layer-id':doping.layerId,'data-doping':'true'}));}}
  const labelY=back?17:310,ta=makeSvg('text',{x:back?558:35,y:labelY,'font-size':'12','font-weight':'700'});ta.textContent='A';content.appendChild(ta);const tb=makeSvg('text',{x:back?35:558,y:labelY,'font-size':'12','font-weight':'700'});tb.textContent='B';content.appendChild(tb);
  svg.appendChild(content);
  const len=Math.hypot(b.x-a.x,b.y-a.y); $('sectionMeta').textContent=`${(len/1000).toFixed(2)} mm line · ${back?'backside flipped · ':''}schematic Z`;
}
function bindSectionNavigation(){
  const svg=$('sectionSvg'); if(!svg) return;
  svg.style.cursor='grab';
  svg.addEventListener('wheel',e=>{
    e.preventDefault();
    const rect=svg.getBoundingClientRect();
    const cx=(e.clientX-rect.left)/rect.width*600, cy=(e.clientY-rect.top)/rect.height*320;
    const factor=Math.exp(-e.deltaY*0.0015);
    const newScale=Math.min(8, Math.max(0.5, sectionScale*factor));
    // adjust translation to keep cursor point stable
    sectionTx = cx - (cx - sectionTx) * (newScale/sectionScale);
    sectionTy = cy - (cy - sectionTy) * (newScale/sectionScale);
    sectionScale=newScale;
    const g=$('sectionContent'); if(g) g.setAttribute('transform',`translate(${sectionTx},${sectionTy}) scale(${sectionScale})`);
  },{passive:false});
  svg.addEventListener('pointerdown',e=>{
    if(e.button!==0) return;
    // don't interfere with slice handle if we add later
    sectionPan={x:e.clientX, y:e.clientY, tx:sectionTx, ty:sectionTy};
    svg.setPointerCapture(e.pointerId); svg.style.cursor='grabbing';
  });
  svg.addEventListener('pointermove',e=>{
    if(!sectionPan) return;
    sectionTx = sectionPan.tx + (e.clientX - sectionPan.x);
    sectionTy = sectionPan.ty + (e.clientY - sectionPan.y);
    const g=$('sectionContent'); if(g) g.setAttribute('transform',`translate(${sectionTx},${sectionTy}) scale(${sectionScale})`);
  });
  const end=()=>{ sectionPan=null; const s=$('sectionSvg'); if(s) s.style.cursor='grab'; };
  svg.addEventListener('pointerup',end); svg.addEventListener('pointercancel',end);
  svg.addEventListener('dblclick',()=>{
    sectionScale=1; sectionTx=0; sectionTy=0;
    const g=$('sectionContent'); if(g) g.setAttribute('transform',`translate(0,0) scale(1)`);
  });
}

function surfaceZAt(p,side='front'){
  let z=side==='back'?-state.wafer.thickness:0;
  if(side==='back'){
    for(const cut of state.cuts)if((cut.side||'front')==='back'&&pointInPoly(p,cut.footprint))z=Math.max(z,cut.zMax);
    for(const solid of state.solids)if((solid.side||'front')==='back'&&pointInPoly(p,solid.footprint))z=Math.min(z,solid.zMin);
  }else{
    for(const cut of state.cuts)if((cut.side||'front')==='front'&&pointInPoly(p,cut.footprint))z=Math.min(z,cut.zMin);
    for(const solid of state.solids)if((solid.side||'front')==='front'&&pointInPoly(p,solid.footprint))z=Math.max(z,solid.zMax);
  }
  return z;
}
function topLayerAt(point,side='front'){
  const p={x:point[0],y:point[1]};
  if(!pointInPoly(p, waferOutline())) return null;
  // check cuts that etch substrate: if point inside a front cut that lowers surface, substrate is no longer top unless a solid covers it
  let candidates=[];
  for(const solid of state.solids) if((solid.side||'front')===side && pointInPoly(p, solid.footprint)) candidates.push(solid);
  if(!candidates.length) return {kind:'substrate', id:'substrate', z:surfaceZAt(p,side)};
  // topmost is max zMax (front) or min zMin (back)
  candidates.sort((a,b)=> side==='back'? a.zMin - b.zMin : b.zMax - a.zMax);
  const top=candidates[0];
  return {kind:'solid', id:top.id, layerId:top.layerId, solid:top, z: side==='back'?top.zMin:top.zMax};
}
function isTopFaceSelection(){return $('selectionMode')?.value==='top';}
function isPatternsSelection(){const v=$('selectionMode')?.value; return v==='imprinted' || v==='patterns';}
function topSelectionCount(){return state._topFaceSelection.selectedSolidIds.size;}
function clearTopSelection(){state._topFaceSelection.selectedSolidIds.clear();}
function clearPatternSelection(){state.patternSelectedKeys.clear();}
function patternSelectionCount(){return state.patternSelectedKeys.size;}
function updateLayoutSectionVisibility(){
  const sec=$('layoutSection');
  if(!sec) return;
  const show=isPatternsSelection();
  sec.classList.toggle('hidden', !show);
}
function updateSelectionInfo(){
  if($('pushMode')?.value==='doping'){$('selectionInfo').textContent='Doping overlaps the selected physical target layer; mask-face selection is not used.';return;}
  if(isTopFaceSelection()){
    const n=topSelectionCount();
    if(n) {$('selectionInfo').textContent=`${n} full face${n>1?'s':''} selected (model).`;}
    else {$('selectionInfo').textContent=`No full face selected — the whole ${state.activeFace} face will be used. Click a visible top region.`;}
    return;
  }
  if(isPatternsSelection()){
    const n=patternSelectionCount();
    if(n) {
      const inv=patternSelectedLayers().filter(l=>l.inverted).length;
      let txt=`${n} pattern layer${n>1?'s':''} selected — alignment and tone apply live, then Apply.`;
      if(inv>=2) txt+=` (${inv} inverted → union of each S\\layer)`;
      else if(inv===1 && n>1) txt+=` (mixed: inverted contributes wafer minus its shapes)`;
      $('selectionInfo').textContent=txt;
    }
    else {$('selectionInfo').textContent=`No pattern layer selected — the whole ${state.activeFace} face will be used. Check layers below.`;}
    return;
  }
  const n=state.selectedFaceIds.size;$('selectionInfo').textContent=n?`${n} patterned face${n>1?'s':''} selected.`:`No pattern selected — the whole ${state.activeFace} face will be used.`;
}

async function buildMaterialConsumption(pieces,distance,mode){
  const groups=new Map(),eps=1e-7,t=state.wafer.thickness;
  for(const piece of pieces){const side=piece.face.side||state.activeFace,surface=surfaceZAt(centroid(piece.polygon),side),key=`${side}|${surface.toFixed(6)}`,group=groups.get(key)||{side,surface,masks:[]};group.masks.push(piece.polygon);groups.set(key,group);}
  let working=clone(state.solids),workingDopings=clone(state.dopings);const substrateCuts=[];
  for(const group of groups.values()){
    const front=group.side!=='back',cutLow=group.surface-distance,cutHigh=group.surface+distance,candidates=working.filter(s=>(s.side||'front')===group.side&&(front?(s.zMax>cutLow+eps&&s.zMin<group.surface-eps):(s.zMin<cutHigh-eps&&s.zMax>group.surface+eps)));
    if(candidates.length){const split=await splitPolygonsByMask(candidates.map(s=>s.footprint),group.masks),candidateIds=new Set(candidates.map(s=>s.id)),next=working.filter(s=>!candidateIds.has(s.id));for(let i=0;i<candidates.length;i++){const solid=candidates[i];for(const polygon of split.remaining[i])next.push({...clone(solid),id:uid('solid'),footprint:polygon});if(front){const residualMax=Math.min(solid.zMax,cutLow);if(residualMax>solid.zMin+eps)for(const polygon of split.overlaps[i])next.push({...clone(solid),id:uid('solid'),footprint:polygon,zMax:residualMax});}else{const residualMin=Math.max(solid.zMin,cutHigh);if(solid.zMax>residualMin+eps)for(const polygon of split.overlaps[i])next.push({...clone(solid),id:uid('solid'),footprint:polygon,zMin:residualMin});}}working=next;}
    const dopingCandidates=workingDopings.filter(d=>front?(d.zMax>cutLow+eps&&d.zMin<group.surface-eps):(d.zMin<cutHigh-eps&&d.zMax>group.surface+eps));if(dopingCandidates.length){const split=await splitPolygonsByMask(dopingCandidates.map(d=>d.footprint),group.masks),candidateIds=new Set(dopingCandidates.map(d=>d.id)),next=workingDopings.filter(d=>!candidateIds.has(d.id));for(let i=0;i<dopingCandidates.length;i++){const doping=dopingCandidates[i];for(const polygon of split.remaining[i])next.push({...clone(doping),id:uid('doping-region'),footprint:polygon});if(front){const residualMax=Math.min(doping.zMax,cutLow);if(residualMax>doping.zMin+eps)for(const polygon of split.overlaps[i])next.push({...clone(doping),id:uid('doping-region'),footprint:polygon,zMax:residualMax,depth:residualMax-doping.zMin});}else{const residualMin=Math.max(doping.zMin,cutHigh);if(doping.zMax>residualMin+eps)for(const polygon of split.overlaps[i])next.push({...clone(doping),id:uid('doping-region'),footprint:polygon,zMin:residualMin,depth:doping.zMax-residualMin});}}workingDopings=next;}
    const substrateMin=front?Math.max(-t,cutLow):Math.max(-t,group.surface),substrateMax=front?Math.min(0,group.surface):Math.min(0,cutHigh);if(substrateMax>substrateMin+eps)for(const footprint of group.masks)substrateCuts.push({id:uid('cut'),side:group.side,footprint:clone(footprint),zMin:substrateMin,zMax:substrateMax,sourceFaceId:null,target:'substrate',wholeFace:false,profile:mode==='isotropic-etch'?'isotropic':'vertical',lateralRadius:mode==='isotropic-etch'?distance:0});
  }
  return {solids:working,dopings:workingDopings,cuts:[...state.cuts,...substrateCuts]};
}
function cleanupConsumedLayers(previousNames){
  const surviving=new Set(state.solids.map(s=>s.layerId)),removed=[];for(const [id,name] of previousNames)if(!surviving.has(id)){removed.push(name);delete state.layerVisuals[id];}
  if(removed.length){const removedIds=new Set([...previousNames.keys()].filter(id=>!surviving.has(id)));state.dopings=state.dopings.filter(d=>!removedIds.has(d.targetLayerId));}
  const activeDopingLayers=new Set(state.dopings.map(d=>d.layerId));for(const [id,visual] of Object.entries(state.layerVisuals))if(visual.gradient&&!activeDopingLayers.has(id))delete state.layerVisuals[id];
  return removed;
}
function renderDopingControls(){const select=$('dopingTargetLayer');if(!select)return;const previous=select.value,options=state.wafer?physicalLayerOptions():[];select.innerHTML='';for(const entry of options){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.name;select.appendChild(option);}if(options.some(o=>o.id===previous))select.value=previous;select.disabled=!options.length;}
function updateOperationModeUi(){const mode=$('pushMode').value,conformal=['conformal-grow','isotropic-etch'].includes(mode),doping=mode==='doping';$('operationModeHint').classList.toggle('hidden',!conformal);$('dopingControls').classList.toggle('hidden',!doping);$('materialFieldLabel').textContent=doping?'Dopant':'Material';$('materialInput').disabled=mode==='down'||mode==='isotropic-etch';renderDopingControls();updateSelectionInfo();}
function captureOperationState(){return clone({solids:state.solids,cuts:state.cuts,dopings:state.dopings,layerVisuals:state.layerVisuals});}
function recordOperationUndo(){state.operationUndo.push(captureOperationState());if(state.operationUndo.length>50)state.operationUndo.shift();updateUndoUi();}
function updateUndoUi(){$('undoOperationBtn').disabled=!state.operationUndo.length;}
function undoOperation(){const previous=state.operationUndo.pop();if(!previous)return;state.solids=previous.solids||[];state.cuts=previous.cuts||[];state.dopings=previous.dopings||[];state.layerVisuals=previous.layerVisuals||{};ensureLayerVisuals();state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();renderAll();updateUndoUi();status('Undid the last geometry operation.');}
function applyDoping(distance,dopant){
  const targetLayerId=$('dopingTargetLayer').value,position=$('dopingPosition').value,targets=targetLayerId==='substrate'?[{footprint:waferOutline(),zMin:-state.wafer.thickness,zMax:0}]:state.solids.filter(s=>s.layerId===targetLayerId);if(!targets.length){status('Choose an existing target layer for doping.');return;}
  recordOperationUndo();const layerId=uid('doping'),name=nextLayerName(`Doping · ${dopant}`);state.layerVisuals[layerId]={name,color:materialColor(dopant),scale:1,gradient:true};
  for(const target of targets){const available=Math.max(0,target.zMax-target.zMin),depth=Math.min(distance,available);if(depth<=0)continue;const zMin=position==='upper'?target.zMax-depth:target.zMin,zMax=position==='upper'?target.zMax:target.zMin+depth;state.dopings.push({id:uid('doping-region'),layerId,targetLayerId,dopant,position,depth,footprint:clone(target.footprint),zMin,zMax});}
  renderAll();status(`Added ${dopant} doping to the ${position} ${Math.min(distance,Math.max(...targets.map(t=>t.zMax-t.zMin))).toFixed(3)} µm of ${layerVisual(targetLayerId).name}.`);
}
async function applyPushPull(){
  if(!state.wafer){status('Create or open a wafer before using Push / Pull.');return;}
  const distance=Number($('distanceInput').value)*Number($('distanceUnit').value); if(!Number.isFinite(distance)||distance<=0){status('Distance must be positive.');return;}
  const mode=$('pushMode').value, material=$('materialInput').value.trim()||'Generic film';
  if(mode==='doping'){applyDoping(distance,material==='Generic film'?'Dopant':material);return;}
  let wholeFace, selected;
  if(isTopFaceSelection()){
    const ids=state._topFaceSelection.selectedSolidIds;
    wholeFace=ids.size===0;
    if(wholeFace) selected=[{id:null,side:state.activeFace,polygon:waferOutline(),wholeFace:true}];
    else {
      const solids=state.solids.filter(s=>ids.has(s.id) && (s.side||'front')===state.activeFace);
      selected=solids.map(s=>({id:s.id,side:s.side||state.activeFace,polygon:clone(s.footprint),wholeFace:false}));
      if(!selected.length){status('Selected full faces are no longer present.');return;}
    }
  } else if(isPatternsSelection()){
    const selKeys=[...state.patternSelectedKeys];
    wholeFace=selKeys.length===0;
    if(wholeFace){
      selected=[{id:null,side:state.activeFace,polygon:waferOutline(),wholeFace:true}];
    } else {
      // Multi-layer pattern masks: collect transformed polys; for inverted layers resolve substrate complement
      // Border-only without Fill is ignored by default (natural: closed but unfilled border is not a mask)
      selected=[];
      let blockedBorders=[];
      for(const key of selKeys){
        const layer=state.gds.layers.find(l=>l.key===key);
        if(!layer) continue;
        if(layer.isBorderOnly && !layer.fillPattern){ blockedBorders.push(`${layer.layer}/${layer.datatype}`); continue; }
        const raw=effectiveLayerPolygons(layer).map(poly=>transformedLayerPolygon(layer, poly));
        if(!raw.length) continue;
        if(layer.inverted===true){
          status(`Resolving inverted pattern ${layer.layer}/${layer.datatype}…`);
          try{
            const regions=await resolveMaskRegions(raw, true);
            for(const poly of regions) selected.push({id:layer.key,side:state.activeFace,polygon:poly,wholeFace:false});
          }catch(e){status(`Pattern ${layer.layer}/${layer.datatype} inverted resolve failed: ${e.message}`);return;}
        } else {
          for(const poly of raw) selected.push({id:layer.key,side:state.activeFace,polygon:poly,wholeFace:false});
        }
      }
      if(blockedBorders.length){ status(`Border-only layer(s) ${blockedBorders.join(', ')} without Fill are not used as mask — enable Fill pattern to use as filled outer contour.`); }
      if(!selected.length){status('Selected pattern layers produced no geometry (border-only without Fill is ignored).');return;}
    }
  } else {
    wholeFace=state.selectedFaceIds.size===0;
    selected=wholeFace?[{id:null,side:state.activeFace,polygon:waferOutline(),wholeFace:true}]:state.imprintedFaces.filter(f=>state.selectedFaceIds.has(f.id));
  }
  status(wholeFace?`Preparing the whole ${state.activeFace} face…`:'Clipping selected faces to the substrate…');let clipped;try{clipped=await clipPolygonsToWafer(selected.map(f=>f.polygon));}catch(e){status(`Push / pull failed: ${e.message}`);return;}
  let pieces=[];clipped.forEach((parts,i)=>parts.forEach(polygon=>pieces.push({face:selected[i],polygon})));
  if(!pieces.length){state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();renderTop();status('No selected area overlaps the substrate. Nothing was created.');return;}
  if(mode==='conformal-grow'||mode==='isotropic-etch'){
    status(mode==='conformal-grow'?'Calculating conformal growth…':'Calculating isotropic etch…');let regions;try{regions=await isotropicOffset(pieces.map(p=>p.polygon),distance);}catch(e){status(`Operation failed: ${e.message}`);return;}
    pieces=regions.map(polygon=>({face:{id:null,side:state.activeFace},polygon}));if(!pieces.length){state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();renderTop();status('The isotropic operation produced no region inside the substrate.');return;}
  }
  if(mode==='up'||mode==='conformal-grow'){
    recordOperationUndo();
    const layerId=uid('layer');state.layerVisuals[layerId]={name:nextLayerName(material),color:materialColor(material),scale:1};
    for(const piece of pieces){const side=piece.face.side||'front',c=centroid(piece.polygon),z0=surfaceZAt(c,side);state.solids.push({id:uid('solid'),layerId,side,material,footprint:clone(piece.polygon),zMin:side==='back'?z0-distance:z0,zMax:side==='back'?z0:z0+distance,sourceFaceId:piece.face.id,wholeFace,profile:mode==='conformal-grow'?'conformal':'vertical',lateralRadius:mode==='conformal-grow'?distance:0});}
    status(mode==='conformal-grow'?`Conformally grew ${material} with a ${distance.toFixed(3)} µm isotropic radius on the ${state.activeFace} face.`:(wholeFace?`Created a ${distance.toFixed(3)} µm ${material} blanket layer on the ${state.activeFace} face.`:`Pulled ${pieces.length} substrate-bounded region(s) from the ${state.activeFace} face by ${distance.toFixed(3)} µm.`));
  }else{
    const previousNames=new Map(solidLayerDescriptors().map(d=>[d.id,layerVisual(d.id).name]));status('Calculating layer-by-layer material consumption…');let consumed;try{consumed=await buildMaterialConsumption(pieces,distance,mode);}catch(e){status(`Operation failed: ${e.message}`);return;}recordOperationUndo();state.solids=consumed.solids;state.dopings=consumed.dopings;state.cuts=consumed.cuts;const removed=cleanupConsumedLayers(previousNames),removedText=removed.length?` Removed layer${removed.length>1?'s':''}: ${removed.join(', ')}.`:'';
    status(mode==='isotropic-etch'?`Isotropically etched inward from the ${state.activeFace} surface by ${distance.toFixed(3)} µm.${removedText}`:`Pushed inward from the ${state.activeFace} surface by ${distance.toFixed(3)} µm.${removedText}`);
  }
  // Keep Patterns selection for iterative tuning; clear legacy imprinted/top
  state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();renderAll();
}

function renderGdsControls(){
  const controls=$('gdsControls'),hasLayers=state.gds.layers.length>0;controls.classList.toggle('hidden',!hasLayers);if(!hasLayers)return;
  const uScale=UNIT_TO_UM[gdsAlignmentUnit],transform=state.gds.transform||{};
  $('gdsOffsetX').value=formatDisplayNumber((Number(transform.offsetX)||0)/uScale);
  $('gdsOffsetY').value=formatDisplayNumber((Number(transform.offsetY)||0)/uScale);
  $('gdsRotation').value=formatDisplayNumber(Number(transform.rotationDeg)||0);
  $('gdsScale').value=formatDisplayNumber(Number(transform.scale)||1);
  $('gdsAlignmentUnit').value=gdsAlignmentUnit;
  // Live preview: alignment remains editable even after geometry exists; no lock
  const disabled=!gdsSourceFile;
  for(const el of [$('gdsOffsetX'),$('gdsOffsetY'),$('gdsRotation'),$('gdsScale'),$('gdsAlignmentUnit'),$('applyGdsAlignmentBtn')]) el.disabled=disabled;
}
function renderLayerList(){
  const box=$('layerList');box.innerHTML='';
  renderGdsControls();
  // Keep hierarchy in sync when layout section is visible
  if(isPatternsSelection()) renderHierarchy();
  if(!state.gds.layers.length){box.className='layer-list empty-note';box.textContent='Import a GDSII or OASIS file to view its layers.';renderImprintDebug();return;} box.className='layer-list';
  const patternsMode=isPatternsSelection();
  for(const layer of state.gds.layers){
    const item=document.createElement('div');item.className='layer-item'+(patternsMode && state.patternSelectedKeys.has(layer.key)?' selected-pattern':'');
    const head=document.createElement('div');head.className='layer-head';
    // Visibility toggle — plain checkbox with text
    const visLabel=document.createElement('label');visLabel.className='check-text vis-check';visLabel.title='Show/hide in Top View';
    const vis=document.createElement('input');vis.type='checkbox';vis.checked=layer.visible!==false;vis.addEventListener('change',()=>{layer.visible=vis.checked;renderTop();});
    const visText=document.createElement('span');visText.textContent='Show';
    visLabel.append(vis,visText);
    // Pattern selection toggle (only in Patterns mode) — border-only without Fill is disabled by default
    const isBorder=!!layer.isBorderOnly;
    const patLabel=document.createElement('label');patLabel.className='check-text pat-check';
    patLabel.title=isBorder && !layer.fillPattern ? 'Closed border without fill — enable Fill pattern to use as mask (border alone is not used by default)' : 'Use in Patterns Apply — multi-select, combined on Apply';
    const pat=document.createElement('input');pat.type='checkbox';pat.checked=state.patternSelectedKeys.has(layer.key);
    if(isBorder && !layer.fillPattern){ pat.disabled=true; patLabel.style.opacity='0.45'; }
    pat.addEventListener('change',()=>{
      if(pat.checked) state.patternSelectedKeys.add(layer.key); else state.patternSelectedKeys.delete(layer.key);
      updateSelectionInfo(); renderLayerList(); renderTop();
      status(pat.checked?`Pattern ${layer.layer}/${layer.datatype} selected.`:`Pattern ${layer.layer}/${layer.datatype} deselected.`);
    });
    if(!patternsMode) patLabel.style.display='none';
    const patText=document.createElement('span');patText.textContent='Use';
    patLabel.append(pat,patText);
    if(isBorder && !layer.fillPattern){
      const hint=document.createElement('span');hint.className='muted';hint.textContent='border';hint.title='Closed border without fill — not used until Fill is enabled';
      // show hint next to Use, but keep layout compact
      patLabel.append(hint);
    }
    const sw=document.createElement('span');sw.className='layer-swatch';sw.style.background=layer.color;
    const strong=document.createElement('strong');
    strong.textContent=layer.alias||`Layer ${layer.layer}/${layer.datatype}`;
    strong.title=`Click to edit alias — Layer ${layer.layer}/${layer.datatype}`;
    strong.style.cursor='pointer'; strong.style.textDecoration='underline'; strong.style.textDecorationStyle='dotted'; strong.style.textUnderlineOffset='2px';
    strong.addEventListener('click',()=>{
      const value=prompt(`Alias for layer ${layer.layer}/${layer.datatype}`,layer.alias||'');
      if(value===null) return; layer.alias=value.trim(); renderLayerList(); renderTop();
    });
    const count=document.createElement('span');count.className='muted';count.textContent=`${layer.count||layer.polygons.length}`;
    head.append(patLabel,visLabel,sw,strong,count);item.appendChild(head);
    const options=document.createElement('div');options.className='layer-options';
    const tone=document.createElement('label');tone.className='layer-tone';const invert=document.createElement('input');invert.type='checkbox';invert.checked=layer.inverted===true;
    invert.addEventListener('change',()=>{layer.inverted=invert.checked;status(`Layer ${layer.layer}/${layer.datatype} tone: ${layer.inverted?'inverted':'normal'}.`); renderTop();});
    tone.append(invert,document.createTextNode('Invert'));options.appendChild(tone);
    const fillLabel=document.createElement('label');fillLabel.className='layer-tone';const fill=document.createElement('input');fill.type='checkbox';fill.checked=layer.fillPattern===true;
    fill.addEventListener('change',async()=>{
      fill.disabled=true;const enabled=fill.checked;
      try{await setLayerFillPattern(layer,enabled);status(`Layer ${layer.layer}/${layer.datatype}: ${enabled?'filled closed patterns':'original geometry'}.`);}catch(e){fill.checked=!enabled;status(`Fill pattern failed: ${e.message}`);}finally{fill.disabled=false;}
    });fillLabel.append(fill,document.createTextNode('Fill pattern'));options.appendChild(fillLabel);
    const mirrorLabel=document.createElement('label');mirrorLabel.className='layer-tone';const mirror=document.createElement('input');mirror.type='checkbox';mirror.checked=layer.mirrored===true;
    mirror.addEventListener('change',()=>{layer.mirrored=mirror.checked;state.topBounds=null;renderTop();status(`Layer ${layer.layer}/${layer.datatype}: ${layer.mirrored?'mirrored left/right about the layout origin':'original orientation'}.`);});
    mirrorLabel.append(mirror,document.createTextNode('Mirror'));options.appendChild(mirrorLabel);item.appendChild(options);
    box.appendChild(item);
  }
  renderImprintDebug();
}
function renderImprintDebug(){
  const box=$('imprintDebugActions'); if(!box) return; box.innerHTML='';
  if(!state.gds.layers.length){box.textContent='No layers.';return;}
  // Rebuild per-layer imprint/select for debug parity
  for(const layer of state.gds.layers){
    const row=document.createElement('div');row.className='layer-actions';
    const imprint=document.createElement('button');imprint.textContent=`Imprint ${layer.layer}/${layer.datatype}`;imprint.addEventListener('click',()=>imprintLayer(layer));
    const sel=document.createElement('button');sel.textContent=`Select ${layer.layer}/${layer.datatype}`;sel.addEventListener('click',()=>{
      // Switch to legacy imprinted selection for comparison
      $('selectionMode').value='imprinted'; updateLayoutSectionVisibility(); clearPatternSelection();
      for(const f of state.imprintedFaces.filter(f=>f.layerKey===layer.key&&(f.side||'front')===state.activeFace))state.selectedFaceIds.add(f.id);
      updateSelectionInfo();renderTop();renderLayerList();
    });
    row.append(imprint, sel); box.appendChild(row);
  }
}
async function setLayerFillPattern(layer,enabled){
  if(enabled&&!Array.isArray(layer.filledPolygons)){const response=await fetch('/api/geometry/fill-holes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subjects:layer.polygons||[]})});if(!response.ok){const data=await response.json().catch(()=>({detail:response.statusText}));throw new Error(data.detail||response.statusText);}const data=await response.json();layer.filledPolygons=Array.isArray(data.regions)?data.regions:[];}
  layer.fillPattern=enabled;state.topBounds=null;renderTop();
}
async function imprintLayer(layer){
  if(!state.wafer){status('Create or open a wafer before imprinting a layer.');return;}
  const side=state.activeFace,inverted=layer.inverted===true;if(state.imprintedFaces.some(f=>f.layerKey===layer.key&&(f.side||'front')===side)){status(`Layer ${layer.layer}/${layer.datatype} is already imprinted on the ${side} face.`);return;}
  const transformed=effectiveLayerPolygons(layer).map(poly=>transformedLayerPolygon(layer,poly));status(`Resolving ${inverted?'inverted':'normal'}${layer.fillPattern?' filled':''}${layer.mirrored?' mirrored':''} mask geometry inside the substrate…`);let regions;try{regions=await resolveMaskRegions(transformed,inverted);}catch(e){status(`Imprint failed: ${e.message}`);return;}
  regions.forEach((polygon,i)=>state.imprintedFaces.push({id:uid('face'),layerKey:layer.key,polyIndex:i,partIndex:0,side,inverted,fillPattern:layer.fillPattern===true,mirrored:layer.mirrored===true,polygon}));
  status(`Imprinted ${regions.length} substrate-bounded region(s) from layer ${layer.layer}/${layer.datatype} on the ${side} face.`);renderGdsControls();renderLayerList();renderAll();
}

async function importGds(file,topCell=null,preserveTransform=false){
  // Live Patterns path: allow re-import even after geometry; imprint snapshot remains locked behind debug
  // (Alignment tuning after geometry is handled via live preview, not file replacement)
  status(`Reading ${file.name}…`);const form=new FormData();form.append('file',file);if(topCell)form.append('top_cell',topCell);
  let res;try{res=await fetch('/api/gds/inspect',{method:'POST',body:form});}catch(e){status(`Layout request failed: ${e.message}`);return;}
  if(!res.ok){const j=await res.json().catch(()=>({detail:res.statusText}));status(`Layout import: ${j.detail||res.statusText}`);return;}
  const data=await res.json();
  const previousTransform=preserveTransform?state.gds.transform:null,previousAliases=new Map(state.gds.layers.map(l=>[`${l.layer}/${l.datatype}`,l.alias])),previousTones=new Map(state.gds.layers.map(l=>[`${l.layer}/${l.datatype}`,l.inverted===true])),previousFills=new Map(state.gds.layers.map(l=>[`${l.layer}/${l.datatype}`,l.fillPattern===true])),previousMirrors=new Map(state.gds.layers.map(l=>[`${l.layer}/${l.datatype}`,l.mirrored===true]));
  state.gds=normalizeGds({filename:data.filename,bbox:data.bbox,topCells:data.top_cells||[],activeTopCell:data.active_top_cell,transform:previousTransform||{offsetX:0,offsetY:0,rotationDeg:0,scale:1},hierarchy:data.hierarchy||[],layers:data.layers.map((l,i)=>{const key=`${l.layer}/${l.datatype}`;return {...l,key,alias:previousAliases.get(key)||'',inverted:previousTones.get(key)||false,fillPattern:previousFills.get(key)||false,mirrored:previousMirrors.get(key)||false,visible:true,color:palette[i%palette.length]};})});gdsSourceFile=file;
  for(const layer of state.gds.layers) layer.isBorderOnly=detectBorderOnly(layer);
  // New file → clear pattern selection (layers changed)
  clearPatternSelection();
  for(const layer of state.gds.layers.filter(l=>l.fillPattern))await setLayerFillPattern(layer,true);
  $('gdsStatus').textContent=`${state.gds.layers.length} layers`;
  updateLayoutSectionVisibility(); renderLayerList();renderHierarchy();fitLayout();renderAll();persistSharedState();
  status(`Loaded ${data.filename}: ${data.active_top_cell}, ${data.layers.length} layer/datatype pairs${data.truncated?' (polygon limit reached)':''}.`);
}
function renderSnapshots(){
  const track=$('snapshotTrack'); const strip=$('snapshotStrip');
  if(!track) return;
  track.innerHTML='';
  if(!state.snapshots.length){
    const n=document.createElement('div');n.className='snapshot-empty';n.textContent='No snapshots yet — click + Snapshot in the top bar to capture the current 3D perspective.';
    track.appendChild(n);
    return;
  }
  for(const s of state.snapshots){
    const card=document.createElement('div');card.className='snapshot-card'+(s.id===state.activeSnapshotId?' active':'');
    card.title=`${s.name} — click to restore`;
    const thumb=document.createElement('img');thumb.className='snapshot-thumb';
    thumb.src=s.thumb||''; thumb.alt=s.name;
    if(!s.thumb) thumb.style.background='#e2e8f0';
    thumb.onerror=()=>{ thumb.style.background='#e2e8f0'; thumb.removeAttribute('src'); };
    const info=document.createElement('div');info.className='snapshot-info';
    const name=document.createElement('div');name.className='snapshot-name';name.textContent=s.name;
    const meta=document.createElement('div');meta.className='snapshot-meta';meta.textContent=`${s.device.solids.length} solids · ${s.device.cuts.length} cuts`;
    info.append(name,meta);
    const del=document.createElement('button');del.type='button';del.className='snapshot-delete';del.title='Delete snapshot';del.textContent='×';
    del.addEventListener('click',(e)=>{ e.stopPropagation(); deleteSnapshot(s.id); });
    card.addEventListener('click',()=>{
      if(s.id===state.activeSnapshotId) return;
      // Auto-save current active snapshot before switching — re-shoot covering current archive + camera
      const active=state.snapshots.find(x=>x.id===state.activeSnapshotId);
      if(active){
        try{
          active.device=currentDeviceSnapshot();
          const newThumb=captureSnapshotThumb();
          if(newThumb) active.thumb=newThumb;
          const newCam=captureCameraState();
          if(newCam) active.camera=newCam;
          active.updated=new Date().toISOString();
        }catch(e){ console.warn('auto-save snapshot failed',e); }
      }
      state.activeSnapshotId=s.id;
      restoreDeviceSnapshot(s.device);
      if(s.camera) restoreCameraState(s.camera);
      else renderAll();
      renderSnapshots();
      status(active?`Auto-saved previous state, switched to ${s.name}`:`Restored snapshot: ${s.name}`);
    });
    card.append(thumb,info,del);
    track.appendChild(card);
  }
  // keep newest visible on the right
  requestAnimationFrame(()=>{ const strip=$('snapshotStrip'); if(strip) strip.scrollLeft=strip.scrollWidth; });
}
function captureSnapshotThumb(){
  try{
    if(!renderer || !renderer.domElement) return null;
    // ensure current frame is rendered
    if(typeof renderer.render === 'function' && scene && camera) renderer.render(scene,camera);
    const dataUrl=renderer.domElement.toDataURL('image/png');
    return dataUrl;
  }catch(e){ console.warn('snapshot thumb failed',e); return null; }
}
function deleteSnapshot(id){
  const idx=state.snapshots.findIndex(s=>s.id===id);
  if(idx===-1) return;
  const name=state.snapshots[idx].name;
  state.snapshots.splice(idx,1);
  if(state.activeSnapshotId===id) state.activeSnapshotId=state.snapshots.length? state.snapshots[state.snapshots.length-1].id : null;
  renderSnapshots();
  status(`Deleted snapshot: ${name}`);
}
function saveNamedSnapshot(name){
  const thumb=captureSnapshotThumb();
  const cam=captureCameraState();
  const s={id:uid('snap'),name,created:new Date().toISOString(),device:currentDeviceSnapshot(),thumb,camera:cam};
  state.snapshots.push(s);state.activeSnapshotId=s.id;renderSnapshots();status(`Snapshot saved: ${name}`);
}
function openSnapshotNameDialog(purpose='snapshot'){
  if(!state.wafer){status('Create or open a wafer before saving a snapshot.');return;}
  snapshotNamePurpose=purpose;
  const dialog=$('snapshotNameDialog'),input=$('snapshotNameInput'),error=$('snapshotNameError');
  error.classList.add('hidden');error.textContent='';input.value=`State ${state.snapshots.length+1}`;
  if(dialog.open)dialog.close();dialog.showModal();input.focus();input.select();
}
function createSnapshot(){openSnapshotNameDialog('snapshot');}

function modelStats(){$('modelStats').textContent=state.wafer?`${state.solids.length} solids · ${state.cuts.length} cuts · ${state.dopings.length} doped regions · ${state.imprintedFaces.length} faces`:'';}
function renderAll(){ensureLayerVisuals();renderTop();renderSection();render3D();renderFigureLegend();renderDopingControls();updateUndoUi();modelStats();}

async function initThree(){
  try{
    THREE=await import('three');
    ({OrbitControls}=await import('three/addons/controls/OrbitControls.js'));
  }catch(e){$('threeError').classList.remove('hidden');$('threeError').textContent='The local 3D library could not be loaded. Run npm install and restart WaferCAD. '+e.message;return;}
  const host=$('threeContainer');renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xf1f3f5);host.appendChild(renderer.domElement);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.01,5000);camera.up.set(0,0,1);camera.position.set(state.activeFace==='back'?-7:7,-9,state.activeFace==='back'?-6:6);controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,-.1);controls.enableDamping=true;
  scene.add(new THREE.HemisphereLight(0xffffff,0x66717c,2.0));const dl=new THREE.DirectionalLight(0xffffff,2.4);dl.position.set(5,-4,9);scene.add(dl);
  deviceGroup=new THREE.Group();scene.add(deviceGroup);axesGroup=createInfiniteAxes();axesGroup.visible=state.showAxes;scene.add(axesGroup);
  resizeObserver=new ResizeObserver(()=>resizeThree());resizeObserver.observe(host);resizeThree();animateThree();render3D();
}
function resizeThree(){if(!renderer)return;const host=$('threeContainer'),w=Math.max(host.clientWidth,1),h=Math.max(host.clientHeight,1);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function createAxisLabel(text,color,position){const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;const context=canvas.getContext('2d');context.font='700 42px Segoe UI, sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillStyle=color;context.fillText(text,48,32);const texture=new THREE.CanvasTexture(canvas),material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false});const sprite=new THREE.Sprite(material);sprite.position.set(...position);sprite.scale.set(.42,.28,1);sprite.renderOrder=1002;return sprite;}
function createInfiniteAxes(){
  const group=new THREE.Group(),extent=1000,axes=[{points:[[-extent,0,0],[extent,0,0]],color:0xdc2626},{points:[[0,-extent,0],[0,extent,0]],color:0x16a34a},{points:[[0,0,-extent],[0,0,extent]],color:0x2563eb}];
  for(const axis of axes){const geometry=new THREE.BufferGeometry().setFromPoints(axis.points.map(p=>new THREE.Vector3(...p))),material=new THREE.LineBasicMaterial({color:axis.color,transparent:true,opacity:.82,depthTest:false,depthWrite:false});const line=new THREE.Line(geometry,material);line.renderOrder=1000;group.add(line);}
  const origin=new THREE.Mesh(new THREE.SphereGeometry(.085,18,12),new THREE.MeshBasicMaterial({color:0x111827,depthTest:false,depthWrite:false}));origin.renderOrder=1001;origin.name='Origin';group.add(origin,createAxisLabel('X','#dc2626',[5.1,0,0]),createAxisLabel('Y','#16a34a',[0,5.1,0]),createAxisLabel('Z','#2563eb',[0,0,5.1]),createAxisLabel('O','#111827',[.18,.18,.18]));return group;
}
function updateAxesVisibility(){state.showAxes=$('showAxes').checked;if(axesGroup)axesGroup.visible=state.showAxes;status(state.showAxes?'3D origin and X/Y/Z axes shown.':'3D axes hidden.');}
function syncViewControls(){
  if($('zExag')){
    $('zExag').value=String(Math.min(200, Math.max(0.1, state.zExag)));
    if($('zExagNumber')) $('zExagNumber').value=formatDisplayNumber(state.zExag);
    $('zExagValue').value=`×${formatDisplayNumber(state.zExag)}`;
  }
  if($('maskOpacity')){
    const pct=Math.round((Number(state.maskBaseOpacity)||0.35)*100);
    $('maskOpacity').value=String(pct);
    if($('maskOpacityValue')) $('maskOpacityValue').textContent=pct+'%';
  }
  $('showAxes').checked=state.showAxes;if(axesGroup)axesGroup.visible=state.showAxes;
}
function setZExag(v, source='slider'){
  let n=Number(v);
  if(!Number.isFinite(n) || n<=0) return;
  n=Math.min(1000, Math.max(0.1, n));
  state.zExag=n;
  // keep slider and number in sync without feedback loop
  if(source!=='slider' && $('zExag')) $('zExag').value=String(Math.min(200, Math.max(0.1, n)));
  if(source!=='number' && $('zExagNumber')) $('zExagNumber').value=formatDisplayNumber(n);
  if($('zExagValue')) $('zExagValue').value=`×${formatDisplayNumber(n)}`;
  renderSection();render3D();
}
function setMaskOpacity(v){
  let n=Number(v);
  if(!Number.isFinite(n)) return;
  n=Math.min(100, Math.max(0, n))/100;
  state.maskBaseOpacity=n;
  if($('maskOpacity')) $('maskOpacity').value=String(Math.round(n*100));
  if($('maskOpacityValue')) $('maskOpacityValue').textContent=Math.round(n*100)+'%';
  renderTop();
}
function animateThree(now=performance.now()){if(!renderer)return;requestAnimationFrame(animateThree);updateCameraFaceFlip(now);controls.update();renderer.render(scene,camera);}
function disposeGroup(g){while(g.children.length){const o=g.children.pop();if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}}}
function scaledPoly(poly,scale){return poly.map(([x,y])=>[x*scale,y*scale]);}
function makeShape(poly){const s=new THREE.Shape();poly.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;}
function mappedZ(z){return displayZ(z);}
function render3D(){
  if(!THREE||!deviceGroup)return;disposeGroup(deviceGroup);if(!state.wafer||!state.slice)return;
  const xy=waferXYScale(),scaledWafer=scaledPoly(waferOutline(),xy);
  // Build substrate as vertical slabs. Each slab gets holes for cuts that fully span it.
  const zBounds=[-state.wafer.thickness,0,...state.cuts.flatMap(c=>[Math.max(-state.wafer.thickness,c.zMin),Math.min(0,c.zMax)])].sort((a,b)=>a-b).filter((v,i,a)=>i===0||Math.abs(v-a[i-1])>1e-9);
  for(let i=0;i<zBounds.length-1;i++){
    const low=zBounds[i],high=zBounds[i+1]; const shape=makeShape(scaledWafer);
    const activeCuts=state.cuts.filter(c=>c.zMin<=low+1e-8&&c.zMax>=high-1e-8);
    for(const cut of activeCuts){const pp=scaledPoly(cut.footprint,xy);const hole=new THREE.Path();pp.forEach(([x,y],j)=>j?hole.lineTo(x,y):hole.moveTo(x,y));hole.closePath();shape.holes.push(hole);}
    const depth=Math.max(mappedZ(high)-mappedZ(low),.0001);const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:96});geo.translate(0,0,mappedZ(low));const mat=new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual('substrate').color),roughness:.72,metalness:.02,side:THREE.DoubleSide});const mesh=new THREE.Mesh(geo,mat);deviceGroup.add(mesh);
  }
  const layerDescriptors=solidLayerDescriptors();
  for(const solid of state.solids){const p=scaledPoly(solid.footprint,xy),shape=makeShape(p),mapped=mappedSolidBounds(solid,layerDescriptors),depth=Math.max(mapped.zMax-mapped.zMin,.004),geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:16});geo.translate(0,0,mapped.zMin);const mat=new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual(solid.layerId).color),roughness:.55,metalness:solid.material.toLowerCase().includes('metal')?.6:.05,side:THREE.DoubleSide});deviceGroup.add(new THREE.Mesh(geo,mat));}
  for(const doping of state.dopings){const p=scaledPoly(doping.footprint,xy),shape=makeShape(p),mapped=mappedDopingBounds(doping,layerDescriptors),depth=Math.max(mapped.zMax-mapped.zMin,.004),geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:16});geo.translate(0,0,mapped.zMin);const mat=new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual(doping.layerId).color),transparent:true,opacity:.38,depthWrite:false,roughness:.35,metalness:0,side:THREE.DoubleSide});deviceGroup.add(new THREE.Mesh(geo,mat));}
  // Selected slice plane.
  const a=state.slice.a,b=state.slice.b,ax=a.x*xy,ay=a.y*xy,bx=b.x*xy,by=b.y*xy,len=Math.hypot(bx-ax,by-ay),angle=Math.atan2(by-ay,bx-ax),mappedSolids=state.solids.map(s=>mappedSolidBounds(s,layerDescriptors));const maxz=Math.max(.3,...mappedSolids.map(s=>s.zMax));const minz=Math.min(mappedZ(-state.wafer.thickness),...mappedSolids.map(s=>s.zMin)),height=maxz-minz+.2;const plane=new THREE.Mesh(new THREE.BoxGeometry(len,.018,height),new THREE.MeshBasicMaterial({color:0x2563eb,transparent:true,opacity:.18,depthWrite:false}));plane.position.set((ax+bx)/2,(ay+by)/2,(maxz+minz)/2);plane.rotation.z=angle;deviceGroup.add(plane);
  const boundaryPoints=scaledWafer.map(([x,y])=>new THREE.Vector3(x,y,.006));const boundaryGeo=new THREE.BufferGeometry().setFromPoints(boundaryPoints);const boundary=new THREE.LineLoop(boundaryGeo,new THREE.LineBasicMaterial({color:0x475569}));deviceGroup.add(boundary);
}

function saveProject(){
  ensureLayerVisuals();const payload={format:'wafercad-mvp',version:7,wafer:state.wafer,activeFace:state.activeFace,solids:state.solids,cuts:state.cuts,dopings:state.dopings,layerVisuals:state.layerVisuals,gds:state.gds,imprintedFaces:state.imprintedFaces,slice:state.slice,snapshots:state.snapshots,view:{zExag:state.zExag,showAxes:state.showAxes,maskBaseOpacity:state.maskBaseOpacity}};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='wafercad-project.json';a.click();URL.revokeObjectURL(a.href);status('Project saved.');
}
async function openProject(file){try{const p=JSON.parse(await file.text());if(p.format!=='wafercad-mvp')throw new Error('Not a WaferCAD MVP project');state.wafer=p.wafer?normalizeWafer(p.wafer):null;state.activeFace=p.activeFace||'front';state.solids=p.solids||[];state.cuts=p.cuts||[];state.dopings=p.dopings||[];state.layerVisuals=p.layerVisuals||{};state.gds=normalizeGds(p.gds);for(const layer of state.gds.layers) layer.isBorderOnly=detectBorderOnly(layer);state.imprintedFaces=p.imprintedFaces||[];state.slice=p.slice||null;state.snapshots=p.snapshots||[];for(const s of state.snapshots){ if(!s.camera) s.camera=null; if(!s.thumb) s.thumb=null; }
  state.zExag=Number.isFinite(Number(p.view?.zExag))?Math.min(1000,Math.max(0.1,Number(p.view.zExag))):8;state.showAxes=p.view?.showAxes===true;state.maskBaseOpacity=Number.isFinite(Number(p.view?.maskBaseOpacity))?Math.min(1,Math.max(0,Number(p.view.maskBaseOpacity))):0.35;state.operationUndo=[];state._exactThickness=null;ensureLayerVisuals();state.selectedFaceIds.clear();clearTopSelection();clearPatternSelection();gdsSourceFile=null;if(state.wafer&&!state.slice)setDefaultSlice();state.topBounds=null;$('gdsStatus').textContent=state.gds.layers?.length?`${state.gds.layers.length} layers`:'none';syncViewControls();updateActiveFaceUi();updateSelectionInfo();updateLayoutSectionVisibility();renderLayerList();renderHierarchy();renderSnapshots();fitWafer();renderAll();status(`Opened ${file.name} (v${p.version||6}→7).`);}catch(e){status(`Open project failed: ${e.message}`)}}

function updateWaferShapeFields(){const shape=$('waferShape').value;$('waferCircleFields').classList.toggle('hidden',shape!=='circle');$('waferRectFields').classList.toggle('hidden',shape!=='rect');$('waferCustomFields').classList.toggle('hidden',shape!=='custom');updateWaferEdgeInfo();}
function updateWaferEdgeInfo(){
  const info=$('waferEdgeInfo'); if(!info) return;
  const shape=$('waferShape').value;
  if(shape!=='circle'){info.textContent='';return;}
  const edge=$('waferEdgeFeature')?.value||'none';
  if(edge==='none'){info.textContent='Full circle — no flat or notch.';return;}
  const diamVal=Number($('waferDiameter').value);
  const unit=waferDialogLateralUnit;
  const diamUm=diamVal*UNIT_TO_UM[unit];
  const diamMm=diamUm/1000;
  if(!Number.isFinite(diamMm) || diamMm<=0){info.textContent='';return;}
  if(edge==='flat'){
    const flatMm=waferFlatLengthMm(diamMm);
    const flatInUnit=flatMm*1000/UNIT_TO_UM[unit];
    info.textContent=`Main flat at -Y: length ${formatDisplayNumber(flatInUnit)} ${unit} (SEMI for ${diamMm.toFixed(1)} mm wafer)`;
  } else if(edge==='notch'){
    const depthMm=waferNotchDepthMm(diamMm);
    const depthInUnit=depthMm*1000/UNIT_TO_UM[unit];
    info.textContent=`Notch at -Y: depth ${formatDisplayNumber(depthInUnit)} ${unit}, 90° V, opening ~${formatDisplayNumber(depthInUnit*2)} ${unit} (SEMI)`;
  }
}
function convertFields(ids,fromUnit,toUnit){const ratio=UNIT_TO_UM[fromUnit]/UNIT_TO_UM[toUnit];for(const id of ids){const el=$(id),v=Number(el.value);if(Number.isFinite(v))el.value=String(Number((v*ratio).toPrecision(10)));}}
function waferLateralUnitSelects(){return [...document.querySelectorAll('.wafer-lateral-unit')];}
function setWaferLateralUnit(unit){for(const select of waferLateralUnitSelects())select.value=unit;}
function formatCoordinateText(poly,unit){const scale=UNIT_TO_UM[unit];return poly.map(([x,y])=>`${Number((x/scale).toPrecision(10))}, ${Number((y/scale).toPrecision(10))}`).join('\n');}
function convertCoordinateTextUnits(text,fromUnit,toUnit){const ratio=UNIT_TO_UM[fromUnit]/UNIT_TO_UM[toUnit];return text.split(/\r?\n/).map(line=>{const parts=line.trim().split(/[,\s]+/).filter(Boolean);if(parts.length!==2)return line;const x=Number(parts[0]),y=Number(parts[1]);if(!Number.isFinite(x)||!Number.isFinite(y))return line;return `${Number((x*ratio).toPrecision(10))}, ${Number((y*ratio).toPrecision(10))}`;}).join('\n');}
function parseCoordinateText(text,unit){
  const scale=UNIT_TO_UM[unit],lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const poly=lines.map((line,i)=>{const parts=line.split(/[,\s]+/).filter(Boolean);if(parts.length!==2)throw new Error(`Line ${i+1}: enter one x, y coordinate pair.`);const x=Number(parts[0]),y=Number(parts[1]);if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error(`Line ${i+1}: coordinates must be numbers.`);return [x*scale,y*scale];});
  if(poly.length<3)throw new Error('Enter at least three polygon vertices.');
  if(!isSimplePolygon(poly))throw new Error('The polygon crosses itself. Check the vertex order.');
  if(Math.abs(polygonArea(poly))<1e-9)throw new Error('Polygon area must be non-zero.');
  if(polygonArea(poly)<0)poly.reverse();
  return poly;
}
function loadWaferForm(){
  const w=normalizeWafer(state.wafer||DEFAULT_WAFER),lu=w.displayUnits?.lateral||'mm',tu=w.displayUnits?.thickness||'um';waferDialogLateralUnit=lu;waferDialogThicknessUnit=tu;setWaferLateralUnit(lu);$('waferThicknessUnit').value=tu;$('waferShape').value=w.shape;$('waferMaterial').value=w.material;$('waferThickness').value=String(w.thickness/UNIT_TO_UM[tu]);
  if(w.shape==='circle'){$('waferDiameter').value=String(w.diameter/UNIT_TO_UM[lu]); if($('waferEdgeFeature')) $('waferEdgeFeature').value=w.edgeFeature||'none';}
  if(w.shape==='rect'){$('waferWidth').value=String(w.width/UNIT_TO_UM[lu]);$('waferHeight').value=String(w.height/UNIT_TO_UM[lu]);}
  $('waferCoordinates').value=formatCoordinateText(waferOutline(w),lu);
  $('waferFormError').classList.add('hidden');updateWaferShapeFields();updateWaferEdgeInfo();
}

function bindUi(){
  legendController.bindUi();
  $('newWaferBtn').addEventListener('click',()=>{
    if(state.wafer){
      const dlg=$('newWaferConfirmDialog');
      if(dlg.open) dlg.close();
      dlg.showModal();
    } else {
      loadWaferForm();$('waferDialog').showModal();
    }
  });
  $('newWaferConfirmSave')?.addEventListener('click',()=>{
    const dlg=$('newWaferConfirmDialog'); dlg.close();
    openSnapshotNameDialog('new-wafer');
  });
  $('newWaferConfirmDiscard')?.addEventListener('click',()=>{
    $('newWaferConfirmDialog').close();
    loadWaferForm();$('waferDialog').showModal();
  });
  $('snapshotNameForm').addEventListener('submit',(ev)=>{
    const purpose=snapshotNamePurpose;
    if(ev.submitter?.value==='cancel'){
      snapshotNamePurpose='snapshot';
      if(purpose==='new-wafer')requestAnimationFrame(()=>{loadWaferForm();$('waferDialog').showModal();});
      return;
    }
    ev.preventDefault();
    const name=$('snapshotNameInput').value.trim(),error=$('snapshotNameError');
    if(!name){error.textContent='Snapshot name cannot be empty.';error.classList.remove('hidden');return;}
    saveNamedSnapshot(name);$('snapshotNameDialog').close('default');snapshotNamePurpose='snapshot';
    if(purpose==='new-wafer')requestAnimationFrame(()=>{loadWaferForm();$('waferDialog').showModal();});
  });
  $('flipFaceBtn').addEventListener('click',flipActiveFace);
  $('waferShape').addEventListener('change',updateWaferShapeFields);
  for(const select of waferLateralUnitSelects())select.addEventListener('change',()=>{const next=select.value;convertFields(['waferDiameter','waferWidth','waferHeight'],waferDialogLateralUnit,next);$('waferCoordinates').value=convertCoordinateTextUnits($('waferCoordinates').value,waferDialogLateralUnit,next);waferDialogLateralUnit=next;setWaferLateralUnit(next);updateWaferEdgeInfo();});
  $('waferDiameter')?.addEventListener('input',updateWaferEdgeInfo);
  $('waferEdgeFeature')?.addEventListener('change',updateWaferEdgeInfo);
  $('waferThicknessUnit').addEventListener('change',()=>{const next=$('waferThicknessUnit').value;convertFields(['waferThickness'],waferDialogThicknessUnit,next);waferDialogThicknessUnit=next;});
  $('waferForm').addEventListener('submit',(ev)=>{
    if(ev.submitter?.value==='cancel')return;ev.preventDefault();const error=$('waferFormError');error.classList.add('hidden');
    try{
      const shape=$('waferShape').value,lu=waferDialogLateralUnit,tu=$('waferThicknessUnit').value,lateralScale=UNIT_TO_UM[lu],thicknessScale=UNIT_TO_UM[tu];
      const positive=(id,label)=>{const v=Number($(id).value);if(!Number.isFinite(v)||v<=0)throw new Error(`${label} must be positive.`);return v;};
      const wafer={shape,thickness:positive('waferThickness','Thickness')*thicknessScale,material:$('waferMaterial').value.trim()||'Si',displayUnits:{lateral:lu,thickness:tu},edgeFeature:'none'};
      if(shape==='circle'){wafer.diameter=positive('waferDiameter','Diameter')*lateralScale; wafer.edgeFeature=$('waferEdgeFeature').value||'none';}
      if(shape==='rect'){wafer.width=positive('waferWidth','Width')*lateralScale;wafer.height=positive('waferHeight','Height')*lateralScale;}
      if(shape==='custom')wafer.outline=parseCoordinateText($('waferCoordinates').value,lu);
      state.wafer=normalizeWafer(wafer);state.activeFace='front';state.solids=[];state.cuts=[];state.dopings=[];state.operationUndo=[];state._exactThickness=null;state.layerVisuals={substrate:{name:`Substrate · ${state.wafer.material}`,color:materialColor(state.wafer.material),scale:1}};state.imprintedFaces=[];state.selectedFaceIds.clear();clearTopSelection();clearPatternSelection();setDefaultSlice();state.topBounds=null;updateActiveFaceUi();updateSelectionInfo();updateLayoutSectionVisibility();fitWafer();renderGdsControls();renderAll();persistSharedState();$('waferDialog').close('default');status(`New ${shape} wafer created.`);
    }catch(e){error.textContent=e.message;error.classList.remove('hidden');}
  });
  $('gdsInput').addEventListener('change',(e)=>{const f=e.target.files?.[0];if(f)importGds(f);e.target.value='';});
  $('sliceCoordinateUnit').addEventListener('change',()=>{const next=$('sliceCoordinateUnit').value;convertFields(['sliceAx','sliceAy','sliceBx','sliceBy'],sliceCoordinateUnit,next);sliceCoordinateUnit=next;});
  $('applySliceCoordinatesBtn').addEventListener('click',()=>{if(!state.slice)return;const values=['sliceAx','sliceAy','sliceBx','sliceBy'].map(id=>Number($(id).value));if(values.some(v=>!Number.isFinite(v))){status('A–B coordinates must be valid numbers.');return;}if(values[0]===values[2]&&values[1]===values[3]){status('A and B must be different points.');return;}const scale=UNIT_TO_UM[sliceCoordinateUnit];state.slice={a:{x:values[0]*scale,y:values[1]*scale},b:{x:values[2]*scale,y:values[3]*scale}};renderTop();renderSection();render3D();status('Applied A–B section coordinates.');});
  $('gdsAlignmentUnit').addEventListener('change',()=>{const next=$('gdsAlignmentUnit').value;convertFields(['gdsOffsetX','gdsOffsetY'],gdsAlignmentUnit,next);gdsAlignmentUnit=next;});
  $('applyGdsAlignmentBtn').addEventListener('click',()=>{
    const x=Number($('gdsOffsetX').value),y=Number($('gdsOffsetY').value),rotation=Number($('gdsRotation').value),sc=Number($('gdsScale').value);
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(rotation)||!Number.isFinite(sc)||sc<=0){status('Alignment values must be valid numbers (scale >0).');return;}
    const scale=UNIT_TO_UM[gdsAlignmentUnit];
    state.gds.transform={offsetX:x*scale,offsetY:y*scale,rotationDeg:rotation,scale:sc};
    state.topBounds=null;fitLayout();renderAll();persistSharedState();
    status(`Applied alignment: X ${x} ${gdsAlignmentUnit}, Y ${y} ${gdsAlignmentUnit}, rotation ${rotation}°, scale ${sc}×.`);
  });
  $('applyPushPullBtn').addEventListener('click',applyPushPull);$('snapshotBtn').addEventListener('click',createSnapshot);$('fitWaferBtn').addEventListener('click',fitWafer);$('fitLayoutBtn').addEventListener('click',fitLayout);
  $('zExag')?.addEventListener('input',()=>setZExag($('zExag').value,'slider'));
  $('zExagNumber')?.addEventListener('change',()=>setZExag($('zExagNumber').value,'number'));
  $('zExagNumber')?.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();$('zExagNumber').blur();}});
  $('maskOpacity')?.addEventListener('input',()=>setMaskOpacity($('maskOpacity').value));
  $('showAxes').addEventListener('change',updateAxesVisibility);$('saveProjectBtn').addEventListener('click',saveProject);$('openProjectInput').addEventListener('change',(e)=>{const f=e.target.files?.[0];if(f)openProject(f);e.target.value='';});
  $('pushMode').addEventListener('change',updateOperationModeUi);updateOperationModeUi();
  $('selectionMode')?.addEventListener('change',()=>{
    state.selectedFaceIds.clear();clearTopSelection();clearPatternSelection();
    updateLayoutSectionVisibility(); updateSelectionInfo(); renderLayerList(); renderTop();
    status(isTopFaceSelection()?'Selection: full faces (model). Click a visible film top in Top View.':'Selection: Patterns — check layers below, adjust alignment/tone live, then Apply.');
  });
  $('undoOperationBtn').addEventListener('click',undoOperation);
}

bindUi();bindTopNavigation();bindSectionNavigation();syncViewControls();updateActiveFaceUi();updateSelectionInfo();updateLayoutSectionVisibility();renderLayerList();renderSnapshots();renderAll();initThree();
// Previous session banner: refresh is now a clean reset, but previous state remains restorable
try{
  const hasPrev = !!(sessionStorage.getItem('wafercad_gds') || localStorage.getItem('wafercad_shared'));
  if(hasPrev){
    const bar=document.createElement('div');
    bar.id='restoreBanner';
    bar.style.cssText='position:fixed;top:44px;left:50%;transform:translateX(-50%);z-index:90;background:#fff;border:1px solid #d8dce1;border-radius:8px;padding:8px 12px;display:flex;gap:8px;align-items:center;box-shadow:0 4px 12px rgba(0,0,0,.12);font-size:12px';
    bar.innerHTML='<span style="color:#334155">Previous session found (refresh reset to empty)</span><button id="restoreBtn" class="small primary">Restore</button><button id="discardBtn" class="small">Reset</button>';
    document.body.appendChild(bar);
    document.getElementById('restoreBtn').onclick=()=>{
      const hadTopBounds = !!state.topBounds;
      loadSharedState();
      if(window.showMainDock) window.showMainDock();
      syncViewControls();updateActiveFaceUi();updateSelectionInfo();updateLayoutSectionVisibility();renderLayerList();renderHierarchy();renderSnapshots();
      if(!state.topBounds && !hadTopBounds) fitWafer();
      renderAll();
      // Force 3D resize after dock switch (hidden canvas has zero size)
      setTimeout(()=>{ window.dispatchEvent(new Event('resize')); renderAll(); }, 80);
      setTimeout(()=>{ window.dispatchEvent(new Event('resize')); }, 300);
      try{ const ts=localStorage.getItem('wafercad_last_save_ts'); status('Restored previous session'+(ts?' — '+new Date(Number(ts)).toLocaleString():'')); }catch{ status('Restored previous session.'); }
      bar.remove();
    };
    document.getElementById('discardBtn').onclick=()=>{
      bar.remove();
      try{ sessionStorage.removeItem('wafercad_gds'); localStorage.removeItem('wafercad_shared'); localStorage.removeItem('wafercad_last_save_ts'); }catch{}
      // Reset current in-memory state to empty (no refresh needed)
      state.wafer=null; state.solids=[]; state.cuts=[]; state.dopings=[]; state.layerVisuals={}; state.imprintedFaces=[]; state.selectedFaceIds.clear(); state.patternSelectedKeys.clear(); state.slice=null; state.snapshots=[]; state.activeSnapshotId=null; state.topBounds=null; state._exactThickness=null; state.operationUndo=[];
      // also clear GDS to fully reset pattern editor
      state.gds={filename:null,bbox:null,layers:[],topCells:[],activeTopCell:null,transform:{offsetX:0,offsetY:0,rotationDeg:0,scale:1},hierarchy:[]};
      syncViewControls();updateActiveFaceUi();updateSelectionInfo();updateLayoutSectionVisibility();renderLayerList();renderHierarchy();renderSnapshots();renderAll();
      status('Reset to empty — previous session cleared. No refresh needed.');
    };
  }
}catch{}
// Dock switching: header stays, content toggles; info persists via core.state (no page reload)
(function(){
  const mainWs=$('mainWorkspace'), patWs=$('patternsWorkspace'), btnMain=$('navMainBtn'), btnPat=$('navPatternsBtn');
  if(!mainWs||!patWs||!btnMain||!btnPat) return;
  function showMain(){
    mainWs.classList.remove('hidden'); patWs.classList.add('hidden');
    btnMain.classList.add('active'); btnPat.classList.remove('active');
    // trigger Three resize after becoming visible
    setTimeout(()=>window.dispatchEvent(new Event('resize')), 50);
  }
  function showPatterns(){
    mainWs.classList.add('hidden'); patWs.classList.remove('hidden');
    btnPat.classList.add('active'); btnMain.classList.remove('active');
    // trigger patterns render
    if(window.patRender) window.patRender();
  }
  btnMain.addEventListener('click', showMain);
  btnPat.addEventListener('click', showPatterns);
  // expose for patterns Apply to Main
  window.showMainDock=showMain;
  // handle /patterns deep link
  if(location.pathname==='/patterns'){ showPatterns(); history.replaceState(null,'','/'); }
})();
fetch('/api/health').then(r=>r.json()).then(h=>{if(!h.gdstk)status("Ready. GDS import is disabled until 'gdstk' is installed.");}).catch(()=>{});
