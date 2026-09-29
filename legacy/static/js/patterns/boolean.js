/* Clipper-like wrappers on top of polygon-clipping (global polygonClipping from UMD).
   We expose union, difference, intersection that work on Array<Array<[x,y]>>.
   Scaling: caller should pass polygons in µm (float); we scale to int nm (*1000) for robustness.
*/
const SCALE = 1000; // µm -> nm integer
function toInt(poly){ return poly.map(([x,y])=>[Math.round(x*SCALE), Math.round(y*SCALE)]); }
function toFloat(poly){ return poly.map(([x,y])=>[x/SCALE, y/SCALE]); }
function ensureMulti(polys){ // polys: Array<poly> where poly is Array<[x,y]>
  // polygon-clipping expects MultiPolygon = Array<Array<Array<[x,y]>>>
  return polys.map(p=>[p]);
}
export function union(polys){
  if(!polys.length) return [];
  // @ts-ignore
  const pc = globalThis.polygonClipping;
  if(!pc) throw new Error("polygonClipping not loaded");
  const scaled = polys.map(toInt);
  const mp = ensureMulti(scaled);
  let res = mp[0];
  for(let i=1;i<mp.length;i++) res = pc.union(res, mp[i]);
  // res is MultiPolygon
  if(!res || !res.length) return [];
  return res.flat(1).map(toFloat);
}
export function difference(subject, clip){
  const pc = globalThis.polygonClipping;
  if(!subject.length) return [];
  if(!clip.length) return subject.slice();
  const s = subject.map(toInt).map(p=>[p]);
  const c = clip.map(toInt).map(p=>[p]);
  let res = s[0];
  for(let i=1;i<s.length;i++) res = pc.union(res, s[i]);
  let clipU = c[0];
  for(let i=1;i<c.length;i++) clipU = pc.union(clipU, c[i]);
  const diff = pc.difference(res, clipU);
  if(!diff || !diff.length) return [];
  return diff.flat(1).map(toFloat);
}
export function intersection(a,b){
  const pc = globalThis.polygonClipping;
  if(!a.length||!b.length) return [];
  const am = a.map(toInt).map(p=>[p]);
  const bm = b.map(toInt).map(p=>[p]);
  let ar = am[0]; for(let i=1;i<am.length;i++) ar = pc.union(ar, am[i]);
  let br = bm[0]; for(let i=1;i<bm.length;i++) br = pc.union(br, bm[i]);
  const inter = pc.intersection(ar, br);
  if(!inter||!inter.length) return [];
  return inter.flat(1).map(toFloat);
}
export function fillHoles(polys){
  // Union will merge and polygon-clipping returns outer with holes as separate rings.
  // For Fill pattern we want outer contours only: union then take each polygon's outer ring.
  const u = union(polys);
  // polygon-clipping already returns outer rings with holes as interior rings in same polygon.
  // To "fill", we keep only outer ring per polygon.
  return u.map(ring => ring[0] ? [ring[0]] : ring).flat(1).map(r=>Array.isArray(r[0])?r:r); // fallback
}
// Global vs per-layer helpers
export function previewGlobalInvert(substrateOutline, activeLayerPolys){
  // substrate minus union(active)
  const uni = union(activeLayerPolys);
  return difference([substrateOutline], uni);
}
export function previewPerLayerInvert(substrateOutline, layerGroups){
  // ⋃(S \ layer_i)
  let res = [];
  for(const grp of layerGroups){
    const d = difference([substrateOutline], grp);
    res = res.length ? union([...res, ...d]) : d;
  }
  return res;
}
