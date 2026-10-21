"""Portable encrypted recovery manifests and an opt-in local ciphertext library."""
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import time
from uuid import uuid4

from redaction import (IDENTITY_PATTERN, decrypt_document, decrypt_mapping,
                       open_payload, restore_markdown, seal_payload, MAX_RECOVERY_TEXT, TOKEN_PATTERN, SHORT_TOKEN)

FORMAT = 'MarkAllDownEncryptedVaultPack'
UUID = re.compile(r'[a-f0-9]{32}')
HASH = re.compile(r'[a-f0-9]{64}')
PROCESSING_PATTERN = re.compile(r'【MAD_([a-f0-9]{12}|[a-f0-9]{32})_')
def short_refs(text):
    return {'short:' + m.group().split('_')[1] for m in re.finditer(SHORT_TOKEN, text)}


MAX_PACK_BYTES = 10_000_000


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def valid_id(value):
    return isinstance(value, str) and UUID.fullmatch(value) is not None


def documents_from_vaults(vaults, password):
    if not isinstance(vaults, list) or not 1 <= len(vaults) <= 100:
        raise ValueError('Provide 1 to 100 document mappings')
    documents = [decrypt_document(vault, password) for vault in vaults]
    ids = [d['processingId'] for d in documents]
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate processing identities')
    owners = {}
    for document in documents:
        for token in document['mapping']:
            if token in owners:
                raise ValueError('Conflicting document placeholders; redact the files again')
            owners[token] = document['processingId']
    return documents


def build_pack(vaults, password, exports=None, pack_id=None):
    documents = documents_from_vaults(vaults, password)
    refs = [{'documentId':d['documentId'], 'processingId':d['processingId']} for d in documents]
    manifest = {'packId':pack_id or uuid4().hex,
                'documents':[{k:d[k] for k in ('documentId','processingId','sourceHash','redactedHash')} for d in documents],
                'exports':exports or []}
    return {'format':FORMAT, 'version':2, 'packId':manifest['packId'], 'refs':refs,
            'vaults':vaults, 'manifest':seal_payload(manifest,password,'MAD-M1')}


def validate_pack(pack, password):
    if not isinstance(pack, dict) or pack.get('format') != FORMAT or pack.get('version') not in (1,2):
        raise ValueError('Invalid recovery pack')
    vaults = pack.get('vaults')
    if not isinstance(vaults, list) or not 1 <= len(vaults) <= 100:
        raise ValueError('Provide 1 to 100 mappings')
    if pack['version'] == 1:
        refs = []
        for vault in vaults:
            mapping = decrypt_mapping(vault,password)
            refs.extend({'documentId':'', 'processingId':p} for p in sorted(set(PROCESSING_PATTERN.findall(' '.join(mapping))) | short_refs(' '.join(mapping))))
        if len({r['processingId'] for r in refs})>100:
            raise ValueError('Too many document identities in the legacy pack')
        return {'documents':[], 'exports':[], 'refs':refs, 'vaults':vaults, 'legacy':True}
    documents = documents_from_vaults(vaults,password)
    manifest = open_payload(pack.get('manifest'),password,'MAD-M1')
    if not valid_id(pack.get('packId')) or manifest.get('packId') != pack['packId']:
        raise ValueError('Recovery pack identity mismatch')
    expected = [{k:d[k] for k in ('documentId','processingId','sourceHash','redactedHash')} for d in documents]
    refs = [{k:d[k] for k in ('documentId','processingId')} for d in documents]
    if manifest.get('documents') != expected or pack.get('refs') != refs:
        raise ValueError('Recovery document manifest mismatch')
    exports = manifest.get('exports')
    if not isinstance(exports,list) or len(exports) > 100:
        raise ValueError('Invalid export manifest')
    known = {d['processingId']:d['documentId'] for d in documents}
    for record in exports:
        if not isinstance(record,dict) or not valid_id(record.get('exportId')) or not isinstance(record.get('contentHash'),str) or not HASH.fullmatch(record['contentHash']):
            raise ValueError('Invalid export identity or hash')
        pids,dids=record.get('processingIds'),record.get('documentIds')
        if not isinstance(pids,list) or not pids or len(pids)>100 or len(set(pids)) != len(pids) or any(not isinstance(p,str) or p not in known for p in pids):
            raise ValueError('Unknown export document identity')
        if dids != [known[p] for p in pids]:
            raise ValueError('Export document manifest mismatch')
        if record.get('kind') not in ('document','combined') or not isinstance(record.get('name'),str) or len(record['name'])>4096:
            raise ValueError('Invalid export name')
    return {'documents':documents,'exports':exports,'refs':refs,'vaults':vaults,'legacy':False}


def export_record(name, content, kind="document"):
    refs = list(dict.fromkeys(IDENTITY_PATTERN.findall(content)))
    if not refs:
        raise ValueError('Export is missing document identities')
    return {'exportId':uuid4().hex, 'name':name, 'kind':kind, 'contentHash':digest(content),
            'documentIds':[r[0] for r in refs], 'processingIds':[r[1] for r in refs]}


def preview_recovery(content, pack, password):
    if not isinstance(content,str) or len(content)>MAX_RECOVERY_TEXT:
        raise ValueError('Recovery text exceeds size limit')
    data = validate_pack(pack,password)
    if data['legacy']:
        restored,count = restore_markdown(content,data['vaults'],password)
        return {'content':restored,'restored':count,'integrity':'legacy','originalMatch':None,'documentIds':[], 'processingIds':[]}
    headers = IDENTITY_PATTERN.findall(content)
    pids = set(PROCESSING_PATTERN.findall(content)) | {p for _,p in headers}
    known = {d['processingId']:d for d in data['documents']}
    owners = {token:d['processingId'] for d in data['documents'] for token in d['mapping']}
    pids.update(owners[m.group()] for m in TOKEN_PATTERN.finditer(content) if m.group() in owners)
    if not pids or not pids.issubset(known):
        raise ValueError('Cannot identify this document with the provided recovery pack')
    if any(known[p]['documentId']!=d for d,p in headers):
        raise ValueError('Document identity does not match recovery pack')
    selected = [v for v,d in zip(data['vaults'],data['documents']) if d['processingId'] in pids]
    restored,count = restore_markdown(content,selected,password)
    exact = any(record['contentHash']==digest(content) and set(record['processingIds'])==pids for record in data['exports'])
    original_match = digest(restored)==known[next(iter(pids))]['sourceHash'] if len(pids)==1 else None
    # Combined exports add headings/separators; their full-file hash is authenticated
    # by the export manifest instead of comparing with one document's source hash.
    if exact and len(pids)==1 and not original_match:
        record=next(r for r in data['exports'] if r['contentHash']==digest(content) and set(r['processingIds'])==pids)
        if record['kind']=='document':
            raise ValueError('Exact recovery did not match the original document hash')
    return {'content':restored,'restored':count,'integrity':'exact' if exact else 'edited','originalMatch':original_match,
            'documentIds':list(dict.fromkeys(known[p]['documentId'] for p in sorted(pids))), 'processingIds':sorted(pids)}


class RecoveryLibrary:
    """Only encrypted packs, random IDs and timestamps persist; no passwords/source."""
    def __init__(self, root=None):
        self.root=Path(root or os.environ.get('MAD_RECOVERY_LIBRARY_DIR') or
                       Path(os.environ.get('LOCALAPPDATA') or Path.home())/'com.markalldown.app'/'recovery-library')

    def connect(self):
        if self.root.is_symlink():
            raise ValueError('Recovery library directory must not be a symbolic link')
        self.root.mkdir(parents=True,exist_ok=True,mode=0o700)
        os.chmod(self.root,0o700)
        path=self.root/'library.sqlite3'
        if path.is_symlink():
            raise ValueError('Recovery library database must not be a symbolic link')
        db=sqlite3.connect(path,timeout=10)
        os.chmod(path,0o600)
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('CREATE TABLE IF NOT EXISTS packs (id TEXT PRIMARY KEY, saved REAL NOT NULL, documents INTEGER NOT NULL, legacy INTEGER NOT NULL, data TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS refs (pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE, processing_id TEXT NOT NULL, PRIMARY KEY(pack_id, processing_id))')
        return db

    def save(self, pack, password):
        data=validate_pack(pack,password)
        stored=dict(pack)
        pack_id=stored.get('packId') or hashlib.sha256(json.dumps(pack,sort_keys=True,separators=(',',':')).encode('utf-8')).hexdigest()[:32]
        if not valid_id(pack_id):raise ValueError('Invalid recovery pack ID')
        stored['packId']=pack_id
        raw=json.dumps(stored,ensure_ascii=False,sort_keys=True,separators=(',',':'))
        if len(raw.encode('utf-8'))>MAX_PACK_BYTES:raise ValueError('Recovery pack exceeds library size limit')
        db=self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            with db:
                row=db.execute('SELECT data FROM packs WHERE id=?',(pack_id,)).fetchone()
                if row:
                    if row[0]!=raw:raise ValueError('A different recovery pack already uses this ID')
                    return pack_id
                if db.execute('SELECT COUNT(*) FROM packs').fetchone()[0]>=1000:
                    raise ValueError('Recovery library is full; remove old packs first')
                db.execute('INSERT INTO packs VALUES (?,?,?,?,?)',(pack_id,time.time(),len(pack['vaults']),int(data['legacy']),raw))
                refs = {r['processingId'] for r in data['refs']}
                for document in data['documents']:
                    refs.update(short_refs(' '.join(document['mapping'])))
                db.executemany('INSERT OR IGNORE INTO refs VALUES (?,?)',[(pack_id,p) for p in refs])
            return pack_id
        finally:db.close()

    def list(self):
        db=self.connect()
        try:
            return [{'packId':r[0],'savedAt':r[1],'documents':r[2],'legacy':bool(r[3])} for r in db.execute('SELECT id,saved,documents,legacy FROM packs ORDER BY saved DESC LIMIT 1000')]
        finally:db.close()

    def load(self, pack_id):
        if not valid_id(pack_id):raise ValueError('Invalid recovery pack ID')
        db=self.connect()
        try:row=db.execute('SELECT data FROM packs WHERE id=?',(pack_id,)).fetchone()
        finally:db.close()
        if not row:raise ValueError('Recovery pack is not in the local library')
        return json.loads(row[0])

    def find(self, content):
        if not isinstance(content,str) or len(content)>MAX_RECOVERY_TEXT:raise ValueError('Invalid recovery text')
        headers = IDENTITY_PATTERN.findall(content)
        pids=set(PROCESSING_PATTERN.findall(content)) | {p for _,p in headers}
        if not headers:
            pids.update(short_refs(content))
        if not pids or len(pids)>100:return []
        db=self.connect()
        try:
            marks=','.join('?' for _ in pids)
            rows=db.execute(f'SELECT pack_id FROM refs WHERE processing_id IN ({marks}) GROUP BY pack_id HAVING COUNT(DISTINCT processing_id)=?',(*sorted(pids),len(pids))).fetchall()
            matched={r[0] for r in rows}
        finally:db.close()
        return [p for p in self.list() if p['packId'] in matched]

    def delete(self, pack_id):
        if not valid_id(pack_id):raise ValueError('Invalid recovery pack ID')
        db=self.connect()
        try:
            with db:db.execute('DELETE FROM packs WHERE id=?',(pack_id,))
        finally:db.close()
