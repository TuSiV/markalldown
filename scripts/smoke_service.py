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
import sys
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
    plain = convert('synthetic.md', '# 中文合同\nPhone 13800138000'.encode('utf-8'))
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
    source=request(port,token,'text?'+urlencode({'path':plain['cachePath']}))['content']
    assert '13800138000' in source
    with tempfile.TemporaryDirectory() as directory:
        for fmt in ['individual','combined','zip']:
            body={'files':[{'name':'synthetic.md','cachePath':plain['cachePath'],'content':'Truncated preview'}],
                  'options':{'exportPath':directory,'format':fmt,'structure':'flat','preserveNames':True}}
            if fmt=='zip':
                payload=json.dumps(body).encode()
                with urlopen(Request(f'http://127.0.0.1:{port}/api/export',data=payload,
                    headers={'X-API-Token':token,'Content-Type':'application/json'}),timeout=60) as response:
                    with zipfile.ZipFile(io.BytesIO(response.read())) as z:
                        text=z.read('synthetic.md').decode('utf-8')
            else:
                out=request(port,token,'export',body)
                path=Path(out['path'])/'synthetic.md' if fmt=='individual' else Path(out['path'])
                text=path.read_text(encoding='utf-8')
            assert source in text, 'Export did not use full cached source'
        try:request(port,token,'text?'+urlencode({'path':plain['cachePath']}),auth=False)
        except HTTPError as e:assert e.code==401
        else:raise AssertionError('Missing authentication accepted')
    print('Main service: conversion, OCR, cache, all export modes and authentication passed')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('binary',nargs='?');parser.add_argument('--source',action='store_true');args=parser.parse_args()
    if not args.source and not args.binary:parser.error('binary is required unless --source')
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    token=secrets.token_urlsafe(32)
    env=os.environ.copy()
    env['PATH']=str(Path(env.get('SystemRoot','C:/Windows'))/'System32') if os.name=='nt' else '/usr/bin:/bin'
    command=[sys.executable,str(Path(__file__).resolve().parents[1]/'backend/server.py')] if args.source else [str(Path(args.binary).resolve())]
    proc=subprocess.Popen(command+['--port',str(port),'--token='+token],env=env)
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
