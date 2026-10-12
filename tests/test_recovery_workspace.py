"""Acceptance of portable identities, authenticated exports and optional storage."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch
from uuid import uuid4
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from fastapi import FastAPI,Depends,Header,HTTPException
from fastapi.testclient import TestClient
from redaction_api import router, _save_private_text
from recovery import RecoveryLibrary,preview_recovery,validate_pack
from redaction import redact_markdown,encrypt_mapping

class RecoveryWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.env=patch.dict(os.environ,{'MAD_RECOVERY_LIBRARY_DIR':str(self.root/'library')});self.env.start();self.addCleanup(self.env.stop)
        app=FastAPI()
        def auth(x_api_token:str=Header(default='')):
            if x_api_token!='secret':raise HTTPException(401)
        app.include_router(router,dependencies=[Depends(auth)])
        self.client=TestClient(app);self.headers={'X-API-Token':'secret'};self.password='secure test password'
    def post(self,route,body):return self.client.post('/api/'+route,json=body,headers=self.headers)
    def redact(self,source,doc_id=None):
        body={'content':source,'passphrase':self.password,'options':{}}
        if doc_id:body['documentId']=doc_id
        r=self.post('redact',body);self.assertEqual(r.status_code,200,r.text);return r.json()
    def export(self,source='# Contract\n13800138000',fmt='individual',keep=False):
        sources=source if isinstance(source,list) else [source]
        results=[self.redact(s) for s in sources]
        body={'files':[{'name':f'document_{i+1:04d}.md','content':r['content'],'sourceHash':r['sourceHash'],'reviewed':True} for i,r in enumerate(results)],
              'pack':{'format':'MarkAllDownEncryptedVaultPack','version':2,'vaults':[r['vault'] for r in results]},'passphrase':self.password,
              'options':{'exportPath':str(self.root),'format':fmt,'structure':'flat'},'saveToLibrary':keep}
        response=self.post('privacy/export',body);self.assertEqual(response.status_code,200,response.text)
        out=response.json();pack=json.loads(Path(out['vaultPath']).read_bytes())
        if fmt=='individual':content=(Path(out['path'])/'document_0001.md').read_bytes().decode('utf-8')
        elif fmt=='combined':content=Path(out['path']).read_bytes().decode('utf-8')
        else:
            with zipfile.ZipFile(out['path']) as z:content=z.read('document_0001.md').decode('utf-8')
        return content,pack,out,results
    def preview(self,content,pack,**extra):
        return self.post('recovery/preview',{'content':content,'pack':pack,'passphrase':self.password,**extra})
    def test_original_names_preserved_in_individual_and_zip_exports(self):
        source='报告 13800138000'
        for fmt in ('individual','zip'):
            with self.subTest(fmt=fmt):
                r=self.redact(source)
                body={'files':[{'name':'案件报告.md','relativePath':'资料/案件报告.md','content':r['content'],'sourceHash':r['sourceHash'],'reviewed':True}],
                      'pack':{'format':'MarkAllDownEncryptedVaultPack','version':2,'vaults':[r['vault']]},'passphrase':self.password,
                      'options':{'exportPath':str(self.root),'format':fmt,'structure':'preserve'}}
                response=self.post('privacy/export',body);self.assertEqual(response.status_code,200,response.text)
                out=response.json();pack=json.loads(Path(out['vaultPath']).read_bytes())
                if fmt=='individual':content=(Path(out['path'])/'资料'/'案件报告.md').read_bytes().decode('utf-8')
                else:
                    with zipfile.ZipFile(out['path']) as z:
                        self.assertEqual(z.namelist(),['资料/案件报告.md']);content=z.read('资料/案件报告.md').decode('utf-8')
                restored=self.preview(content,pack);self.assertEqual(restored.status_code,200,restored.text)
                self.assertEqual(restored.json()['content'],source);self.assertEqual(restored.json()['integrity'],'exact')
    def test_doc_identity_stable_and_processing_changes(self):
        identity=uuid4().hex
        a=self.redact('13800138000',identity);b=self.redact('13800138000',identity)
        self.assertEqual(a['documentId'],b['documentId']);self.assertNotEqual(a['processingId'],b['processingId'])
        self.assertIn(a['processingId'],a['content']);self.assertNotIn('13800138000',json.dumps(a['vault']))
    def test_renamed_and_copied_file_exact_without_conversion_state(self):
        source='# Example\r\n13800138000\r\n'
        content,pack,_,_=self.export(source)
        renamed=self.root/'copied-and-renamed.md';renamed.write_bytes(content.encode())
        result=self.preview(renamed.read_bytes().decode(),pack)
        self.assertEqual(result.status_code,200,result.text);self.assertEqual(result.json()['integrity'],'exact');self.assertEqual(result.json()['content'],source)
        self.assertTrue(result.json()['originalMatch'])
    def test_combined_and_zip_manifest_and_original_recovery(self):
        for fmt in ['combined','zip']:
            with self.subTest(fmt=fmt):
                content,pack,_,_=self.export(['A 13800138000','B 13900139000'],fmt)
                manifest=validate_pack(pack,self.password)
                self.assertEqual(len(manifest['exports']),1 if fmt=='combined' else 2)
                response=self.preview(content,pack);self.assertEqual(response.status_code,200,response.text)
                self.assertEqual(response.json()['integrity'],'exact');self.assertIn('A 13800138000',response.json()['content'])
                if fmt=='combined':self.assertIn('B 13900139000',response.json()['content'])
    def test_single_combined_export_not_mistaken_for_source_hash(self):
        content,pack,_,_=self.export('13800138000','combined')
        result=self.preview(content,pack);self.assertEqual(result.status_code,200,result.text);self.assertEqual(result.json()['integrity'],'exact')
        self.assertFalse(result.json()['originalMatch'])
    def test_edit_requires_acknowledgement_and_does_not_overwrite(self):
        content,pack,_,_=self.export()
        modified=content+'\nEdited paragraph'
        preview=self.preview(modified,pack);self.assertEqual(preview.json()['integrity'],'edited');self.assertIn('Edited paragraph',preview.json()['content'])
        dest=self.root/'restored.md'
        body={'content':modified,'pack':pack,'passphrase':self.password,'path':str(dest),'reviewed':True}
        self.assertEqual(self.post('recovery/save',body).status_code,400);self.assertFalse(dest.exists())
        body['allowEdited']=True;self.assertEqual(self.post('recovery/save',body).status_code,200)
        self.assertEqual(self.post('recovery/save',body).status_code,409)
        self.assertIn('13800138000',dest.read_text())
    def test_missing_header_fragment_restores_known_tokens_with_warning(self):
        content,pack,_,_=self.export()
        result=self.preview(content.split('\n',1)[1],pack)
        self.assertEqual(result.status_code,200,result.text);self.assertEqual(result.json()['integrity'],'edited')
    def test_zero_findings_and_empty_excerpt_keep_identity(self):
        content,pack,_,_=self.export('No sensitive values')
        self.assertEqual(self.preview(content,pack).json()['integrity'],'exact')
        content2,pack2,_,_=self.export('13800138000')
        header=content2.split('\n',1)[0]+'\nOnly an excerpt'
        result=self.preview(header,pack2);self.assertEqual(result.status_code,200,result.text);self.assertEqual(result.json()['restored'],0);self.assertEqual(result.json()['integrity'],'edited')
    def test_authenticated_manifest_and_public_refs_tampering_rejected(self):
        content,pack,_,_=self.export()
        for field in ['refs','manifest','packId']:
            bad=json.loads(json.dumps(pack))
            if field=='refs':bad['refs'][0]['documentId']=uuid4().hex
            elif field=='packId':bad['packId']=uuid4().hex
            else:bad['manifest']['data']='AAAA'
            self.assertEqual(self.preview(content,bad).status_code,400)
        wrong=content.replace(pack['refs'][0]['documentId'],uuid4().hex)
        self.assertEqual(self.preview(wrong,pack).status_code,400)
    def test_wrong_pack_and_password_rejected(self):
        content,_,_,_=self.export()
        _,other,_,_=self.export('13900139000')
        self.assertEqual(self.preview(content,other).status_code,400)
        self.assertEqual(self.preview(content,other,passphrase='wrong password').status_code,400)
    def test_legacy_pack_preview_and_confirmed_save(self):
        masked,mapping,_=redact_markdown('Phone 13800138000',{})
        pack={'format':'MarkAllDownEncryptedVaultPack','version':1,'vaults':[encrypt_mapping(mapping,self.password)]}
        result=self.preview(masked,pack);self.assertEqual(result.json()['integrity'],'legacy');self.assertEqual(result.json()['content'],'Phone 13800138000')
        dest=self.root/'legacy.md';body={'content':masked,'pack':pack,'passphrase':self.password,'path':str(dest),'reviewed':True}
        self.assertEqual(self.post('recovery/save',body).status_code,400)
        body['allowEdited']=True;self.assertEqual(self.post('recovery/save',body).status_code,200)
        a=self.post('recovery/library/save',{'pack':pack,'passphrase':self.password}).json()['packId']
        b=self.post('recovery/library/save',{'pack':pack,'passphrase':self.password}).json()['packId'];self.assertEqual(a,b)
        self.assertEqual(self.post('recovery/library/find',{'content':masked}).json()['packs'][0]['packId'],a)
    def test_library_opt_in_persists_only_ciphertext_and_matches_ids(self):
        content,pack,out,_=self.export('PRIVATE_COMPANY 13800138000')
        self.assertIsNone(out['libraryPackId']);self.assertEqual(RecoveryLibrary().list(),[])
        content,pack,out,_=self.export('PRIVATE_COMPANY 13800138000',keep=True)
        pack_id=out['libraryPackId'];self.assertEqual(pack_id,pack['packId'])
        # A new instance/connection simulates app restart with no conversion state.
        self.assertEqual(RecoveryLibrary().load(pack_id),pack)
        matches=self.post('recovery/library/find',{'content':content}).json()['packs'];self.assertEqual(matches[0]['packId'],pack_id)
        r=self.post('recovery/preview',{'content':content,'libraryPackId':pack_id,'passphrase':self.password})
        self.assertEqual(r.json()['integrity'],'exact')
        raw=(self.root/'library/library.sqlite3').read_bytes()
        for forbidden in [b'PRIVATE_COMPANY',b'13800138000',self.password.encode()]:self.assertNotIn(forbidden,raw)
        self.post('recovery/library/delete',{'packId':pack_id})
        self.assertEqual(RecoveryLibrary().list(),[]);self.assertEqual(RecoveryLibrary().find(content),[])
        self.assertEqual(self.post('recovery/preview',{'content':content,'libraryPackId':pack_id,'passphrase':self.password}).status_code,400)
    def test_library_rejects_tampered_pack_before_persistence(self):
        # Authenticated pack mutation is detected before library persistence.
        content,pack,_,_=self.export()
        bad=dict(pack);bad['packId']=uuid4().hex
        self.assertEqual(self.post('recovery/library/save',{'pack':bad,'passphrase':self.password}).status_code,400)
        self.assertEqual(RecoveryLibrary().list(),[])
    def test_routes_require_auth_and_library_paths_cannot_be_injected(self):
        for route in ['recovery/preview','recovery/save','recovery/library/list','recovery/library/find','recovery/library/save','recovery/library/delete']:
            self.assertEqual(self.client.post('/api/'+route,json={}).status_code,401)
        self.assertEqual(self.post('recovery/library/delete',{'packId':'../outside'}).status_code,400)
        if os.name=='posix':
            link=self.root/'link';link.symlink_to(self.root/'library',target_is_directory=True)
            with self.assertRaises(ValueError):RecoveryLibrary(link).list()
    def test_library_failure_aborts_export_before_publication(self):
        result=self.redact('13800138000')
        body={'files':[{'name':'doc.md','content':result['content'],'sourceHash':result['sourceHash'],'reviewed':True}],
              'pack':{'format':'MarkAllDownEncryptedVaultPack','version':2,'vaults':[result['vault']]},
              'passphrase':self.password,'options':{'exportPath':str(self.root),'format':'individual'},'saveToLibrary':True}
        with patch('redaction_api.RecoveryLibrary.save',side_effect=OSError('disk full')):
            self.assertEqual(self.post('privacy/export',body).status_code,500)
        self.assertEqual(list(self.root.glob('redacted-*')),[])
        self.assertEqual(len(list(self.root.glob('recovery-*.json'))),1)
        self.assertEqual(list(self.root.glob('.redaction-*')),[])
    def test_each_file_in_one_batch_recovers_separately(self):
        sources=['A 13800138000','B 13900139000']
        _,pack,out,_=self.export(sources)
        for i,source in enumerate(sources):
            content=(Path(out['path'])/f'document_{i+1:04d}.md').read_bytes().decode()
            result=self.preview(content,pack)
            self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(result.json()['content'],source)
            self.assertEqual(result.json()['integrity'],'exact')
    def test_existing_file_unchanged_and_crlf_save_exact(self):
        source='A\r\n13800138000\r\n';content,pack,_,_=self.export(source)
        existing=self.root/'input.md';existing.write_bytes(content.encode())
        body={'content':content,'pack':pack,'passphrase':self.password,'path':str(existing),'reviewed':True}
        self.assertEqual(self.post('recovery/save',body).status_code,409);self.assertEqual(existing.read_bytes(),content.encode())
        output=self.root/'new.md';body['path']=str(output)
        r=self.post('recovery/save',body);self.assertEqual(r.status_code,200,r.text);self.assertEqual(output.read_bytes(),source.encode())

    def test_yaml_front_matter_stays_at_start_and_restores_exactly(self):
        source='\ufeff---\ntitle: Contract\n---\n# Body\n13800138000\n'
        content,pack,_,_=self.export(source)
        self.assertTrue(content.startswith('\ufeff---\ntitle: Contract\n---\n<!-- MarkAllDown:'))
        response=self.preview(content,pack)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['content'],source)

    def test_recovery_expansion_limit_is_checked_before_allocating_output(self):
        token='【MAD_large_KEYWORD_0001】'
        pack={'format':'MarkAllDownEncryptedVaultPack','version':1,
              'vaults':[encrypt_mapping({token:'x'*1_000_000},self.password)]}
        result=self.preview(token*40,pack)
        self.assertEqual(result.status_code,400)
        self.assertIn('size limit',result.text)
    def test_failed_readback_removes_only_new_output(self):
        output=self.root/'failed.md'
        with patch('pathlib.Path.read_bytes',side_effect=OSError('read failed')):
            with self.assertRaises(OSError):_save_private_text(output,'test')
        self.assertFalse(output.exists())
        output.write_text('keep')
        with self.assertRaises(FileExistsError):_save_private_text(output,'new')
        self.assertEqual(output.read_text(),'keep')

if __name__=='__main__':unittest.main()
