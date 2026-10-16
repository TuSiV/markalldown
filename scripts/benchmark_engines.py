"""Reproducible local corpus benchmark. Synthetic data, no hosted OCR/AI."""
import argparse,json,statistics,subprocess,sys,time,threading,os
os.environ["ORT_DISABLE_TELEMETRY"] = "1"
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
def worker(engine,path):
 import psutil
 from converter import prepare_onnx
 prepare_onnx()
 import anydoc
 from markitdown import MarkItDown
 md=MarkItDown(enable_plugins=False) if engine=='markitdown' else None
 try:
  process=psutil.Process();rss=lambda:process.memory_info().rss
 except psutil.Error:
  # Some managed runtimes virtualize getpid while exposing /proc/self.
  rss=lambda:int(next(line.split()[1] for line in Path('/proc/self/status').read_text().splitlines() if line.startswith('VmRSS:')))*1024
 baseline=rss();peak=[baseline];stop=threading.Event()
 def sample():
  while not stop.wait(.001):peak[0]=max(peak[0],rss())
 thread=threading.Thread(target=sample);thread.start();times=[];content='';error=None
 try:
  for _ in range(5):
   start=time.perf_counter();content=md.convert(path).text_content if md else anydoc.to_markdown(path)
   times.append((time.perf_counter()-start)*1000)
 except Exception as e:error=type(e).__name__+': '+str(e)[:300]
 finally:stop.set();thread.join();peak[0]=max(peak[0],rss())
 return {'engine':engine,'filename':Path(path).name,'medianMs':round(statistics.median(times),3) if times else None,'rssIncreaseMB':round((peak[0]-baseline)/1024**2,2),'characters':len(content),'keyText':{s:s in content for s in ['中文','13800138000','125000.50']},'error':error}
def main():
 p=argparse.ArgumentParser();p.add_argument('--worker',choices=['anydoc','markitdown']);p.add_argument('--file');p.add_argument('--output',default='benchmark-results/report.json');a=p.parse_args()
 if a.worker:print(json.dumps(worker(a.worker,a.file),ensure_ascii=False));return
 import tempfile,importlib.metadata,anydoc
 fixtures=Path(tempfile.gettempdir())/'mad-benchmark-fixtures';subprocess.run([sys.executable,str(ROOT/'scripts/web_fixtures.py'),str(fixtures)],check=True)
 files=[*sorted((ROOT/'tests/fixtures/local-engines').glob('sample.*')),*sorted((ROOT/'tests/fixtures/local-engines').glob('chinese.*')),*[fixtures/f for f in ['中文合同.docx','中文表格.xlsx','中文汇报.pptx','中文合同.rtf']]]
 reports=[]
 for file in files:
  for engine in ['anydoc','markitdown']:
   r=subprocess.run([sys.executable,__file__,'--worker',engine,'--file',str(file)],capture_output=True,text=True,check=True)
   reports.append(json.loads(r.stdout));print(file.name,engine,reports[-1]['medianMs'],reports[-1]['error'] and 'error')
 module=Path(anydoc.__file__).parent
 web=ROOT/'dist-web';sizes={}
 if web.exists():
  sizes['webTotalMB']=round(sum(p.stat().st_size for p in web.rglob('*') if p.is_file())/1024**2,2)
  sizes['wasmBytes']=sum(p.stat().st_size for p in (web/'assets').glob('anydoc*.wasm'))
  sizes['ocrResourcesMB']=round(sum(p.stat().st_size for p in (web/'ocr').rglob('*') if p.is_file())/1024**2,2)
 report={'method':'5 in-process conversions, median including first cold conversion. Each engine/file in fresh process. RSS delta sampled at 1ms; initialization/process launch excluded. Not a fidelity score or mobile benchmark.','platform':sys.platform,'versions':{k:importlib.metadata.version(k) for k in ['firecrawl-anydoc','markitdown']},'pythonModuleBytes':sum(p.stat().st_size for p in module.rglob('*') if p.is_file()),'sizes':sizes,'results':reports}
 out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
if __name__=='__main__':main()

