"""Concurrent conversion requests and shared-engine isolation, using local fixtures."""
import asyncio
import sys
from pathlib import Path
import threading
import time
import tempfile
import zipfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
import httpx
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import server
from converter import Converter
from ocr import OcrEngine

class ConversionResponsiveness(unittest.IsolatedAsyncioTestCase):
    async def test_export_returns_real_paths_including_zip_and_collision_suffixes(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),base_url='http://test') as client:
            with tempfile.TemporaryDirectory() as directory:
                for fmt in ('individual','combined','zip','zip'):
                    r=await client.post('/api/export',headers={'X-API-Token':server.API_TOKEN},json={'returnPath':True,'files':[{'name':'report.md','content':'# Synthetic export'}],'options':{'format':fmt,'preserveNames':True,'structure':'flat','exportPath':directory}})
                    self.assertEqual(r.status_code,200,r.text)
                    path=Path(r.json()['path']);self.assertTrue(path.exists())
                    if fmt=='zip':
                        with zipfile.ZipFile(path) as z:self.assertEqual(z.read('report.md').decode(),'# Synthetic export')
                self.assertTrue(path.name.endswith('_1.zip'))
    async def test_two_conversions_do_not_block_health_or_each_other(self):
        lock=threading.Lock();started=threading.Event();release=threading.Event();active=0
        async def convert(content,request,job_id,filename,concurrency):
            nonlocal active
            with lock:
                active+=1
                if active==2:started.set()
            await asyncio.to_thread(release.wait, 3)
            return content.decode(), {'engine':'fixture', 'warnings':[]}
        transport=httpx.ASGITransport(app=server.app)
        async with httpx.AsyncClient(transport=transport,base_url='http://test') as client:
            with patch.object(server.pdf_jobs,'convert',side_effect=convert):
                tasks=[asyncio.create_task(client.post('/api/convert',headers={'X-API-Token':server.API_TOKEN},files={'file':(name,b'# Synthetic text')})) for name in ('one.md','two.md')]
                try:
                    self.assertTrue(await asyncio.to_thread(started.wait,2),'Conversions must overlap')
                    self.assertEqual((await asyncio.wait_for(client.get('/api/health'),1)).status_code,200)
                finally:release.set()
                responses=await asyncio.gather(*tasks)
                self.assertTrue(all(r.status_code==200 for r in responses))
                self.assertNotEqual(responses[0].json()['cachePath'],responses[1].json()['cachePath'])
                for r in responses:Path(r.json()['cachePath']).unlink(missing_ok=True)

class EngineIsolation(unittest.TestCase):
    def test_markdown_engine_is_local_to_each_worker(self):
        converter=Converter();barrier=threading.Barrier(2)
        def worker():
            md=converter.md;barrier.wait(2);return md,converter.md
        with patch('converter.prepare_onnx'), patch.dict(sys.modules, {'markitdown': SimpleNamespace(MarkItDown=Mock(side_effect=lambda **kw:object()))}):
            with ThreadPoolExecutor(max_workers=2) as pool:
                results=list(pool.map(lambda _:worker(),range(2)))
        self.assertIs(results[0][0],results[0][1]);self.assertIs(results[1][0],results[1][1]);self.assertIsNot(results[0][0],results[1][0])
    def test_shared_ocr_calls_are_serialized(self):
        engine=OcrEngine();active=0;peak=0
        def recognize(image):
            nonlocal active,peak
            active+=1;peak=max(peak,active);time.sleep(.02);active-=1
            return [[None,'Local fixture',1]],0
        engine._ocr=recognize
        with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(engine.ocr_image_file,['one.png','two.png']))
        self.assertEqual(peak,1);self.assertEqual(results,['Local fixture','Local fixture'])

