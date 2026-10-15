#!/usr/bin/env python3
"""Compare fresh 1/2/4-worker runs on synthetic text, scanned and mixed PDFs."""
import argparse
import asyncio
import io
import json
import os
from pathlib import Path
import platform
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import psutil
from pdf_jobs import PdfJobs
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont

class Client:
    async def is_disconnected(self): return False

def fixtures():
    paths=['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','C:/Windows/Fonts/arial.ttf','/System/Library/Fonts/Supplemental/Arial.ttf']
    font=next((ImageFont.truetype(path,52) for path in paths if Path(path).exists()),ImageFont.load_default(size=52))
    image=Image.new('RGB',(1400,500),'white');ImageDraw.Draw(image).text((60,160),'Phone 13800138000',font=font,fill='black')
    result={}
    for kind in ('text','scan','mixed'):
        raw=io.BytesIO();canvas=Canvas(raw)
        if kind in ('text','mixed'):
            for index in range(8 if kind=='text' else 1):
                canvas.drawString(40,800,f'Synthetic contract page {index+1}: Phone 13800138000 amount 125000.50');canvas.showPage()
        if kind in ('scan','mixed'):
            canvas.drawImage(ImageReader(image),30,400,width=540,height=193);canvas.showPage()
        canvas.save();result[kind]=raw.getvalue()
    return result

async def measure(content, concurrency, count):
    jobs=PdfJobs(); started=time.perf_counter();peak=0;rss_available=True
    tasks=[asyncio.create_task(jobs.convert(content,Client(),str(index),'benchmark.pdf',concurrency)) for index in range(count)]
    try:
        while not all(task.done() for task in tasks):
            memory=0
            try: children=psutil.Process().children(recursive=True)
            except (psutil.NoSuchProcess,psutil.AccessDenied): children=[];rss_available=False
            for process in children:
                try: memory+=process.memory_info().rss
                except (psutil.NoSuchProcess,psutil.AccessDenied): pass
            peak=max(peak,memory);await asyncio.sleep(.05)
        values=await asyncio.gather(*tasks)
        assert all('13800138000' in text for text,_ in values), 'Converted content lost expected text'
        return {'concurrency':concurrency,'files':count,'seconds':round(time.perf_counter()-started,3),'peakWorkerRssMB':round(peak/1024**2,1) if rss_available else None}
    finally:
        await jobs.close()
        await asyncio.gather(*tasks,return_exceptions=True)

async def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='queue-benchmark.json');parser.add_argument('--files',type=int,default=4);args=parser.parse_args()
    report={'platform':platform.platform(),'cpuCount':os.cpu_count(),'memoryGB':round(psutil.virtual_memory().total/1024**3,1),'syntheticOnly':True,'note':'Single fresh run per scenario; includes worker/model startup, not a universal speedup claim.','results':{}}
    for kind,content in fixtures().items():
        report['results'][kind]=[]
        for concurrency in (1,2,4):
            result=await measure(content,concurrency,args.files);report['results'][kind].append(result);print(kind,json.dumps(result),flush=True)
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':asyncio.run(main())
