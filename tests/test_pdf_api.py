import sys
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from fastapi.testclient import TestClient
import server
from pdf_jobs import PdfTimeout

class PdfApiTests(unittest.TestCase):
    def test_timeout_is_reported_as_stopped_not_an_unknown_server_error(self):
        with TestClient(server.app) as client, patch.object(server.pdf_jobs, 'convert', new=AsyncMock(side_effect=PdfTimeout())):
            response = client.post('/api/convert', headers={'X-API-Token':server.API_TOKEN}, files={'file':('large.pdf', b'pdf')}, data={'jobId':'test-job'})
        self.assertEqual(response.status_code, 408)
        self.assertIn('任务已停止', response.json()['detail'])

    def test_queue_status_requires_auth_and_exposes_only_state(self):
        server.pdf_jobs.states['fixture'] = 'queued'
        try:
            with TestClient(server.app) as client:
                self.assertEqual(client.get('/api/conversions/fixture').status_code, 401)
                self.assertEqual(client.get('/api/conversions/fixture', headers={'X-API-Token':server.API_TOKEN}).json(), {'state':'queued'})
                self.assertEqual(client.get('/api/conversions/missing', headers={'X-API-Token':server.API_TOKEN}).status_code, 404)
        finally: server.pdf_jobs.states.clear()

    def test_pause_resume_discard_all_require_local_authentication(self):
        with TestClient(server.app) as client:
            for action in ('pause','resume','discard'):
                with self.subTest(action=action):
                    self.assertEqual(client.post('/api/conversions/unknown/'+action,json={'concurrency':2}).status_code,401)
