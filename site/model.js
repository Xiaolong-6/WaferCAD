export const GRID_N=96;
export const COLORS=['#6f6a8f','#557f83','#8a6f68','#667f99','#847760','#7c687b','#657b68','#8b7d58','#60768a','#85696d'];

export function createModel({shape='circle',width=100,height=100,thickness=12}={}){
  const cols=GRID_N,rows=GRID_N,dx=width/cols,dy=height/rows,columns=new Array(cols*rows);
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const x=-width/2+(i+.5)*dx,y=-height/2+(j+.5)*dy,inside=shape==='circle'?((x/(width/2))**2+(y/(height/2))**2<=1):true;
    columns[j*cols+i]=inside?[{name:'Base',z0:-thickness/2,z1:thickness/2,color:'#b7bdc5'}]:[];
  }
  return {shape,width,height,thickness,cols,rows,dx,dy,columns,layers:[{name:'Base',color:'#b7bdc5'}],revision:1};
}
export function cloneModel(m){return structuredClone(m)}
export function cellCenter(m,i,j){return [-m.width/2+(i+.5)*m.dx,-m.height/2+(j+.5)*m.dy]}
export function cellIndex(m,x,y){const i=Math.floor((x+m.width/2)/m.dx),j=Math.floor((y+m.height/2)/m.dy);if(i<0||j<0||i>=m.cols||j>=m.rows)return null;return [i,j]}
export function topSegment(column,face='front'){return column.length?(face==='front'?column.at(-1):column[0]):null}
export function surfaceZ(column,face='front'){if(!column.length)return null;return face==='front'?column.at(-1).z1:column[0].z0}
export function normalizeColumn(column){
  const sorted=column.filter(s=>s.z1>s.z0+1e-8).sort((a,b)=>a.z0-b.z0),out=[];
  for(const s of sorted){const p=out.at(-1);if(p&&p.name===s.name&&p.color===s.color&&Math.abs(p.z1-s.z0)<1e-7)p.z1=s.z1;else out.push({...s});}
  return out;
}
export function ensureLayer(model,name){let found=model.layers.find(l=>l.name===name);if(found)return found;found={name,color:COLORS[(model.layers.length-1)%COLORS.length]};model.layers.push(found);return found}

function dilateMask(mask,cols,rows,radius){
  if(radius<=0)return mask;const out=new Uint8Array(mask.length),rr=radius*radius;
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++)if(mask[j*cols+i]){
    for(let y=Math.max(0,j-radius);y<=Math.min(rows-1,j+radius);y++)for(let x=Math.max(0,i-radius);x<=Math.min(cols-1,i+radius);x++)if((x-i)**2+(y-j)**2<=rr)out[y*cols+x]=1;
  }
  return out;
}
function trim(column,amount,face){
  let left=amount,c=column.map(s=>({...s}));
  while(left>1e-9&&c.length){const idx=face==='front'?c.length-1:0,s=c[idx],h=s.z1-s.z0;if(left>=h-1e-9){left-=h;c.splice(idx,1)}else{if(face==='front')s.z1-=left;else s.z0+=left;left=0;}}
  return normalizeColumn(c);
}
export function applyOperation(model,{type,name,target,thickness,face='front',mask,growth='direct'}){
  const amount=Math.max(.0001,Number(thickness)||0),layer=(type==='etch'?null:ensureLayer(model,type==='grow'?target:name));
  let active=mask;if(growth==='conformal'&&type!=='etch')active=dilateMask(mask,model.cols,model.rows,Math.max(1,Math.round(amount/Math.max(model.dx,model.dy))));
  for(let idx=0;idx<model.columns.length;idx++){
    if(!active[idx]||!model.columns[idx].length)continue;let c=model.columns[idx];
    if(type==='etch'){model.columns[idx]=trim(c,amount,face);continue;}
    const current=topSegment(c,face);if(!current)continue;
    if(type==='grow'){
      if(current.name!==target)continue;
      if(face==='front')current.z1+=amount;else current.z0-=amount;model.columns[idx]=normalizeColumn(c);continue;
    }
    const z=surfaceZ(c,face);if(face==='front')c.push({name:layer.name,z0:z,z1:z+amount,color:layer.color});else c.unshift({name:layer.name,z0:z-amount,z1:z,color:layer.color});model.columns[idx]=normalizeColumn(c);
  }
  model.revision++;
}
export function fullFaceMask(model){const a=new Uint8Array(model.columns.length);for(let i=0;i<a.length;i++)if(model.columns[i].length)a[i]=1;return a}
export function modelBoundsZ(model){let lo=Infinity,hi=-Infinity;for(const c of model.columns)if(c.length){lo=Math.min(lo,c[0].z0);hi=Math.max(hi,c.at(-1).z1)}return Number.isFinite(lo)?[lo,hi]:[-1,1]}
