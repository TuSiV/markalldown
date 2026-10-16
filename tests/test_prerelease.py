"""Release artifact gates for numeric prerelease version 3.0.0."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publish', Path(__file__).resolve().parents[1]/'scripts/publish_prerelease.py')
publish = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publish)

class PrereleaseTests(unittest.TestCase):
    def fixture(self, root, version='3.0.0'):
        installers, screenshots = root/'installers', root/'screenshots'
        installers.mkdir(); screenshots.mkdir()
        for name in [f'MarkAllDown_{version}_x64-setup.exe',f'MarkAllDown_{version}_aarch64.dmg',f'MarkAllDown_{version}_x64.dmg']:
            (installers/name).write_bytes(b'synthetic installer')
        for i in range(20): (screenshots/f'{i}.png').write_bytes(b'synthetic screenshot')
        return installers,screenshots

    def test_numeric_version_remains_valid_for_prerelease_artifact_gates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); installers,screenshots=self.fixture(root)
            assets=publish.prepare('3.0.0',installers,screenshots,root/'output')
            self.assertEqual(len(assets),5)
            self.assertIn('SHA256SUMS.txt',{p.name for p in assets})

    def test_missing_platform_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); installers,screenshots=self.fixture(root)
            (installers/'MarkAllDown_3.0.0_x64.dmg').unlink()
            with self.assertRaises(AssertionError): publish.prepare('3.0.0',installers,screenshots,root/'output')

    def test_mismatched_version_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); installers,screenshots=self.fixture(root,'2.3.0-rc.5')
            with self.assertRaises(AssertionError): publish.prepare('3.0.0',installers,screenshots,root/'output')

    def test_incomplete_ui_evidence_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); installers,screenshots=self.fixture(root)
            (screenshots/'0.png').unlink()
            with self.assertRaises(AssertionError): publish.prepare('3.0.0',installers,screenshots,root/'output')
