import {$,formatDisplayNumber,persistSharedState,state,status} from './core.js';
import {waferOutline} from './geometry.js';
import {editableLayerMaterial,ensureLayerVisuals,formatThicknessRange,layerLegendEntries,layerVisual,outerLayerPosition,renameLayerMaterial,validColor} from './layer-model.js';

export function createLegendController({recordOperationUndo,updateSelectionInfo,renderAll}){
  let editingLayerVisualId=null,pendingDeleteLayerId=null,thicknessRefreshSeq=0,thicknessRefreshPending=false,thicknessRefreshDirty=false;

  async function refreshExactThickness(){
    if(!state.wafer){state._exactThickness=null;return;}
    if(thicknessRefreshPending){thicknessRefreshDirty=true;return;}
    thicknessRefreshPending=true;
    const sequence=++thicknessRefreshSeq;
    try{
      const payload={outline:waferOutline(),thickness:state.wafer.thickness,cuts:state.cuts.map(cut=>({footprint:cut.footprint,zMin:cut.zMin,zMax:cut.zMax}))};
      const response=await fetch('/api/geometry/substrate-thickness',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!response.ok)return;
      const data=await response.json();
      if(sequence!==thicknessRefreshSeq)return;
      state._exactThickness={min:Number(data.min),max:Number(data.max),atoms:data.atoms,exact:data.exact!==false};
      updateThickness();
    }catch(error){/* retain the local estimate */}
    finally{thicknessRefreshPending=false;if(thicknessRefreshDirty){thicknessRefreshDirty=false;refreshExactThickness();}}
  }

  function updateThickness(){
    const box=$('figureLegend');if(!box||box.classList.contains('hidden'))return;
    const entries=layerLegendEntries(),rows=box.querySelectorAll('.figure-legend-row');
    for(let index=0;index<entries.length&&index<rows.length;index++){
      const entry=entries[index],thickness=rows[index].querySelector('.figure-legend-thickness');if(!thickness)continue;
      const exact=entry.id==='substrate'&&state._exactThickness;
      thickness.textContent=`Thickness ${formatThicknessRange(entry.thickness)}${exact?` · ${exact.atoms} atoms${exact.exact===false?' · approx.':''}`:''}`;
    }
    if(entries.length!==rows.length)render();
  }

  function render(){
    const box=$('figureLegend');if(!box)return;
    box.innerHTML='';const entries=layerLegendEntries();box.classList.toggle('hidden',!entries.length);if(!entries.length)return;
    const title=document.createElement('div');title.className='figure-legend-title';title.textContent='Figure legend';box.appendChild(title);
    for(const entry of entries){
      const row=document.createElement('div');row.className='figure-legend-row';row.dataset.layerId=entry.id;
      const edit=document.createElement('button');edit.type='button';edit.className='figure-legend-edit';edit.title='Click to change material name, color and display scale';
      const swatch=document.createElement('span');swatch.className='figure-legend-swatch';swatch.style.background=entry.gradient?`linear-gradient(90deg,transparent,${entry.color})`:entry.color;
      const label=document.createElement('span');label.className='figure-legend-label';
      const nameLine=document.createElement('span');nameLine.className='figure-legend-name-line';
      const name=document.createElement('span');name.className='figure-legend-name';name.textContent=entry.name;nameLine.appendChild(name);
      if(entry.sideLabel){const badge=document.createElement('span');badge.className='figure-legend-badge';badge.textContent=entry.sideLabel;nameLine.appendChild(badge);}
      if(entry.outerPosition){const badge=document.createElement('span');badge.className='figure-legend-badge outer';badge.textContent=entry.outerPosition[0].toUpperCase()+entry.outerPosition.slice(1);nameLine.appendChild(badge);}
      const thickness=document.createElement('span');thickness.className='figure-legend-thickness';const exact=entry.id==='substrate'&&state._exactThickness;thickness.textContent=`Thickness ${formatThicknessRange(entry.thickness)}${exact?` · ${exact.atoms} atoms`:''}`;label.append(nameLine,thickness);
      const scale=document.createElement('span');scale.className='figure-legend-scale';scale.textContent=`×${formatDisplayNumber(entry.scale)}`;edit.append(swatch,label,scale);row.appendChild(edit);
      if(entry.kind==='solid'&&entry.outerPosition){const remove=document.createElement('button');remove.type='button';remove.className='figure-legend-delete';remove.textContent='×';remove.title=`Delete exposed ${entry.outerPosition} layer`;remove.setAttribute('aria-label',`Delete ${entry.name}`);remove.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openDeleteDialog(entry.id);});row.appendChild(remove);}
      box.appendChild(row);
    }
    refreshExactThickness();
  }

  function openVisualDialog(id){
    try{const visual=layerVisual(id),dialog=$('layerVisualDialog');editingLayerVisualId=id;$('layerVisualName').value=editableLayerMaterial(id);$('layerVisualColor').value=visual.color;$('layerVisualScale').value=formatDisplayNumber(visual.scale);$('layerVisualError').classList.add('hidden');if(dialog.open)dialog.close();dialog.showModal();dialog.style.zIndex='9999';}
    catch(error){console.error('openLayerVisualDialog failed',error);status(`Cannot open layer dialog: ${error.message}`);}
  }

  function openDeleteDialog(id){const position=outerLayerPosition(id),entry=layerLegendEntries().find(item=>item.id===id);if(!position||!entry){status('Only an exposed top or bottom material layer can be deleted.');return;}pendingDeleteLayerId=id;$('deleteLayerMessage').textContent=`Delete ${entry.name}, the exposed ${position} layer? Associated doping on this layer will also be removed.`;const dialog=$('deleteLayerDialog');if(dialog.open)dialog.close();dialog.showModal();}
  function deleteOuterLayer(id){const position=outerLayerPosition(id),entry=layerLegendEntries().find(item=>item.id===id);if(!position||!entry){status('Layer deletion cancelled because it is no longer an exposed outer layer.');return;}recordOperationUndo();const removedSolidIds=new Set(state.solids.filter(solid=>solid.layerId===id).map(solid=>solid.id)),removedDopingLayerIds=new Set(state.dopings.filter(doping=>doping.targetLayerId===id).map(doping=>doping.layerId));state.solids=state.solids.filter(solid=>solid.layerId!==id);state.dopings=state.dopings.filter(doping=>doping.targetLayerId!==id&&doping.layerId!==id);delete state.layerVisuals[id];for(const dopingLayerId of removedDopingLayerIds)delete state.layerVisuals[dopingLayerId];for(const solidId of removedSolidIds)state._topFaceSelection.selectedSolidIds.delete(solidId);ensureLayerVisuals();updateSelectionInfo();renderAll();persistSharedState();status(`Deleted ${entry.name}, the exposed ${position} layer.`);}

  function bindUi(){
    $('applyLayerVisualBtn').addEventListener('click',()=>{const scale=Number($('layerVisualScale').value),name=$('layerVisualName').value.trim(),error=$('layerVisualError');if(!name){error.textContent='Material name cannot be empty.';error.classList.remove('hidden');return;}if(!Number.isFinite(scale)||scale<=0||scale>100){error.textContent='Display scale must be greater than 0 and no more than 100.';error.classList.remove('hidden');return;}if(!editingLayerVisualId||!state.layerVisuals[editingLayerVisualId])return;renameLayerMaterial(editingLayerVisualId,name);state.layerVisuals[editingLayerVisualId].color=validColor($('layerVisualColor').value);state.layerVisuals[editingLayerVisualId].scale=scale;$('layerVisualDialog').close('default');renderAll();persistSharedState();status(`Updated ${state.layerVisuals[editingLayerVisualId].name}: display ×${scale}.`);});
    $('confirmDeleteLayerBtn').addEventListener('click',()=>{const id=pendingDeleteLayerId;pendingDeleteLayerId=null;$('deleteLayerDialog').close('default');if(id)deleteOuterLayer(id);});
    $('deleteLayerDialog').addEventListener('close',()=>{if($('deleteLayerDialog').returnValue==='cancel')pendingDeleteLayerId=null;});
    const box=$('figureLegend');box?.addEventListener('click',event=>{if(event.target.closest('.figure-legend-delete'))return;const row=event.target.closest('.figure-legend-row');if(!row?.dataset.layerId)return;event.preventDefault();event.stopPropagation();openVisualDialog(row.dataset.layerId);});
  }

  return {bindUi,render};
}
