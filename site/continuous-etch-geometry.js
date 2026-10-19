// Exact analytic continuous selective release owner. No Z bands are stored.
// Deliberately read-only until canonical Process/History and renderer integration
// can use the same material ownership; never silently mutate an old project.

function finite(name,value){if(!Number.isFinite(value)||typeof value!=="number")throw new RangeError(name+" must be finite");return value;}

function positive(name,value){finite(name,value);if(!(value>0))throw new RangeError(name+" must be positive");return value;}

function segmentDistance(point,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/l)):0;return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy);}

function inRing(point,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}

function inMulti(point,multi){for(const poly of multi){if(inRing(point,poly[0])&&!poly.slice(1).some(r=>inRing(point,r)))return true;}return false;}

function validateSeed(geom){if(!Array.isArray(geom)||!geom.length)throw new RangeError("Seed requires a nonempty MultiPolygon");for(const poly of geom){if(!Array.isArray(poly)||!poly.length)throw new RangeError("Invalid polygon");for(const ring of poly){if(!Array.isArray(ring)||ring.length<4)throw new RangeError("Invalid seed ring");for(const p of ring){if(!Array.isArray(p)||p.length!==2)throw new RangeError("Invalid point");finite("x",p[0]);finite("y",p[1]);}if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw new RangeError("Unclosed seed ring");}}return geom;}

function seedDistance(point,geom){finite("x",point?.[0]);finite("y",point?.[1]);if(inMulti(point,geom))return 0;let distance=Infinity;for(const poly of geom)for(const ring of poly)for(let i=1;i<ring.length;i++)distance=Math.min(distance,segmentDistance(point,ring[i-1],ring[i]));return distance;}

function createContinuousEtchFront({seedGeom,seedZ,face,layerId,lateralUm,verticalUm,shape="elliptical"}){validateSeed(seedGeom);finite("seedZ",seedZ);positive("lateralUm",lateralUm);positive("verticalUm",verticalUm);if(!["front","back"].includes(face))throw new RangeError("Invalid release face");if(typeof layerId!=="string"||!layerId)throw new RangeError("Target layerId required");if(!["circular","elliptical","vertical"].includes(shape))throw new RangeError("Invalid front shape");if(shape==="circular"&&Math.abs(lateralUm-verticalUm)>1e-10*Math.max(lateralUm,verticalUm))throw new RangeError("Circular front needs equal L and D");return {kind:"continuous-etch-front-v1",seedGeom:JSON.parse(JSON.stringify(seedGeom)),seedZ,face,layerId,lateralUm,verticalUm,shape};}

function continuousDepthAtDistance(front,d){finite("distance",d);if(d<0)throw new RangeError("Negative distance");if(front.shape==="vertical")return d<=front.lateralUm?front.verticalUm:0;if(d>=front.lateralUm)return 0;const t=d/front.lateralUm;return front.verticalUm*Math.sqrt(Math.max(0,(1-t)*(1+t)));}

function continuousDepthAtXY(front,point){return continuousDepthAtDistance(front,seedDistance(point,front.seedGeom));}

function continuousFrontZ(front,point){return front.seedZ+(front.face==="front"?-1:1)*continuousDepthAtXY(front,point);}

function continuousReleaseRemoves(front,point,layerId){if(layerId!==front.layerId)return false;const [x,y,z]=point;finite("x",x);finite("y",y);finite("z",z);const depth=(front.face==="front"?front.seedZ-z:z-front.seedZ);return depth>=0&&depth<continuousDepthAtXY(front,[x,y]);}

function sampleContinuousSection(front,a,b,steps=128){if(!Number.isSafeInteger(steps)||steps<2||steps>4096)throw new RangeError("Invalid display step budget");for(const p of [a,b]){finite("section x",p?.[0]);finite("section y",p?.[1]);}return Array.from({length:steps+1},(_,i)=>{const t=i/steps,xy=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];return {xy,z:continuousFrontZ(front,xy)};});}

function remainingMaterialAt(model,fronts,point){const [x,y,z]=point;finite("x",x);finite("y",y);finite("z",z);if(!Array.isArray(fronts))throw new TypeError("Fronts must be an array");for(const region of model?.regions||[]){if(!inMulti([x,y],region.geom))continue;for(const part of region.stack||[]){if(z>=part.z0&&z<part.z1)return fronts.some(f=>continuousReleaseRemoves(f,point,part.layerId))?null:part.layerId;}}return null;}

export { seedDistance, createContinuousEtchFront, continuousDepthAtDistance, continuousDepthAtXY, continuousFrontZ, continuousReleaseRemoves, sampleContinuousSection, remainingMaterialAt };
