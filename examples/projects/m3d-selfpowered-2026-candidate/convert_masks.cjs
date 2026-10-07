const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const source = path.join(__dirname, 'masks');
const dest = path.join(__dirname, 'masks_gds');
fs.mkdirSync(dest, { recursive: true });

function rec(t,d,payload=Buffer.alloc(0)){if(payload.length%2)payload=Buffer.concat([payload,Buffer.alloc(1)]);const b=Buffer.alloc(4);b.writeUInt16BE(payload.length+4);b[2]=t;b[3]=d;return Buffer.concat([b,payload]);}
function i16(v){const b=Buffer.alloc(2);b.writeInt16BE(v);return b;}
function real(v){const b=Buffer.alloc(8);let e=64;while(v>=1){v/=16;e++;}while(v<1/16){v*=16;e--;}b[0]=e;for(let i=1;i<8;i++){v*=256;b[i]=Math.floor(v);v-=b[i];}return b;}
function gds(name,rects){const c=[rec(0,2,i16(600)),rec(1,2,Buffer.alloc(24)),rec(2,6,Buffer.from('M3D_RECON_V2')),rec(3,5,Buffer.concat([real(.001),real(1e-9)])),rec(5,2,Buffer.alloc(24)),rec(6,6,Buffer.from(name.substring(0,32)))];for(const [x,y,w,h] of rects){const pts=[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]],xy=Buffer.alloc(40);pts.flat().forEach((n,i)=>xy.writeInt32BE(Math.round(n*1000),i*4));c.push(rec(8,0),rec(13,2,i16(1)),rec(14,2,i16(0)),rec(16,3,xy),rec(17,0));}c.push(rec(7,0),rec(4,0));return Buffer.concat(c);}
const manifest=[];
for(const file of fs.readdirSync(source).filter(f=>f.endsWith('.svg')).sort()){
 const svg=fs.readFileSync(path.join(source,file),'utf8');
 const rects=[...svg.matchAll(/<rect\s([^>]+)>?/g)].map(m=>{const a=Object.fromEntries([...m[1].matchAll(/([\w]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));return [+a.x,+a.y,+a.width,+a.height];});
 const out=file.replace('.svg','.gds');fs.writeFileSync(path.join(dest,out),gds(file.replace('.svg',''),rects));
 manifest.push({svg:file,gds:out,sourceSha256:crypto.createHash('sha256').update(svg).digest('hex'),rectangleCount:rects.length,databaseUnitUm:.001,geometryModified:false});
}
fs.writeFileSync(path.join(dest,'conversion_manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Converted ${manifest.length} reconstructed SVG masks to GDS.`);
