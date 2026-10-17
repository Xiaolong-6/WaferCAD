#!/usr/bin/env python3
"""One-command isolated offline diagnostic evidence from a real .wafercad project.

Uses the production project reader and owned surface/slice routines; no server,
file:// navigation, CI, or background work. Not a full app/browser acceptance.
"""
import argparse
import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path

SCRIPTS=Path(__file__).resolve().parent
VALID={'main','main-back','mask','section','three','navigation','topbar','viewbar'}

def run_command(args):
    r=subprocess.run(args,check=True,capture_output=True,text=True)
    if r.stdout.strip():print(r.stdout.strip())
    if r.stderr.strip():print(r.stderr.strip(),file=sys.stderr)

def main():
    parser=argparse.ArgumentParser(description='WaferCAD scientific/UI evidence without localhost or CI')
    parser.add_argument('--project',required=True,help='Existing validated .wafercad project')
    parser.add_argument('--output',required=True)
    parser.add_argument('--views',default='main,mask,section',help='Comma-separated main,mask,section,three,navigation,topbar,viewbar')
    parser.add_argument('--width',type=int,default=1100);parser.add_argument('--height',type=int,default=760)
    parser.add_argument('--z-min',type=float);parser.add_argument('--z-max',type=float)
    parser.add_argument('--z-exaggeration',type=float,default=8)
    parser.add_argument('--scale',choices=['auto','physical'],default='auto')
    parser.add_argument('--face',choices=['front','back'])
    parser.add_argument('--mobile',choices=['edit','view'],default='edit')
    parser.add_argument('--domain',choices=['project','mask','process','history'],default='project')
    args=parser.parse_args()
    if (args.z_min is None)!=(args.z_max is None):parser.error('Set both --z-min and --z-max')
    if args.z_min is not None and (not all(map(math.isfinite,(args.z_min,args.z_max))) or args.z_min>=args.z_max):parser.error('Invalid physical Z range')
    if args.width<320 or args.height<320 or args.width>4096 or args.height>4096:parser.error('Invalid image dimensions')
    requested=[v.strip() for v in args.views.split(',') if v.strip()]
    if not requested or any(v not in VALID for v in requested):parser.error('Unknown view')
    out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
    images=[];needs_geometry=any(view in {'main','main-back','mask','section','three'} for view in requested)
    if needs_geometry:
        run_command(['node',str(SCRIPTS/'offline-chat-native-export.mjs'),'--project',args.project,
                     '--output',str(out),'--three','true' if 'three' in requested else 'false'])
    for view in requested:
        if view in ('navigation','topbar','viewbar'):
            run_command([sys.executable,str(SCRIPTS/'offline-chat-ui.py'),'--component',view,
                         '--output',str(out),'--width',str(args.width),'--height',str(args.height),
                         '--mobile',args.mobile,'--domain',args.domain])
            images.append(f'{view}-{args.width}-{args.mobile}.png')
        elif view=='three':
            run_command([sys.executable,str(SCRIPTS/'offline-chat-vtk.py'),'--input',str(out/'native-three.json'),
                         '--output',str(out),'--z-exaggeration',str(args.z_exaggeration)])
            images.append('three-native.png')
        else:
            command=[sys.executable,str(SCRIPTS/'offline-chat-raster.py'),'--input',str(out/'native-model.json'),
                     '--output',str(out),'--view',view,'--width',str(args.width),'--height',str(args.height),'--scale',args.scale]
            if args.z_min is not None and view=='section':command.extend(['--z-min',str(args.z_min),'--z-max',str(args.z_max)])
            if args.face:command.extend(['--face',args.face])
            run_command(command);images.append(f'{view}.png')
    from PIL import Image, ImageStat
    diagnostics=[]
    for image in images:
        path=out/image
        with Image.open(path) as png:
            png.load();variation=max(ImageStat.Stat(png.convert('RGB')).stddev)
            if png.width<100 or png.height<30 or variation<2.5:
                raise RuntimeError(f'Empty or almost-uniform diagnostic image: {image}')
            diagnostics.append({'file':image,'size':list(png.size),
                                'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                                'rgbMaxStdDev':round(variation,2)})
    bundle_manifest=SCRIPTS.parent/'offline-source-manifest.json'
    source_metadata=json.loads(bundle_manifest.read_text()) if bundle_manifest.exists() else None
    provenance={'schema':'wafercad-offline-chat-acceptance-v1','sourceRevision':source_metadata.get('revision') if source_metadata else 'unavailable',
                'dirtyAtPackaging':source_metadata.get('dirtyAtPackaging') if source_metadata else None,'projectSha256':hashlib.sha256(Path(args.project).read_bytes()).hexdigest(),
                'views':requested,'images':diagnostics,'method':'real project -> native WaferCAD geometry -> offline diagnostic renderers',
                'nativeApplicationVisualAcceptance':False,'ciWasRun':False,'limitations':[
                  '3D uses VTK, not the Three.js shader/compositor','Scientific slices omit rough appearance and live UI overlays',
                  'Shell component captures have empty business adapters']}
    (out/'summary.evidence.json').write_text(json.dumps(provenance,indent=2))
    print(json.dumps({'output':str(out),'images':images,'evidence':'summary.evidence.json'}))
if __name__=='__main__':main()