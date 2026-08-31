import {state} from './core.js';
import {bboxPolys,waferOutline} from './geometry.js';

export function normalizeGds(value){const g={filename:null,bbox:null,layers:[],topCells:[],activeTopCell:null,maskPolarity:'transmit',truncated:false,polygonLimit:20000,committedProjection:null,transform:{offsetX:0,offsetY:0,rotationDeg:0,scale:1},hierarchy:[],...(value||{})};g.layers=Array.isArray(g.layers)?g.layers:[];g.topCells=Array.isArray(g.topCells)?g.topCells:[];g.hierarchy=Array.isArray(g.hierarchy)?g.hierarchy:[];g.maskPolarity=g.maskPolarity==='block'?'block':'transmit';g.truncated=g.truncated===true;g.polygonLimit=Number.isFinite(Number(g.polygonLimit))?Number(g.polygonLimit):20000;if(!g.committedProjection||!Array.isArray(g.committedProjection.regions))g.committedProjection=null;g.transform={offsetX:0,offsetY:0,rotationDeg:0,scale:1,...(g.transform||{})};if(!Number.isFinite(Number(g.transform.scale))||Number(g.transform.scale)<=0)g.transform.scale=1;return g;}
export function transformPoint([x,y],transform=state.gds.transform){const scale=Number(transform?.scale)||1,sx=x*scale,sy=y*scale,angle=(Number(transform?.rotationDeg)||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);return [sx*cos-sy*sin+(Number(transform?.offsetX)||0),sx*sin+sy*cos+(Number(transform?.offsetY)||0)];}
export function transformedPolygon(polygon){return polygon.map(point=>transformPoint(point));}
export function effectiveLayerPolygons(layer){
  if(layer.fillPattern===true&&Array.isArray(layer.filledPolygons))return layer.filledPolygons;
  if(Array.isArray(layer.components)&&layer.components.length){
    const selected=Array.isArray(layer.selectedComponentIds)?new Set(layer.selectedComponentIds):null;
    if(!selected)return layer.polygons||[];
    const chosen=layer.components.filter(component=>selected.has(component.id));
    const sourceIndices=[...new Set(chosen.flatMap(component=>Array.isArray(component.source_polygon_indices)?component.source_polygon_indices:[]))];
    if(sourceIndices.length&&Array.isArray(layer.polygons))return sourceIndices.map(index=>layer.polygons[index]).filter(Boolean);
    return chosen.map(component=>component.polygon);
  }
  return layer.polygons||[];
}
export function transformedLayerPolygon(layer,polygon){return polygon.map(([x,y])=>transformPoint([layer.mirrored===true?-x:x,y]));}
export function transformedGdsBounds(){const polygons=state.gds.layers.flatMap(layer=>effectiveLayerPolygons(layer).map(polygon=>transformedLayerPolygon(layer,polygon)));return polygons.length?bboxPolys(polygons):null;}
export function patternSelectedLayers(){return state.gds.layers.filter(layer=>state.patternSelectedKeys.has(layer.key));}
export function patternRawMaskPolygons(){const result=[];for(const layer of patternSelectedLayers()){if(layer.isBorderOnly&&!layer.fillPattern)continue;for(const polygon of effectiveLayerPolygons(layer))result.push({layer,poly:transformedLayerPolygon(layer,polygon)});}return result;}
export function patternHasBlockedBorder(){return patternSelectedLayers().some(layer=>layer.isBorderOnly&&!layer.fillPattern);}
export function substrateProjectionFingerprint(face=state.activeFace){return JSON.stringify({face,outline:waferOutline(),thickness:state.wafer?.thickness||null});}
export function maskProjectionFingerprint(){return JSON.stringify({filename:state.gds.filename||null,cell:state.gds.activeTopCell||null,polarity:state.gds.maskPolarity||'transmit',transform:state.gds.transform||null,layers:[...state.patternSelectedKeys].sort().map(key=>{const layer=state.gds.layers.find(item=>item.key===key);return [key,Array.isArray(layer?.selectedComponentIds)?[...layer.selectedComponentIds].sort():null];})});}
export function committedProjectionIsCurrent(projection=state.gds.committedProjection){return !!projection&&projection.substrateFingerprint===substrateProjectionFingerprint(projection.face||state.activeFace)&&projection.sourceFingerprint===maskProjectionFingerprint();}
