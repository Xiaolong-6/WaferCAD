import {state} from './core.js';
import {bboxPolys} from './geometry.js';

export function normalizeGds(value){const g={filename:null,bbox:null,layers:[],topCells:[],activeTopCell:null,transform:{offsetX:0,offsetY:0,rotationDeg:0,scale:1},hierarchy:[],...(value||{})};g.layers=Array.isArray(g.layers)?g.layers:[];g.topCells=Array.isArray(g.topCells)?g.topCells:[];g.hierarchy=Array.isArray(g.hierarchy)?g.hierarchy:[];g.transform={offsetX:0,offsetY:0,rotationDeg:0,scale:1,...(g.transform||{})};if(!Number.isFinite(Number(g.transform.scale))||Number(g.transform.scale)<=0)g.transform.scale=1;return g;}
export function transformPoint([x,y],transform=state.gds.transform){const scale=Number(transform?.scale)||1,sx=x*scale,sy=y*scale,angle=(Number(transform?.rotationDeg)||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);return [sx*cos-sy*sin+(Number(transform?.offsetX)||0),sx*sin+sy*cos+(Number(transform?.offsetY)||0)];}
export function transformedPolygon(polygon){return polygon.map(point=>transformPoint(point));}
export function effectiveLayerPolygons(layer){return layer.fillPattern===true&&Array.isArray(layer.filledPolygons)?layer.filledPolygons:(layer.polygons||[]);}
export function transformedLayerPolygon(layer,polygon){return polygon.map(([x,y])=>transformPoint([layer.mirrored===true?-x:x,y]));}
export function transformedGdsBounds(){const polygons=state.gds.layers.flatMap(layer=>effectiveLayerPolygons(layer).map(polygon=>transformedLayerPolygon(layer,polygon)));return polygons.length?bboxPolys(polygons):null;}
export function patternSelectedLayers(){return state.gds.layers.filter(layer=>state.patternSelectedKeys.has(layer.key));}
export function patternRawMaskPolygons(){const result=[];for(const layer of patternSelectedLayers()){if(layer.isBorderOnly&&!layer.fillPattern)continue;for(const polygon of effectiveLayerPolygons(layer))result.push({layer,poly:transformedLayerPolygon(layer,polygon)});}return result;}
export function patternHasBlockedBorder(){return patternSelectedLayers().some(layer=>layer.isBorderOnly&&!layer.fillPattern);}
