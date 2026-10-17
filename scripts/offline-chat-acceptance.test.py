#!/usr/bin/env python3
"""Focused offline Chat acceptance checks; no CI, network or live app server."""
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
SCRIPTS=ROOT/'scripts'

def run(*args,check=True):
    return subprocess.run([*map(str,args)],cwd=ROOT,check=check,capture_output=True,text=True)

class OfflineChatCaptureTest(unittest.TestCase):
    def test_real_full_photodetector_with_zoomed_section(self):
        file=ROOT/'site/examples/photodetector-literature-examples.wafercad'
        before=hashlib.sha256(file.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory() as temporary:
            run(sys.executable,SCRIPTS/'offline-chat-acceptance.py','--project',file,
                '--output',temporary,'--views','main,mask,section','--z-min','174.2','--z-max','175.72')
            info=json.loads((Path(temporary)/'summary.evidence.json').read_text())
            self.assertEqual(info['projectSha256'],before)
            self.assertEqual(len(info['images']),3)
            self.assertGreater((Path(temporary)/'section.png').stat().st_size,3000)
            slice_meta=json.loads((Path(temporary)/'section.evidence.json').read_text())
            self.assertEqual(slice_meta['zRangeUm'],[174.2,175.72])
        self.assertEqual(before,hashlib.sha256(file.read_bytes()).hexdigest())

    def test_real_perc_file_mask(self):
        file=ROOT/'site/examples/perc-solar-cells-point-contacts.wafercad'
        with tempfile.TemporaryDirectory() as temporary:
            run(sys.executable,SCRIPTS/'offline-chat-acceptance.py','--project',file,
                '--output',temporary,'--views','mask')
            data=json.loads((Path(temporary)/'native-model.json').read_text())
            self.assertEqual(data['mask']['source'],'file')
            self.assertEqual(len(data['mask']['fileElements']),217)
            self.assertEqual(data['mask']['selected'],['3|0'])
            self.assertTrue((Path(temporary)/'mask.png').stat().st_size>4000)

    def test_m3d_roi_uses_native_surface_plan_without_full_scene(self):
        file=ROOT/'site/examples/m3d-selfpowered-full-replay.wafercad'
        with tempfile.TemporaryDirectory() as temporary:
            run('node', SCRIPTS/'offline-chat-native-export.mjs', '--project', file,
                '--output',temporary,'--three','true','--roi','1,-5,8,5')
            data=json.loads((Path(temporary)/'native-three.json').read_text())
            self.assertEqual(data['threeRoiUm'], {'xmin':1,'ymin':-5,'xmax':8,'ymax':5})
            self.assertGreater(len(data['plan']['sidewalls']),0)
            self.assertLess(len(data['plan']['sidewalls']),25000)
            self.assertLess(len(data['plan']['caps']),300)
            run(sys.executable,SCRIPTS/'offline-chat-vtk.py','--input',Path(temporary)/'native-three.json',
                '--output',temporary,'--camera','iso','--z-exaggeration','4')
            evidence=json.loads((Path(temporary)/'three-native.evidence.json').read_text())
            self.assertEqual(evidence['roiUm'],data['threeRoiUm'])
            self.assertEqual(evidence['cameraPreset'],'iso')
            self.assertGreater((Path(temporary)/'three-native.png').stat().st_size,5000)

    def test_roi_validation_is_transactional_and_rejects_outside_bounds(self):
        file=ROOT/'site/examples/perc-solar-cells-point-contacts.wafercad'
        with tempfile.TemporaryDirectory() as temporary:
            bad=run('node',SCRIPTS/'offline-chat-native-export.mjs', '--project',file,
                '--output',temporary,'--three','true','--roi','0,0,0,1',check=False)
            self.assertNotEqual(bad.returncode,0)
            self.assertFalse((Path(temporary)/'native-model.json').exists())
            bad=run('node',SCRIPTS/'offline-chat-native-export.mjs', '--project',file,
                '--output',temporary,'--three','true','--roi','50000,50000,50100,50100',check=False)
            self.assertNotEqual(bad.returncode,0)
            self.assertFalse((Path(temporary)/'native-model.json').exists())

    def test_ui_source_backed_selected_mask_mobile_and_desktop(self):
        with tempfile.TemporaryDirectory() as temporary:
            for component, width, height, mobile, domain, selected in [
                ('navigation',390,844,'view','mask','mask'),
                ('navigation',390,844,'edit','history','main'),
                ('viewbar',1440,960,'edit','process','three')]:
                run(sys.executable,SCRIPTS/'offline-chat-ui.py','--component',component,
                    '--width',width,'--height',height,'--mobile',mobile,
                    '--domain',domain,'--selected-view',selected,'--output',temporary)
                name=f'{component}-{width}-{mobile}-{domain}-{selected}-light'
                self.assertGreater((Path(temporary)/f'{name}.png').stat().st_size,1000)
                info=json.loads((Path(temporary)/f'{name}.evidence.json').read_text())
                self.assertEqual(info['selectedView'],selected)
                self.assertEqual(info['theme'],'light')
            bad=run(sys.executable,SCRIPTS/'offline-chat-ui.py','--component','navigation',
                '--theme','dark','--output',temporary,check=False)
            self.assertNotEqual(bad.returncode,0)

    def test_unified_command_with_roi_and_selected_view(self):
        file=ROOT/'site/examples/m3d-selfpowered-full-replay.wafercad'
        with tempfile.TemporaryDirectory() as temporary:
            run(sys.executable,SCRIPTS/'offline-chat-acceptance.py','--project',file,
                '--output',temporary,'--views','three,navigation','--roi','1,-5,8,5',
                '--camera','top','--width','390','--height','844','--mobile','view',
                '--selected-view','three')
            summary=json.loads((Path(temporary)/'summary.evidence.json').read_text())
            self.assertEqual(summary['threeRoiUm'],[1,-5,8,5])
            self.assertEqual(summary['cameraPreset'],'top')
            self.assertEqual(len(summary['images']),2)
            self.assertTrue((Path(temporary)/'navigation-390-view-project-three-light.png').exists())

    def test_constrained_triangles_do_not_fill_holes(self):
        import importlib.util
        spec=importlib.util.spec_from_file_location('offline_vtk',SCRIPTS/'offline-chat-vtk.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        poly=[[[-10,-10],[10,-10],[10,10],[-10,10],[-10,-10]],
              [[-2,-2],[-2,2],[2,2],[2,-2],[-2,-2]]]
        triangles=list(module.polygon_triangles([poly]))
        from shapely.geometry import Polygon
        import math
        total=sum(Polygon(t).area for t in triangles)
        self.assertTrue(math.isclose(total,384,rel_tol=1e-9))
        self.assertTrue(all(not Polygon(t).intersects(Polygon(poly[1]).buffer(-.001)) for t in triangles))

    def test_invalid_project_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            path=Path(temporary)/'invalid.wafercad';path.write_text('{}')
            result=run('node',SCRIPTS/'offline-chat-native-export.mjs',
                       '--project',path,'--output',temporary,check=False)
            self.assertNotEqual(result.returncode,0)
            self.assertFalse((Path(temporary)/'native-model.json').exists())

    def test_actual_v2_shell_without_url_navigation(self):
        with tempfile.TemporaryDirectory() as temporary:
            run(sys.executable,SCRIPTS/'offline-chat-ui.py',
                '--component','navigation','--width','390','--height','844','--mobile','view',
                '--output',temporary)
            evidence=json.loads((Path(temporary)/'navigation-390-view-project-main-light.evidence.json').read_text())
            self.assertTrue((Path(temporary)/'navigation-390-view-project-main-light.png').stat().st_size>1000)
            self.assertIn('ui-v2/workstation-v2.js',evidence['sourceSha256'])
            self.assertFalse(evidence['nativeAppAcceptance'])

if __name__=='__main__':unittest.main(verbosity=2)