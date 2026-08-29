import {DEFAULT_WAFER,state} from './core.js';

export function normalizeWafer(value){
  const wafer={...(value||DEFAULT_WAFER)};
  wafer.shape=wafer.shape||'circle';
  wafer.thickness=Number(wafer.thickness)||500;
  wafer.material=wafer.material||'Si';
  wafer.displayUnits=wafer.displayUnits||{lateral:'mm',thickness:'um'};
  wafer.edgeFeature=wafer.edgeFeature||'none';
  if(wafer.shape==='circle')wafer.diameter=Number(wafer.diameter)||100000;
  if(wafer.shape==='rect'){wafer.width=Number(wafer.width)||100000;wafer.height=Number(wafer.height)||100000;}
  if(wafer.shape==='custom'&&(!Array.isArray(wafer.outline)||wafer.outline.length<3))return {...wafer,shape:'circle',diameter:100000};
  return wafer;
}

export function waferFlatLengthMm(diameterMm){
  if(diameterMm<60)return 15.88;
  if(diameterMm<88){const t=(diameterMm-50.8)/(76.2-50.8);return 15.88+t*(22.22-15.88);}
  if(diameterMm<112){const t=(diameterMm-76.2)/(100-76.2);return 22.22+t*(32.5-22.22);}
  if(diameterMm<137){const t=(diameterMm-100)/(125-100);return 32.5+t*(42.5-32.5);}
  if(diameterMm<175){const t=(diameterMm-125)/(150-125);return 42.5+t*(57.5-42.5);}
  return 57.5;
}

export function waferNotchDepthMm(diameterMm){return diameterMm>=100?1:.7;}

export function waferOutline(value=state.wafer){
  if(!value)return [];
  const wafer=normalizeWafer(value);
  if(wafer.shape==='custom')return wafer.outline.map(point=>[Number(point[0]),Number(point[1])]);
  if(wafer.shape==='rect'){const x=wafer.width/2,y=wafer.height/2;return [[-x,-y],[x,-y],[x,y],[-x,y]];}
  const radius=wafer.diameter/2,edge=wafer.edgeFeature||'none';
  if(edge==='flat'){
    const halfLength=waferFlatLengthMm(wafer.diameter/1000)*1000/2;
    if(halfLength>=radius)return circleOutline(radius);
    const theta=Math.asin(Math.min(1,halfLength/radius)),yFlat=-Math.sqrt(Math.max(0,radius*radius-halfLength*halfLength));
    const points=[[-halfLength,yFlat],[halfLength,yFlat]],start=-Math.PI/2+theta,end=-Math.PI/2-theta+Math.PI*2;
    for(let i=1;i<96;i++){const angle=(start+i/96*(end-start))%(Math.PI*2);points.push([Math.cos(angle)*radius,Math.sin(angle)*radius]);}
    return points;
  }
  if(edge==='notch'){
    const depth=waferNotchDepthMm(wafer.diameter/1000)*1000,halfWidth=depth,theta=Math.asin(Math.min(1,halfWidth/radius));
    const points=[[-halfWidth,-radius],[0,-radius+depth],[halfWidth,-radius]],start=-Math.PI/2+theta,end=-Math.PI/2-theta+Math.PI*2;
    for(let i=1;i<96;i++){const angle=(start+i/96*(end-start))%(Math.PI*2);points.push([Math.cos(angle)*radius,Math.sin(angle)*radius]);}
    return points;
  }
  return circleOutline(radius);
}

function circleOutline(radius){const points=[];for(let i=0;i<128;i++){const angle=i/128*Math.PI*2;points.push([Math.cos(angle)*radius,Math.sin(angle)*radius]);}return points;}

export function bboxPolys(polygons){
  if(!polygons.length)return null;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const polygon of polygons)for(const [x,y] of polygon){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  return [x0,y0,x1,y1];
}

export function waferBounds(){const outline=waferOutline();return outline.length?bboxPolys([outline]):[-1,-1,1,1];}
export function viewAspectBounds(bounds,padFraction=.08){let [x0,y0,x1,y1]=bounds,w=Math.max(x1-x0,1),h=Math.max(y1-y0,1);const pad=Math.max(w,h)*padFraction;x0-=pad;x1+=pad;y0-=pad;y1+=pad;w=x1-x0;h=y1-y0;const target=600/420,current=w/h;if(current>target){const need=w/target-h;y0-=need/2;y1+=need/2;}else{const need=h*target-w;x0-=need/2;x1+=need/2;}return [x0,y0,x1,y1];}
export function waferXYScale(){const [x0,y0,x1,y1]=waferBounds();return 9/Math.max(x1-x0,y1-y0,1);}

export function polygonArea(polygon){let sum=0;for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];sum+=a[0]*b[1]-b[0]*a[1];}return sum/2;}
function orient(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function segmentsCross(a,b,c,d){return orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0;}
export function isSimplePolygon(polygon){for(let i=0;i<polygon.length;i++)for(let j=i+1;j<polygon.length;j++){if(j===i||j===(i+1)%polygon.length||i===(j+1)%polygon.length)continue;if(segmentsCross(polygon[i],polygon[(i+1)%polygon.length],polygon[j],polygon[(j+1)%polygon.length]))return false;}return true;}
export function pointInPoly(point,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j],hit=((a[1]>point.y)!==(b[1]>point.y))&&(point.x<(b[0]-a[0])*(point.y-a[1])/(b[1]-a[1]+1e-30)+a[0]);if(hit)inside=!inside;}return inside;}
export function centroid(polygon){let x=0,y=0;for(const point of polygon){x+=point[0];y+=point[1];}return {x:x/polygon.length,y:y/polygon.length};}
export function detectBorderOnly(layer){const polygons=layer.polygons||[];if(polygons.length<3)return false;const bounds=bboxPolys(polygons);if(!bounds)return false;const area=(bounds[2]-bounds[0])*(bounds[3]-bounds[1]);if(!area||!Number.isFinite(area))return false;return polygons.reduce((sum,polygon)=>sum+Math.abs(polygonArea(polygon)),0)/area<.5;}
export function polyBbox(polygon){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y] of polygon){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return [x0,y0,x1,y1];}
export function bboxIntersects(a,b){return !(a[2]<b[0]||a[0]>b[2]||a[3]<b[1]||a[1]>b[3]);}
export function isPolyInViewport(polygon,viewport){return !viewport||bboxIntersects(polyBbox(polygon),viewport);}

export function linePolyIntervals(a,b,polygon){
  const ts=[0,1],dx=b.x-a.x,dy=b.y-a.y;
  for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],ex=q[0]-p[0],ey=q[1]-p[1],den=dx*ey-dy*ex;if(Math.abs(den)<1e-12)continue;const px=p[0]-a.x,py=p[1]-a.y,t=(px*ey-py*ex)/den,u=(px*dy-py*dx)/den;if(t>0&&t<1&&u>=0&&u<=1)ts.push(t);}
  ts.sort((x,y)=>x-y);const unique=ts.filter((value,index)=>index===0||Math.abs(value-ts[index-1])>1e-7),result=[];
  for(let i=0;i<unique.length-1;i++){const t0=unique[i],t1=unique[i+1],middle=(t0+t1)/2,point={x:a.x+dx*middle,y:a.y+dy*middle};if(pointInPoly(point,polygon))result.push([t0,t1]);}
  return result;
}

export function lineCircleInterval(a,b,radius){const dx=b.x-a.x,dy=b.y-a.y,A=dx*dx+dy*dy,B=2*(a.x*dx+a.y*dy),C=a.x*a.x+a.y*a.y-radius*radius,D=B*B-4*A*C;if(D<0)return a.x*a.x+a.y*a.y<radius*radius&&b.x*b.x+b.y*b.y<radius*radius?[0,1]:null;const root=Math.sqrt(D),t0=(-B-root)/(2*A),t1=(-B+root)/(2*A),lo=Math.max(0,Math.min(t0,t1)),hi=Math.min(1,Math.max(t0,t1));return hi>lo?[lo,hi]:null;}
