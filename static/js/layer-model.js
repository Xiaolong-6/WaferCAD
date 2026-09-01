import {formatDisplayNumber,state,uid} from './core.js';
import {centroid,pointInPoly,waferOutline,waferXYScale} from './geometry.js';

export function materialColor(name){let hash=0;for(const char of name)hash=(hash*31+char.charCodeAt(0))>>>0;const colors=['#9ca3af','#60a5fa','#f59e0b','#34d399','#c084fc','#f87171','#22d3ee','#a3e635'];return colors[hash%colors.length];}
export function validColor(value,fallback='#9ca3af'){return /^#[0-9a-f]{6}$/i.test(value||'')?value:fallback;}
export function validLayerScale(value){const number=Number(value);return Number.isFinite(number)&&number>0?Math.min(number,100):1;}
export function nextLayerName(base){const names=new Set(Object.values(state.layerVisuals||{}).map(value=>value.name));if(!names.has(base))return base;let number=2;while(names.has(`${base} ${number}`))number++;return `${base} ${number}`;}

export const MIN_VISUAL_THICKNESS = 0.25;
export function relativeThickness(t_um){
  const number=Number(t_um);
  if(!Number.isFinite(number)||number<=0) return 0;
  const t_nm=number*1000;
  if(!Number.isFinite(t_nm)||t_nm<=0) return 0;
  const value=1+Math.log10(t_nm);
  return Math.max(MIN_VISUAL_THICKNESS,value);
}
function isRelativeMapping(){return state.zMapping==='relative';}
function globalPhysicalScale(){const n=Number(state.zExag);return Number.isFinite(n)&&n>0?Math.min(1000,Math.max(0.1,n)):8;}
function globalRelativeScale(){const n=Number(state.relativeZScale);return Number.isFinite(n)&&n>0?Math.min(100,Math.max(0.1,n)):1;}
function globalDisplayScale(){return isRelativeMapping()?globalRelativeScale():globalPhysicalScale();}
export const RELATIVE_NORMALIZATION_NOTE = "Relative visual units: H=relativeThickness(T)*globalRelativeScale (default 1 gives H~6.7 for 500 um, comparable to XY width ~9)";
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
  return relativeThickness(thickness)*globalRelativeScale()*substrateScale;
}
export const SUBSTRATE_SURFACE_D0 = 1; // µm, surface-detail exaggeration knee
function substrateDepthVisual(depth, Hsub, T){
  if(depth<=0) return 0;
  if(depth>= T/2) return Hsub/2;
  const d0=SUBSTRATE_SURFACE_D0;
  return (Hsub/2) * Math.log(1 + depth/d0) / Math.log(1 + (T/2)/d0);
}
function substrateVisualZ(z){
  const T=Number(state.wafer?.thickness)||0;
  const H=substrateVisualHeightRelative();
  const zz=Number(z);
  if(!Number.isFinite(zz)||T<=0) return 0;
  if(zz>=0) return 0;
  if(zz<=-T) return -H;
  if(zz>= -T/2){
    const d=-zz;
    return -substrateDepthVisual(d, H, T);
  } else {
    const d=zz+T;
    return -H + substrateDepthVisual(d, H, T);
  }
}
function pieceInteriorPoint(polygon){
  if(!Array.isArray(polygon)||polygon.length<3) return null;
  let x=0,y=0;
  for(const p of polygon){ x+=p[0]; y+=p[1]; }
  const c={x:x/polygon.length, y:y/polygon.length};
  if(pointInPoly(c, polygon)) return c;
  for(const p of polygon){
    const q={x:p[0]*0.99+ c.x*0.01, y:p[1]*0.99+ c.y*0.01};
    if(pointInPoly(q, polygon)) return q;
  }
  return c;
}
function footprintsOverlap(a,b){
  // quick bbox then point test
  let ax0=Infinity,ay0=Infinity,ax1=-Infinity,ay1=-Infinity;
  for(const p of a){ ax0=Math.min(ax0,p[0]); ay0=Math.min(ay0,p[1]); ax1=Math.max(ax1,p[0]); ay1=Math.max(ay1,p[1]); }
  let bx0=Infinity,by0=Infinity,bx1=-Infinity,by1=-Infinity;
  for(const p of b){ bx0=Math.min(bx0,p[0]); by0=Math.min(by0,p[1]); bx1=Math.max(bx1,p[0]); by1=Math.max(by1,p[1]); }
  if(ax1 < bx0 || bx1 < ax0 || ay1 < by0 || by1 < ay0) return false;
  const ca=pieceInteriorPoint(a), cb=pieceInteriorPoint(b);
  if(ca && pointInPoly(ca,b)) return true;
  if(cb && pointInPoly(cb,a)) return true;
  return true;
}
function findSupportingSolids(piece, allSolids, side){
  const eps=1e-7;
  const supporters=[];
  const isBack = (side||piece.side||'front')==='back';
  for(const cand of allSolids){
    if(cand.id===piece.id) continue;
    if((cand.side||'front')!==(piece.side||'front')) continue;
    if(isBack){
      if(Math.abs(Number(cand.zMin) - Number(piece.zMax)) > eps) continue;
    } else {
      if(Math.abs(Number(cand.zMax) - Number(piece.zMin)) > eps) continue;
    }
    if(!footprintsOverlap(piece.footprint, cand.footprint)) continue;
    supporters.push(cand);
  }
  return supporters;
}
function computeVisualBoundsForPiece(piece, allSolids, memo, visiting=new Set()){
  if(memo.has(piece.id)) return memo.get(piece.id);
  if(visiting.has(piece.id)){
    // cycle fallback
    const T_full=fullPhysicalThicknessForLayer(piece.layerId,null)||Math.max(0, Number(piece.zMax)-Number(piece.zMin));
    const V_full=relativeThickness(T_full)*globalRelativeScale()*validLayerScale(state.layerVisuals?.[piece.layerId]?.scale);
    const thickness=Math.max(0, Number(piece.zMax)-Number(piece.zMin));
    const V_piece=T_full>0?(thickness/T_full)*V_full:0;
    const res= (piece.side||'front')==='back'?{zMin:-substrateVisualHeightRelative()-V_piece, zMax:-substrateVisualHeightRelative()}:{zMin:0, zMax:V_piece};
    memo.set(piece.id,res);
    return res;
  }
  visiting.add(piece.id);
  const T_full=fullPhysicalThicknessForLayer(piece.layerId,null);
  const effective_T = (Number.isFinite(T_full) && T_full>0)? T_full : Math.max(0, Number(piece.zMax)-Number(piece.zMin));
  const perScale=validLayerScale(state.layerVisuals?.[piece.layerId]?.scale);
  const V_full=relativeThickness(effective_T)*globalRelativeScale()*perScale;
  const pieceThickness=Math.max(0, Number(piece.zMax)-Number(piece.zMin));
  const V_piece= effective_T>0? (pieceThickness/effective_T)*V_full : 0;
  const side=(piece.side||'front');
  let result;
  if(side==='back'){
    const supporters=findSupportingSolids(piece, allSolids, 'back');
    let supportVisualBottom;
    if(supporters.length){
      let minBottom=Infinity;
      for(const sup of supporters){
        const b=computeVisualBoundsForPiece(sup, allSolids, memo, visiting);
        minBottom=Math.min(minBottom, b.zMin);
      }
      supportVisualBottom=minBottom;
    } else {
      const Tsub=Number(state.wafer?.thickness)||0;
      const Hsub=substrateVisualHeightRelative();
      const eps=1e-7;
      if(Math.abs(Number(piece.zMax) + Tsub) < eps){
        supportVisualBottom=-Hsub;
      } else {
        // no direct support: place based on substrate mapping of its top (fallback to local)
        // use substrateVisualZ for its top as approximation, but ensure not overlapping substrate incorrectly
        // For floating piece, anchor at substrate bottom plus offset based on physical height? Use 0 as fallback and adjust?
        // For coplanar different XY, each piece's top is at substrate bottom, so this fallback won't be used because supporters empty but top is at -T -> handled above.
        // For other cases, fallback to -Hsub (conservative)
        supportVisualBottom= -Hsub;
        // If piece is not at substrate bottom and has no supporters, it is likely at a different XY with empty below, treat as sitting on substrate top's projection at that XY (which is at substrate bottom for back? actually back substrate bottom is -Hsub)
        // So keep -Hsub
      }
    }
    // For back, piece's top aligns with support's bottom
    const visualTop=supportVisualBottom;
    const visualBottom=visualTop - V_piece;
    result={zMin:visualBottom, zMax:visualTop};
  } else {
    const supporters=findSupportingSolids(piece, allSolids, 'front');
    let supportVisualTop;
    if(supporters.length){
      let maxTop=-Infinity;
      for(const sup of supporters){
        const b=computeVisualBoundsForPiece(sup, allSolids, memo, visiting);
        maxTop=Math.max(maxTop, b.zMax);
      }
      supportVisualTop=maxTop;
    } else {
      const eps=1e-7;
      if(Math.abs(Number(piece.zMin)) < eps){
        supportVisualTop=0;
      } else {
        // No support found but piece is above substrate (e.g., floating at 2..3 with no support at 2)
        // This can happen for mixed-height same layer where piece B's support is at 2 but no solid at exactly 2 at that XY (because underlying is different XY). In that XY, substrate top is 0 but piece is at 2 floating, which should still be placed at visual height corresponding to physical height 2's support? However in valid stacked geometry, there should be a supporting solid at that XY whose top is 2. If not found, fallback to 0 and place piece at 0..V_piece (coplanar) which is acceptable for test where we want both pieces at 0..V (coplanar) not stacked.
        // For mixed-height same layerId pieces at different XY, they should both be at 0, not one above the other, so fallback 0 is correct.
        // For piece B that is truly stacked above another piece at same XY, supporter will be found, so not fallback.
        supportVisualTop=0;
      }
    }
    const visualBottom=supportVisualTop;
    const visualTop=visualBottom + V_piece;
    result={zMin:visualBottom, zMax:visualTop};
  }
  visiting.delete(piece.id);
  memo.set(piece.id,result);
  return result;
}
function layerVisualIntervalRelative(layerId,layers){
  // kept for substrate and for doping fallback that expects global interval;
  // for solids, this is no longer used for positioning, but kept for compatibility for substrate interval.
  if(layerId==='substrate'){
    const thickness=state.wafer?Number(state.wafer.thickness)||0:0;
    const visualHeight=substrateVisualHeightRelative();
    return {visualMin:-visualHeight,visualMax:0,physicalBottom:-thickness,physicalThickness:thickness,visualHeight};
  }
  // For backward compat, return interval based on first piece of that layer at substrate top
  const descriptors=layers||solidLayerDescriptors();
  const current=descriptors.find(layer=>layer.id===layerId);
  if(!current) return null;
  const T_full=fullPhysicalThicknessForLayer(layerId,descriptors);
  if(T_full<=0) return null;
  const perScale=validLayerScale(state.layerVisuals?.[layerId]?.scale);
  const V_full=relativeThickness(T_full)*globalRelativeScale()*perScale;
  // Return as if layer sits on substrate top (local)
  return {visualMin:0,visualMax:V_full,physicalBottom:Number(current.zMin),physicalThickness:T_full,visualHeight:V_full};
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
    return substrateVisualZ(z);
  }
  const xy=waferXYScale(),exaggeration=globalPhysicalScale(),thickness=state.wafer.thickness,substrateScale=validLayerScale(state.layerVisuals?.substrate?.scale),mapped=mappedPhysicalZLinear(z),mappedBottom=mappedPhysicalZLinear(-thickness);
  if(z>=0) return mapped*xy*exaggeration;
  if(z<=-thickness) return mappedBottom*xy*exaggeration*substrateScale+(mapped-mappedBottom)*xy*exaggeration;
  return mapped*xy*exaggeration*substrateScale;
}
export function mappedSolidBounds(solid,layers=solidLayerDescriptors()){
  if(isRelativeMapping()){
    if(!state.wafer) return {zMin:0,zMax:0};
    // Use local topology-aware mapping; layers param kept for API compat but not used for global stack
    return computeVisualBoundsForPiece(solid, state.solids, new Map());
  }
  const current=layers.find(layer=>layer.id===solid.layerId),rawMin=displayZ(solid.zMin),rawMax=displayZ(solid.zMax);if(!current)return {zMin:rawMin,zMax:rawMax};const epsilon=1e-7;if(current.side==='back'){const offset=layers.filter(layer=>layer.id!==current.id&&layer.side==='back'&&layer.zMin>=current.zMax-epsilon).reduce((sum,layer)=>sum+(layer.scale-1)*(displayZ(layer.zMax)-displayZ(layer.zMin)),0),zMax=rawMax-offset;return {zMin:zMax-(rawMax-rawMin)*current.scale,zMax};}const offset=layers.filter(layer=>layer.id!==current.id&&layer.side!=='back'&&layer.zMax<=current.zMin+epsilon).reduce((sum,layer)=>sum+(layer.scale-1)*(displayZ(layer.zMax)-displayZ(layer.zMin)),0),zMin=rawMin+offset;return {zMin,zMax:zMin+(rawMax-rawMin)*current.scale};}
export function mappedDopingBounds(doping,layers=solidLayerDescriptors()){
  if(isRelativeMapping()){
    if(!state.wafer) return {zMin:0,zMax:0};
    const allSolids=state.solids;
    if(doping.targetLayerId==='substrate'){
      const rawMin=substrateVisualZ(Number(doping.zMin));
      const rawMax=substrateVisualZ(Number(doping.zMax));
      const zMin=Math.min(rawMin,rawMax), zMax=Math.max(rawMin,rawMax);
      const scale=validLayerScale(layerVisual(doping.layerId).scale);
      const height=zMax-zMin;
      // doping per-layer scale is intentional display override; allow overflow but clamp negative heights to keep visible
      if(doping.position==='lower') return {zMin:zMin,zMax:zMin+height*scale};
      return {zMin:zMax-height*scale,zMax:zMax};
    }
    // solid target: find local target piece at doping's XY
    const dopingPt=pieceInteriorPoint(doping.footprint);
    let targetPiece=null;
    if(dopingPt){
      for(const s of allSolids){
        if(s.layerId!==doping.targetLayerId) continue;
        if(!footprintsOverlap(doping.footprint, s.footprint)) continue;
        // check doping interval inside target's interval (allow epsilon)
        if(Number(doping.zMin) < Number(s.zMin)-1e-7 || Number(doping.zMax) > Number(s.zMax)+1e-7) continue;
        if(pointInPoly(dopingPt, s.footprint) || pointInPoly(pieceInteriorPoint(s.footprint), doping.footprint)){
          targetPiece=s; break;
        }
      }
    }
    if(!targetPiece){
      // fallback: any overlapping target
      for(const s of allSolids){
        if(s.layerId!==doping.targetLayerId) continue;
        if(!footprintsOverlap(doping.footprint, s.footprint)) continue;
        targetPiece=s; break;
      }
    }
    if(!targetPiece){
      // no local piece found, use global interval as fallback (local at substrate top)
      const t=Number(doping.zMax)-Number(doping.zMin);
      const v=relativeThickness(t)*globalRelativeScale()*validLayerScale(layerVisual(doping.layerId).scale);
      return doping.position==='lower'?{zMin:0,zMax:v}:{zMin:0,zMax:v};
    }
    const targetBounds=computeVisualBoundsForPiece(targetPiece, allSolids, new Map());
    const T_target=Math.max(0, Number(targetPiece.zMax)-Number(targetPiece.zMin));
    if(T_target<=0) return targetBounds;
    const fLow=(Number(doping.zMin)-Number(targetPiece.zMin))/T_target;
    const fHigh=(Number(doping.zMax)-Number(targetPiece.zMin))/T_target;
    const clampedLow=Math.max(0,Math.min(1,fLow));
    const clampedHigh=Math.max(0,Math.min(1,fHigh));
    const V_target=targetBounds.zMax - targetBounds.zMin;
    const rawMin=targetBounds.zMin + clampedLow*V_target;
    const rawMax=targetBounds.zMin + clampedHigh*V_target;
    const scale=validLayerScale(layerVisual(doping.layerId).scale);
    const height=rawMax-rawMin;
    // per-layer doping scale is explicit display exaggeration; preserve overflow as intentional
    if(doping.position==='lower') return {zMin:rawMin,zMax:rawMin+height*scale};
    return {zMin:rawMax-height*scale,zMax:rawMax};
  }
  let mapped;if(doping.targetLayerId==='substrate')mapped={zMin:displayZ(doping.zMin),zMax:displayZ(doping.zMax)};else mapped=mappedSolidBounds({layerId:doping.targetLayerId,zMin:doping.zMin,zMax:doping.zMax},layers);const scale=validLayerScale(layerVisual(doping.layerId).scale),height=mapped.zMax-mapped.zMin;if(doping.position==='lower')return {zMin:mapped.zMin,zMax:mapped.zMin+height*scale};return {zMin:mapped.zMax-height*scale,zMax:mapped.zMax};}
export function substrateVisualHeight(){
  if(!state.wafer) return 0;
  if(isRelativeMapping()) return substrateVisualHeightRelative();
  const xy=waferXYScale(),thickness=Number(state.wafer.thickness)||0,substrateScale=validLayerScale(state.layerVisuals?.substrate?.scale);
  return thickness*xy*globalPhysicalScale()*substrateScale;
}
export function mappedCutBounds(zMin,zMax){
  if(!state.wafer) return {zMin:0,zMax:0};
  if(isRelativeMapping()){
    // use surface-detail substrate mapping for accurate shallow visibility
    return {zMin: substrateVisualZ(Number(zMin)), zMax: substrateVisualZ(Number(zMax))};
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
