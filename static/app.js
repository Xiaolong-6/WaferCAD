import {$,DEFAULT_WAFER,UNIT_TO_UM,clearSharedState,clone,formatDisplayNumber,hasSharedState,palette,persistSharedState,loadSharedState,rgbHexToInt,state,status,uid} from './js/core.js';
import {bboxPolys,contoursTouch,detectBorderOnly,isPolyInViewport,isSimplePolygon,normalizeWafer,pointInPoly,polygonArea,polygonTopologies,viewAspectBounds,waferBounds,waferFlatLengthMm,waferNotchDepthMm,waferOutline,waferXYScale} from './js/geometry.js';
import {GeometryJobCancelledError,cancelActiveGeometryJobs,clipPolygonsToWafer,composeMaskRegions,isotropicOffset,partitionTopSurface,resolveMaskRegions,runCancellableGeometry,splitPolygonsByMask} from './js/geometry-api.js';
import {createLayerMappingContext,displayZ,ensureLayerVisuals,layerVisual,mappedCutBounds,mappedDopingBounds,mappedSolidBounds,materialColor,nextLayerName,physicalLayerOptions,relativeThickness,solidLayerDescriptors,substrateVisualHeight} from './js/layer-model.js';
import {createLegendController} from './js/legend-controller.js';
import {CURRENT_PROJECT_VERSION,validateAndMigrateProject} from './js/project-schema.js';
import {captureDevice,internDevice,internThumbnail,pruneSnapshotDevices,resolveSnapshotDevice,resolveSnapshotThumbnail} from './js/snapshot-store.js';
import {committedProjectionIsCurrent,effectiveLayerPolygons,normalizeGds,patternLayerIsEligible,transformedGdsBounds,transformedLayerPolygon} from './js/layout-model.js';
import {clearSvg,makeSvg} from './js/svg.js';
import {createSectionView} from './js/views/section-view.js';

let THREE=null,OrbitControls=null,mergeGeometries=null;
let renderer = null, scene = null, camera = null, controls = null, deviceGroup = null, axesGroup = null;
let cameraFlipAnimation = null;
let resizeObserver = null;
let render3DFrame = null, threeLoopRunning = false, threeFrameId = null;
let waferDialogLateralUnit = 'mm', waferDialogThicknessUnit = 'um';
let gdsSourceFile = null, gdsAlignmentUnit = 'mm';
let sliceCoordinateUnit = 'mm', topPan = null, sliceDragFrame = null, sliceDragName = null;
let topSurfaceAtoms = [], topSurfaceKey = null, topSurfacePendingKey = null;
let cutUnionCacheKey=null,cutUnionPendingKey=null;
let operationInFlight=false,operationStopRequested=false,operationStartedAt=0,operationTimer=null,operationStage='';
let snapshotNamePurpose = 'snapshot';
function groupBy(items,keyOf){const groups=new Map();for(const item of items){const key=keyOf(item),group=groups.get(key);if(group)group.push(item);else groups.set(key,[item]);}return groups;}
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
function currentDeviceSnapshot(){ensureLayerVisuals();return captureDevice();}
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
function restoreDeviceSnapshot(s){state.wafer=s.wafer?normalizeWafer(clone(s.wafer)):null;state.activeFace=s.activeFace||'front';state.solids=clone(s.solids||[]);state.cuts=clone(s.cuts||[]);state.dopings=clone(s.dopings||[]);state.layerVisuals=clone(s.layerVisuals||{});state.imprintedFaces=clone(s.imprintedFaces||[]);state.gds.committedProjection=null;state.operationUndo=[];ensureLayerVisuals();state.selectedFaceIds.clear();clearPatternSelection();clearTopSelection();setDefaultSlice();state.topBounds=null;updateActiveFaceUi();updateSelectionInfo();updateLayoutSectionVisibility();renderAll();persistSharedState();}

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
function surfaceGeometryKey(){
  if(!state.wafer)return 'empty';
  const wafer=state.wafer;
  return JSON.stringify([
    state.activeFace,wafer.shape,wafer.diameter,wafer.width,wafer.height,wafer.thickness,wafer.outline,
    state.solids.map(s=>[s.id,s.side,s.layerId,s.zMin,s.zMax,s.footprint]),
    state.cuts.map(c=>[c.id,c.side,c.zMin,c.zMax,c.footprint]),
  ]);
}
async function ensureTopSurfacePartition(force=false){
  const key=surfaceGeometryKey();
  if(key==='empty'){topSurfaceAtoms=[];topSurfaceKey=key;topSurfacePendingKey=null;return [];}
  if(!force&&topSurfaceKey===key)return topSurfaceAtoms;
  if(!force&&topSurfacePendingKey===key)return null;
  topSurfacePendingKey=key;
  try{
    const atoms=await partitionTopSurface();
    if(surfaceGeometryKey()!==key)return null;
    topSurfaceAtoms=atoms;topSurfaceKey=key;
    const valid=new Set(atoms.map(atom=>atom.id));
    for(const id of [...state._topFaceSelection.selectedSolidIds])if(!valid.has(id))state._topFaceSelection.selectedSolidIds.delete(id);
    updateSelectionInfo();renderTop();
    return atoms;
  }catch(error){if(surfaceGeometryKey()===key)status(`Top-surface partition failed: ${error.message}`);return null;}
  finally{if(topSurfacePendingKey===key)topSurfacePendingKey=null;}
}
function invalidateTopSurfacePartition(){topSurfaceKey=null;topSurfacePendingKey=null;topSurfaceAtoms=[];}
function cutGeometryKey(){return state.wafer?JSON.stringify([state.wafer.thickness,state.cuts.map(c=>[c.id,c.side,c.zMin,c.zMax,c.wholeFace,c.partitionBatchId,c.footprint])]):'empty';}
function substrateZBounds(){return state.wafer?[-state.wafer.thickness,0,...state.cuts.flatMap(c=>[Math.max(-state.wafer.thickness,c.zMin),Math.min(0,c.zMax)])].sort((a,b)=>a-b).filter((v,i,a)=>i===0||Math.abs(v-a[i-1])>1e-9):[];}
function isKnownPartitionBatch(cuts){
  if(!cuts.length)return false;
  const batchId=cuts[0].partitionBatchId;
  if(batchId&&cuts.every(c=>c.partitionBatchId===batchId))return true;
  // Projects saved before partitionBatchId existed still contain one exact surface
  // partition per slab.  This signature distinguishes those generated cuts from
  // arbitrary/imported cut geometry, which must still pass through boolean union.
  return !batchId&&cuts.every(c=>!c.partitionBatchId&&c.target==='substrate'&&c.sourceFaceId==null&&c.wholeFace===false&&c.side===cuts[0].side&&c.zMin===cuts[0].zMin&&c.zMax===cuts[0].zMax&&c.profile===cuts[0].profile&&Number(c.lateralRadius||0)===Number(cuts[0].lateralRadius||0));
}
let substrateSlabRegions=new Map();
function contourPerimeter(polygon){let total=0;for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];total+=Math.hypot(b[0]-a[0],b[1]-a[1]);}return total;}
async function ensureCutUnionCache(){
  const key=cutGeometryKey();if(cutUnionCacheKey===key||cutUnionPendingKey===key)return;cutUnionPendingKey=key;
  try{
    const waferOutlinePoly=waferOutline();
    const bounds=substrateZBounds();
    const entries=await Promise.all(bounds.slice(0,-1).map(async(low, idx)=>{
      const high=bounds[idx+1];
      const active=state.cuts.filter(c=>c.zMin<=low+1e-8&&c.zMax>=high-1e-8);
      if(!active.length){
        return [`${low}|${high}`, {zMin:low, zMax:high, remainingRegions:[waferOutlinePoly], remainingTopologies:[{outer:waferOutlinePoly,holes:[]}],unionRegions:[],activeCount:0,isEmpty:false,useHoles:false,reusedPartition:false}];
      }
      if(active.some(cut=>cut.wholeFace===true)){
        return [`${low}|${high}`, {zMin:low,zMax:high,remainingRegions:[],remainingTopologies:[],unionRegions:[waferOutlinePoly],activeCount:active.length,isEmpty:true,useHoles:false,reusedPartition:true}];
      }
      // Compute remaining substrate = wafer - union(active)
      // Use backend block operation for exact remaining
      let remainingRegions, unionRegions;
      const reusedPartition=isKnownPartitionBatch(active);
      if(reusedPartition){
        unionRegions=active.map(c=>c.footprint);
        // For known partition, check if union covers whole wafer (whole-face)
        const remainingCheck=await composeMaskRegions(active.map(c=>c.footprint),'block', waferOutlinePoly);
        remainingRegions=remainingCheck.regions;
      } else {
        const [unionRes, remainingRes]=await Promise.all([
          composeMaskRegions(active.map(c=>c.footprint),'transmit',null),
          composeMaskRegions(active.map(c=>c.footprint),'block', waferOutlinePoly)
        ]);
        unionRegions=unionRes.regions;
        remainingRegions=remainingRes.regions;
      }
      const remainingArea=remainingRegions.reduce((sum,region)=>sum+Math.abs(polygonArea(region)),0),booleanPrecisionArea=contourPerimeter(waferOutlinePoly)*2e-6;
      const isEmpty=remainingRegions.length===0||remainingArea<=booleanPrecisionArea;
      if(isEmpty)remainingRegions=[];
      const touchesBoundary=!isEmpty&&unionRegions.some(region=>contoursTouch(region,waferOutlinePoly));
      const useHoles=!isEmpty && !touchesBoundary && unionRegions.length>0;
      const remainingTopologies=useHoles?[]:remainingRegions.flatMap(polygonTopologies);
      return [`${low}|${high}`, {zMin:low,zMax:high,remainingRegions,remainingTopologies,unionRegions,activeCount:active.length,isEmpty,useHoles,reusedPartition}];
    }));
    if(cutGeometryKey()!==key) return;
    substrateSlabRegions=new Map(entries);
    state._cutUnionStats=entries.map(([k,v])=>({slab:k, sourceCount:v.activeCount, regionCount:v.useHoles?v.unionRegions.length:v.remainingRegions.length, isEmpty:v.isEmpty, useHoles:v.useHoles, remainingCount:v.remainingRegions.length, reusedPartition:v.reusedPartition}));
    state._substrateSlabRegions=entries.map(([k,v])=>({slab:k,zMin:v.zMin,zMax:v.zMax,remainingCount:v.remainingRegions.length,holeCount:(v.remainingTopologies||[]).reduce((sum,topology)=>sum+topology.holes.length,0),isEmpty:v.isEmpty,useHoles:v.useHoles}));
    cutUnionCacheKey=key;
    sectionView.syncControls();sectionView.render();render3D();
  } catch(error){if(cutGeometryKey()===key)status(`Substrate slab Boolean failed: ${error.message}`);}
  finally{if(cutUnionPendingKey===key)cutUnionPendingKey=null;}
}
function niceScaleDistance(target){if(!(target>0))return 1;const power=10**Math.floor(Math.log10(target)),normalized=target/power;return (normalized>=5?5:normalized>=2?2:1)*power;}
function appendTopScaleBar(svg){
  if(!state.topBounds)return;const span=state.topBounds[2]-state.topBounds[0],distance=niceScaleDistance(span*.16),pixels=distance/span*600,x=18,y=392,label=distance>=1000?`${Number((distance/1000).toPrecision(3))} mm`:`${Number(distance.toPrecision(3))} µm`,group=makeSvg('g',{'data-scale-bar':'top','pointer-events':'none'});
  group.appendChild(makeSvg('rect',{x:x-7,y:y-24,width:pixels+14,height:31,rx:4,fill:'#fff','fill-opacity':'.82'}));group.appendChild(makeSvg('line',{x1:x,y1:y,x2:x+pixels,y2:y,stroke:'#27313b','stroke-width':'3'}));group.appendChild(makeSvg('line',{x1:x,y1:y-5,x2:x,y2:y+5,stroke:'#27313b','stroke-width':'2'}));group.appendChild(makeSvg('line',{x1:x+pixels,y1:y-5,x2:x+pixels,y2:y+5,stroke:'#27313b','stroke-width':'2'}));const text=makeSvg('text',{x:x+pixels/2,y:y-8,'text-anchor':'middle','font-size':'11','font-weight':'700',fill:'#27313b'});text.textContent=label;group.appendChild(text);svg.appendChild(group);
}
function placeCameraOnActiveFace(){if(!camera)return;const back=state.activeFace==='back';camera.position.x=back?-Math.abs(camera.position.x):Math.abs(camera.position.x);camera.position.z=back?-Math.abs(camera.position.z):Math.abs(camera.position.z);controls?.update();}
function updateActiveFaceUi(syncCamera=true){const back=state.activeFace==='back';$('activeFaceLabel').textContent=back?'Back face':'Front face';$('flipFaceBtn').textContent=back?'Back':'Front';$('flipFaceBtn').disabled=!state.wafer;if(syncCamera)placeCameraOnActiveFace();}
function startCameraFaceFlip(){if(!camera||!controls)return;const target=controls.target.clone(),relative=camera.position.clone().sub(target);cameraFlipAnimation={started:performance.now(),duration:720,target,relative};controls.enabled=false;}
function updateCameraFaceFlip(now){if(!cameraFlipAnimation)return;const a=cameraFlipAnimation,t=Math.min(1,(now-a.started)/a.duration),eased=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,angle=Math.PI*eased,c=Math.cos(angle),s=Math.sin(angle),r=a.relative;camera.position.set(a.target.x+r.x*c+r.z*s,a.target.y+r.y,a.target.z-r.x*s+r.z*c);camera.lookAt(a.target);if(t>=1){cameraFlipAnimation=null;controls.enabled=true;controls.update();}}
function flipActiveFace(){if(!state.wafer)return;state.activeFace=state.activeFace==='front'?'back':'front';state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();updateActiveFaceUi(false);startCameraFaceFlip();renderAll();persistSharedState();status(`Active processing face: ${state.activeFace}. The 3D camera is flipping to the ${state.activeFace} side.`);}
function formatSliceInput(value){const decimals={nm:1,um:3,mm:4,cm:5}[sliceCoordinateUnit]??4;return String(Number(Number(value).toFixed(decimals)));}
function updateSliceInputs(){const focused=document.activeElement;if(!state.slice){for(const id of ['sliceAx','sliceAy','sliceBx','sliceBy']){$(id).value='';$(id).disabled=true;}$('applySliceCoordinatesBtn').disabled=true;return;}const scale=UNIT_TO_UM[sliceCoordinateUnit],values={sliceAx:state.slice.a.x/scale,sliceAy:state.slice.a.y/scale,sliceBx:state.slice.b.x/scale,sliceBy:state.slice.b.y/scale};for(const [id,value] of Object.entries(values)){const input=$(id);input.disabled=false;if(focused!==input)input.value=formatSliceInput(value);}$('applySliceCoordinatesBtn').disabled=false;$('sliceCoordinateUnit').value=sliceCoordinateUnit;}

function renderTop(){
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
    const currentSurfaceAtoms=topSurfaceKey===surfaceGeometryKey()?topSurfaceAtoms:null;
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
    for(const atom of topSurfaceAtoms){
      if(atom.side!==state.activeFace||!isPolyInViewport(atom.polygon,viewport))continue;
      const selected=state._topFaceSelection.selectedSolidIds.has(atom.id);
      const path=makeSvg('path',{d:polyPath(atom.polygon),fill:selected?'#f59e0b':atom.kind==='substrate'?'#ffffff':'#60a5fa','fill-opacity':selected?'0.42':atom.kind==='substrate'?'0.05':'0.18',stroke:selected?'#d97706':atom.kind==='substrate'?'#64748b':'#2563eb','stroke-opacity':atom.kind==='substrate'?'0.35':'1','stroke-width':selected?'2.2':'1.2','data-surface-face':atom.id,'data-source-id':atom.sourceId,'data-surface-kind':atom.kind});
      path.style.cursor='pointer';
      path.addEventListener('click',(ev)=>{ev.stopPropagation();if(state._topFaceSelection.selectedSolidIds.has(atom.id))state._topFaceSelection.selectedSolidIds.delete(atom.id);else state._topFaceSelection.selectedSolidIds.add(atom.id);updateSelectionInfo();renderTop();});
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
      path.addEventListener('click',(ev)=>{ev.stopPropagation(); if(state.selectedFaceIds.has(face.id)) state.selectedFaceIds.delete(face.id); else state.selectedFaceIds.add(face.id); updateSelectionInfo(); renderTop();});
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
  g.addEventListener('pointerdown',(ev)=>{sliceDragName=name;ev.preventDefault();ev.stopPropagation();});
}
function bindTopNavigation(){
  const svg=$('topSvg');
  svg.addEventListener('wheel',(ev)=>{if(!state.topBounds)return;ev.preventDefault();const rect=svg.getBoundingClientRect(),sx=(ev.clientX-rect.left)/rect.width*600,sy=(ev.clientY-rect.top)/rect.height*420,anchor=svgToModel(sx,sy),factor=Math.exp(Math.max(-500,Math.min(500,ev.deltaY))*.0015),[x0,y0,x1,y1]=state.topBounds;state.topBounds=[anchor.x+(x0-anchor.x)*factor,anchor.y+(y0-anchor.y)*factor,anchor.x+(x1-anchor.x)*factor,anchor.y+(y1-anchor.y)*factor];renderTop();},{passive:false});
  svg.addEventListener('pointerdown',(ev)=>{if(ev.button!==0||ev.target!==svg||!state.topBounds)return;svg.setPointerCapture(ev.pointerId);topPan={x:ev.clientX,y:ev.clientY,bounds:[...state.topBounds]};svg.style.cursor='grabbing';});
  window.addEventListener('pointermove',(ev)=>{if(!sliceDragName||!state.slice)return;const rect=svg.getBoundingClientRect(),sx=(ev.clientX-rect.left)/rect.width*600,sy=(ev.clientY-rect.top)/rect.height*420;state.slice[sliceDragName.toLowerCase()]=svgToModel(sx,sy);if(!sliceDragFrame)sliceDragFrame=requestAnimationFrame(()=>{sliceDragFrame=null;renderTop();sectionView.render();});});
  svg.addEventListener('pointermove',(ev)=>{if(sliceDragName||!topPan)return;const rect=svg.getBoundingClientRect(),[x0,y0,x1,y1]=topPan.bounds,dx=(ev.clientX-topPan.x)/rect.width*(x1-x0),dy=(ev.clientY-topPan.y)/rect.height*(y1-y0),mx=state.activeFace==='back'?dx:-dx;state.topBounds=[x0+mx,y0+dy,x1+mx,y1+dy];renderTop();});
  const end=()=>{topPan=null;svg.style.cursor='';};svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
  const endSlice=()=>{if(!sliceDragName)return;sliceDragName=null;render3D();};window.addEventListener('pointerup',endSlice);window.addEventListener('pointercancel',endSlice);
  svg.addEventListener('dblclick',()=>fitLayout());
}

function currentSubstrateSlabs(){
  if(!state.wafer)return [];
  const key=cutGeometryKey();
  if(cutUnionCacheKey===key)return [...substrateSlabRegions.values()];
  if(!state.cuts.length)return [{zMin:-state.wafer.thickness,zMax:0,remainingRegions:[waferOutline()],unionRegions:[],isEmpty:false,useHoles:false}];
  return null;
}
const sectionView=createSectionView({getSubstrateSlabs:currentSubstrateSlabs,ensureSubstrateSlabs:ensureCutUnionCache});
if((new URLSearchParams(location.search).get('qa')||'').includes('refill'))window.wafercadRefillDiagnostics=()=>({operation:state._lastOperationDebug||null,renderBounds:clone(state._solidRenderBounds||[]),section:sectionView.debugEntries()});

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
    if(n) {$('selectionInfo').textContent=`${n} exposed surface region${n>1?'s':''} selected.`;}
    else {$('selectionInfo').textContent=`No exposed region selected — the whole ${state.activeFace} surface will be used.`;}
    return;
  }
  if(isPatternsSelection()){
    const projection=state.gds.committedProjection;
    if(Array.isArray(projection?.regions)&&projection.regions.length&&committedProjectionIsCurrent(projection))$('selectionInfo').textContent=`Committed ${projection.face||'front'} substrate projection: ${projection.regions.length} region${projection.regions.length>1?'s':''} · polygons ${projection.polarity==='block'?'block':'transmit'}.`;
    else if(Array.isArray(projection?.regions)&&projection.regions.length)$('selectionInfo').textContent='Committed projection is stale because the wafer or mask source changed. Recommit it in Pattern Editor.';
    else $('selectionInfo').textContent='No substrate projection committed — open Pattern Editor, inspect Wafer Projection, then commit it.';
    return;
  }
  const n=state.selectedFaceIds.size;$('selectionInfo').textContent=n?`${n} patterned face${n>1?'s':''} selected.`:`No pattern selected — the whole ${state.activeFace} face will be used.`;
}

async function buildMaterialConsumption(surfaceAtoms,distance,mode,wholeFace=false){
  const groups=new Map(),eps=1e-7,t=state.wafer.thickness;
  for(const atom of surfaceAtoms){const side=atom.side||state.activeFace,surface=Number(atom.surface),key=`${side}|${surface.toFixed(6)}`,group=groups.get(key)||{side,surface,masks:[]};group.masks.push(atom.polygon);groups.set(key,group);}
  let working=clone(state.solids),workingDopings=clone(state.dopings);const substrateCuts=[],partitionBatchId=uid('cut-batch');
  for(const group of groups.values()){
    const front=group.side!=='back',cutLow=group.surface-distance,cutHigh=group.surface+distance,candidates=working.filter(s=>front?(s.zMax>cutLow+eps&&s.zMin<group.surface-eps):(s.zMin<cutHigh-eps&&s.zMax>group.surface+eps));
    if(candidates.length){const split=await splitPolygonsByMask(candidates.map(s=>s.footprint),group.masks),candidateIds=new Set(candidates.map(s=>s.id)),next=working.filter(s=>!candidateIds.has(s.id));for(let i=0;i<candidates.length;i++){const solid=candidates[i];for(const polygon of split.remaining[i])next.push({...clone(solid),id:uid('solid'),footprint:polygon});if(front){const residualMax=Math.min(solid.zMax,cutLow);if(residualMax>solid.zMin+eps)for(const polygon of split.overlaps[i])next.push({...clone(solid),id:uid('solid'),footprint:polygon,zMax:residualMax});}else{const residualMin=Math.max(solid.zMin,cutHigh);if(solid.zMax>residualMin+eps)for(const polygon of split.overlaps[i])next.push({...clone(solid),id:uid('solid'),footprint:polygon,zMin:residualMin});}}working=next;}
    const dopingCandidates=workingDopings.filter(d=>front?(d.zMax>cutLow+eps&&d.zMin<group.surface-eps):(d.zMin<cutHigh-eps&&d.zMax>group.surface+eps));if(dopingCandidates.length){const split=await splitPolygonsByMask(dopingCandidates.map(d=>d.footprint),group.masks),candidateIds=new Set(dopingCandidates.map(d=>d.id)),next=workingDopings.filter(d=>!candidateIds.has(d.id));for(let i=0;i<dopingCandidates.length;i++){const doping=dopingCandidates[i];for(const polygon of split.remaining[i])next.push({...clone(doping),id:uid('doping-region'),footprint:polygon});if(front){const residualMax=Math.min(doping.zMax,cutLow);if(residualMax>doping.zMin+eps)for(const polygon of split.overlaps[i])next.push({...clone(doping),id:uid('doping-region'),footprint:polygon,zMax:residualMax,depth:residualMax-doping.zMin});}else{const residualMin=Math.max(doping.zMin,cutHigh);if(doping.zMax>residualMin+eps)for(const polygon of split.overlaps[i])next.push({...clone(doping),id:uid('doping-region'),footprint:polygon,zMin:residualMin,depth:doping.zMax-residualMin});}}workingDopings=next;}
    const substrateMin=front?Math.max(-t,cutLow):Math.max(-t,group.surface),substrateMax=front?Math.min(0,group.surface):Math.min(0,cutHigh),substrateMasks=wholeFace&&groups.size===1?[waferOutline()]:group.masks;if(substrateMax>substrateMin+eps)for(const footprint of substrateMasks)substrateCuts.push({id:uid('cut'),side:group.side,footprint:clone(footprint),zMin:substrateMin,zMax:substrateMax,sourceFaceId:null,target:'substrate',wholeFace:wholeFace&&groups.size===1,profile:mode==='isotropic-etch'?'isotropic':'vertical',lateralRadius:mode==='isotropic-etch'?distance:0,partitionBatchId});
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
function setOperationStage(message){operationStage=message;status(message);const button=$('applyPushPullBtn');if(button&&operationInFlight)button.title=message;}
function setOperationBusy(busy){
  const button=$('applyPushPullBtn');operationInFlight=busy;
  if(!button)return;
  if(operationTimer){clearInterval(operationTimer);operationTimer=null;}
  if(!busy){operationStopRequested=false;button.disabled=false;button.classList.remove('stop');button.textContent='Apply operation';button.title='';return;}
  operationStopRequested=false;operationStartedAt=performance.now();button.disabled=false;button.classList.add('stop');
  const tick=()=>{const elapsed=Math.max(0,Math.floor((performance.now()-operationStartedAt)/1000));button.textContent=operationStopRequested?`Stopping… ${elapsed}s`:`Stop · ${elapsed}s`;button.title=operationStopRequested?'Waiting for the geometry worker to terminate…':`${operationStage} Click to stop.`;};
  tick();operationTimer=setInterval(tick,250);
}
async function stopOperation(){
  if(!operationInFlight||operationStopRequested)return;
  operationStopRequested=true;setOperationStage('Stopping the active geometry worker…');$('applyPushPullBtn').disabled=true;
  await cancelActiveGeometryJobs();
}
function undoOperation(){const previous=state.operationUndo.pop();if(!previous)return;state.solids=previous.solids||[];state.cuts=previous.cuts||[];state.dopings=previous.dopings||[];state.layerVisuals=previous.layerVisuals||{};ensureLayerVisuals();state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();renderAll();updateUndoUi();persistSharedState();status('Undid the last geometry operation.');}
async function applyDoping(distance,dopant){
  const targetLayerId=$('dopingTargetLayer').value;
  setOperationStage('Partitioning the exposed target surface for doping…');
  let atoms;try{atoms=await partitionTopSurface();}catch(error){if(error instanceof GeometryJobCancelledError)throw error;status(`Doping failed: ${error.message}`);return;}
  const targets=atoms.filter(atom=>atom.layerId===targetLayerId);if(!targets.length){status('The selected target layer has no exposed region on the active face.');return;}
  recordOperationUndo();const layerId=uid('doping'),name=nextLayerName(`Doping · ${dopant}`),front=state.activeFace!=='back',position=front?'upper':'lower';state.layerVisuals[layerId]={name,color:materialColor(dopant),scale:1,gradient:true};
  let maxDepth=0;
  for(const target of targets){const available=Math.max(0,target.zMax-target.zMin),depth=Math.min(distance,available);if(depth<=0)continue;maxDepth=Math.max(maxDepth,depth);const zMin=front?target.surface-depth:target.surface,zMax=front?target.surface:target.surface+depth;state.dopings.push({id:uid('doping-region'),layerId,targetLayerId,dopant,position,depth,footprint:clone(target.polygon),zMin,zMax});}
  invalidateTopSurfacePartition();renderAll();persistSharedState();status(`Added ${dopant} doping ${maxDepth.toFixed(3)} µm inward from the exposed ${state.activeFace} surface of ${layerVisual(targetLayerId).name}.`);
}
export function availableMaterialDepth(frontAtoms,backAtoms){
  const frontByGeometry=new Map(frontAtoms.map(atom=>[atom.geometryId,atom])),backByGeometry=new Map(backAtoms.map(atom=>[atom.geometryId,atom])),keys=new Set([...frontByGeometry.keys(),...backByGeometry.keys()]);
  const depths=[];
  for(const key of keys){
    const frontAtom=frontByGeometry.get(key),backAtom=backByGeometry.get(key);
    if(!frontAtom||!backAtom)return null;
    const depth=Number(frontAtom.surface)-Number(backAtom.surface);
    const tolerance=1e-7*Math.max(1,Math.abs(Number(frontAtom.surface)),Math.abs(Number(backAtom.surface)));
    if(!Number.isFinite(depth)||depth < -tolerance)return null;
    depths.push(Math.max(0,depth));
  }
  if(!depths.length)return null;
  const minimum=Math.min(...depths),maximum=Math.max(...depths),tolerance=1e-7*Math.max(1,Math.abs(minimum),Math.abs(maximum));
  return {minimum,maximum,mixed:maximum-minimum>tolerance};
}
async function runPushPull(){
  if(!state.wafer){status('Create or open a wafer before using Push / Pull.');return;}
  const distance=Number($('distanceInput').value)*Number($('distanceUnit').value); if(!Number.isFinite(distance)||distance<=0){status('Distance must be positive.');return;}
  const mode=$('pushMode').value, material=$('materialInput').value.trim()||'Generic film';
  if(mode==='doping'){await applyDoping(distance,material==='Generic film'?'Dopant':material);return;}
  let wholeFace, selected;
  if(isTopFaceSelection()){
    const ids=state._topFaceSelection.selectedSolidIds;
    wholeFace=ids.size===0;
    if(wholeFace) selected=[{id:null,side:state.activeFace,polygon:waferOutline(),wholeFace:true}];
    else {
      const atoms=await ensureTopSurfacePartition();
      selected=(atoms||topSurfaceAtoms).filter(atom=>ids.has(atom.id)&&atom.side===state.activeFace).map(atom=>({id:atom.id,side:atom.side,polygon:clone(atom.polygon),wholeFace:false}));
      if(!selected.length){status('Selected exposed face regions are no longer present.');return;}
    }
  } else if(isPatternsSelection()){
    if(state.gds.truncated===true){status(`Layout is incomplete at the ${state.gds.polygonLimit||20000}-polygon import limit. Projection-based processing is blocked.`);return;}
    const projection=state.gds.committedProjection;
    if(!Array.isArray(projection?.regions)||!projection.regions.length){status('No substrate projection committed. Open Pattern Editor → Wafer Projection and commit it first.');return;}
    if(!committedProjectionIsCurrent(projection)){status('The committed projection is stale. Reopen Pattern Editor and commit the current wafer/mask projection.');return;}
    if((projection.face||'front')!==state.activeFace){status(`The committed projection targets the ${projection.face||'front'} face. Commit a projection for the active ${state.activeFace} face first.`);return;}
    wholeFace=false;
    selected=projection.regions.map(polygon=>({id:'committed-projection',side:state.activeFace,polygon:clone(polygon),wholeFace:false}));
  } else {
    wholeFace=state.selectedFaceIds.size===0;
    selected=wholeFace?[{id:null,side:state.activeFace,polygon:waferOutline(),wholeFace:true}]:state.imprintedFaces.filter(f=>state.selectedFaceIds.has(f.id));
  }
  setOperationStage(wholeFace?`Preparing the whole ${state.activeFace} face…`:'Clipping selected faces to the substrate…');let clipped;try{clipped=await clipPolygonsToWafer(selected.map(f=>f.polygon));}catch(e){if(e instanceof GeometryJobCancelledError)throw e;status(`Push / pull failed: ${e.message}`);return;}
  let pieces=[];clipped.forEach((parts,i)=>parts.forEach(polygon=>pieces.push({face:selected[i],polygon})));
  if(!pieces.length){state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();renderTop();status('No selected area overlaps the substrate. Nothing was created.');return;}
  if(mode==='conformal-grow'||mode==='isotropic-etch'){
    setOperationStage(mode==='conformal-grow'?'Calculating conformal growth…':'Calculating isotropic etch…');let regions;try{regions=await isotropicOffset(pieces.map(p=>p.polygon),distance);}catch(e){if(e instanceof GeometryJobCancelledError)throw e;status(`Operation failed: ${e.message}`);return;}
    pieces=regions.map(polygon=>({face:{id:null,side:state.activeFace},polygon}));if(!pieces.length){state.selectedFaceIds.clear();clearTopSelection();updateSelectionInfo();renderTop();status('The isotropic operation produced no region inside the substrate.');return;}
  }
  setOperationStage('Partitioning the exposed material surface…');let surfaceAtoms;try{surfaceAtoms=await partitionTopSurface(pieces.map(piece=>piece.polygon));}catch(error){if(error instanceof GeometryJobCancelledError)throw error;status(`Operation failed: ${error.message}`);return;}
  if(!surfaceAtoms.length){status('The selected mask does not overlap an exposed material surface.');return;}
  const operationDiagnostics=correctnessDiagnosticsEnabled()?{mode,projectionRegionCount:pieces.length,requestedArea:pieces.reduce((sum,piece)=>sum+Math.abs(polygonArea(piece.polygon)),0),inputSurfaceAtoms:operationAtomDiagnostics(surfaceAtoms),outputSurfaceAtoms:[],createdSolids:[]}:null;
  // Preflight for destructive Push: ensure requested depth does not exceed locally available material
  if(mode==='down'||mode==='isotropic-etch'){
    setOperationStage('Validating available material depth…');
    const masksForCheck=pieces.map(piece=>piece.polygon);
    const oppositeSide=state.activeFace==='front'?'back':'front';
    let oppositeAtoms;
    try{ oppositeAtoms=await partitionTopSurface(masksForCheck, oppositeSide); }catch(error){ if(error instanceof GeometryJobCancelledError) throw error; status(`Depth validation failed: ${error.message}`); return; }
    const isFront=state.activeFace==='front';
    const frontAtoms=isFront? surfaceAtoms : oppositeAtoms;
    const backAtoms=isFront? oppositeAtoms : surfaceAtoms;
    const availability=availableMaterialDepth(frontAtoms,backAtoms);
    if(!availability){status('Unable to validate a continuous material path through every selected region. No geometry was changed.');return;}
    const tolerance=1e-7*Math.max(1,Math.abs(distance),Math.abs(availability.minimum));
    if(distance>availability.minimum+tolerance){
      status(availability.mixed
        ?`Requested Push depth ${formatDisplayNumber(distance)} µm exceeds the minimum available thickness of ${formatDisplayNumber(availability.minimum)} µm across the selected regions.`
        :`Requested Push depth ${formatDisplayNumber(distance)} µm exceeds the available material thickness of ${formatDisplayNumber(availability.minimum)} µm in the selected region.`);
      return;
    }
  }
  if(mode==='up'||mode==='conformal-grow'){
    recordOperationUndo();
    const layerId=uid('layer');state.layerVisuals[layerId]={name:nextLayerName(material),color:materialColor(material),scale:1,baseThickness:distance};
    for(const atom of surfaceAtoms){const side=atom.side||state.activeFace,z0=atom.surface,solid={id:uid('solid'),layerId,side,material,footprint:clone(atom.polygon),zMin:side==='back'?z0-distance:z0,zMax:side==='back'?z0:z0+distance,sourceFaceId:atom.id,wholeFace,profile:mode==='conformal-grow'?'conformal':'vertical',lateralRadius:mode==='conformal-grow'?distance:0};state.solids.push(solid);if(operationDiagnostics)operationDiagnostics.createdSolids.push({id:solid.id,zMin:solid.zMin,zMax:solid.zMax});}
    status(mode==='conformal-grow'?`Conformally grew ${material} with a ${distance.toFixed(3)} µm isotropic radius on the ${state.activeFace} face.`:(wholeFace?`Created a ${distance.toFixed(3)} µm ${material} blanket layer on the ${state.activeFace} face.`:`Pulled ${pieces.length} substrate-bounded region(s) from the ${state.activeFace} face by ${distance.toFixed(3)} µm.`));
  }else{
    const previousNames=new Map(solidLayerDescriptors().map(d=>[d.id,layerVisual(d.id).name]));setOperationStage('Calculating layer-by-layer material consumption…');let consumed;try{consumed=await buildMaterialConsumption(surfaceAtoms,distance,mode,wholeFace);}catch(e){if(e instanceof GeometryJobCancelledError)throw e;status(`Operation failed: ${e.message}`);return;}recordOperationUndo();state.solids=consumed.solids;state.dopings=consumed.dopings;state.cuts=consumed.cuts;const removed=cleanupConsumedLayers(previousNames),removedText=removed.length?` Removed layer${removed.length>1?'s':''}: ${removed.join(', ')}.`:'';
    status(mode==='isotropic-etch'?`Isotropically etched inward from the ${state.activeFace} surface by ${distance.toFixed(3)} µm.${removedText}`:`Pushed inward from the ${state.activeFace} surface by ${distance.toFixed(3)} µm.${removedText}`);
  }
  // Keep Patterns selection for iterative tuning; clear legacy imprinted/top
  state.selectedFaceIds.clear();clearTopSelection();invalidateTopSurfacePartition();
  if(operationDiagnostics){try{operationDiagnostics.outputSurfaceAtoms=operationAtomDiagnostics(await partitionTopSurface(pieces.map(piece=>piece.polygon)));}catch(error){operationDiagnostics.outputError=error.message;}state._lastOperationDebug=operationDiagnostics;}
  updateSelectionInfo();renderAll();persistSharedState();
}
async function applyPushPull(){
  if(operationInFlight){await stopOperation();return;}
  operationStage='Validating operation…';setOperationBusy(true);
  try{await runCancellableGeometry(()=>runPushPull());}
  catch(error){status(error instanceof GeometryJobCancelledError?'Operation stopped. No unfinished geometry was applied.':`Operation failed: ${error.message}`);}
  finally{setOperationBusy(false);}
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
    const vis=document.createElement('input');vis.type='checkbox';vis.checked=layer.visible!==false;vis.addEventListener('change',()=>{layer.visible=vis.checked;renderTop();persistSharedState();});
    const visText=document.createElement('span');visText.textContent='Show';
    visLabel.append(vis,visText);
    // Context classification is a hint; only geometry validity limits processing.
    const areaOk=patternLayerIsEligible(layer);
    const patLabel=document.createElement('label');patLabel.className='check-text pat-check';
    patLabel.title=areaOk?'Use in Patterns Apply — multi-select, combined on Apply':'No selected area geometry — select components or close the shape';
    const pat=document.createElement('input');pat.type='checkbox';pat.checked=state.patternSelectedKeys.has(layer.key);
    if(!areaOk&&!pat.checked){pat.disabled=true;patLabel.style.opacity='0.45';}
    pat.addEventListener('change',()=>{
      if(pat.checked) state.patternSelectedKeys.add(layer.key); else state.patternSelectedKeys.delete(layer.key);
      updateSelectionInfo(); renderLayerList(); renderTop();persistSharedState();
      status(pat.checked?`Pattern ${layer.layer}/${layer.datatype} selected.`:`Pattern ${layer.layer}/${layer.datatype} deselected.`);
    });
    if(!patternsMode) patLabel.style.display='none';
    const patText=document.createElement('span');patText.textContent='Use';
    patLabel.append(pat,patText);
    if(layer.isBorderOnly===true){
      const hint=document.createElement('span');hint.className='muted';hint.textContent='possible frame/context';hint.title='Automatic visual hint only — select Use to include this geometry';
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
      if(value===null) return; layer.alias=value.trim(); renderLayerList(); renderTop();persistSharedState();
    });
    const count=document.createElement('span');count.className='muted';count.textContent=`${layer.count||layer.polygons.length}`;
    head.append(patLabel,visLabel,sw,strong,count);item.appendChild(head);
    const options=document.createElement('div');options.className='layer-options';
    const tone=document.createElement('label');tone.className='layer-tone';const invert=document.createElement('input');invert.type='checkbox';invert.checked=layer.inverted===true;
    invert.addEventListener('change',()=>{layer.inverted=invert.checked;status(`Layer ${layer.layer}/${layer.datatype} tone: ${layer.inverted?'inverted':'normal'}.`); renderTop();persistSharedState();});
    tone.append(invert,document.createTextNode('Invert'));options.appendChild(tone);
    const fillLabel=document.createElement('label');fillLabel.className='layer-tone';const fill=document.createElement('input');fill.type='checkbox';fill.checked=layer.fillPattern===true;
    fill.addEventListener('change',async()=>{
      fill.disabled=true;const enabled=fill.checked;
      try{await setLayerFillPattern(layer,enabled);status(`Layer ${layer.layer}/${layer.datatype}: ${enabled?'filled closed patterns':'original geometry'}.`);}catch(e){fill.checked=!enabled;status(`Fill pattern failed: ${e.message}`);}finally{fill.disabled=false;}
    });fillLabel.append(fill,document.createTextNode('Fill pattern'));options.appendChild(fillLabel);
    const mirrorLabel=document.createElement('label');mirrorLabel.className='layer-tone';const mirror=document.createElement('input');mirror.type='checkbox';mirror.checked=layer.mirrored===true;
    mirror.addEventListener('change',()=>{layer.mirrored=mirror.checked;state.topBounds=null;renderTop();persistSharedState();status(`Layer ${layer.layer}/${layer.datatype}: ${layer.mirrored?'mirrored left/right about the layout origin':'original orientation'}.`);});
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
      $('selectionMode').value='imprinted';state.selectionMode='imprinted'; updateLayoutSectionVisibility(); clearPatternSelection();persistSharedState('selection-mode');
      for(const f of state.imprintedFaces.filter(f=>f.layerKey===layer.key&&(f.side||'front')===state.activeFace))state.selectedFaceIds.add(f.id);
      updateSelectionInfo();renderTop();renderLayerList();
    });
    row.append(imprint, sel); box.appendChild(row);
  }
}
async function setLayerFillPattern(layer,enabled){
  if(enabled&&!Array.isArray(layer.filledPolygons)){const response=await fetch('/api/geometry/fill-holes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subjects:layer.polygons||[]})});if(!response.ok){const data=await response.json().catch(()=>({detail:response.statusText}));throw new Error(data.detail||response.statusText);}const data=await response.json();layer.filledPolygons=Array.isArray(data.regions)?data.regions:[];}
  layer.fillPattern=enabled;state.topBounds=null;renderLayerList();renderTop();persistSharedState();
}
async function imprintLayer(layer){
  if(!state.wafer){status('Create or open a wafer before imprinting a layer.');return;}
  const side=state.activeFace,inverted=layer.inverted===true;if(state.imprintedFaces.some(f=>f.layerKey===layer.key&&(f.side||'front')===side)){status(`Layer ${layer.layer}/${layer.datatype} is already imprinted on the ${side} face.`);return;}
  const transformed=effectiveLayerPolygons(layer).map(poly=>transformedLayerPolygon(layer,poly));status(`Resolving ${inverted?'inverted':'normal'}${layer.fillPattern?' filled':''}${layer.mirrored?' mirrored':''} mask geometry inside the substrate…`);let regions;try{regions=await resolveMaskRegions(transformed,inverted);}catch(e){status(`Imprint failed: ${e.message}`);return;}
  regions.forEach((polygon,i)=>state.imprintedFaces.push({id:uid('face'),layerKey:layer.key,polyIndex:i,partIndex:0,side,inverted,fillPattern:layer.fillPattern===true,mirrored:layer.mirrored===true,polygon}));
  status(`Imprinted ${regions.length} substrate-bounded region(s) from layer ${layer.layer}/${layer.datatype} on the ${side} face.`);renderGdsControls();renderLayerList();renderAll();persistSharedState();
}

async function importGds(file,topCell=null,preserveTransform=false){
  // Live Patterns path: allow re-import even after geometry; imprint snapshot remains locked behind debug
  // (Alignment tuning after geometry is handled via live preview, not file replacement)
  status(`Reading ${file.name}…`);const form=new FormData();form.append('file',file);if(topCell)form.append('top_cell',topCell);
  let res;try{res=await fetch('/api/gds/inspect',{method:'POST',body:form});}catch(e){status(`Layout request failed: ${e.message}`);return;}
  if(!res.ok){const j=await res.json().catch(()=>({detail:res.statusText}));status(`Layout import: ${j.detail||res.statusText}`);return;}
  const data=await res.json();
  const previousTransform=preserveTransform?state.gds.transform:null,previousPolarity=state.gds.maskPolarity||'transmit',previousAliases=new Map(state.gds.layers.map(l=>[`${l.layer}/${l.datatype}`,l.alias])),previousTones=new Map(state.gds.layers.map(l=>[`${l.layer}/${l.datatype}`,l.inverted===true])),previousFills=new Map(state.gds.layers.map(l=>[`${l.layer}/${l.datatype}`,l.fillPattern===true])),previousMirrors=new Map(state.gds.layers.map(l=>[`${l.layer}/${l.datatype}`,l.mirrored===true]));
  state.gds=normalizeGds({filename:data.filename,bbox:data.bbox,topCells:data.top_cells||[],activeTopCell:data.active_top_cell,maskPolarity:previousPolarity,truncated:data.truncated===true,polygonLimit:data.polygon_limit||20000,transform:previousTransform||{offsetX:0,offsetY:0,rotationDeg:0,scale:1},hierarchy:data.hierarchy||[],layers:data.layers.map((l,i)=>{const key=`${l.layer}/${l.datatype}`;return {...l,key,alias:previousAliases.get(key)||'',inverted:previousTones.get(key)||false,fillPattern:previousFills.get(key)||false,mirrored:previousMirrors.get(key)||false,visible:true,color:palette[i%palette.length]};})});gdsSourceFile=file; state._gdsFileBlob=file; state._gdsFileName=file.name;
  for(const layer of state.gds.layers) layer.isBorderOnly=detectBorderOnly(layer);
  // New file → clear pattern selection (layers changed)
  clearPatternSelection();
  for(const layer of state.gds.layers.filter(l=>l.fillPattern))await setLayerFillPattern(layer,true);
  $('gdsStatus').textContent=`${state.gds.layers.length} layers`;
  updateLayoutSectionVisibility(); renderLayerList();renderHierarchy();fitLayout();renderAll();await persistSharedState('layout-import');window.dispatchEvent(new CustomEvent('wafercad:gds-loaded',{detail:{filename:data.filename,truncated:data.truncated===true}}));
  status(`Loaded ${data.filename}: ${data.active_top_cell}, ${data.layers.length} layer/datatype pairs${data.truncated?' (polygon limit reached)':''}.`);
}
function makeSnapshotPlaceholder(index){const thumb=document.createElement('div');thumb.className='snapshot-thumb snapshot-thumb-placeholder';const step=document.createElement('span');step.textContent=String(index+1).padStart(2,'0');thumb.appendChild(step);return thumb;}
function renderSnapshots(){
  const track=$('snapshotTrack'); const strip=$('snapshotStrip');
  if(!track) return;
  track.innerHTML='';
  if(!state.snapshots.length){
    const n=document.createElement('div');n.className='snapshot-empty';n.textContent='No snapshots yet — click + Snapshot in the top bar to capture the current 3D perspective.';
    track.appendChild(n);
    return;
  }
  for(const [snapshotIndex,s] of state.snapshots.entries()){
    const card=document.createElement('div');card.className='snapshot-card'+(s.id===state.activeSnapshotId?' active':'');
    card.title=`${s.name} — click to restore`;
    const thumbnail=resolveSnapshotThumbnail(s),thumb=thumbnail?document.createElement('img'):makeSnapshotPlaceholder(snapshotIndex);if(thumbnail)thumb.className='snapshot-thumb';
    if(thumbnail){thumb.src=thumbnail;thumb.alt=s.name;thumb.onerror=()=>{thumb.replaceWith(makeSnapshotPlaceholder(snapshotIndex));};}
    const info=document.createElement('div');info.className='snapshot-info';
    const name=document.createElement('div');name.className='snapshot-name';name.textContent=s.name;
    const device=resolveSnapshotDevice(s);const meta=document.createElement('div');meta.className='snapshot-meta';meta.textContent=`${device.solids.length} solids · ${device.cuts.length} cuts`;
    info.append(name,meta);
    const del=document.createElement('button');del.type='button';del.className='snapshot-delete';del.title='Delete snapshot';del.textContent='×';
    del.addEventListener('click',(e)=>{ e.stopPropagation(); deleteSnapshot(s.id); });
    card.addEventListener('click',()=>{
      if(s.id===state.activeSnapshotId) return;
      // Auto-save current active snapshot before switching — re-shoot covering current archive + camera
      const active=state.snapshots.find(x=>x.id===state.activeSnapshotId);
      if(active){
        try{
          active.deviceRef=internDevice(currentDeviceSnapshot());
          delete active.device;
          const newThumb=captureSnapshotThumb();
          if(newThumb){active.thumbRef=internThumbnail(newThumb);delete active.thumb;}
          const newCam=captureCameraState();
          if(newCam) active.camera=newCam;
          active.updated=new Date().toISOString();
        }catch(e){ console.warn('auto-save snapshot failed',e); }
      }
      state.activeSnapshotId=s.id;
      restoreDeviceSnapshot(resolveSnapshotDevice(s));
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
  pruneSnapshotDevices();
  if(state.activeSnapshotId===id) state.activeSnapshotId=state.snapshots.length? state.snapshots[state.snapshots.length-1].id : null;
  renderSnapshots();persistSharedState();
  status(`Deleted snapshot: ${name}`);
}
function saveNamedSnapshot(name){
  const thumb=captureSnapshotThumb();
  const cam=captureCameraState();
  const s={id:uid('snap'),name,created:new Date().toISOString(),deviceRef:internDevice(currentDeviceSnapshot()),thumbRef:internThumbnail(thumb),camera:cam};
  state.snapshots.push(s);state.activeSnapshotId=s.id;renderSnapshots();persistSharedState();status(`Snapshot saved: ${name}`);
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
function renderAll(){ensureLayerVisuals();renderTop();sectionView.render();render3D();renderFigureLegend();renderDopingControls();updateUndoUi();modelStats();}

async function initThree(){
  try{
    THREE=await import('three');
    ({OrbitControls}=await import('three/addons/controls/OrbitControls.js'));
    ({mergeGeometries}=await import('three/addons/utils/BufferGeometryUtils.js'));
  }catch(e){$('threeError').classList.remove('hidden');$('threeError').textContent='The local 3D library could not be loaded. Run npm install and restart WaferCAD. '+e.message;return;}
  const host=$('threeContainer');renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xf1f3f5);host.appendChild(renderer.domElement);
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.01,5000);camera.up.set(0,0,1);camera.position.set(state.activeFace==='back'?-7:7,-9,state.activeFace==='back'?-6:6);controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,-.1);controls.enableDamping=true;
  scene.add(new THREE.HemisphereLight(0xffffff,0x66717c,2.0));const dl=new THREE.DirectionalLight(0xffffff,2.4);dl.position.set(5,-4,9);scene.add(dl);
  deviceGroup=new THREE.Group();scene.add(deviceGroup);axesGroup=createInfiniteAxes();axesGroup.visible=state.showAxes;scene.add(axesGroup);
  resizeObserver=new ResizeObserver(()=>resizeThree());resizeObserver.observe(host);resizeThree();render3D();startThreeLoop();
}
function resizeThree(){if(!renderer)return;const host=$('threeContainer'),w=Math.max(host.clientWidth,1),h=Math.max(host.clientHeight,1);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
function createAxisLabel(text,color,position){const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;const context=canvas.getContext('2d');context.font='700 42px Segoe UI, sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillStyle=color;context.fillText(text,48,32);const texture=new THREE.CanvasTexture(canvas),material=new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false});const sprite=new THREE.Sprite(material);sprite.position.set(...position);sprite.scale.set(.42,.28,1);sprite.renderOrder=1002;return sprite;}
function createInfiniteAxes(){
  const group=new THREE.Group(),extent=1000,axes=[{points:[[-extent,0,0],[extent,0,0]],color:0xdc2626},{points:[[0,-extent,0],[0,extent,0]],color:0x16a34a},{points:[[0,0,-extent],[0,0,extent]],color:0x2563eb}];
  for(const axis of axes){const geometry=new THREE.BufferGeometry().setFromPoints(axis.points.map(p=>new THREE.Vector3(...p))),material=new THREE.LineBasicMaterial({color:axis.color,transparent:true,opacity:.82,depthTest:false,depthWrite:false});const line=new THREE.Line(geometry,material);line.renderOrder=1000;group.add(line);}
  const origin=new THREE.Mesh(new THREE.SphereGeometry(.085,18,12),new THREE.MeshBasicMaterial({color:0x111827,depthTest:false,depthWrite:false}));origin.renderOrder=1001;origin.name='Origin';group.add(origin,createAxisLabel('X','#dc2626',[5.1,0,0]),createAxisLabel('Y','#16a34a',[0,5.1,0]),createAxisLabel('Z','#2563eb',[0,0,5.1]),createAxisLabel('O','#111827',[.18,.18,.18]));return group;
}
function updateAxesVisibility(){state.showAxes=$('showAxes').checked;if(axesGroup)axesGroup.visible=state.showAxes;persistSharedState();status(state.showAxes?'3D origin and X/Y/Z axes shown.':'3D axes hidden.');}
function syncViewControls(){
  const isRelative=state.zMapping==='relative';
  const currentScale=isRelative?state.relativeZScale:state.zExag;
  if($('zMapping'))$('zMapping').value=isRelative?'relative':'linear';
  if($('zExag')){
    const max=isRelative?20:200;
    $('zExag').max=String(max);
    $('zExag').value=String(Math.min(max, Math.max(0.1, currentScale)));
    if($('zExagNumber')){ $('zExagNumber').value=formatDisplayNumber(currentScale); $('zExagNumber').max=String(isRelative?100:1000); }
    $('zExagValue').value=`${isRelative?'':'×'}${formatDisplayNumber(currentScale)}`;
    if($('zScaleLabel')) $('zScaleLabel').textContent=isRelative?'Display scale':'Z';
    if($('zScalePrefix')) {$('zScalePrefix').textContent=isRelative?'':'×';$('zScalePrefix').style.display=isRelative?'none':'';}
    if($('zDisplayInline')) $('zDisplayInline').title=isRelative?'Relative thickness is logarithmic between layers and linear within each layer — 1 nm=1, 10 nm=2, 100 nm=3, 1 µm=4, 10 µm=5, 100 µm=6 (automatic). Display scale multiplies the visual height. Physical geometry is unchanged.':'Physical: true Z × exaggeration (1 = isotropic). Display scale multiplies physical thickness. Visual geometry only.';
  }
  if($('maskOpacity')){
    const rawOpacity=Number(state.maskBaseOpacity),pct=Math.round((Number.isFinite(rawOpacity)?Math.min(1,Math.max(0,rawOpacity)):.35)*100);
    $('maskOpacity').value=String(pct);
    if($('maskOpacityValue')) $('maskOpacityValue').textContent=pct+'%';
  }
  sectionView.syncControls();
  $('showAxes').checked=state.showAxes;if(axesGroup)axesGroup.visible=state.showAxes;
}
function setZExag(v,{persist=true,source='slider'}={}){
  let n=Number(v);
  if(!Number.isFinite(n) || n<=0) return;
  const isRelative=state.zMapping==='relative';
  const max=isRelative?100:1000;
  const sliderMax=isRelative?20:200;
  n=Math.min(max, Math.max(0.1, n));
  if(isRelative) state.relativeZScale=n; else state.zExag=n;
  // keep slider and number in sync without feedback loop
  if(source!=='slider' && $('zExag')) $('zExag').value=String(Math.min(sliderMax, Math.max(0.1, n)));
  if(source!=='number' && $('zExagNumber')) $('zExagNumber').value=formatDisplayNumber(n);
  if($('zExagValue')) $('zExagValue').value=`${isRelative?'':'×'}${formatDisplayNumber(n)}`;
  sectionView.render();scheduleRender3D();if(persist)persistSharedState('z-scale');
}
function setZMapping(value){
  const next=value==='relative'?'relative':'linear';
  state.zMapping=next;
  if($('zMapping'))$('zMapping').value=state.zMapping;
  syncViewControls();
  sectionView.render();render3D();persistSharedState('z-mapping');
  status(state.zMapping==='relative'?'Z display uses relative thickness: logarithmic between layers and linear within each layer. 1 nm=1, 10 nm=2, 100 nm=3, 1 µm=4, 10 µm=5, 100 µm=6. Physical coordinates are unchanged.':'Z display uses physical linear thickness (×1 is isotropic).');
}
function setMaskOpacity(v){
  let n=Number(v);
  if(!Number.isFinite(n)) return;
  n=Math.min(100, Math.max(0, n))/100;
  state.maskBaseOpacity=n;
  if($('maskOpacity')) $('maskOpacity').value=String(Math.round(n*100));
  if($('maskOpacityValue')) $('maskOpacityValue').textContent=Math.round(n*100)+'%';
  renderTop();persistSharedState();
}
function mainWorkspaceVisible(){const workspace=$('mainWorkspace');return !!workspace&&!workspace.classList.contains('hidden');}
function shouldRunThreeLoop(){return !!renderer&&!document.hidden&&mainWorkspaceVisible();}
function startThreeLoop(){if(threeLoopRunning||!shouldRunThreeLoop())return;threeLoopRunning=true;threeFrameId=requestAnimationFrame(animateThree);}
function stopThreeLoop(){threeLoopRunning=false;if(threeFrameId!=null){cancelAnimationFrame(threeFrameId);threeFrameId=null;}}
function animateThree(now=performance.now()){if(!threeLoopRunning||!renderer)return;threeFrameId=null;updateCameraFaceFlip(now);controls.update();renderer.render(scene,camera);threeFrameId=requestAnimationFrame(animateThree);}
function memoryDiagnosticsEnabled(){const params=new URLSearchParams(location.search),qa=params.get('qa')||'';return params.get('debug')==='memory'||qa==='memory'||qa.includes('memory');}
function correctnessDiagnosticsEnabled(){const qa=new URLSearchParams(location.search).get('qa')||'';return qa.includes('refill')||qa.includes('topology');}
function operationAtomDiagnostics(atoms){return atoms.map(atom=>({geometryId:atom.geometryId,sourceId:atom.sourceId,kind:atom.kind,layerId:atom.layerId,surface:Number(atom.surface),zMin:Number(atom.zMin),zMax:Number(atom.zMax),area:Number(atom.area)}));}
function render3DDebugStats(){if(!memoryDiagnosticsEnabled())return null;return state._render3DStats||(state._render3DStats={requested:0,executed:0,scheduled:false});}
export function scheduleRender3D(){const stats=render3DDebugStats();if(stats)stats.requested++;if(render3DFrame!=null)return;render3DFrame=requestAnimationFrame(()=>{render3DFrame=null;if(stats)stats.scheduled=false;render3D();});if(stats)stats.scheduled=true;}
function cancelScheduledRender3D(){if(render3DFrame!=null){cancelAnimationFrame(render3DFrame);render3DFrame=null;}const stats=render3DDebugStats();if(stats)stats.scheduled=false;}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopThreeLoop();else if(mainWorkspaceVisible()){scheduleRender3D();startThreeLoop();}});
function disposeGroup(g){while(g.children.length){const o=g.children.pop();if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}}}
function scaledPoly(poly,scale){return poly.map(([x,y])=>[x*scale,y*scale]);}
function makeShape(poly){const s=new THREE.Shape();poly.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;}
function makeTopologyShape(topology,scale){const shape=makeShape(scaledPoly(topology.outer,scale));for(const contour of topology.holes){const hole=new THREE.Path();scaledPoly(contour,scale).forEach(([x,y],index)=>index?hole.lineTo(x,y):hole.moveTo(x,y));hole.closePath();shape.holes.push(hole);}return shape;}
function mappedZ(z){return displayZ(z);}
function addMergedExtrusions(items,xy,boundsOf,materialOf,kind,collectRefillDiagnostics){
  let meshCount=0;
  for(const group of groupBy(items,item=>`${item.layerId}|${item.material||item.dopant||''}`).values()){
    const geometries=[];
    for(const item of group){
      const mapped=boundsOf(item),depth=Math.max(mapped.zMax-mapped.zMin,1e-9),geometryBounds=collectRefillDiagnostics?{min:Infinity,max:-Infinity}:null;
      for(const topology of polygonTopologies(item.footprint)){
        const shape=makeTopologyShape(topology,xy),geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:16});geometry.translate(0,0,mapped.zMin);
        if(collectRefillDiagnostics){geometry.computeBoundingBox();geometryBounds.min=Math.min(geometryBounds.min,geometry.boundingBox.min.z);geometryBounds.max=Math.max(geometryBounds.max,geometry.boundingBox.max.z);}
        geometries.push(geometry);
      }
      if(collectRefillDiagnostics)state._solidRenderBounds.push({id:item.id,layerId:item.layerId,kind,physical:{min:Number(item.zMin),max:Number(item.zMax)},mapped:{min:mapped.zMin,max:mapped.zMax},geometry:geometryBounds});
    }
    const material=materialOf(group[0]);
    if(geometries.length===1){deviceGroup.add(new THREE.Mesh(geometries[0],material));meshCount++;continue;}
    const merged=mergeGeometries(geometries,false);
    if(merged){for(const geometry of geometries)geometry.dispose();deviceGroup.add(new THREE.Mesh(merged,material));meshCount++;continue;}
    for(const geometry of geometries){deviceGroup.add(new THREE.Mesh(geometry,material.clone()));meshCount++;}
    material.dispose();
  }
  return meshCount;
}
function render3D(){
  if(!THREE||!deviceGroup)return;disposeGroup(deviceGroup);if(!state.wafer||!state.slice)return;
  const debugStats=render3DDebugStats();if(debugStats)debugStats.executed++;
  const xy=waferXYScale(),scaledWafer=scaledPoly(waferOutline(),xy);
  const zBounds=substrateZBounds(),cutKey=cutGeometryKey();if(cutUnionCacheKey!==cutKey)void ensureCutUnionCache();
  // Use derived remaining substrate per Z slab; whole-face cuts produce empty remaining (no mesh) and edge-touching cuts are rendered as remaining outer regions, not as degenerate holes.
  let substrateSlabCount=0,substrateRegionCount=0,substrateMeshCount=0,substratePendingSlabs=0,substrateTopologyHoles=0;
  for(let i=0;i<zBounds.length-1;i++){
    const low=zBounds[i],high=zBounds[i+1];
    const slabKey=`${low}|${high}`;
    const slabInfo=cutUnionCacheKey===cutKey?substrateSlabRegions.get(slabKey):null;
    if(slabInfo){
      if(slabInfo.isEmpty){
        substrateSlabCount++;
        continue;
      }
      if(slabInfo.useHoles){
        const shape=makeShape(scaledWafer);
        for(const footprint of slabInfo.unionRegions){const pp=scaledPoly(footprint,xy);const hole=new THREE.Path();pp.forEach(([x,y],j)=>j?hole.lineTo(x,y):hole.moveTo(x,y));hole.closePath();shape.holes.push(hole);}
        const depth=Math.max(mappedZ(high)-mappedZ(low),.0001);const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:96});geo.translate(0,0,mappedZ(low));const mat=new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual('substrate').color),roughness:.72,metalness:.02,side:THREE.DoubleSide});deviceGroup.add(new THREE.Mesh(geo,mat));substrateRegionCount++;substrateMeshCount++;substrateSlabCount++;
      } else {
        for(const topology of slabInfo.remainingTopologies||slabInfo.remainingRegions.flatMap(polygonTopologies)){
          const shape=makeTopologyShape(topology,xy);
          substrateTopologyHoles+=topology.holes.length;
          const depth=Math.max(mappedZ(high)-mappedZ(low),.0001);const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:96});geo.translate(0,0,mappedZ(low));const mat=new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual('substrate').color),roughness:.72,metalness:.02,side:THREE.DoubleSide});deviceGroup.add(new THREE.Mesh(geo,mat));substrateRegionCount++;substrateMeshCount++;
        }
        substrateSlabCount++;
      }
    } else {
      // While exact Boolean regions are pending, omit affected slabs. This avoids
      // both a transient residual rim and ever constructing a boundary-touching
      // or whole-face cut as a Three.js hole.
      const active=state.cuts.filter(c=>c.zMin<=low+1e-8&&c.zMax>=high-1e-8);
      if(active.length){substratePendingSlabs++;continue;}
      const shape=makeShape(scaledWafer);
      const depth=Math.max(mappedZ(high)-mappedZ(low),.0001);const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:96});geo.translate(0,0,mappedZ(low));const mat=new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual('substrate').color),roughness:.72,metalness:.02,side:THREE.DoubleSide});deviceGroup.add(new THREE.Mesh(geo,mat));substrateSlabCount++;substrateRegionCount++;substrateMeshCount++;
    }
  }
  const layerDescriptors=solidLayerDescriptors(),mappingContext=createLayerMappingContext();
  const collectRefillDiagnostics=correctnessDiagnosticsEnabled();
  if(collectRefillDiagnostics)state._solidRenderBounds=[];
  const solidMeshes=addMergedExtrusions(state.solids,xy,solid=>mappedSolidBounds(solid,layerDescriptors,mappingContext),solid=>new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual(solid.layerId).color),roughness:.55,metalness:solid.material.toLowerCase().includes('metal')?.6:.05,side:THREE.DoubleSide}),'solid',collectRefillDiagnostics);
  const dopingMeshes=addMergedExtrusions(state.dopings,xy,doping=>mappedDopingBounds(doping,layerDescriptors,mappingContext),doping=>new THREE.MeshStandardMaterial({color:rgbHexToInt(layerVisual(doping.layerId).color),transparent:true,opacity:.38,depthWrite:false,roughness:.35,metalness:0,side:THREE.DoubleSide}),'doping',collectRefillDiagnostics);
  state._renderStats={substrateSlabs:substrateSlabCount,substrateRegions:substrateRegionCount,substrateMeshes:substrateMeshCount,substratePendingSlabs,substrateTopologyHoles,solidRegions:state.solids.length,solidMeshes,dopingRegions:state.dopings.length,dopingMeshes};
  // Selected slice plane.
  const a=state.slice.a,b=state.slice.b,ax=a.x*xy,ay=a.y*xy,bx=b.x*xy,by=b.y*xy,len=Math.hypot(bx-ax,by-ay),angle=Math.atan2(by-ay,bx-ax),mappedSolids=state.solids.map(s=>mappedSolidBounds(s,layerDescriptors,mappingContext));const maxz=Math.max(.3,...mappedSolids.map(s=>s.zMax));const minz=Math.min(mappedZ(-state.wafer.thickness),...mappedSolids.map(s=>s.zMin)),height=maxz-minz+.2;const plane=new THREE.Mesh(new THREE.BoxGeometry(len,.018,height),new THREE.MeshBasicMaterial({color:0x2563eb,transparent:true,opacity:.18,depthWrite:false}));plane.position.set((ax+bx)/2,(ay+by)/2,(maxz+minz)/2);plane.rotation.z=angle;deviceGroup.add(plane);
  const boundaryPoints=scaledWafer.map(([x,y])=>new THREE.Vector3(x,y,.006));const boundaryGeo=new THREE.BufferGeometry().setFromPoints(boundaryPoints);const boundary=new THREE.LineLoop(boundaryGeo,new THREE.LineBasicMaterial({color:0x475569}));deviceGroup.add(boundary);
}
function polygonTotals(layers=[]){let polygons=0,points=0;for(const layer of layers){for(const polygon of layer.polygons||[]){polygons++;points+=polygon.length;}}return {polygons,points};}
function memoryDiagnostics(){
  const gds=polygonTotals(state.gds?.layers);
  return {
    persistent:{solids:state.solids.length,cuts:state.cuts.length,dopings:state.dopings.length,gdsPolygons:gds.polygons,gdsPoints:gds.points,snapshots:state.snapshots.length,snapshotDevices:Object.keys(state.snapshotDevices||{}).length,snapshotThumbnailChars:Object.values(state.snapshotThumbnails||{}).reduce((sum,value)=>sum+(typeof value==='string'?value.length:JSON.stringify(value||'').length),0)},
    pattern:window.patMemoryDiagnostics?.()||null,
    three:renderer?{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}:null,
    persistence:state._persistenceStats?{...state._persistenceStats}:null,
    render3D:state._render3DStats?{...state._render3DStats}:null,
    threeLoopRunning
  };
}
if(memoryDiagnosticsEnabled())window.wafercadMemoryDiagnostics=memoryDiagnostics;

function saveProject(){
  ensureLayerVisuals();const payload={format:'wafercad-mvp',version:CURRENT_PROJECT_VERSION,wafer:state.wafer,activeFace:state.activeFace,solids:state.solids,cuts:state.cuts,dopings:state.dopings,layerVisuals:state.layerVisuals,gds:state.gds,imprintedFaces:state.imprintedFaces,slice:state.slice,snapshots:state.snapshots,snapshotDevices:state.snapshotDevices,snapshotThumbnails:state.snapshotThumbnails,view:{zExag:state.zExag,relativeZScale:state.relativeZScale,zMapping:state.zMapping,zLogK:state.zLogK,showAxes:state.showAxes,maskBaseOpacity:state.maskBaseOpacity,sectionBreak:state.sectionBreak}};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='wafercad-project.json';a.click();URL.revokeObjectURL(a.href);status('Project saved.');
}
async function openProject(file){try{const p=validateAndMigrateProject(JSON.parse(await file.text()));state.wafer=p.wafer?normalizeWafer(p.wafer):null;state.activeFace=p.activeFace||'front';state.solids=p.solids;state.cuts=p.cuts;state.dopings=p.dopings;state.layerVisuals=p.layerVisuals||{};state.gds=normalizeGds(p.gds);for(const layer of state.gds.layers) layer.isBorderOnly=detectBorderOnly(layer);state.imprintedFaces=p.imprintedFaces;state.slice=p.slice||null;state.snapshots=p.snapshots;state.snapshotDevices=p.snapshotDevices;state.snapshotThumbnails=p.snapshotThumbnails;for(const s of state.snapshots)if(!s.camera)s.camera=null;
  state.zExag=Number.isFinite(Number(p.view?.zExag))?Math.min(1000,Math.max(0.1,Number(p.view.zExag))):8;state.relativeZScale=Number.isFinite(Number(p.view?.relativeZScale))?Math.min(100,Math.max(0.1,Number(p.view?.relativeZScale))):1;const rawMapping=p.view?.zMapping;state.zMapping=rawMapping==='relative'?'relative':rawMapping==='log'?'relative':'linear';state.zLogK=Number.isFinite(Number(p.view?.zLogK))&&Number(p.view?.zLogK)>0?Number(p.view?.zLogK):.05;state.showAxes=p.view?.showAxes===true;state.maskBaseOpacity=Number.isFinite(Number(p.view?.maskBaseOpacity))?Math.min(1,Math.max(0,Number(p.view.maskBaseOpacity))):0.35;state.sectionBreak=p.view?.sectionBreak&&typeof p.view.sectionBreak==='object'?{...p.view.sectionBreak}:sectionView.defaultBreak(state.wafer,state.wafer?.thickness>50);state.operationUndo=[];state._exactThickness=null;ensureLayerVisuals();state.selectedFaceIds.clear();clearTopSelection();clearPatternSelection();gdsSourceFile=null;if(state.wafer&&!state.slice)setDefaultSlice();state.topBounds=null;$('gdsStatus').textContent=state.gds.layers?.length?`${state.gds.layers.length} layers`:'none';syncViewControls();updateActiveFaceUi();updateSelectionInfo();updateLayoutSectionVisibility();renderLayerList();renderHierarchy();renderSnapshots();fitWafer();renderAll();persistSharedState('project-open');status(`Opened ${file.name} (project v${CURRENT_PROJECT_VERSION}).`);}catch(e){status(`Open project failed: ${e.message}`)}}

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
  const _nwb=$('newWaferBtn');
  console.log('bindUi newWaferBtn', !!_nwb, _nwb?.id);
  if(_nwb) _nwb.addEventListener('click',()=>{
    console.log('newWaferBtn clicked, wafer', !!state.wafer);
    if(state.wafer){
      const dlg=$('newWaferConfirmDialog');
      if(dlg.open) dlg.close();
      dlg.showModal();
    } else {
      loadWaferForm();$('waferDialog').showModal();
    }
  }); else console.error('newWaferBtn not found at bindUi');
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
      state.wafer=normalizeWafer(wafer);state.sectionBreak=sectionView.defaultBreak(state.wafer,state.wafer.thickness>50);state.activeFace='front';state.solids=[];state.cuts=[];state.dopings=[];state.operationUndo=[];state._exactThickness=null;state.layerVisuals={substrate:{name:`Substrate · ${state.wafer.material}`,color:materialColor(state.wafer.material),scale:1}};state.imprintedFaces=[];state.gds.committedProjection=null;state.selectedFaceIds.clear();clearTopSelection();clearPatternSelection();setDefaultSlice();state.topBounds=null;sectionView.syncControls();updateActiveFaceUi();updateSelectionInfo();updateLayoutSectionVisibility();fitWafer();renderGdsControls();renderAll();persistSharedState();$('waferDialog').close('default');status(`New ${shape} wafer created.`);
    }catch(e){error.textContent=e.message;error.classList.remove('hidden');}
  });
  $('gdsInput').addEventListener('change',(e)=>{const f=e.target.files?.[0];if(f)importGds(f);e.target.value='';});
  $('sliceCoordinateUnit').addEventListener('change',()=>{const next=$('sliceCoordinateUnit').value;convertFields(['sliceAx','sliceAy','sliceBx','sliceBy'],sliceCoordinateUnit,next);sliceCoordinateUnit=next;});
  $('applySliceCoordinatesBtn').addEventListener('click',()=>{if(!state.slice)return;const values=['sliceAx','sliceAy','sliceBx','sliceBy'].map(id=>Number($(id).value));if(values.some(v=>!Number.isFinite(v))){status('A–B coordinates must be valid numbers.');return;}if(values[0]===values[2]&&values[1]===values[3]){status('A and B must be different points.');return;}const scale=UNIT_TO_UM[sliceCoordinateUnit];state.slice={a:{x:values[0]*scale,y:values[1]*scale},b:{x:values[2]*scale,y:values[3]*scale}};renderTop();sectionView.render();render3D();persistSharedState();status('Applied A–B section coordinates.');});
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
  $('zExag')?.addEventListener('input',()=>setZExag($('zExag').value,{persist:false,source:'slider'}));
  $('zExag')?.addEventListener('change',()=>setZExag($('zExag').value,{persist:true,source:'slider'}));
  $('zMapping')?.addEventListener('change',()=>setZMapping($('zMapping').value));
  $('zExagNumber')?.addEventListener('change',()=>setZExag($('zExagNumber').value,{persist:true,source:'number'}));
  $('zExagNumber')?.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();$('zExagNumber').blur();}});
  $('maskOpacity')?.addEventListener('input',()=>setMaskOpacity($('maskOpacity').value));
  $('showAxes').addEventListener('change',updateAxesVisibility);$('saveProjectBtn').addEventListener('click',saveProject);$('openProjectInput').addEventListener('change',(e)=>{const f=e.target.files?.[0];if(f)openProject(f);e.target.value='';});
  $('pushMode').addEventListener('change',updateOperationModeUi);updateOperationModeUi();
  $('selectionMode')?.addEventListener('change',()=>{
    const mode=$('selectionMode').value;
    state.selectionMode=mode;
    state.selectedFaceIds.clear();clearTopSelection();
    // keep patternSelectedKeys when switching to Patterns (set in dock), clear only when switching away? For now keep
    updateLayoutSectionVisibility(); updateSelectionInfo(); renderLayerList(); renderTop();
    persistSharedState('selection-mode');
    status(mode==='top'?'Selection: full faces (model). Click a visible film top in Top View.':'Selection: Patterns — the committed substrate projection will be used.');
  });
  $('undoOperationBtn').addEventListener('click',undoOperation);
}

if($('selectionMode'))$('selectionMode').value=state.selectionMode||'top';
bindUi();bindTopNavigation();sectionView.bind();syncViewControls();updateActiveFaceUi();updateSelectionInfo();updateLayoutSectionVisibility();renderLayerList();renderSnapshots();renderAll();initThree();
// Previous session banner: refresh is now a clean reset, but previous state remains restorable
try{
  const hasPrev = hasSharedState();
  if(hasPrev){
    const bar=document.createElement('div');
    bar.id='restoreBanner';
    bar.style.cssText='position:fixed;top:44px;left:50%;transform:translateX(-50%);z-index:90;background:#fff;border:1px solid #d8dce1;border-radius:8px;padding:8px 12px;display:flex;gap:8px;align-items:center;box-shadow:0 4px 12px rgba(0,0,0,.12);font-size:12px';
    bar.innerHTML='<span style="color:#334155">Previous session found (refresh reset to empty)</span><button id="restoreBtn" class="small primary">Restore</button><button id="discardBtn" class="small">Reset</button>';
    document.body.appendChild(bar);
    document.getElementById('restoreBtn').onclick=async()=>{
      const hadTopBounds = !!state.topBounds;
      const restored=await loadSharedState();if(!restored){status('No recoverable previous session was found.');bar.remove();return;}
      gdsSourceFile=state._gdsFileBlob||null;
      if(Array.isArray(state.gds.committedProjection?.regions)&&state.gds.committedProjection.regions.length)state.selectionMode='imprinted';
      if($('selectionMode'))$('selectionMode').value=state.selectionMode||'top';
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
      clearSharedState();
      // Reset current in-memory state to empty (no refresh needed)
      state.wafer=null; state.sectionBreak={enabled:false,mode:'surfaces',frontKeep:5,backKeep:5,from:-495,to:-5}; state.solids=[]; state.cuts=[]; state.dopings=[]; state.layerVisuals={}; state.imprintedFaces=[]; state.selectedFaceIds.clear(); state.patternSelectedKeys.clear(); state.slice=null; state.snapshots=[]; state.snapshotDevices={}; state.snapshotThumbnails={}; state.activeSnapshotId=null; state.topBounds=null; state._exactThickness=null; state.operationUndo=[];state.selectionMode='top';if($('selectionMode'))$('selectionMode').value='top';
      // also clear GDS to fully reset pattern editor
      state.gds=normalizeGds(null);state._gdsFileBlob=null;state._gdsFileName=null;gdsSourceFile=null;
      if(window.patReset)window.patReset();
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
    if(window.patSuspend)window.patSuspend();
    btnMain.classList.add('active'); btnPat.classList.remove('active');
    updateSelectionInfo();renderTop();resizeThree();scheduleRender3D();startThreeLoop();
  }
  function showPatterns(){
    cancelScheduledRender3D();stopThreeLoop();
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
(async()=>{
  const name=new URLSearchParams(location.search).get('project');
  if(!name)return;
  if(!/^[^/\\]+\.wafercad\.json$/i.test(name)){status('Invalid local project link.');return;}
  try{
    status(`Loading ${name}…`);
    const response=await fetch(`/api/projects/${encodeURIComponent(name)}`);
    if(!response.ok){const detail=await response.json().catch(()=>({detail:response.statusText}));throw new Error(detail.detail||response.statusText);}
    await openProject(new File([await response.blob()],name,{type:'application/json'}));
    document.getElementById('restoreBanner')?.remove();
  }catch(error){status(`Local project failed to open: ${error.message}`);}
})();
