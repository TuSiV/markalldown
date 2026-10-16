"""Ensure basic service readiness is independent of optional conversion engines."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]

class StartupTests(unittest.TestCase):
    def test_service_starts_without_loading_conversion_engines(self):
        script = '''
import sys, importlib.abc
class BlockHeavy(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in {'onnxruntime', 'markitdown', 'anydoc', 'cv2', 'rapidocr_onnxruntime'}:
            raise AssertionError('Eager conversion dependency: ' + fullname)
sys.meta_path.insert(0, BlockHeavy())
import server
from fastapi.testclient import TestClient
with TestClient(server.app) as client:
    assert client.get('/api/health').json()['status'] == 'ok'
    assert client.get('/api/startup').status_code == 401
    data = client.get('/api/startup', headers={'X-API-Token':server.API_TOKEN}).json()
    assert any(item['stage'] == 'application_ready' for item in data['stages'])
'''
        subprocess.run([sys.executable, '-c', script], cwd=ROOT/'backend', check=True, timeout=30, capture_output=True)

    def test_timings_never_include_credentials_or_paths(self):
        sys.path.insert(0, str(ROOT/'backend'))
        from startup import timed_stage, snapshot
        with timed_stage('test_load'):
            pass
        item = snapshot()[-1]
        self.assertEqual(item['stage'], 'test_load')
        self.assertGreaterEqual(item['elapsedMs'], 0)
        self.assertEqual(set(item), {'stage', 'sinceEntryMs', 'elapsedMs'})

if __name__ == '__main__': unittest.main()
