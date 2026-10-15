export interface OfflineProgress {completed:number;total:number;current:string}

export function prepareOfflineResources(signal:AbortSignal,onProgress:(progress:OfflineProgress)=>void):Promise<void>{
 return new Promise((resolve,reject)=>{
  const channel=new MessageChannel(),id=crypto.randomUUID();
  let worker:ServiceWorker|undefined,settled=false;
  const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);channel.port1.close();};
  const finish=(error?:Error)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve();};
  const stop=()=>worker?.postMessage({type:'CANCEL_OFFLINE',id});
  const cancel=()=>{stop();finish(new DOMException('已取消离线准备，已缓存资源会保留','AbortError'));};
  // Include service-worker readiness in the timeout and cancellation window.
  const timer=setTimeout(()=>{stop();finish(Error('离线资源准备超时，已缓存资源会保留，请重试'));},120_000);
  signal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted){cancel();return;}
  channel.port1.onmessage=event=>{
   const data=event.data;
   if(data?.type==='OFFLINE_PROGRESS'){
    if(Number.isInteger(data.completed)&&Number.isInteger(data.total)&&data.total>0&&data.completed>=0&&data.completed<=data.total&&typeof data.current==='string')onProgress(data);
    return;
   }
   if(data?.ok===true)finish();
   else finish(Error('离线资源下载失败，已缓存资源会保留，请重试'));
  };
  navigator.serviceWorker.ready.then(registration=>{
   if(settled)return;
   worker=registration.active??undefined;
   if(!worker){finish(Error('离线服务尚未就绪，请刷新后重试'));return;}
   worker.postMessage({type:'PREPARE_OFFLINE',id},[channel.port2]);
  }).catch(error=>finish(error));
 });
}
