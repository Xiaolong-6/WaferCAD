import {state,UNIT_TO_UM} from '../core.js';
import {isSimplePolygon,normalizeWafer,polygonArea,waferBounds} from '../geometry.js';
import {materialColor} from '../layer-model.js';

// Dialogs and view implementations remain outside this synchronous lifecycle.
export function createWaferController({defaultSectionBreak,onWaferChanged,onActiveFaceChanged,reportStatus,qa=false}){
  const debug=qa?(state._waferControllerDebug||(state._waferControllerDebug={instances:0,creates:0,flips:0,resets:0})):null;
  if(debug)debug.instances++;
  function setDefaultSlice(){if(!state.wafer){state.slice=null;return;}const [x0,y0,x1,y1]=waferBounds(),cy=(y0+y1)/2;state.slice={a:{x:x0+(x1-x0)*.175,y:cy},b:{x:x1-(x1-x0)*.175,y:cy}};}
  function parseCoordinateText(text,unit){
    const scale=UNIT_TO_UM[unit],lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const poly=lines.map((line,i)=>{const parts=line.split(/[,\s]+/).filter(Boolean);if(parts.length!==2)throw new Error(`Line ${i+1}: enter one x, y coordinate pair.`);const x=Number(parts[0]),y=Number(parts[1]);if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error(`Line ${i+1}: coordinates must be numbers.`);return [x*scale,y*scale];});
    if(poly.length<3)throw new Error('Enter at least three polygon vertices.');
    if(!isSimplePolygon(poly))throw new Error('The polygon crosses itself. Check the vertex order.');
    if(Math.abs(polygonArea(poly))<1e-9)throw new Error('Polygon area must be non-zero.');
    if(polygonArea(poly)<0)poly.reverse();
    return poly;
  }

  function createWafer(input){
    const {shape,displayUnits:{lateral:lu,thickness:tu}}=input,lateralScale=UNIT_TO_UM[lu],thicknessScale=UNIT_TO_UM[tu];
    const positive=(value,label)=>{const v=Number(value);if(!Number.isFinite(v)||v<=0)throw new Error(`${label} must be positive.`);return v;};
    const wafer={shape,thickness:positive(input.thickness,'Thickness')*thicknessScale,material:input.material.trim()||'Si',displayUnits:{lateral:lu,thickness:tu},edgeFeature:'none'};
    if(shape==='circle'){wafer.diameter=positive(input.diameter,'Diameter')*lateralScale;wafer.edgeFeature=input.edgeFeature||'none';}
    if(shape==='rect'){wafer.width=positive(input.width,'Width')*lateralScale;wafer.height=positive(input.height,'Height')*lateralScale;}
    if(shape==='custom')wafer.outline=parseCoordinateText(input.coordinates,lu);
    state.wafer=normalizeWafer(wafer);state.sectionBreak=defaultSectionBreak(state.wafer,state.wafer.thickness>50);state.activeFace='front';
    state.solids=[];state.cuts=[];state.dopings=[];state.operationUndo=[];state._exactThickness=null;
    state.layerVisuals={substrate:{name:`Substrate · ${state.wafer.material}`,color:materialColor(state.wafer.material),scale:1}};
    state.imprintedFaces=[];state.gds.committedProjection=null;state.selectedFaceIds.clear();state._topFaceSelection.selectedSolidIds.clear();state.patternSelectedKeys.clear();setDefaultSlice();state.topBounds=null;
    if(debug)debug.creates++;
    onWaferChanged();reportStatus(`New ${shape} wafer created.`);
  }
  function flipActiveFace(){
    if(!state.wafer)return;state.activeFace=state.activeFace==='front'?'back':'front';
    state.selectedFaceIds.clear();state._topFaceSelection.selectedSolidIds.clear();
    if(debug)debug.flips++;
    onActiveFaceChanged({animate:true});
    reportStatus(`Active processing face: ${state.activeFace}. The 3D camera is flipping to the ${state.activeFace} side.`);
  }
  // The full-session reset's snapshots, layout and persistence stay with app.js.
  function reset(){
    state.wafer=null;state.sectionBreak={enabled:false,mode:'surfaces',frontKeep:5,backKeep:5,from:-495,to:-5};
    state.solids=[];state.cuts=[];state.dopings=[];state.layerVisuals={};state.imprintedFaces=[];
    state.selectedFaceIds.clear();state.patternSelectedKeys.clear();state.slice=null;state.topBounds=null;state._exactThickness=null;state.operationUndo=[];state.selectionMode='top';
    if(debug)debug.resets++;
  }
  function diagnostics(){return {debug:debug?{...debug}:null};}
  return {createWafer,flipActiveFace,reset,initializeSlice:setDefaultSlice,diagnostics};
}
