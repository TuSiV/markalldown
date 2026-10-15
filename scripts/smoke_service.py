#!/usr/bin/env python3
"""Exercise the packaged service over real HTTP, without Python on its PATH."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen
import zipfile

def request(port, token, route, data=None, auth=True):
    payload = None if data is None else json.dumps(data).encode()
    headers = {'Content-Type':'application/json'}
    if auth: headers['X-API-Token']=token
    with urlopen(Request(f'http://127.0.0.1:{port}/api/{route}',data=payload,headers=headers),timeout=60) as r:
        return json.load(r)

def exercise(port,token):
    from urllib.error import HTTPError
    # Real conversion through the frozen API, including bundled OCR models.
    from PIL import Image, ImageDraw, ImageFont
    def convert(name, raw):
        boundary = "smoke" + secrets.token_hex(12)
        payload = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()
                   + raw + f'\r\n--{boundary}--\r\n'.encode())
        with urlopen(Request(f'http://127.0.0.1:{port}/api/convert', data=payload, headers={
            'X-API-Token':token,'Content-Type':f'multipart/form-data; boundary={boundary}'}), timeout=120) as r:
            return json.load(r)
    for name,expected in [('sample.doc','Fixture Document'),('sample.ppt','Deck Title'),('chinese.doc','中文合同'),('chinese.ppt','中文合同汇报')]:
        fixture=Path(__file__).resolve().parents[1]/'tests/fixtures/local-engines'/name
        response=convert(name,fixture.read_bytes())
        from urllib.parse import urlencode
        content=request(port,token,'text?'+urlencode({'path':response['cachePath']}))['content']
        assert expected in content, 'Packaged anydoc lost expected text: '+name
        assert response['engine']=='anydoc' and response['warnings']
    plain = convert('synthetic.md', b'# Synthetic contract\nPhone 13800138000')
    assert plain.get('cachePath')
    image = Image.new('RGB',(1600,500),'white')
    fonts=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','C:/Windows/Fonts/arial.ttf','/System/Library/Fonts/Supplemental/Arial.ttf']
    font=next((ImageFont.truetype(f,64) for f in fonts if Path(f).exists()),ImageFont.load_default(size=64))
    ImageDraw.Draw(image).text((80,150),'Phone 13800138000',font=font,fill='black')
    png=io.BytesIO();image.save(png,format='PNG')
    scan=convert('synthetic-scan.png',png.getvalue())
    from urllib.parse import urlencode
    text=request(port,token,'text?'+urlencode({'path':scan['cachePath']}))['content']
    assert '13800138000' in text, 'Packaged OCR failed to read synthetic phone'
    with tempfile.TemporaryDirectory() as directory:
        source='# Synthetic contract\nPhone 13800138000. Email abc@example.com.\n'
        result=request(port,token,'redact',{'content':source,'options':{},'passphrase':'smoke-test-password'})
        assert '13800138000' not in result['content']
        for fmt in ['individual','combined','zip']:
            out=request(port,token,'privacy/export',{
                'files':[{'name':'document_0001.md','relativePath':'document_0001.md','content':result['content'],'sourceHash':result['sourceHash'],'reviewed':True}],
                'pack':{'format':'MarkAllDownEncryptedVaultPack','version':1,'vaults':[result['vault']]},
                'passphrase':'smoke-test-password','options':{'exportPath':directory,'format':fmt,'structure':'flat'}})
            assert Path(out['vaultPath']).is_file()
            if fmt=='individual': text=(Path(out['path'])/'document_0001.md').read_text(encoding="utf-8")
            elif fmt=='zip':
                with zipfile.ZipFile(out['path']) as z:text=z.read('document_0001.md').decode()
            else:text=Path(out['path']).read_text(encoding="utf-8")
            restored=request(port,token,'restore',{'content':text,'vaults':[result['vault']],'passphrase':'smoke-test-password'})['content']
            assert source in restored
        # Portable pack and independent recovery, including the bundled SQLite library.
        output=request(port,token,'privacy/export',{
            'files':[{'name':'portable.md','content':result['content'],'sourceHash':result['sourceHash'],'reviewed':True}],
            'pack':{'format':'MarkAllDownEncryptedVaultPack','version':2,'vaults':[result['vault']]},
            'passphrase':'smoke-test-password','saveToLibrary':True,
            'options':{'exportPath':directory,'format':'individual','structure':'flat'}})
        markdown=(Path(output['path'])/'portable.md').read_bytes().decode('utf-8')
        pack=json.loads(Path(output['vaultPath']).read_bytes())
        preview=request(port,token,'recovery/preview',{'content':markdown,'pack':pack,'passphrase':'smoke-test-password'})
        assert preview['integrity']=='exact' and preview['content']==source
        matches=request(port,token,'recovery/library/find',{'content':markdown})['packs']
        assert output['libraryPackId'] in [p['packId'] for p in matches]
        local=request(port,token,'recovery/preview',{'content':markdown,'libraryPackId':output['libraryPackId'],'passphrase':'smoke-test-password'})
        assert local['content']==source
        saved=Path(directory)/'restored-copy.md'
        request(port,token,'recovery/save',{'content':markdown,'pack':pack,'passphrase':'smoke-test-password','path':str(saved),'reviewed':True})
        assert saved.read_bytes()==source.encode('utf-8')
        request(port,token,'recovery/library/delete',{'packId':output['libraryPackId']})
        assert output['libraryPackId'] not in [p['packId'] for p in request(port,token,'recovery/library/list',{})['packs']]
        try: request(port,token,'redact',{'content':source},auth=False)
        except HTTPError as e: assert e.code==401
        else: raise AssertionError('Missing authentication accepted')
    print('Packaged service: conversion/OCR, redact/export/restore, portable pack and local library checks passed')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('binary');args=parser.parse_args()
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    token=secrets.token_urlsafe(32)
    env=os.environ.copy()
    env['PATH']=str(Path(env.get('SystemRoot','C:/Windows'))/'System32') if os.name=='nt' else '/usr/bin:/bin'
    proc=subprocess.Popen([str(Path(args.binary).resolve()),'--port',str(port),'--token='+token],env=env)
    try:
        deadline=time.monotonic()+120
        while time.monotonic()<deadline:
            if proc.poll() is not None:raise RuntimeError('Packaged service exited before startup')
            try:request(port,token,'health');break
            except Exception:time.sleep(0.5)
        else:raise RuntimeError('Packaged service did not become ready')
        exercise(port,token)
    finally:
        proc.terminate()
        try:proc.wait(timeout=15)
        except subprocess.TimeoutExpired:proc.kill();proc.wait()
if __name__=='__main__':main()
