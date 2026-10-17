#!/usr/bin/env python3
"""Focused offline native-browser allowlist and Three.js pin regression."""
import importlib.util
import json
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
