import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

MODULE_PATH = Path(__file__).with_name('offline-package.py')
spec = importlib.util.spec_from_file_location('offline_package', MODULE_PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class PortableBundleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'site').mkdir()
        (self.root / 'scripts').mkdir()
        (self.root / 'site' / 'example.wafercad').write_text('{"model": {}}')
        for name in mod.SCRIPT_NAMES:
            (self.root / 'scripts' / name).write_text('// file')

    def test_roundtrip_paths_and_manifest(self):
        result = mod.build(self.root, self.root / 'dist' / 'offline.zip', include_deps=False)
        with zipfile.ZipFile(result['output']) as f:
            manifest = json.loads(f.read('offline-source-manifest.json'))
            self.assertEqual(manifest['schema'], 'wafercad-offline-bundle-v1')
            self.assertIn('site/example.wafercad', manifest['files'])
            self.assertEqual(len(manifest['files']), len(f.namelist()) - 1)
            self.assertTrue(mod.verify(Path(result['output']))['verified'])
            self.assertTrue(all(not p.startswith('/') and '..' not in Path(p).parts for p in f.namelist()))

    def test_tampered_payload_fails_hash_verification(self):
        result = mod.build(self.root, self.root / 'offline.zip', include_deps=False)
        changed = self.root / 'bad.zip'
        with zipfile.ZipFile(result['output']) as original, zipfile.ZipFile(changed, 'w') as target:
            for name in original.namelist():
                content = original.read(name)
                target.writestr(name, b'changed' if name == 'site/example.wafercad' else content)
        with self.assertRaisesRegex(ValueError, 'Hash mismatch'):
            mod.verify(changed)

    def test_missing_required_code_fails_closed(self):
        (self.root / 'scripts' / mod.SCRIPT_NAMES[0]).unlink()
        with self.assertRaisesRegex(ValueError, 'Missing required'):
            mod.build(self.root, self.root / 'bad.zip', include_deps=False)

    def test_no_symlinks(self):
        (self.root / 'site' / 'link').symlink_to(self.root / 'site' / 'example.wafercad')
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            mod.build(self.root, self.root / 'bad.zip', include_deps=False)


if __name__ == '__main__':
    unittest.main()