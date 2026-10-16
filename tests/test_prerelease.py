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

    def test_stable_requires_msi_and_checksums_all_four_installers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); installers,screenshots=self.fixture(root)
            with self.assertRaises(AssertionError):
                publish.prepare('3.0.0',installers,screenshots,root/'missing',include_msi=True)
            (installers/'MarkAllDown_3.0.0_x64_en-US.msi').write_bytes(b'synthetic MSI')
            assets=publish.prepare('3.0.0',installers,screenshots,root/'stable',include_msi=True)
            self.assertEqual(len(assets),6)
            self.assertEqual(len((root/'stable/SHA256SUMS.txt').read_text().splitlines()),5)

    def test_stable_replacement_refuses_another_release_or_unexpected_tag(self):
        from unittest.mock import patch
        stable_spec=importlib.util.spec_from_file_location('stable',Path(__file__).resolve().parents[1]/'scripts/publish_stable.py')
        stable=importlib.util.module_from_spec(stable_spec)
        with patch.dict('sys.modules',{'publish_prerelease':publish}):
            stable_spec.loader.exec_module(stable)
        release={'id':414450383,'prerelease':True,'draft':False,'target_commitish':stable.OLD_SOURCE}
        tag={'object':{'type':'commit','sha':stable.OLD_SOURCE}}
        stable.assert_replacement_target(release,tag,'new-source')
        with self.assertRaises(AssertionError):
            stable.assert_replacement_target({**release,'id':1},tag,'new-source')
        with self.assertRaises(AssertionError):
            stable.assert_replacement_target(release,{'object':{'type':'commit','sha':'unexpected'}},'new-source')
        with self.assertRaises(AssertionError):
            stable.assert_replacement_target({**release,'prerelease':False},tag,'new-source')
