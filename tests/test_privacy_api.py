"""Integration tests for the optional FastAPI privacy router (no external AI calls)."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import httpx
from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.testclient import TestClient
from redaction_api import router, _ai_endpoint



class TestPrivacyAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        def auth(x_api_token: str = Header(default='', alias='X-API-Token')):
            if x_api_token != 'test-local-token':
                raise HTTPException(status_code=401)
        app.include_router(router, dependencies=[Depends(auth)])
        cls.client = TestClient(app)
        cls.headers = {'X-API-Token': 'test-local-token'}

    def test_http_redact_restore_roundtrip(self):
        source = '手机号：13800138000；联系人张三。'
        payload = {'content': source, 'options': {'keywords': ['张三']}, 'passphrase': 'a valid vault key'}
        response = self.client.post('/api/redact', json=payload, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        masked = response.json()
        self.assertNotIn('13800138000', masked['content'])
        self.assertNotIn('张三', masked['content'])
        result = self.client.post('/api/restore', json={
            'content': masked['content'], 'vaults': [masked['vault']], 'passphrase': 'a valid vault key'
        }, headers=self.headers)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['content'], source)

    def test_local_auth_required(self):
        r = self.client.post('/api/redact', json={'content': '13800138000', 'passphrase': 'passphrase'})
        self.assertEqual(r.status_code, 401)

    def test_invalid_passphrase(self):
        r = self.client.post('/api/redact', headers=self.headers, json={'content': '13800138000', 'passphrase': 'short'})
        self.assertEqual(r.status_code, 400)

    def test_external_ai_requires_explicit_consent(self):
        r = self.client.post('/api/ai/suggest', headers=self.headers, json={
            'redactedText': 'Anonymous text', 'consent': False,
            'baseUrl': 'https://example.org/v1', 'model': 'test-model', 'apiKey': 'test'
        })
        self.assertEqual(r.status_code, 400)

    def test_external_ai_receives_only_redacted_text_in_model_request(self):
        payload = {
            'redactedText': 'Person 【MAD_abcd_PERSON_0001】',
            'consent': True, 'baseUrl': 'https://example.org/v1',
            'model': 'test-model', 'apiKey': 'fake-key',
        }
        with patch('redaction_api._call_ai', return_value=[{'text': 'Person', 'category': 'other'}]) as mock:
            r = self.client.post('/api/ai/suggest', headers=self.headers, json=payload)
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(mock.call_args.args[-1], payload['redactedText'])
            self.assertEqual(mock.call_args.args[0], 'https://example.org/v1/chat/completions')

    def test_ai_http_nonlocal_is_blocked(self):
        with self.assertRaises(ValueError):
            _ai_endpoint('http://thirdparty.example/v1')

    def test_ai_local_http_is_allowed(self):
        self.assertEqual(_ai_endpoint('http://127.0.0.1:1234/v1'),
                         'http://127.0.0.1:1234/v1/chat/completions')

if __name__ == '__main__':
    unittest.main()
