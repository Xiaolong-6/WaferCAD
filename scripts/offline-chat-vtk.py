#!/usr/bin/env python3
"""VTK inspection of WaferCAD-owned surfaces. Not the production Three.js renderer."""
import sys, json, time, math, argparse
from collections import defaultdict
from pathlib import Path
import vtk
from shapely.geometry import Polygon
from shapely import constrained_delaunay_triangles

def parse_hex(code):
 try:return tuple(int(code.lstrip('#')[i:i+2],16)/255 for i in (0,2,4))
 except:return (.6,.7,.8)
def openring(r):
 out=[(float(p[0]),float(p[1])) for p in r]
 return out[:-1] if len(out)>2 and out[0]==out[-1] else out

def polygon_triangles(geo):
 for poly in geo or []:
  if not poly:continue
  shell=openring(poly[0]); holes=[openring(r) for r in poly[1:]]
  if len(shell)<3:continue
  shape=Polygon(shell,holes)
  if not shape.is_valid:raise ValueError('Invalid native material cap polygon (refuse repair)')
  if shape.area<=1e-10:continue
  triangulation=constrained_delaunay_triangles(shape)
  pieces=list(triangulation.geoms)
  if not math.isclose(sum(t.area for t in pieces),shape.area,rel_tol=1e-8,abs_tol=1e-7):
   raise ValueError("Constrained cap triangulation did not cover native material area")
  for tri in pieces:
   if not shape.covers(tri):raise ValueError("Cap triangle outside native material footprint")
   p=list(tri.exterior.coords)[:3]
   if abs(tri.area)<1e-11:continue
   yield p

def main(input_path,output,exaggeration,camera_mode='iso'):
 src=Path(output);src.mkdir(parents=True,exist_ok=True)
 data=json.loads(Path(input_path).read_text()); plan=data['plan']; layers={l['id']:l for l in data['model']['layers']}
 groups=defaultdict(list); n_cap=0;n_side=0
 for c in plan['caps']:
  if c.get('buried'):continue
  layer=c['layerId'];z=c['z']*exaggeration
  for tri in polygon_triangles(c['polys']):groups[layer].append([(p[0],p[1],z) for p in tri]);n_cap+=1
 for s in plan['sidewalls']:
  if s.get('buried') or s['z1']-s['z0']<1e-9:continue
  p,q=s['p'],s['q'];lo=s['z0']*exaggeration;hi=s['z1']*exaggeration
  groups[s['layerId']].append([(p[0],p[1],lo),(q[0],q[1],lo),(q[0],q[1],hi)])
  groups[s['layerId']].append([(p[0],p[1],lo),(q[0],q[1],hi),(p[0],p[1],hi)])
  n_side+=1
 ren=vtk.vtkRenderer();ren.SetBackground(.94,.96,.98)
 scene_bounds=[]
 for layer,triangles in groups.items():
  if not triangles:continue
  pts=vtk.vtkPoints();polys=vtk.vtkCellArray()
  for tri in triangles:
   ids=vtk.vtkTriangle()
   for i,p in enumerate(tri):
    ids.GetPointIds().SetId(i,pts.InsertNextPoint(p));scene_bounds.append(p)
   polys.InsertNextCell(ids)
  pd=vtk.vtkPolyData();pd.SetPoints(pts);pd.SetPolys(polys)
  mapper=vtk.vtkPolyDataMapper();mapper.SetInputData(pd)
  actor=vtk.vtkActor();actor.SetMapper(mapper)
  actor.GetProperty().SetColor(*parse_hex(layers[layer].get('color','#99aabb')))
  actor.GetProperty().SetAmbient(.28);actor.GetProperty().SetDiffuse(.78)
  ren.AddActor(actor)
 if not scene_bounds:raise ValueError('No triangles')
 xs=[p[0] for p in scene_bounds];ys=[p[1] for p in scene_bounds];zs=[p[2] for p in scene_bounds]
 center=((min(xs)+max(xs))/2,(min(ys)+max(ys))/2,(min(zs)+max(zs))/2)
 radius=max(max(xs)-min(xs),max(ys)-min(ys),max(zs)-min(zs))
 cam=ren.GetActiveCamera(); cam.SetFocalPoint(center)
 if camera_mode == 'top':
  cam.SetPosition(center[0],center[1],center[2]+radius*2)
  cam.SetViewUp(0,1,0)
 elif camera_mode == 'side':
  cam.SetPosition(center[0],center[1]-radius*2,center[2])
  cam.SetViewUp(0,0,1)
 else:
  cam.SetPosition(center[0]+radius*.95,center[1]-radius*1.45,center[2]+radius*.95)
  cam.SetViewUp(0,0,1)
 cam.ParallelProjectionOn();cam.SetParallelScale(radius*.85)
 window=vtk.vtkRenderWindow();window.AddRenderer(ren);window.SetSize(1100,850);window.SetOffScreenRendering(1);window.SetMultiSamples(0)
 ren.ResetCameraClippingRange();window.Render()
 snap=vtk.vtkWindowToImageFilter();snap.SetInput(window);snap.Update()
 writer=vtk.vtkPNGWriter();writer.SetFileName(str(src/'three-native.png'));writer.SetInputConnection(snap.GetOutputPort());writer.Write()
 summary={'nativeInputSha256':data['sha256'],'backend':'VTK synthetic triangles from native WaferCAD owned material surfaces','threeJSVisualAcceptance':False,'roughnessRendered':False,'zExaggeration':exaggeration,'cameraPreset':camera_mode,'roiUm':data.get('threeRoiUm'),'capTriangles':n_cap,'exteriorSidewalls':n_side,'layerCount':len(groups),'image':'three-native.png'}
 (src/'three-native.evidence.json').write_text(json.dumps(summary,indent=2))
 print(summary)
if __name__=='__main__':
 parser=argparse.ArgumentParser(description='Diagnostic VTK offscreen image from native WaferCAD surface ownership')
 parser.add_argument('--input',required=True);parser.add_argument('--output',required=True)
 parser.add_argument('--z-exaggeration',type=float,default=8)
 parser.add_argument('--camera',choices=['iso','top','side'],default='iso')
 args=parser.parse_args()
 if not math.isfinite(args.z_exaggeration) or not 0 < args.z_exaggeration <= 10000:parser.error('Invalid Z exaggeration')
 main(args.input,args.output,args.z_exaggeration,args.camera)