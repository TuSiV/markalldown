/// <reference lib="webworker" />
import {precacheAndRoute,cleanupOutdatedCaches} from 'workbox-precaching';
import {registerRoute} from 'workbox-routing';
import {CacheFirst} from 'workbox-strategies';
declare const self:ServiceWorkerGlobalScope & {__WB_MANIFEST:Array<{url:string;revision:string|null}>};
precacheAndRoute(self.__WB_MANIFEST);cleanupOutdatedCaches();
registerRoute(({url})=>url.origin===self.location.origin&&/\/(ocr|pdf)\//.test(url.pathname),new CacheFirst({cacheName:'mad-ocr-v1'}));
self.addEventListener('install',()=>{void self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
const downloads=new Map<string,AbortController>();
self.addEventListener('message',event=>{
 if(event.data?.type==='CANCEL_OFFLINE'){downloads.get(event.data.id)?.abort();return;}
 if(event.data?.type!=='PREPARE_OFFLINE')return;
 const controller=new AbortController();downloads.set(event.data.id,controller);
 event.waitUntil((async()=>{
  try {
   const response=await fetch(new URL('offline-resources.json',self.registration.scope),{signal:controller.signal});
   if(!response.ok)throw Error('Missing offline resources');
   const resources:unknown=await response.json();if(!Array.isArray(resources)||resources.length>1000||resources.some(s=>typeof s!=='string'||!/^(ocr|pdf)\/[a-zA-Z0-9_.\/-]+$/.test(s)))throw Error('Invalid resources');
   const cache=await caches.open('mad-ocr-v1');
   // Sequential fetches avoid mobile memory spikes; the ready marker is written
   // only when every expected resource has been downloaded successfully.
   let completed=0;
   const progress=(current:string)=>event.ports[0]?.postMessage({type:'OFFLINE_PROGRESS',completed,total:resources.length,current});
   for(const path of resources){
    controller.signal.throwIfAborted();progress(path);
    const url=new URL(path,self.registration.scope);
    if(!await cache.match(url)){const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw Error('Download failed');await cache.put(url,r);}
    controller.signal.throwIfAborted();completed++;progress('');
   }
   controller.signal.throwIfAborted();
   await cache.put(new URL('offline-ready',self.registration.scope),new Response('ready'));
   event.ports[0]?.postMessage({ok:true});
  }catch{event.ports[0]?.postMessage({ok:false});}finally{downloads.delete(event.data.id);}
 })());
});
