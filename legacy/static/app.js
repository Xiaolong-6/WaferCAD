import {$,DEFAULT_WAFER,UNIT_TO_UM,clearSharedState,clone,formatDisplayNumber,hasSharedState,palette,persistSharedState,loadSharedState,state,status,uid} from './js/core.js';
import {contoursTouch,detectBorderOnly,normalizeWafer,polygonArea,polygonTopologies,waferFlatLengthMm,waferNotchDepthMm,waferOutline} from './js/geometry.js';
import {clipPolygonsToWafer,composeMaskRegions,partitionTopSurface,resolveMaskRegions} from './js/geometry-api.js';
import {ensureLayerVisuals,physicalLayerOptions} from './js/layer-model.js';
import {createLegendController} from './js/legend-controller.js';
import {CURRENT_PROJECT_VERSION,validateAndMigrateProject} from './js/project-schema.js';
import {captureDevice} from './js/snapshot-store.js';
import {committedProjectionIsCurrent,effectiveLayerPolygons,normalizeGds,patternLayerIsEligible,transformedLayerPolygon} from './js/layout-model.js';
import {ensureLayerFilledPolygons} from './js/pattern-fill.js';
import {createTopView} from './js/views/top-view.js';
import {createWaferController} from './js/controllers/wafer-controller.js';
import {createSectionView} from './js/views/section-view.js';
import {createThreeView} from './js/views/three-view.js';
import {createProcessController} from './js/controllers/process-controller.js';
import {createSnapshotController} from './js/controllers/snapshot-controller.js';
// Compatibility for existing numerical invariant tests; implementation lives in the controller.
export {availableMaterialDepth} from './js/controllers/process-controller.js';

let waferDialogLateralUnit = 'mm', waferDialogThicknessUnit = 'um';
let gdsSourceFile = null, gdsAlignmentUnit = 'mm';
let topSurfaceAtoms = [], topSurfaceKey = null, topSurfacePendingKey = null;
let cutUnionCacheKey=null,cutUnionPendingKey=null;
let operationInFlight=false,operationStopRequested=false,operationStartedAt=0,operationTimer=null,operationStage='';
let snapshotNamePurpose = 'snapshot';
const legendController=createLegendController({recordOperationUndo:()=>processController.recordUndo(),updateSelectionInfo:()=>updateSelectionInfo(),renderAll:()=>renderAll()});
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
function setDefaultSlice(){waferController.initializeSlice();}
function currentDeviceSnapshot(){ensureLayerVisuals();return captureDevice();}
function restoreDeviceSnapshot(s){state.wafer=s.wafer?normalizeWafer(clone(s.wafer)):null;state.activeFace=s.activeFace||'front';state.solids=clone(s.solids||[]);state.cuts=clone(s.cuts||[]);state.dopings=clone(s.dopings||[]);state.layerVisuals=clone(s.layerVisuals||{});state.imprintedFaces=clone(s.imprintedFaces||[]);state.gds.committedProjection=null;state.operationUndo=[];ensureLayerVisuals();state.selectedFaceIds.clear();clearPatternSelection();clearTopSelection();setDefaultSlice();state.topBounds=null;updateActiveFaceUi();updateSelectionInfo();updateLayoutSectionVisibility();renderAll();persistSharedState();}

function fitWafer(){topView.fitWafer();}
function fitLayout(){topView.fitLayout();}
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
    sectionView.syncControls();sectionView.render();threeView.scheduleRender();
  } catch(error){if(cutGeometryKey()===key)status(`Substrate slab Boolean failed: ${error.message}`);}
  finally{if(cutUnionPendingKey===key)cutUnionPendingKey=null;}
}
function updateActiveFaceUi(syncCamera=true){const back=state.activeFace==='back';$('activeFaceLabel').textContent=back?'Back face':'Front face';$('flipFaceBtn').textContent=back?'Back':'Front';$('flipFaceBtn').disabled=!state.wafer;if(syncCamera)threeView.syncActiveFace();}
function flipActiveFace(){waferController.flipActiveFace();}
function renderTop(){topView.render();}

function currentSubstrateSlabs(){
  if(!state.wafer)return [];
  const key=cutGeometryKey();
  if(cutUnionCacheKey===key)return [...substrateSlabRegions.values()];
  if(!state.cuts.length)return [{zMin:-state.wafer.thickness,zMax:0,remainingRegions:[waferOutline()],unionRegions:[],isEmpty:false,useHoles:false}];
  return null;
}
export const topView=createTopView({
  getTopSurfaceAtoms:()=>topSurfaceAtoms,
  getCurrentTopSurfaceAtoms:()=>topSurfaceKey===surfaceGeometryKey()?topSurfaceAtoms:null,
  ensureTopSurfacePartition,isTopFaceSelection,isPatternsSelection,onSelectionChanged:updateSelectionInfo,
  onSliceChanged:phase=>{if(phase!=='end')sectionView.render();if(phase!=='drag')threeView.render();if(phase==='coordinates')persistSharedState();},
  qa:(new URLSearchParams(location.search).get('qa')||'').includes('top-view'),
});
const sectionView=createSectionView({getSubstrateSlabs:currentSubstrateSlabs,ensureSubstrateSlabs:ensureCutUnionCache});
export const threeView=createThreeView({
  getSubstrateSlabs:currentSubstrateSlabs,ensureSubstrateSlabs:ensureCutUnionCache,
  getSubstrateZBounds:substrateZBounds,mainWorkspaceVisible,
  memoryDiagnosticsEnabled,correctnessDiagnosticsEnabled,
});
const waferController=createWaferController({
  defaultSectionBreak:(...args)=>sectionView.defaultBreak(...args),
  onWaferChanged:()=>{sectionView.syncControls();updateActiveFaceUi();updateSelectionInfo();updateLayoutSectionVisibility();fitWafer();renderGdsControls();renderAll();persistSharedState();$('waferDialog').close('default');},
  onActiveFaceChanged:({animate})=>{updateSelectionInfo();updateActiveFaceUi(false);threeView.syncActiveFace({animate});renderAll();persistSharedState();},
  reportStatus:status,qa:(new URLSearchParams(location.search).get('qa')||'').includes('wafer-controller'),
});
const processController=createProcessController({
  resolveProcessRegions,
  clearSelection:()=>{state.selectedFaceIds.clear();clearTopSelection();},
  invalidateSurfaceCache:invalidateTopSurfacePartition,
  onProcessChanged:()=>{updateSelectionInfo();renderAll();persistSharedState();},
  onSelectionChanged:()=>{updateSelectionInfo();renderTop();},
  onUndoChanged:updateUndoUi,reportStatus:status,onActivityChanged:updateOperationActivity,
  correctnessDiagnosticsEnabled,
});
if((new URLSearchParams(location.search).get('qa')||'').includes('refill'))window.wafercadRefillDiagnostics=()=>({operation:state._lastOperationDebug||null,renderBounds:clone(state._solidRenderBounds||[]),section:sectionView.debugEntries()});

const snapshotController=createSnapshotController({
  captureCurrentDevice:currentDeviceSnapshot,restoreDevice:restoreDeviceSnapshot,
  captureCamera:()=>threeView.captureCamera(),restoreCamera:camera=>threeView.restoreCamera(camera),
  captureThumbnail:captureSnapshotThumb,
  onSnapshotsChanged:()=>{renderSnapshots();persistSharedState();},
  onSnapshotActivated:({hasCamera})=>{if(!hasCamera)renderAll();renderSnapshots();},
  reportStatus:status,qa:(new URLSearchParams(location.search).get('qa')||'').includes('snapshot-controller'),
});

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

async function resolveProcessRegions(){
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
  return {wholeFace,selected};
}

function renderDopingControls(){const select=$('dopingTargetLayer');if(!select)return;const previous=select.value,options=state.wafer?physicalLayerOptions():[];select.innerHTML='';for(const entry of options){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.name;select.appendChild(option);}if(options.some(o=>o.id===previous))select.value=previous;select.disabled=!options.length;}
function updateOperationModeUi(){const mode=$('pushMode').value,conformal=['conformal-grow','isotropic-etch'].includes(mode),doping=mode==='doping';$('operationModeHint').classList.toggle('hidden',!conformal);$('dopingControls').classList.toggle('hidden',!doping);$('materialFieldLabel').textContent=doping?'Dopant':'Material';$('materialInput').disabled=mode==='down'||mode==='isotropic-etch';renderDopingControls();updateSelectionInfo();}
function updateUndoUi(){$('undoOperationBtn').disabled=!state.operationUndo.length;}
function updateOperationActivity({busy,stopping,stage}){
  const wasBusy=operationInFlight;
  operationInFlight=busy;operationStopRequested=stopping;operationStage=stage;
  const button=$('applyPushPullBtn');if(!button)return;
  if(!busy){
    if(operationTimer){clearInterval(operationTimer);operationTimer=null;}
    button.disabled=false;button.classList.remove('stop');button.textContent='Apply operation';button.title='';return;
  }
  if(!wasBusy)operationStartedAt=performance.now();
  button.disabled=stopping;button.classList.add('stop');
  const tick=()=>{const elapsed=Math.max(0,Math.floor((performance.now()-operationStartedAt)/1000));button.textContent=operationStopRequested?`Stopping… ${elapsed}s`:`Stop · ${elapsed}s`;button.title=operationStopRequested?'Waiting for the geometry worker to terminate…':`${operationStage} Click to stop.`;};
  tick();if(!operationTimer)operationTimer=setInterval(tick,250);
}
async function applyPushPull(){
  return processController.applyPushPull({
    distance:Number($('distanceInput').value)*Number($('distanceUnit').value),
    mode:$('pushMode').value,material:$('materialInput').value.trim()||'Generic film',
    targetLayerId:$('dopingTargetLayer').value,
  });
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
  const previous=layer.fillPattern===true;
  layer.fillPattern=enabled;
  const refreshPattern=()=>{if(!$('patternsWorkspace')?.classList.contains('hidden'))window.patRender?.();};
  refreshPattern();
  try{await ensureLayerFilledPolygons(layer);}
  catch(error){layer.fillPattern=previous;throw error;}
  finally{state.topBounds=null;renderLayerList();renderTop();refreshPattern();persistSharedState();}
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
  const snapshots=snapshotController.listSnapshots();
  if(!snapshots.length){
    const n=document.createElement('div');n.className='snapshot-empty';n.textContent='No snapshots yet — click + Snapshot in the top bar to capture the current 3D perspective.';
    track.appendChild(n);
    return;
  }
  for(const [snapshotIndex,s] of snapshots.entries()){
    const card=document.createElement('div');card.className='snapshot-card'+(s.active?' active':'');
    card.title=`${s.name} — click to restore`;
    const thumbnail=s.thumbnail,thumb=thumbnail?document.createElement('img'):makeSnapshotPlaceholder(snapshotIndex);if(thumbnail)thumb.className='snapshot-thumb';
    if(thumbnail){thumb.src=thumbnail;thumb.alt=s.name;thumb.onerror=()=>{thumb.replaceWith(makeSnapshotPlaceholder(snapshotIndex));};}
    const info=document.createElement('div');info.className='snapshot-info';
    const name=document.createElement('div');name.className='snapshot-name';name.textContent=s.name;
    const meta=document.createElement('div');meta.className='snapshot-meta';meta.textContent=`${s.solids} solids · ${s.cuts} cuts`;
    info.append(name,meta);
    const del=document.createElement('button');del.type='button';del.className='snapshot-delete';del.title='Delete snapshot';del.textContent='×';
    del.addEventListener('click',(e)=>{ e.stopPropagation(); snapshotController.delete(s.id); });
    card.addEventListener('click',()=>snapshotController.activate(s.id));
    card.append(thumb,info,del);
    track.appendChild(card);
  }
  // keep newest visible on the right
  requestAnimationFrame(()=>{ const strip=$('snapshotStrip'); if(strip) strip.scrollLeft=strip.scrollWidth; });
}
function captureSnapshotThumb(){
  try{
    return threeView.captureImage();
  }catch(e){ console.warn('snapshot thumb failed',e); return null; }
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
function renderAll(){ensureLayerVisuals();renderTop();sectionView.render();threeView.render();renderFigureLegend();renderDopingControls();updateUndoUi();modelStats();}

function updateAxesVisibility(){state.showAxes=$('showAxes').checked;threeView.syncAxes();persistSharedState();status(state.showAxes?'3D origin and X/Y/Z axes shown.':'3D axes hidden.');}
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
  $('showAxes').checked=state.showAxes;threeView.syncAxes();
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
  sectionView.render();threeView.scheduleRender();if(persist)persistSharedState('z-scale');
}
function setZMapping(value){
  const next=value==='relative'?'relative':'linear';
  state.zMapping=next;
  if($('zMapping'))$('zMapping').value=state.zMapping;
  syncViewControls();
  sectionView.render();threeView.render();persistSharedState('z-mapping');
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
function memoryDiagnosticsEnabled(){const params=new URLSearchParams(location.search),qa=params.get('qa')||'';return params.get('debug')==='memory'||qa==='memory'||qa.includes('memory');}
function correctnessDiagnosticsEnabled(){const qa=new URLSearchParams(location.search).get('qa')||'';return qa.includes('refill')||qa.includes('topology');}
function polygonTotals(layers=[]){let polygons=0,points=0;for(const layer of layers){for(const polygon of layer.polygons||[]){polygons++;points+=polygon.length;}}return {polygons,points};}
function memoryDiagnostics(){
  const gds=polygonTotals(state.gds?.layers),three=threeView.diagnostics();
  return {
    persistent:{solids:state.solids.length,cuts:state.cuts.length,dopings:state.dopings.length,gdsPolygons:gds.polygons,gdsPoints:gds.points,snapshots:state.snapshots.length,snapshotDevices:Object.keys(state.snapshotDevices||{}).length,snapshotThumbnailChars:Object.values(state.snapshotThumbnails||{}).reduce((sum,value)=>sum+(typeof value==='string'?value.length:JSON.stringify(value||'').length),0)},
    pattern:window.patMemoryDiagnostics?.()||null,
    three:three.memory,
    persistence:state._persistenceStats?{...state._persistenceStats}:null,
    render3D:three.render3D,
    threeLoopRunning:three.loopRunning
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
    snapshotController.create(name);$('snapshotNameDialog').close('default');snapshotNamePurpose='snapshot';
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
      waferController.createWafer({
        shape:$('waferShape').value,displayUnits:{lateral:waferDialogLateralUnit,thickness:$('waferThicknessUnit').value},
        thickness:$('waferThickness').value,material:$('waferMaterial').value,
        diameter:$('waferDiameter').value,width:$('waferWidth').value,height:$('waferHeight').value,
        edgeFeature:$('waferEdgeFeature').value,coordinates:$('waferCoordinates').value,
      });
    }catch(e){error.textContent=e.message;error.classList.remove('hidden');}
  });
  $('gdsInput').addEventListener('change',(e)=>{const f=e.target.files?.[0];if(f)importGds(f);e.target.value='';});
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
  $('undoOperationBtn').addEventListener('click',processController.undo);
}

if($('selectionMode'))$('selectionMode').value=state.selectionMode||'top';
bindUi();topView.bind();sectionView.bind();syncViewControls();updateActiveFaceUi();updateSelectionInfo();updateLayoutSectionVisibility();renderLayerList();renderSnapshots();renderAll();threeView.init();
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
      waferController.reset();state.snapshots=[];state.snapshotDevices={};state.snapshotThumbnails={};state.activeSnapshotId=null;if($('selectionMode'))$('selectionMode').value='top';
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
    updateSelectionInfo();renderTop();threeView.resize();threeView.scheduleRender();threeView.start();
  }
  function showPatterns(){
    threeView.cancelScheduledRender();threeView.stop();
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
