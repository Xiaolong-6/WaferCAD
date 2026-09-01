import {formatDisplayNumber,state,uid} from './core.js';
import {centroid,pointInPoly,waferOutline,waferXYScale} from './geometry.js';

export function materialColor(name){let hash=0;for(const char of name)hash=(hash*31+char.charCodeAt(0))>>>0;const colors=['#9ca3af','#60a5fa','#f59e0b','#34d399','#c084fc','#f87171','#22d3ee','#a3e635'];return colors[hash%colors.length];}
export function validColor(value,fallback='#9ca3af'){return /^#[0-9a-f]{6}$/i.test(value||'')?value:fallback;}
export function validLayerScale(value){const number=Number(value);return Number.isFinite(number)&&number>0?Math.min(number,100):1;}
export function nextLayerName(base){const names=new Set(Object.values(state.layerVisuals||{}).map(value=>value.name));if(!names.has(base))return base;let number=2;while(names.has(`${base} ${number}`))number++;return `${base} ${number}`;}

export function relativeThickness(t_um){
  const number=Number(t_um);
  if(!Number.isFinite(number)||number<=0) return 0.25;
  const t_nm=number*1000;
  if(!Number.isFinite(t_nm)||t_nm<=0) return 0.25;
  const value=1+Math.log10(t_nm);
  return Math.max(0.25,value);
}
function isRelativeMapping(){return state.zMapping==='relative';}
function globalDisplayScale(){const n=Number(state.zExag);return Number.isFinite(n)&&n>0?Math.min(1000,Math.max(0.1,n)):8;}
function fullPhysicalThicknessForLayer(layerId,layers){
  if(layerId==='substrate') return state.wafer?Number(state.wafer.thickness)||0:0;
  const visual=state.layerVisuals?.[layerId];
  if(visual&&Number.isFinite(Number(visual.baseThickness))&&Number(visual.baseThickness)>0) return Number(visual.baseThickness);
  const desc=(layers||[]).find(layer=>layer.id===layerId);
  if(desc) return Math.max(0,Number(desc.zMax)-Number(desc.zMin));
  const solids=state.solids.filter(solid=>solid.layerId===layerId);
  if(solids.length){
    const min=Math.min(...solids.map(solid=>Number(solid.zMin)));
    const max=Math.max(...solids.map(solid=>Number(solid.zMax)));
    return Math.max(0,max-min);
  }
  return 0;
}
function substrateVisualHeightRelative(){
  const thickness=state.wafer?Number(state.wafer.thickness)||0:0;
  const substrateScale=validLayerScale(state.layerVisuals?.substrate?.scale);
  return relativeThickness(thickness)*globalDisplayScale()*substrateScale;
}
function layerVisualIntervalRelative(layerId,layers){
  if(layerId==='substrate'){
    const thickness=state.wafer?Number(state.wafer.thickness)||0:0;
    const visualHeight=substrateVisualHeightRelative();
    return {visualMin:-visualHeight,visualMax:0,physicalBottom:-thickness,physicalThickness:thickness,visualHeight};
  }
  const descriptors=layers||solidLayerDescriptors();
  const current=descriptors.find(layer=>layer.id===layerId);
  if(!current) return null;
  const T_full=fullPhysicalThicknessForLayer(layerId,descriptors);
  if(T_full<=0) return null;
  const perScale=validLayerScale(state.layerVisuals?.[layerId]?.scale);
  const V_full=relativeThickness(T_full)*globalDisplayScale()*perScale;
  const side=current.side||'front';
  if(side==='back'){
    const backLayers=descriptors.filter(layer=>(layer.side||'front')==='back').sort((a,b)=> Number(b.zMax)-Number(a.zMax));
    const Hsub=substrateVisualHeightRelative();
    let offset=0;
    for(const layer of backLayers){
      if(layer.id===layerId){
        const physicalBottom=Number(layer.zMax)-T_full;
        const visualTop=-Hsub - offset;
        const visualBottom=visualTop - V_full;
        return {visualMin:visualBottom,visualMax:visualTop,physicalBottom,physicalThickness:T_full,visualHeight:V_full};
      }
      const tf=fullPhysicalThicknessForLayer(layer.id,descriptors);
      const vf=relativeThickness(tf)*globalDisplayScale()*validLayerScale(state.layerVisuals?.[layer.id]?.scale);
      offset+=vf;
    }
  } else {
    const frontLayers=descriptors.filter(layer=>(layer.side||'front')!=='back').sort((a,b)=> Number(a.zMin)-Number(b.zMin));
    let offset=0;
    for(const layer of frontLayers){
      if(layer.id===layerId){
        const physicalBottom=Number(layer.zMin);
        const visualBottom=offset;
        const visualTop=offset+V_full;
        return {visualMin:visualBottom,visualMax:visualTop,physicalBottom,physicalThickness:T_full,visualHeight:V_full};
      }
      const tf=fullPhysicalThicknessForLayer(layer.id,descriptors);
      const vf=relativeThickness(tf)*globalDisplayScale()*validLayerScale(state.layerVisuals?.[layer.id]?.scale);
      offset+=vf;
    }
  }
  return null;
}
export function ensureLayerVisuals(){
  state.layerVisuals=state.layerVisuals&&typeof state.layerVisuals==='object'?state.layerVisuals:{};
  if(state.wafer){const old=state.layerVisuals.substrate||{};state.layerVisuals.substrate={name:old.name||`Substrate · ${state.wafer.material}`,color:validColor(old.color,materialColor(state.wafer.material)),scale:validLayerScale(old.scale),baseThickness: Number.isFinite(Number(old.baseThickness))&&Number(old.baseThickness)>0?Number(old.baseThickness):Number(state.wafer.thickness)||0};}
  const migrated=new Map();
  for(const solid of state.solids){if(!solid.layerId){const key=`${solid.side||'front'}|${solid.material}|${solid.zMin}|${solid.zMax}`;if(!migrated.has(key))migrated.set(key,uid('layer'));solid.layerId=migrated.get(key);}const old=state.layerVisuals[solid.layerId]||{};const thickness=Math.max(0,Number(solid.zMax)-Number(solid.zMin));const existingBase=Number.isFinite(Number(old.baseThickness))&&Number(old.baseThickness)>0?Number(old.baseThickness):null;const baseThickness=existingBase!=null?existingBase:(thickness>0?thickness:Number(state.wafer?.thickness)||thickness);state.layerVisuals[solid.layerId]={name:old.name||nextLayerName(solid.material||'Layer'),color:validColor(old.color,materialColor(solid.material||'Layer')),scale:validLayerScale(old.scale),baseThickness};}
  for(const doping of state.dopings){const old=state.layerVisuals[doping.layerId]||{};state.layerVisuals[doping.layerId]={name:old.name||`Doping · ${doping.dopant||'Dopant'}`,color:validColor(old.color,materialColor(doping.dopant||'Dopant')),scale:validLayerScale(old.scale),gradient:true,baseThickness: old.baseThickness!=null?old.baseThickness:undefined};}
}

export function layerVisual(id){return state.layerVisuals?.[id]||{name:'Layer',color:'#9ca3af',scale:1};}
export function solidLayerDescriptors(){ensureLayerVisuals();const map=new Map();for(const solid of state.solids){const descriptor=map.get(solid.layerId)||{id:solid.layerId,side:solid.side||'front',zMin:solid.zMin,zMax:solid.zMax,scale:validLayerScale(state.layerVisuals[solid.layerId]?.scale)};descriptor.zMin=Math.min(descriptor.zMin,solid.zMin);descriptor.zMax=Math.max(descriptor.zMax,solid.zMax);map.set(solid.layerId,descriptor);}return [...map.values()];}
export function outerLayerPosition(id){if(id==='substrate')return null;const layers=solidLayerDescriptors(),current=layers.find(layer=>layer.id===id),epsilon=1e-7;if(!current)return null;const sameSide=layers.filter(layer=>layer.side===current.side);if(current.side==='back'){const bottom=Math.min(...sameSide.map(layer=>layer.zMin));return Math.abs(current.zMin-bottom)<=epsilon?'bottom':null;}const top=Math.max(...sameSide.map(layer=>layer.zMax));return Math.abs(current.zMax-top)<=epsilon?'top':null;}

function mappedPhysicalZLinear(z){return z;}
export function displayZ(z){
  if(!state.wafer) return 0;
  if(isRelativeMapping()){
    const thickness=Number(state.wafer.thickness)||0;
    if(thickness<=0) return 0;
    const Hsub=substrateVisualHeightRelative();
    if(z>=0) return 0;
    if(z<=-thickness) return -Hsub;
    return -Hsub + (Number(z)+thickness)/thickness * Hsub;
  }
  const xy=waferXYScale(),exaggeration=globalDisplayScale(),thickness=state.wafer.thickness,substrateScale=validLayerScale(state.layerVisuals?.substrate?.scale),mapped=mappedPhysicalZLinear(z),mappedBottom=mappedPhysicalZLinear(-thickness);
  if(z>=0) return mapped*xy*exaggeration;
  if(z<=-thickness) return mappedBottom*xy*exaggeration*substrateScale+(mapped-mappedBottom)*xy*exaggeration;
  return mapped*xy*exaggeration*substrateScale;
}
export function mappedSolidBounds(solid,layers=solidLayerDescriptors()){
  if(isRelativeMapping()){
    if(!state.wafer) return {zMin:0,zMax:0};
    const descriptors=layers||solidLayerDescriptors();
    const layerId=solid.layerId;
    const interval=layerVisualIntervalRelative(layerId,descriptors);
    if(!interval){
      const t=Math.max(0,Number(solid.zMax)-Number(solid.zMin));
      const v=relativeThickness(t)*globalDisplayScale()*validLayerScale(layerVisual(layerId).scale);
      const side=solid.side||'front';
      if(side==='back'){
        const Hsub=substrateVisualHeightRelative();
        return {zMin:-Hsub - v, zMax:-Hsub};
      }
      return {zMin:0,zMax:v};
    }
    const T_full=interval.physicalThickness;
    const V_full=interval.visualHeight;
    const physicalBottom=interval.physicalBottom;
    const visualBottom=interval.visualMin;
    if(T_full<=0) return {zMin:visualBottom,zMax:visualBottom};
    const fLow=(Number(solid.zMin)-physicalBottom)/T_full;
    const fHigh=(Number(solid.zMax)-physicalBottom)/T_full;
    const clampedLow=Math.max(0,Math.min(1,fLow));
    const clampedHigh=Math.max(0,Math.min(1,fHigh));
    const zMin=visualBottom + clampedLow*V_full;
    const zMax=visualBottom + clampedHigh*V_full;
    return {zMin:Math.min(zMin,zMax),zMax:Math.max(zMin,zMax)};
  }
  const current=layers.find(layer=>layer.id===solid.layerId),rawMin=displayZ(solid.zMin),rawMax=displayZ(solid.zMax);if(!current)return {zMin:rawMin,zMax:rawMax};const epsilon=1e-7;if(current.side==='back'){const offset=layers.filter(layer=>layer.id!==current.id&&layer.side==='back'&&layer.zMin>=current.zMax-epsilon).reduce((sum,layer)=>sum+(layer.scale-1)*(displayZ(layer.zMax)-displayZ(layer.zMin)),0),zMax=rawMax-offset;return {zMin:zMax-(rawMax-rawMin)*current.scale,zMax};}const offset=layers.filter(layer=>layer.id!==current.id&&layer.side!=='back'&&layer.zMax<=current.zMin+epsilon).reduce((sum,layer)=>sum+(layer.scale-1)*(displayZ(layer.zMax)-displayZ(layer.zMin)),0),zMin=rawMin+offset;return {zMin,zMax:zMin+(rawMax-rawMin)*current.scale};}
export function mappedDopingBounds(doping,layers=solidLayerDescriptors()){
  if(isRelativeMapping()){
    if(!state.wafer) return {zMin:0,zMax:0};
    const descriptors=layers||solidLayerDescriptors();
    let targetInterval=null;
    if(doping.targetLayerId==='substrate'){
      targetInterval=layerVisualIntervalRelative('substrate',descriptors);
    } else {
      // For solid target, find its full layer interval
      targetInterval=layerVisualIntervalRelative(doping.targetLayerId,descriptors);
      // If not found (target layer may have been removed), fallback to substrate
      if(!targetInterval) targetInterval=layerVisualIntervalRelative('substrate',descriptors);
    }
    if(!targetInterval) return {zMin:displayZ(doping.zMin),zMax:displayZ(doping.zMax)};
    const T_target=targetInterval.physicalThickness;
    const V_target=targetInterval.visualHeight;
    const physicalBottom=targetInterval.physicalBottom;
    const visualBottom=targetInterval.visualMin;
    if(T_target<=0) return {zMin:visualBottom,zMax:visualBottom};
    const fLow=(Number(doping.zMin)-physicalBottom)/T_target;
    const fHigh=(Number(doping.zMax)-physicalBottom)/T_target;
    const clampedLow=Math.max(0,Math.min(1,fLow));
    const clampedHigh=Math.max(0,Math.min(1,fHigh));
    const rawMin=visualBottom + clampedLow*V_target;
    const rawMax=visualBottom + clampedHigh*V_target;
    const scale=validLayerScale(layerVisual(doping.layerId).scale);
    const height=rawMax-rawMin;
    if(doping.position==='lower') return {zMin:rawMin,zMax:rawMin+height*scale};
    return {zMin:rawMax-height*scale,zMax:rawMax};
  }
  let mapped;if(doping.targetLayerId==='substrate')mapped={zMin:displayZ(doping.zMin),zMax:displayZ(doping.zMax)};else mapped=mappedSolidBounds({layerId:doping.targetLayerId,zMin:doping.zMin,zMax:doping.zMax},layers);const scale=validLayerScale(layerVisual(doping.layerId).scale),height=mapped.zMax-mapped.zMin;if(doping.position==='lower')return {zMin:mapped.zMin,zMax:mapped.zMin+height*scale};return {zMin:mapped.zMax-height*scale,zMax:mapped.zMax};}
export function substrateVisualHeight(){
  if(!state.wafer) return 0;
  if(isRelativeMapping()) return substrateVisualHeightRelative();
  const xy=waferXYScale(),thickness=Number(state.wafer.thickness)||0,substrateScale=validLayerScale(state.layerVisuals?.substrate?.scale);
  return thickness*xy*globalDisplayScale()*substrateScale;
}
export function mappedCutBounds(zMin,zMax){
  if(!state.wafer) return {zMin:0,zMax:0};
  if(isRelativeMapping()){
    const interval=layerVisualIntervalRelative('substrate',solidLayerDescriptors());
    if(!interval) return {zMin:displayZ(zMin),zMax:displayZ(zMax)};
    const T=interval.physicalThickness, H=interval.visualHeight, physicalBottom=interval.physicalBottom, visualBottom=interval.visualMin;
    const fLow=(Number(zMin)-physicalBottom)/T;
    const fHigh=(Number(zMax)-physicalBottom)/T;
    const clampedLow=Math.max(0,Math.min(1,fLow));
    const clampedHigh=Math.max(0,Math.min(1,fHigh));
    return {zMin: visualBottom + clampedLow*H, zMax: visualBottom + clampedHigh*H};
  }
  return {zMin:displayZ(zMin),zMax:displayZ(zMax)};
}

export function pieceThicknessRange(pieces){const values=pieces.map(piece=>Math.max(0,Number(piece.zMax)-Number(piece.zMin))).filter(Number.isFinite);return values.length?[Math.min(...values),Math.max(...values)]:[0,0];}
function mergedIntervalLength(intervals){if(!intervals.length)return 0;const sorted=intervals.map(([a,b])=>[Math.min(a,b),Math.max(a,b)]).sort((a,b)=>a[0]-b[0]);let total=0,[low,high]=sorted[0];for(let i=1;i<sorted.length;i++){const [a,b]=sorted[i];if(a<=high+1e-7)high=Math.max(high,b);else{total+=high-low;low=a;high=b;}}return total+high-low;}
function substrateRemainingAt(point){const thickness=state.wafer.thickness,intervals=state.cuts.filter(cut=>pointInPoly(point,cut.footprint)).map(cut=>[Math.max(-thickness,cut.zMin),Math.min(0,cut.zMax)]).filter(([a,b])=>b>a);return Math.max(0,thickness-mergedIntervalLength(intervals));}
function polygonInteriorSamples(polygon){const center=centroid(polygon);return [center,...polygon.map(([x,y])=>({x:x*.995+center.x*.005,y:y*.995+center.y*.005}))];}
export function substrateThicknessRange(){if(state._exactThickness&&state._exactThickness.min!=null)return [state._exactThickness.min,state._exactThickness.max];const outline=waferOutline(),samples=polygonInteriorSamples(outline);for(const cut of state.cuts)samples.push(...polygonInteriorSamples(cut.footprint));const values=samples.filter(point=>pointInPoly(point,outline)).map(substrateRemainingAt);return values.length?[Math.min(...values),Math.max(...values)]:[state.wafer.thickness,state.wafer.thickness];}

export function layerLegendEntries(){
  if(!state.wafer)return [];
  ensureLayerVisuals();
  const descriptors=solidLayerDescriptors(),front=descriptors.filter(layer=>layer.side!=='back').sort((a,b)=>b.zMax-a.zMax||b.zMin-a.zMin),back=descriptors.filter(layer=>layer.side==='back').sort((a,b)=>b.zMax-a.zMax||b.zMin-a.zMin),dopingEntries=[],seenDoping=new Set();
  for(const doping of state.dopings){if(seenDoping.has(doping.layerId))continue;seenDoping.add(doping.layerId);dopingEntries.push({id:doping.layerId,kind:'doping',targetLayerId:doping.targetLayerId,...layerVisual(doping.layerId),thickness:pieceThicknessRange(state.dopings.filter(item=>item.layerId===doping.layerId))});}
  const usedDoping=new Set(),attachedDoping=targetLayerId=>dopingEntries.filter(entry=>entry.targetLayerId===targetLayerId).map(entry=>{usedDoping.add(entry.id);return entry;}),solidEntry=layer=>({id:layer.id,kind:'solid',sideLabel:layer.side==='back'?'Back':'Front',outerPosition:outerLayerPosition(layer.id),...layerVisual(layer.id),thickness:pieceThicknessRange(state.solids.filter(solid=>solid.layerId===layer.id))}),entries=[];
  for(const layer of front)entries.push(solidEntry(layer),...attachedDoping(layer.id));
  entries.push({id:'substrate',kind:'substrate',...state.layerVisuals.substrate,thickness:substrateThicknessRange()},...attachedDoping('substrate'));
  for(const layer of back)entries.push(solidEntry(layer),...attachedDoping(layer.id));
  entries.push(...dopingEntries.filter(entry=>!usedDoping.has(entry.id)));
  return entries;
}

export function formatThickness(value){const number=Math.max(0,value);if(number>=1000)return `${formatDisplayNumber(number/1000)} mm`;if(number<1)return `${formatDisplayNumber(number*1000)} nm`;return `${formatDisplayNumber(number)} µm`;}
export function formatThicknessRange(range){const [min,max]=range;return Math.abs(max-min)<1e-7?formatThickness(max):`${formatThickness(min)}–${formatThickness(max)}`;}
export function editableLayerMaterial(id){if(id==='substrate')return state.wafer?.material||'Substrate';const solid=state.solids.find(item=>item.layerId===id);if(solid)return solid.material||layerVisual(id).name;const doping=state.dopings.find(item=>item.layerId===id);return doping?.dopant||layerVisual(id).name.replace(/^Doping\s*·\s*/,'');}
export function renameLayerMaterial(id,name){if(id==='substrate'){state.wafer.material=name;state.layerVisuals[id].name=`Substrate · ${name}`;return;}const solids=state.solids.filter(solid=>solid.layerId===id);if(solids.length){for(const solid of solids)solid.material=name;state.layerVisuals[id].name=name;return;}const dopings=state.dopings.filter(doping=>doping.layerId===id);if(dopings.length){for(const doping of dopings)doping.dopant=name;state.layerVisuals[id].name=`Doping · ${name}`;}}
export function physicalLayerOptions(){const entries=[{id:'substrate',name:layerVisual('substrate').name}],seen=new Set();for(const solid of state.solids)if(!seen.has(solid.layerId)){seen.add(solid.layerId);entries.push({id:solid.layerId,name:layerVisual(solid.layerId).name});}return entries;}
