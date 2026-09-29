import {clone,formatDisplayNumber,state,uid} from '../core.js';
import {polygonArea,waferOutline} from '../geometry.js';
import {GeometryJobCancelledError,cancelActiveGeometryJobs,clipPolygonsToWafer,isotropicOffset,partitionTopSurface,runCancellableGeometry,splitPolygonsByMask} from '../geometry-api.js';
import {ensureLayerVisuals,layerVisual,materialColor,nextLayerName,solidLayerDescriptors} from '../layer-model.js';

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

// Inputs and region selection are supplied by the UI adapter. This controller
// owns process execution, never DOM, view resources or the derived Boolean cache.
export function createProcessController({
  resolveProcessRegions,clearSelection,invalidateSurfaceCache,onProcessChanged,
  onSelectionChanged,onUndoChanged,reportStatus,onActivityChanged,
  correctnessDiagnosticsEnabled=()=>false,
}){
  let busy=false,stopping=false,stage='';
  const qa=(new URLSearchParams(location.search).get('qa')||'').includes('process-controller');
  const debug=qa?(state._processControllerDebug||(state._processControllerDebug={instances:0,pushPullCalls:0,dopingCalls:0,undoCalls:0})):null;
  if(debug)debug.instances++;
  function notifyActivity(){onActivityChanged({busy,stopping,stage});}
  function setStage(message){stage=message;reportStatus(message);notifyActivity();}
  async function stop(){
    if(!busy||stopping)return;
    stopping=true;setStage('Stopping the active geometry worker…');
    await cancelActiveGeometryJobs();
  }
  async function applyPushPull(options){
    if(busy){await stop();return;}
    if(debug)debug.pushPullCalls++;
    busy=true;stopping=false;stage='Validating operation…';notifyActivity();
    try{await runCancellableGeometry(()=>runPushPull(options));}
    catch(error){reportStatus(error instanceof GeometryJobCancelledError?'Operation stopped. No unfinished geometry was applied.':`Operation failed: ${error.message}`);}
    finally{busy=false;stopping=false;notifyActivity();}
  }
  function diagnostics(){return {busy,stopping,stage,debug:debug?{...debug}:null};}
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

  function captureOperationState(){return clone({solids:state.solids,cuts:state.cuts,dopings:state.dopings,layerVisuals:state.layerVisuals});}
  function recordUndo(){state.operationUndo.push(captureOperationState());if(state.operationUndo.length>50)state.operationUndo.shift();onUndoChanged();}

  function undo(){if(debug)debug.undoCalls++;const previous=state.operationUndo.pop();if(!previous)return;state.solids=previous.solids||[];state.cuts=previous.cuts||[];state.dopings=previous.dopings||[];state.layerVisuals=previous.layerVisuals||{};ensureLayerVisuals();clearSelection();invalidateSurfaceCache();onProcessChanged();onUndoChanged();reportStatus('Undid the last geometry operation.');}

  async function applyDoping(distance,dopant,targetLayerId){
    if(debug)debug.dopingCalls++;
    setStage('Partitioning the exposed target surface for doping…');
    let atoms;try{atoms=await partitionTopSurface();}catch(error){if(error instanceof GeometryJobCancelledError)throw error;reportStatus(`Doping failed: ${error.message}`);return;}
    const targets=atoms.filter(atom=>atom.layerId===targetLayerId);if(!targets.length){reportStatus('The selected target layer has no exposed region on the active face.');return;}
    const layerId=uid('doping'),name=nextLayerName(`Doping · ${dopant}`),front=state.activeFace!=='back',position=front?'upper':'lower',pending=[];
    const visual={name,color:materialColor(dopant),scale:1,gradient:true};
    let maxDepth=0;
    for(const target of targets){const available=Math.max(0,target.zMax-target.zMin),depth=Math.min(distance,available);if(depth<=0)continue;maxDepth=Math.max(maxDepth,depth);const zMin=front?target.surface-depth:target.surface,zMax=front?target.surface:target.surface+depth;pending.push({id:uid('doping-region'),layerId,targetLayerId,dopant,position,depth,footprint:clone(target.polygon),zMin,zMax});}
    recordUndo();state.layerVisuals[layerId]=visual;for(const doping of pending)state.dopings.push(doping);
    invalidateSurfaceCache();onProcessChanged();reportStatus(`Added ${dopant} doping ${maxDepth.toFixed(3)} µm inward from the exposed ${state.activeFace} surface of ${layerVisual(targetLayerId).name}.`);
  }

  async function runPushPull({distance,mode,material,targetLayerId}){
    if(!state.wafer){reportStatus('Create or open a wafer before using Push / Pull.');return;}
    if(!Number.isFinite(distance)||distance<=0){reportStatus('Distance must be positive.');return;}

    if(mode==='doping'){await applyDoping(distance,material==='Generic film'?'Dopant':material,targetLayerId);return;}
    const regions=await resolveProcessRegions();if(!regions)return;
    const {wholeFace,selected}=regions;
    setStage(wholeFace?`Preparing the whole ${state.activeFace} face…`:'Clipping selected faces to the substrate…');let clipped;try{clipped=await clipPolygonsToWafer(selected.map(f=>f.polygon));}catch(e){if(e instanceof GeometryJobCancelledError)throw e;reportStatus(`Push / pull failed: ${e.message}`);return;}
    let pieces=[];clipped.forEach((parts,i)=>parts.forEach(polygon=>pieces.push({face:selected[i],polygon})));
    if(!pieces.length){clearSelection();onSelectionChanged();reportStatus('No selected area overlaps the substrate. Nothing was created.');return;}
    if(mode==='conformal-grow'||mode==='isotropic-etch'){
      setStage(mode==='conformal-grow'?'Calculating conformal growth…':'Calculating isotropic etch…');let regions;try{regions=await isotropicOffset(pieces.map(p=>p.polygon),distance);}catch(e){if(e instanceof GeometryJobCancelledError)throw e;reportStatus(`Operation failed: ${e.message}`);return;}
      pieces=regions.map(polygon=>({face:{id:null,side:state.activeFace},polygon}));if(!pieces.length){clearSelection();onSelectionChanged();reportStatus('The isotropic operation produced no region inside the substrate.');return;}
    }
    setStage('Partitioning the exposed material surface…');let surfaceAtoms;try{surfaceAtoms=await partitionTopSurface(pieces.map(piece=>piece.polygon));}catch(error){if(error instanceof GeometryJobCancelledError)throw error;reportStatus(`Operation failed: ${error.message}`);return;}
    if(!surfaceAtoms.length){reportStatus('The selected mask does not overlap an exposed material surface.');return;}
    const operationDiagnostics=correctnessDiagnosticsEnabled()?{mode,projectionRegionCount:pieces.length,requestedArea:pieces.reduce((sum,piece)=>sum+Math.abs(polygonArea(piece.polygon)),0),inputSurfaceAtoms:operationAtomDiagnostics(surfaceAtoms),outputSurfaceAtoms:[],createdSolids:[]}:null;
    // Preflight for destructive Push: ensure requested depth does not exceed locally available material
    if(mode==='down'||mode==='isotropic-etch'){
      setStage('Validating available material depth…');
      const masksForCheck=pieces.map(piece=>piece.polygon);
      const oppositeSide=state.activeFace==='front'?'back':'front';
      let oppositeAtoms;
      try{ oppositeAtoms=await partitionTopSurface(masksForCheck, oppositeSide); }catch(error){ if(error instanceof GeometryJobCancelledError) throw error; reportStatus(`Depth validation failed: ${error.message}`); return; }
      const isFront=state.activeFace==='front';
      const frontAtoms=isFront? surfaceAtoms : oppositeAtoms;
      const backAtoms=isFront? oppositeAtoms : surfaceAtoms;
      const availability=availableMaterialDepth(frontAtoms,backAtoms);
      if(!availability){reportStatus('Unable to validate a continuous material path through every selected region. No geometry was changed.');return;}
      const tolerance=1e-7*Math.max(1,Math.abs(distance),Math.abs(availability.minimum));
      if(distance>availability.minimum+tolerance){
        reportStatus(availability.mixed
          ?`Requested Push depth ${formatDisplayNumber(distance)} µm exceeds the minimum available thickness of ${formatDisplayNumber(availability.minimum)} µm across the selected regions.`
          :`Requested Push depth ${formatDisplayNumber(distance)} µm exceeds the available material thickness of ${formatDisplayNumber(availability.minimum)} µm in the selected region.`);
        return;
      }
    }
    if(mode==='up'||mode==='conformal-grow'){
      const layerId=uid('layer'),pending=[];
      const visual={name:nextLayerName(material),color:materialColor(material),scale:1,baseThickness:distance};
      for(const atom of surfaceAtoms){const side=atom.side||state.activeFace,z0=atom.surface,solid={id:uid('solid'),layerId,side,material,footprint:clone(atom.polygon),zMin:side==='back'?z0-distance:z0,zMax:side==='back'?z0:z0+distance,sourceFaceId:atom.id,wholeFace,profile:mode==='conformal-grow'?'conformal':'vertical',lateralRadius:mode==='conformal-grow'?distance:0};pending.push(solid);if(operationDiagnostics)operationDiagnostics.createdSolids.push({id:solid.id,zMin:solid.zMin,zMax:solid.zMax});}
      recordUndo();state.layerVisuals[layerId]=visual;for(const solid of pending)state.solids.push(solid);
      reportStatus(mode==='conformal-grow'?`Conformally grew ${material} with a ${distance.toFixed(3)} µm isotropic radius on the ${state.activeFace} face.`:(wholeFace?`Created a ${distance.toFixed(3)} µm ${material} blanket layer on the ${state.activeFace} face.`:`Pulled ${pieces.length} substrate-bounded region(s) from the ${state.activeFace} face by ${distance.toFixed(3)} µm.`));
    }else{
      const previousNames=new Map(solidLayerDescriptors().map(d=>[d.id,layerVisual(d.id).name]));setStage('Calculating layer-by-layer material consumption…');let consumed;try{consumed=await buildMaterialConsumption(surfaceAtoms,distance,mode,wholeFace);}catch(e){if(e instanceof GeometryJobCancelledError)throw e;reportStatus(`Operation failed: ${e.message}`);return;}recordUndo();state.solids=consumed.solids;state.dopings=consumed.dopings;state.cuts=consumed.cuts;const removed=cleanupConsumedLayers(previousNames),removedText=removed.length?` Removed layer${removed.length>1?'s':''}: ${removed.join(', ')}.`:'';
      reportStatus(mode==='isotropic-etch'?`Isotropically etched inward from the ${state.activeFace} surface by ${distance.toFixed(3)} µm.${removedText}`:`Pushed inward from the ${state.activeFace} surface by ${distance.toFixed(3)} µm.${removedText}`);
    }
    // Keep Patterns selection for iterative tuning; clear legacy imprinted/top
    clearSelection();invalidateSurfaceCache();
    // Post-commit diagnostics are optional; their failure never rejects a completed operation.
    if(operationDiagnostics){try{operationDiagnostics.outputSurfaceAtoms=operationAtomDiagnostics(await partitionTopSurface(pieces.map(piece=>piece.polygon)));}catch(error){operationDiagnostics.outputError=error.message;}state._lastOperationDebug=operationDiagnostics;}
    onProcessChanged();
  }

  function operationAtomDiagnostics(atoms){return atoms.map(atom=>({geometryId:atom.geometryId,sourceId:atom.sourceId,kind:atom.kind,layerId:atom.layerId,surface:Number(atom.surface),zMin:Number(atom.zMin),zMax:Number(atom.zMax),area:Number(atom.area)}));}

  return {applyPushPull,stop,undo,recordUndo,diagnostics};
}
