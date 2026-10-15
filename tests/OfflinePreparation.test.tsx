import {afterEach,describe,it,expect,vi} from 'vitest';
import {prepareOfflineResources} from '../src/web/offlinePreparation';
let receive:(event:{data:unknown})=>void;
const close=vi.fn();
function setup(ready:Promise<unknown>){
 vi.stubGlobal('MessageChannel',class{port1={close,set onmessage(value:typeof receive){receive=value;}};port2={};});
 Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{ready}});
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();delete (navigator as unknown as {serviceWorker?:unknown}).serviceWorker;vi.clearAllMocks();});
describe('offline preparation protocol',()=>{
 it('keeps the request open for progress and resolves only on completion',async()=>{
  const postMessage=vi.fn();setup(Promise.resolve({active:{postMessage}}));
  const progress=vi.fn(),done=vi.fn();const request=prepareOfflineResources(new AbortController().signal,progress).then(done);
  await Promise.resolve();expect(postMessage).toHaveBeenCalledOnce();
  receive({data:{type:'OFFLINE_PROGRESS',completed:3,total:10,current:'ocr/eng.gz'}});
  await Promise.resolve();expect(progress).toHaveBeenCalledWith({type:'OFFLINE_PROGRESS',completed:3,total:10,current:'ocr/eng.gz'});expect(done).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  receive({data:{ok:true}});await request;expect(done).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
 });
 it('cancels the active worker job and closes the channel',async()=>{
  const postMessage=vi.fn();setup(Promise.resolve({active:{postMessage}}));const controller=new AbortController();
  const request=prepareOfflineResources(controller.signal,vi.fn());const rejected=expect(request).rejects.toThrow('已取消离线准备');
  await Promise.resolve();controller.abort();await rejected;expect(postMessage.mock.calls[1][0]).toEqual({type:'CANCEL_OFFLINE',id:postMessage.mock.calls[0][0].id});expect(close).toHaveBeenCalledOnce();
 });
 it('can cancel while waiting for worker readiness without starting a late download',async()=>{
  let ready!:(r:unknown)=>void;setup(new Promise(r=>{ready=r;}));const controller=new AbortController();const request=prepareOfflineResources(controller.signal,vi.fn());const rejected=expect(request).rejects.toThrow('已取消');controller.abort();await rejected;
  const postMessage=vi.fn();ready({active:{postMessage}});await Promise.resolve();expect(postMessage).not.toHaveBeenCalled();
 });
 it('times out even when service-worker readiness never resolves',async()=>{
  vi.useFakeTimers();setup(new Promise(()=>{}));const request=prepareOfflineResources(new AbortController().signal,vi.fn());const rejected=expect(request).rejects.toThrow('超时');await vi.advanceTimersByTimeAsync(120_000);await rejected;expect(close).toHaveBeenCalledOnce();
 });
});
