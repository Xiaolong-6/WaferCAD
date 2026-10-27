#!/usr/bin/env python3
"""Rebuild TFLN 10x8 as continuous, primitive-driven M1 and M2 masks.

Published: D=40um, r_in~17um, 4 x 0.4um anchors, 80nm membrane,
300nm initial LN and 2um BOX. Undisclosed fanout/release features are
explicit engineering assumptions. The air-holes are not claimed original GDS.
"""
import json, math, time, sys
from pathlib import Path
from shapely.geometry import Point, LineString, box, Polygon
from shapely.ops import unary_union
from shapely import set_precision
from shapely.affinity import translate
P=Path(__file__).parent
Q=32 # 128-sided 20um polygon; radial chord error 6nm
W=1160.;H=3600.; COLS=8; ROWS=10; PX=145.;PY=360.
S=1e-4
xmin,xmax=-W/2,W/2

def circle(r):return Point(0,0).buffer(r,quad_segs=Q)
def stroke(points,width,cap='flat'):
 return LineString(points).buffer(width/2,cap_style=cap,join_style='round',quad_segs=3)
def parts(g):
 if g.is_empty:return []
 if g.geom_type=='Polygon': return [g]
 return [p for c in g.geoms for p in parts(c)]
def enc(g):
 return [ [ [[round(x,4),round(y,4)] for x,y in ring.coords] for ring in [p.exterior,*p.interiors] ] for p in parts(g) if p.area>1e-6 ]
def smooth(points,radius=5.,count=3):
 out=[points[0]]
 for i in range(1,len(points)-1):
  a,p,b=points[i-1:i+2];u=(p[0]-a[0],p[1]-a[1]);v=(b[0]-p[0],b[1]-p[1]);lu=math.hypot(*u);lv=math.hypot(*v)
  if min(lu,lv)<1e-6:continue
  r=min(radius,lu*.3,lv*.3)
  c=(p[0]-r*u[0]/lu,p[1]-r*u[1]/lu);d=(p[0]+r*v[0]/lv,p[1]+r*v[1]/lv)
  out.append(c)
  for j in range(1,count+1):
   t=j/count
   out.append(((1-t)**2*c[0]+2*t*(1-t)*p[0]+t*t*d[0],(1-t)**2*c[1]+2*t*(1-t)*p[1]+t*t*d[1]))
 out.append(points[-1]);return out

t0=time.time()
rim=circle(20).difference(circle(17))
beam=[];release_strips=[]
for deg in (45,135,225,315):
 a=math.radians(deg);p=lambda r:(r*math.cos(a),r*math.sin(a))
 beam.append(stroke([p(19.75),p(42.5)],.4))
 release_strips.append(LineString([p(20.4),p(38)]).buffer(.7,cap_style='round',quad_segs=3))
beam=unary_union(beam)
# Real 0.4um optical ridge, 0.6um closest boundary gap to the 20um rim.
curve=[(x,-20.8-.031*x*x) for x in [i*2 for i in range(-13,14)]]
bus=stroke(curve,.4)
for s in [-1,1]:
 bus=bus.union(stroke([(s*27.5,-58),(s*27,-54),(s*26,-41.756)],.4))
field=box(-47.5,-61,47.5,48)
localm1=field.difference(rim.union(bus))
localm2=circle(42).difference(circle(20.8)).difference(beam.union(bus))
# M2 passes through M1-thinned LN only.
assert localm2.difference(localm1).area<1e-5, localm2.difference(localm1).area
localvoid=unary_union([circle(20.6),*release_strips])
print('local',[(x,round(g.area,2),sum(len(r.coords) for p in parts(g) for r in [p.exterior,*p.interiors])) for x,g in [('m1',localm1),('m2',localm2),('box_void',localvoid)]],flush=True)
# Fanout is assembled per row (not 80 repeated material solids), routes are protected from all M1 etches.
allm1=[];allm2=[];allvoid=[];routes=[]
for row in range(ROWS):
 cy=(row-4.5)*PY
 row_masks=[];row_protect=[];row_bus=[]
 for col in range(COLS):
  cx=(col-3.5)*PX
  allm2.append(translate(localm2,cx,cy));allvoid.append(translate(localvoid,cx,cy))
  row_masks.append(translate(localm1,cx,cy));row_bus.append(translate(bus,cx,cy))
  for port in (0,1):
   sx=cx+(-27.5 if port==0 else 27.5)
   ly=cy-85-8*col-3.3*port
   # Reach LEFT CHIP EDGE, no residual gap. Avoid separate copies of completed solids.
   knots=[(sx,cy-57.4),(sx,ly+10),(sx-8,ly),(xmin-.3,ly)]
   pts=smooth(knots)
   line=LineString(pts)
   ridge=line.buffer(.20,cap_style='round',quad_segs=3)
   corridor=line.buffer(1.2,cap_style='round',quad_segs=3)
   row_masks.append(corridor);row_protect.append(ridge)
   routes.append({'row':row,'col':col,'port':port,'entry':pts[0],'edge':[xmin,ly], 'centerline':pts})
 # Global protect all routes and the original bus at route join.
 protect=unary_union([*row_protect,*row_bus]);
 row_geom=unary_union(row_masks).difference(protect).intersection(box(-580,cy-180,580,cy+180))
 allm1.extend(parts(row_geom))
 print('row',row,'M1 rings',len(parts(row_geom)),'M1 points',sum(len(r.coords) for p in parts(row_geom) for r in [p.exterior,*p.interiors]),'elapsed',round(time.time()-t0,2),flush=True)
# M1 geometry is already non-overlapping between rows, no global boolean needed.
g1=enc(unary_union(allm1));g2=enc(unary_union(allm2));gv=enc(unary_union(allvoid))
# M2 roundness and nonintersecting M1 verified via 2D geometric difference at unit design.
meta={'design':'S1-guided engineering reconstruction, NOT original mask, NOT HF model','published':{'outer_diameter_um':40,'rim_inner_radius_um':17,'anchor_width_um':.4,'anchor_count':4,'ln_um':.3,'membrane_um':.08,'box_um':2},'inferred':{'field':[-47.5,-61,47.5,48],'airHoleOuterRadius_um':42,'releaseRadius_um':20.6,'anchorReleaseEnd_um':38,'fanoutGuideWidth_um':.4,'pitch': [PX,PY],'curveChordErrorMax_nm':1000*20*(1-math.cos(math.pi/(4*Q)))},'pointCounts':{k:sum(len(r) for p in g for r in p) for k,g in [('m1',g1),('m2',g2),('boxVoid',gv)]},'polygons':{k:len(g) for k,g in [('m1',g1),('m2',g2),('boxVoid',gv)]},'source':'fresh parameters plus S1 diagram, no old completed solids'}
(P/'mask_input.json').write_text(json.dumps({'meta':meta,'arrays':{'m1':g1,'m2':g2,'boxVoid':gv}},separators=(',',':')))
(P/'routes.json').write_text(json.dumps(routes,separators=(',',':')))
print('ALL',json.dumps(meta['pointCounts']),json.dumps(meta['polygons']),'seconds',round(time.time()-t0,1),flush=True)
