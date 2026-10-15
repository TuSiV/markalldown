import {afterEach,it,expect,vi} from 'vitest';
vi.mock('workbox-precaching',()=>({precacheAndRoute:vi.fn(),cleanupOutdatedCaches:vi.fn()}));
vi.mock('workbox-routing',()=>({registerRoute:vi.fn()}));
vi.mock('workbox-strategies',()=>({CacheFirst:class{}}));
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('reports cached and downloaded resources only after cache storage, before marking ready',async()=>{
 const handlers:Record<string,(e:any)=>void>={};
 vi.stubGlobal('self',{__WB_MANIFEST:[],location:{origin:'https://example.com'},registration:{scope:'https://example.com/'},addEventListener:(type:string,fn:any)=>{handlers[type]=fn;}});
 const put=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('caches',{open:vi.fn().mockResolvedValue({match:vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce(undefined),put})});
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>['ocr/cached.gz','pdf/new.wasm']}).mockResolvedValueOnce({ok:true});vi.stubGlobal('fetch',fetch);
 await import('../src/web/sw');let job!:Promise<void>;const postMessage=vi.fn();handlers.message({data:{type:'PREPARE_OFFLINE',id:'test'},ports:[{postMessage}],waitUntil:(p:Promise<void>)=>{job=p;}});await job;
 expect(postMessage.mock.calls.map(c=>c[0])).toEqual([
  {type:'OFFLINE_PROGRESS',completed:0,total:2,current:'ocr/cached.gz'},
  {type:'OFFLINE_PROGRESS',completed:1,total:2,current:''},
  {type:'OFFLINE_PROGRESS',completed:1,total:2,current:'pdf/new.wasm'},
  {type:'OFFLINE_PROGRESS',completed:2,total:2,current:''},{ok:true}
 ]);expect(fetch).toHaveBeenCalledTimes(2);expect(put).toHaveBeenCalledTimes(2);expect(String(put.mock.calls[1][0])).toBe('https://example.com/offline-ready');
});
