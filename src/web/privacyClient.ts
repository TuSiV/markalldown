export function privacyJob<T>(operation:string,args:unknown,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./privacy.worker.ts',import.meta.url),{type:'module'});
  const cleanup=()=>{clearTimeout(timer);worker.terminate();signal.removeEventListener('abort',cancel);};
  const cancel=()=>{cleanup();reject(new DOMException('已取消','AbortError'));};
  const timer=setTimeout(()=>{cleanup();reject(Error('处理超时，请拆分文件'));},120_000);
  signal.addEventListener('abort',cancel);if(signal.aborted){cancel();return;}
  worker.onmessage=e=>{cleanup();e.data.error?reject(Error(e.data.error)):resolve(e.data.result);};
  worker.onerror=()=>{cleanup();reject(Error('本地加密引擎加载失败'));};
  worker.postMessage({operation,args});
 });
}
