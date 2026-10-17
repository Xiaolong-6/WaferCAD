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
            evidence=json.loads((Path(temporary)/'navigation-390-view.evidence.json').read_text())
            self.assertTrue((Path(temporary)/'navigation-390-view.png').stat().st_size>1000)
            self.assertIn('ui-v2/workstation-v2.js',evidence['sourceSha256'])
            self.assertFalse(evidence['nativeAppAcceptance'])

if __name__=='__main__':unittest.main(verbosity=2)