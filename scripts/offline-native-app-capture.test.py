#!/usr/bin/env python3
"""Focused offline native-browser allowlist and Three.js pin regression."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name('offline-native-app-capture.py')
spec = importlib.util.spec_from_file_location('offline_native_capture', MODULE)
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class CapturePreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.site = self.root / 'site'
        self.three = self.root / 'node_modules' / 'three'
        (self.three / 'build').mkdir(parents=True)
        (self.three / 'examples/jsm/controls').mkdir(parents=True)
        self.site.mkdir()
        (self.site / 'app.html').write_text(
            '<script type="importmap">https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js</script>')
        (self.three / 'package.json').write_text(json.dumps({'version': '0.179.1'}))
        (self.three / 'build/three.module.js').write_text('export {};')
        (self.three / 'examples/jsm/controls/OrbitControls.js').write_text('export {};')

    def test_inmemory_roi_and_z_break_bounds(self):
        self.assertIsNone(capture.parse_native_bounds(None, 'ROI', 4))
        self.assertEqual(capture.parse_native_bounds('-8,-8,8,8', 'ROI', 4), (-8.,-8.,8.,8.))
        self.assertEqual(capture.parse_native_bounds('173.9,-175.8', 'Z break', 2),
                         (173.9, -175.8))
        for value in ('0,0,0,1', '0,0,1,0', '1,1,-1,2', 'nan,0,1,1', '0,0,inf,1',
                      '0,1,2', 'a,b,c,d'):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    capture.parse_native_bounds(value, 'ROI', 4)
        for value in ('0,1', '1,1', 'nan,0', '2', 'a,b'):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    capture.parse_native_bounds(value, 'Z break', 2)

    def test_rough_cutline_and_quality_preflight_is_fail_closed(self):
        fixture = self.root / 'sample.wafercad'
        fixture.write_text('{}')  # Parsing arguments must fail before reading model or Chromium.
        for options, expected in (
            (['--rough-cutline', '2494.7,2495.3,0.123'], 'require --inmemory-project'),
            (['--quality'], 'require --inmemory-project'),
            (['--inmemory-project', str(fixture), '--rough-cutline', '0,0,0'],
             'xMax > xMin'),
            (['--inmemory-project', str(fixture), '--rough-cutline', 'nan,1,0'],
             'xMax > xMin'),
        ):
            with self.subTest(options=options):
                result = subprocess.run(
                    [sys.executable, str(MODULE), '--output', str(self.root / 'capture'),
                     *options], capture_output=True, text=True, timeout=5,
                )
                self.assertEqual(result.returncode, 2)
                self.assertIn(expected, result.stderr)

    def test_native_model_does_not_duplicate_initial_renderer_build(self):
        source = (MODULE.parent / 'offline-native-model-view.js').read_text()
        self.assertIn('await renderer.init()', source)
        self.assertNotIn('await renderer.render()', source)
        self.assertIn('roughCaps:', source)

    def test_native_section_uses_physical_compositor_only(self):
        source = (MODULE.parent / 'offline-native-section-comparison.js').read_text()
        self.assertIn('renderer.renderSection()', source)
        self.assertIn("sampleMode: 'physical'", source)
        self.assertNotIn('getRoughSectionDisplayMode', source)
        self.assertNotIn("['aligned', 'physical']", source)

    def test_continuous_3d_diagnostic_scale_is_bounded(self):
        fixture = self.root / 'sample.wafercad'
        fixture.write_text('{}')
        for value in ('0.2', '20.01', 'nan', 'inf', '-1'):
            with self.subTest(value=value):
                result = subprocess.run(
                    [sys.executable, str(MODULE), '--output', str(self.root / 'capture'),
                     '--inmemory-project', str(fixture), '--inmemory-z-scale', value],
                    capture_output=True, text=True, timeout=5,
                )
                self.assertEqual(result.returncode, 2)
                self.assertIn('In-memory 3D Z scale must be finite', result.stderr)

    def test_pinned_version_and_files(self):
        self.assertEqual(capture.check_three(self.root), ('0.179.1', self.three))

    def test_wrong_version_fails_closed(self):
        (self.three / 'package.json').write_text(json.dumps({'version': '0.178.0'}))
        with self.assertRaisesRegex(ValueError, 'Missing pinned'):
            capture.check_three(self.root)

    def test_missing_addon_fails_closed(self):
        (self.three / 'examples/jsm/controls/OrbitControls.js').unlink()
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            capture.check_three(self.root)

    def test_only_app_origin_build_stamp_can_be_ignored(self):
        expected = {'url': 'https://wafercad.local/build-info.json?version=1',
                    'reason': 'missing-or-unsafe'}
        self.assertTrue(capture.is_optional_build_info_rejection(expected))
        for item in (
            {'url': 'https://other.example/build-info.json', 'reason': 'external'},
            {'url': 'https://wafercad.local/nested/build-info.json',
             'reason': 'missing-or-unsafe'},
            {'url': 'https://wafercad.local/build-info.json', 'reason': 'external'},
            {'url': 'http://wafercad.local/build-info.json', 'reason': 'external'},
        ):
            with self.subTest(url=item['url']):
                self.assertFalse(capture.is_optional_build_info_rejection(item))

    def test_only_app_and_pinned_cdn_allowed(self):
        path, group = capture.local_file('https://wafercad.local/app.html?start=empty',
                                         self.site, self.three, '0.179.1')
        self.assertEqual((path, group), (self.site / 'app.html', 'site'))
        path, group = capture.local_file('https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js',
                                         self.site, self.three, '0.179.1')
        self.assertEqual((path, group), (self.three / 'build/three.module.js', 'three'))
        for url in ('https://example.com/app.html',
                    'http://wafercad.local/app.html',
                    'https://cdn.jsdelivr.net/npm/three@0.178.0/build/three.module.js',
                    'https://wafercad.local/%2e%2e/package.json',
                    'https://wafercad.local/build-info.json'):
            with self.subTest(url=url):
                self.assertIsNone(capture.local_file(url, self.site, self.three, '0.179.1')[0])


if __name__ == '__main__':
    unittest.main()
