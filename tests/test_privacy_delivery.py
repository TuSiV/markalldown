import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.testclient import TestClient
from redaction import redact_markdown, encrypt_mapping, restore_markdown
from redaction_api import router
from exporter import Exporter, ExportOptions

class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        app = FastAPI()
        def auth(x_api_token: str = Header(default='')):
            if x_api_token != 'secret': raise HTTPException(401)
        app.include_router(router, dependencies=[Depends(auth)])
        self.client = TestClient(app)
        self.headers = {'X-API-Token': 'secret'}
    def payload(self, fmt='individual', sources=None):
        sources = sources or ['# 张三\n13800138000\n| 邮箱 | abc@example.com |', '张三合同 13900139000']
        files, vaults = [], []
        for i, source in enumerate(sources):
            redacted = self.client.post('/api/redact', headers=self.headers, json={
                'content':source, 'options':{'keywords':['张三']}, 'passphrase':'a secure passphrase'}).json()
            files.append({'name':f'document_{i+1:04d}.md', 'relativePath':f'document_{i+1:04d}.md',
                'content':redacted['content'], 'sourceHash':redacted['sourceHash'], 'reviewed':True})
            vaults.append(redacted['vault'])
        return {'files': files, 'pack': {'format':'MarkAllDownEncryptedVaultPack','version':1,'vaults':vaults},
            'passphrase':'a secure passphrase', 'options':{'exportPath':str(self.root),'format':fmt,'structure':'flat'}}, sources
    def deliver(self, body):
        return self.client.post('/api/privacy/export', headers=self.headers, json=body)
    def test_individual_exact_restore_and_vault_saved_outside(self):
        body, sources = self.payload()
        response = self.deliver(body)
        self.assertEqual(response.status_code,200,response.text)
        result = response.json()
        pack = json.loads(Path(result['vaultPath']).read_text())
        self.assertNotIn('13800138000', Path(result['vaultPath']).read_text())
        self.assertNotEqual(Path(result['vaultPath']).parent, Path(result['path']))
        if os.name == 'posix': self.assertEqual(Path(result['vaultPath']).stat().st_mode & 0o777,0o600)
        for i, source in enumerate(sources):
            md = Path(result['path']) / f'document_{i+1:04d}.md'
            self.assertEqual(restore_markdown(md.read_text(),[pack['vaults'][i]],body['passphrase'])[0],source)
    def test_combined_restores_both_documents(self):
        body,sources = self.payload('combined')
        response = self.deliver(body)
        self.assertEqual(response.status_code,200,response.text)
        restored = restore_markdown(Path(response.json()['path']).read_text(),body['pack']['vaults'],body['passphrase'])[0]
        self.assertEqual(restored,'\n'.join(f'# document_{i+1:04d}.md\n\n{source}\n\n---\n' for i,source in enumerate(sources)))
    def test_zip_contains_no_vault_and_exact_restore(self):
        body,sources = self.payload('zip')
        response = self.deliver(body)
        self.assertEqual(response.status_code,200,response.text)
        with zipfile.ZipFile(response.json()['path']) as z:
            self.assertEqual(z.namelist(),['document_0001.md','document_0002.md'])
            for i, name in enumerate(z.namelist()):
                self.assertEqual(restore_markdown(z.read(name).decode(),[body['pack']['vaults'][i]],body['passphrase'])[0],sources[i])
    def test_unreviewed_batch_blocked_before_any_write(self):
        body,_ = self.payload(); body['files'][1]['reviewed']=False
        self.assertEqual(self.deliver(body).status_code,400)
        self.assertEqual(list(self.root.iterdir()),[])
    def test_modified_text_fails_recovery_integrity(self):
        body,_ = self.payload(); body['files'][0]['content']+=' altered'
        self.assertEqual(self.deliver(body).status_code,400)
        self.assertEqual(list(self.root.iterdir()),[])
    def test_wrong_password_no_output(self):
        body,_=self.payload(); body['passphrase']='wrong password'
        self.assertEqual(self.deliver(body).status_code,400)
        self.assertEqual(list(self.root.iterdir()),[])
    def test_save_failure_never_exports(self):
        body,_ = self.payload()
        with patch('redaction_api._save_private_text',side_effect=OSError('disk full')), patch('redaction_api.exporter.export') as export:
            self.assertEqual(self.deliver(body).status_code,500)
            export.assert_not_called()
    def test_export_failure_retains_vault_without_shareable_partial_output(self):
        body,_=self.payload()
        with patch('redaction_api.exporter.export',side_effect=OSError('disk full')):
            self.assertEqual(self.deliver(body).status_code,500)
        self.assertEqual(len(list(self.root.glob('recovery-*.json'))),1)
        self.assertEqual(len(list(self.root.glob('redacted-*'))),0)
        self.assertEqual(len(list(self.root.glob('.redaction-*'))),0)
    def test_auth_required_for_new_export(self):
        body,_ = self.payload()
        self.assertEqual(self.client.post('/api/privacy/export',json=body).status_code,401)
    def test_invalid_category_type_returns_400(self):
        r = self.client.post('/api/redact',headers=self.headers,json={'content':'abc','passphrase':'password','options':{'categories':[{}]}})
        self.assertEqual(r.status_code,400)
    def test_empty_mapping_does_not_hide_unknown_tokens(self):
        with self.assertRaises(ValueError): restore_markdown('【MAD_foreign_PHONE_0001】',[encrypt_mapping({},'password')],'password')
    def test_full_findings_not_truncated(self):
        text=' '.join(f'person{i:04d}' for i in range(250))
        _,_,summary = redact_markdown(text,{'categories':[],'keywords':[f'person{i:04d}' for i in range(250)]})
        self.assertEqual(len(summary['findings']),250)
    def test_match_limit_fails_instead_of_partial_masking(self):
        with self.assertRaises(ValueError): redact_markdown('13800138000 '*20001,{})
    def test_bad_export_path_rejected(self):
        for path in ('../outside.md','C:/outside.md','/outside.md','folder/CON.md','folder/x\n.md'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                Exporter().export([{'name':path,'content':'test'}],str(self.root),ExportOptions())
    def test_export_symlink_cannot_escape_destination(self):
        if os.name != 'posix': self.skipTest('POSIX symlink test')
        with tempfile.TemporaryDirectory() as other:
            (self.root/'linked').symlink_to(other,target_is_directory=True)
            with self.assertRaises(ValueError): Exporter().export([{'name':'linked/out.md','content':'test'}],str(self.root),ExportOptions(structure='preserve'))
            self.assertEqual(list(Path(other).iterdir()),[])
    def test_zip_duplicate_names_are_unique(self):
        result=Exporter().export([{'name':'same.txt','content':'a'},{'name':'same.txt','content':'b'}],str(self.root),ExportOptions(format='zip'))
        with zipfile.ZipFile(result) as z: self.assertEqual(z.namelist(),['same.md','same_1.md'])
    def test_ordinary_export_preserves_content(self):
        source='# Original\r\nPhone 13800138000\r\n'
        Exporter().export([{'name':'original.txt','content':source}],str(self.root),ExportOptions())
        self.assertEqual((self.root/'original.md').read_bytes(),source.encode())
    def test_zero_findings_export_restores(self):
        body,_ = self.payload(sources=['# Nothing sensitive'])
        self.assertEqual(self.deliver(body).status_code,200)
