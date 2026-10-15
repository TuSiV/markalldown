// Report capabilities and registration failures instead of leaving the action disabled.
export function offlineUnavailableReason():string|null{
 try{
  if(window.isSecureContext===false)return '离线准备需要 HTTPS 安全连接，请用本站 HTTPS 地址打开。';
  if(!('serviceWorker' in navigator)||!navigator.serviceWorker)return '当前浏览环境没有提供离线服务，请在 Safari 或 Chrome 的完整浏览器窗口中打开。';
  if(!('caches' in window))return '当前浏览环境没有提供离线缓存，请在浏览器普通窗口中重试。';
  return null;
 }catch{return '当前浏览器设置限制了离线存储，请检查网站数据权限后重试。';}
}

export function ensureOfflineService(signal:AbortSignal):Promise<ServiceWorkerRegistration>{
 const unavailable=offlineUnavailableReason();
 if(unavailable)return Promise.reject(Error(unavailable));
 return new Promise((resolve,reject)=>{
  let settled=false,installing:ServiceWorker|null=null;
  const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);installing?.removeEventListener('statechange',stateChanged);};
  const finish=(error?:Error,registration?:ServiceWorkerRegistration)=>{
   if(settled)return;settled=true;cleanup();error?reject(error):resolve(registration!);
  };
  const cancel=()=>finish(new DOMException('已取消离线服务初始化','AbortError'));
  const stateChanged=()=>{if(installing?.state==='redundant')finish(Error('离线服务安装失败，可能有资源未能下载，请保持联网后重试。'));};
  const timer=setTimeout(()=>finish(Error('离线服务启动超时，请保持页面在前台并重试；若仍失败，请检查浏览器的网站数据权限。')),20_000);
  signal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted){cancel();return;}
  const scope=new URL(import.meta.env.BASE_URL,window.location.origin);
  void (async()=>{
   try{
    const container=navigator.serviceWorker;
    let registration=await container.getRegistration(scope.href);
    if(settled)return;
    // Retry registrations whose previous installation failed, without deleting caches.
    if(!registration||(!registration.active&&!registration.installing&&!registration.waiting)){
     registration=await container.register(new URL('sw.js',scope).href,{scope:scope.href});
    }
    if(settled)return;
    if(registration.active?.state==='activated'){finish(undefined,registration);return;}
    installing=registration.installing;
    installing?.addEventListener('statechange',stateChanged);stateChanged();
    if(settled)return;
    const ready=await container.ready;
    if(!ready.active){finish(Error('离线服务未能激活，请重试。'));return;}
    finish(undefined,ready);
   }catch(error){
    const detail=error instanceof Error?`${error.name}: ${error.message}`:String(error);
    finish(Error(`离线服务启动失败：${detail}。请保持联网，并在浏览器普通窗口中重试。`));
   }
  })();
 });
}
