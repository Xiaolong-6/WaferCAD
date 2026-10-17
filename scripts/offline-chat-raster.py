#!/usr/bin/env python3
"""Inspection-only rasterizer: consumes WaferCAD's unmodified native surface/slice JSON."""
import json, math, html, argparse
from pathlib import Path
import cairosvg

def E(x): return html.escape(str(x),quote=True)
def fmt(x):
    if not math.isfinite(x): raise ValueError(f'nonfinite coordinate {x}')
    return f'{x:.4f}'
def coords(g):
    return [(p[0],p[1]) for poly in (g or []) for ring in poly for p in ring]
def getbounds(geoms):
    p=[xy for g in geoms for xy in coords(g)];
    if not p: raise ValueError('No valid polygon positions')
    return min(x for x,y in p), max(x for x,y in p), min(y for x,y in p),max(y for x,y in p)
def color(layer): return E(layer.get('color') or '#99aacc')
def path(geometry, transform):
    parts = []
    for polygon in geometry or []:
        for ring in polygon:
            segments = []
            for index, position in enumerate(ring):
                x, y = transform(position)
                segments.append(f'{"M" if index == 0 else "L"}{fmt(x)} {fmt(y)}')
            parts.append(' '.join(segments) + ' Z')
    return ' '.join(parts)
def draw(source,view,output,width=1100,height=760,scale_mode='auto',z_range=None,face=None):
    d=json.loads(Path(source).read_text())
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    layers={x['id']:x for x in d['model']['layers']}
    border=d['model']['boundary']; main_geo=[border]
    lx,rx,ty,by=65,width-65,92,height-110
    plotw=rx-lx;ploth=by-ty
    intro='';shapes=[];legend=[]
    if view in ('main','main-back','mask'):
        face='back' if view=='main-back' else (face or d['activeFace']); patches=d['surfaces'][face]
        if view=='mask':
            mask=d['mask']; source=mask['source'];
            main_geo+=[i['geom'] for i in patches]
            main_geo.extend(q['geom'] for q in mask['drawGeometries'])
            main_geo.extend([[q['points']]] for q in mask['fileElements'] if q['points'])
            if mask['roi']:main_geo.append(mask['roi'])
        if view=='mask' and face=='back':
            for geom in [border,*[p['geom'] for p in patches]]:
                main_geo.append([[[(-p[0],p[1]) for p in ring] for ring in poly] for poly in geom])
        xmin,xmax,ymin,ymax=getbounds(main_geo)
        scal=min(plotw/max(xmax-xmin,1e-9),ploth/max(ymax-ymin,1e-9))*.96
        x0=lx+(plotw-(xmax-xmin)*scal)*.5; y0=ty+(ploth-(ymax-ymin)*scal)*.5
        flip=face=='back'
        def to_point(p): return (x0+ ((-p[0] if flip else p[0])-xmin)*scal,y0+(ymax-p[1])*scal)
        def to_mask_point(p): return (x0+(p[0]-xmin)*scal,y0+(ymax-p[1])*scal)
        shapes.append(f'<path d="{path(border,to_point)}" fill="none" stroke="#70839b" stroke-width="1.5" stroke-dasharray="7 4"/>')
        if view!='mask':
            for patch in sorted(patches,key=lambda p:p['z'],reverse=flip):
                c=color(layers[patch['layerId']]);shapes.append(f'<path d="{path(patch["geom"],to_point)}" fill="{c}" fill-rule="evenodd" stroke="#21354c" stroke-opacity=".42" stroke-width=".65"/>');legend.append(patch['layerId'])
        else:
            for patch in patches:
                shapes.append(f'<path d="{path(patch["geom"],to_point)}" fill="none" stroke="#a5b1bd" stroke-dasharray="4 3" stroke-width=".8"/>')
            if source=='draw':
                for i,e in enumerate(mask['drawGeometries']):
                    shapes.append(f'<path d="{path(e["geom"],to_mask_point)}" fill="#4f86c6" fill-opacity=".43" stroke="#3065a0" stroke-width="1" fill-rule="evenodd"/>')
            else:
                for e in mask['fileElements']:
                    k=f"{e['layer']}|{e['datatype']}";chosen=k in set(mask['selected']);points=e['points']; c='#4182cd' if chosen else '#aab7c8'
                    if e['kind']=='polygon':
                        shapes.append(f'<path d="{path([[points]],to_mask_point)}" fill="{c}" fill-opacity="{.45 if chosen else .09}" stroke="{c}" stroke-width=".7"/>')
                    elif e['kind']=='path' and len(points)>=2:
                        coords_line=' '.join(('M' if i==0 else 'L')+fmt(to_mask_point(p)[0])+' '+fmt(to_mask_point(p)[1]) for i,p in enumerate(points))
                        shapes.append(f'<path d="{coords_line}" fill="none" stroke="{c}" stroke-width="{max(.8,e.get("width",0)*scal):.4f}"/>')
            if mask['roi']:
                shapes.append(f'<path d="{path(mask["roi"],to_mask_point)}" fill="none" stroke="#e8590c" stroke-width="2" stroke-dasharray="5 4"/>')
            intro=f'Mask · {source} · {len(mask["fileElements"])} file items · {len(mask["drawGeometries"])} draw shapes'
        if not intro: intro=f'Main · {face} · {len(patches)} native surface groups'
    elif view in ('section','section-detail'):
        slices=d['slices']; a=d['section']['a'];b=d['section']['b']; L=math.dist(a,b)
        z0=min(s['z0'] for s in slices);z1=max(s['z1'] for s in slices)
        if z_range is not None:
            z0,z1=z_range
            if z0>=z1:raise ValueError('Z crop requires min < max')
        elif view=='section-detail':
            z1=max(s['z1'] for s in slices)+.02
            z0=z1-1.5
        span=z1-z0
        if scale_mode=='physical': xscale=zscale=min(plotw/L,ploth/span)*.95
        else: xscale=plotw/L*.95;zscale=ploth/span*.95
        xoff=lx+(plotw-L*xscale)*.5;yoff=ty+(ploth-span*zscale)*.5
        for s in slices:
            sz0=max(s['z0'],z0);sz1=min(s['z1'],z1)
            if sz1<=sz0:continue
            x=xoff+s['t0']*L*xscale;y=yoff+(z1-sz1)*zscale;w=(s['t1']-s['t0'])*L*xscale;h=(sz1-sz0)*zscale
            if w<0 or h<0:raise ValueError('invalid section slice')
            shapes.append(f'<rect x="{fmt(x)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" fill="{color(layers[s["layerId"]])}" stroke="#223449" stroke-width=".5"/>')
            legend.append(s['layerId'])
        if not shapes:raise ValueError('No material intersects the requested Section Z window')
        intro=f'Section · {len(slices)} native material slices · {scale_mode} X:Z scale · Z window [{z0:.3f}, {z1:.3f}] µm'
    else: raise ValueError(view)
    leg=''; unique=list(dict.fromkeys(legend))
    for i,key in enumerate(unique[:9]):
        lab=layers[key].get('name',key)[:36]; x=50+(i%3)*340;y=height-70+(i//3)*18;
        leg+=f'<rect x="{x}" y="{y-10}" width="11" height="11" fill="{color(layers[key])}"/><text x="{x+18}" y="{y}" font-size="11">{E(lab)}</text>'
    title=E(d['project'][:85]); intro=E(intro)
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><rect width="100%" height="100%" fill="#f8fafc"/><text x="35" y="36" font-size="21" font-weight="600" fill="#243047">{title}</text><text x="35" y="56" font-size="13" fill="#52657a">{intro}</text><rect x="35" y="73" width="{width-70}" height="{height-174}" rx="9" fill="white" stroke="#d3dce8"/><defs><clipPath id="viewport"><rect x="35" y="73" width="{width-70}" height="{height-174}"/></clipPath></defs><g clip-path="url(#viewport)">{''.join(shapes)}</g><g font-family="Arial,sans-serif" fill="#3b4b60">{leg}</g><text x="35" y="{height-20}" font-size="10" font-family="Arial" fill="#67768a">Native WaferCAD topology · offline CairoSVG rasterization · scientific diagnostic only · SHA256 {d['sha256'][:12]}</text></svg>'''
    out=output; svgpath=out/f'{view}.svg';pngpath=out/f'{view}.png';svgpath.write_text(svg)
    cairosvg.svg2png(bytestring=svg.encode(),write_to=str(pngpath))
    evidence={'schema':'wafercad-offline-chat-cairo-v1','view':view,'source':d.get('source'),'inputSha256':d['sha256'],
              'renderer':'native-wafercad-geometry + CairoSVG diagnostic','nativeThreeJSPixelAcceptance':False,
              'nativeUIInteractionAcceptance':False,'zRangeUm':z_range,'scaleMode':scale_mode,
              'limitations':['Read-only visual diagnostic; no roughness shader, Z break, or live UI/Canvas equivalence'] }
    (out/f'{view}.evidence.json').write_text(json.dumps(evidence,indent=2))
    print(view,pngpath)
if __name__=='__main__':
 parser=argparse.ArgumentParser(description='Render physical WaferCAD material geometry from native validated export JSON, without localhost.')
 parser.add_argument('--input',required=True);parser.add_argument('--output',required=True)
 parser.add_argument('--view',choices=['main','main-back','mask','section','section-detail'],required=True)
 parser.add_argument('--width',type=int,default=1100);parser.add_argument('--height',type=int,default=760)
 parser.add_argument('--scale',choices=['auto','physical'],default='auto')
 parser.add_argument('--z-min',type=float);parser.add_argument('--z-max',type=float)
 parser.add_argument('--face',choices=['front','back'])
 args=parser.parse_args()
 if args.width<320 or args.width>4096 or args.height<320 or args.height>4096:parser.error('Output dimensions out of range')
 if (args.z_min is None)!=(args.z_max is None):parser.error('Specify both --z-min and --z-max')
 draw(args.input,args.view,args.output,args.width,args.height,args.scale,
      (args.z_min,args.z_max) if args.z_min is not None else None,args.face)