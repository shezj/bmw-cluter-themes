"""Source-export regression tests; build fixtures never leave the temporary directory."""

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile

from build_store import check_sdk
from cluster_source import cluster_app
from prepare_store_source import APP_ID, ROOT, export_source, ignore_local_files
from validate_store_source import read_json, validate


class StoreSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='cluster-store-tests-')
        cls.source = cluster_app(ROOT)
        cls.original_spec = (cls.source / 'app.json').read_bytes()
        cls.export, cls.archive = export_source(Path(cls.temporary.name) / 'source', cls.source.name)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def test_all_themes_and_assets_are_retained(self):
        spec = validate(self.export)
        self.assertEqual(spec['id'], APP_ID)
        original = json.loads(self.original_spec)
        original_settings = {setting['key']: setting for setting in original['settings']}
        settings = {setting['key']: setting for setting in spec['settings']}
        self.assertEqual(settings['hudLayout']['options'], original_settings['hudLayout']['options'])
        self.assertEqual(spec['shared'], original['shared'])
        expected = {str(file.relative_to(self.source / 'hud')): file.read_bytes()
                    for file in (self.source / 'hud').rglob('*') if file.is_file()}
        actual = {str(file.relative_to(self.export / 'apps' / APP_ID / 'hud')): file.read_bytes()
                  for file in (self.export / 'apps' / APP_ID / 'hud').rglob('*') if file.is_file()}
        self.assertEqual(expected, actual, 'artwork, fonts, previews and all layout variants must be preserved byte for byte')
        self.assertEqual((self.source / 'app.json').read_bytes(), self.original_spec)

    def test_archive_is_source_only(self):
        with zipfile.ZipFile(self.archive) as archive:
            names = archive.namelist()
        self.assertIn('source/mgu-repo.json', names)
        for name in names:
            self.assertFalse(any(part in {'oap-sdk', 'dist', '.git', '.data', 'node_modules'} for part in Path(name).parts))
        self.assertTrue((self.export / 'LICENSE').is_file())
        self.assertTrue((self.export / 'apps' / APP_ID / 'NOTICE').is_file())

    def test_export_never_overwrites_existing_work(self):
        with self.assertRaises(FileExistsError):
            export_source(self.export, self.source.name)
        with self.assertRaises(ValueError):
            export_source(Path(self.temporary.name) / 'bad', '../outside')

    def test_local_files_are_excluded(self):
        names = ['.env', '.env.local', 'ssh.key', 'donor.pem', '.data', '__pycache__', '.DS_Store', 'app.json']
        self.assertEqual(set(ignore_local_files(self.source, names)), set(names) - {'app.json'})

    def test_missing_module_is_rejected(self):
        file = self.export / 'shared/apex_motion.js'
        hidden = file.with_suffix('.test-hidden')
        file.rename(hidden)
        try:
            with self.assertRaisesRegex(ValueError, 'missing shared module'):
                validate(self.export)
        finally:
            hidden.rename(file)

    def test_sdk_stub_is_refused(self):
        with tempfile.TemporaryDirectory(prefix='sdk-check-') as temporary:
            root = Path(temporary)
            with self.assertRaisesRegex(ValueError, 'Store must supply'):
                check_sdk(root)
            sdk = root / 'oap-sdk'
            sdk.mkdir()
            (sdk / 'index.js').write_text("throw new Error('BENCH_STUB');\n", encoding='utf-8')
            (sdk / 'package.json').write_text('{"version":"0.0.0-bench-stub"}', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'Refusing the bench SDK'):
                check_sdk(root)

    def test_source_build_and_packed_layouts(self):
        with tempfile.TemporaryDirectory(prefix='store-build-') as temporary:
            root = Path(temporary) / 'repo'
            shutil.copytree(self.export, root)
            # A synthetic API-free module tests packaging, not the BMW SDK or real-car operation.
            sdk = root / 'oap-sdk'
            sdk.mkdir()
            (sdk / 'index.js').write_text('module.exports = {};\n', encoding='utf-8')
            (sdk / 'package.json').write_text('{"name":"oap-sdk","version":"0.0.0-test-fixture"}', encoding='utf-8')
            result = subprocess.run([sys.executable, 'tools/build_store.py', APP_ID], cwd=root,
                                    text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            spec = read_json(root / 'apps' / APP_ID / 'app.json')
            package = root / 'dist' / ('%s@%s.tgz' % (APP_ID, spec['version']))
            with tarfile.open(package) as archive:
                manifest = json.load(archive.extractfile('package/package.json'))
                self.assertEqual(manifest['name'], APP_ID)
                self.assertEqual(manifest['version'], spec['version'])
                names = archive.getnames()
                for module in spec['shared']:
                    self.assertIn('package/javascript/' + module, names)
                self.assertIn('package/javascript/hud.pack', names)
            # Exercise the installed pack reader and every selectable layout's validator.
            script = """
const assert = require('assert'), path = require('path');
const app = path.resolve(process.argv[1]);
const Layouts = require(path.join(app, 'javascript/layouts'));
const spec = require(path.join(app, 'javascript/kit/app-spec.json'));
const layouts = new Layouts(path.join(app, 'test-data'), {info(){}, warn(){}}, [1920,720]);
spec.settings.find(setting => setting.key === 'hudLayout').options.forEach(option => {
  if (option[0] !== 'off') assert(layouts.load(option[0]).widgets.length > 0);
});
console.log('All selectable layouts load from the installed hud.pack.');
"""
            checked = subprocess.run(['node', '-e', script, str(root / 'dist' / APP_ID / 'source')],
                                     cwd=root, text=True, capture_output=True)
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)


if __name__ == '__main__':
    unittest.main()
