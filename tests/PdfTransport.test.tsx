import {afterEach,it,expect,vi} from 'vitest';
import {api} from '../src/lib/api';
class Xhr extends EventTarget{
 static instance:Xhr;upload=new EventTarget();timeout=0;status=200;responseText=JSON.stringify({filename:'result.pdf',cachePath:'/cached',preview:'# result'});
 constructor(){super();Xhr.instance=this;}
 open=vi.fn();setRequestHeader=vi.fn();send=vi.fn();
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('uses server queue states for PDFs without an upload-inclusive five-minute timeout',async()=>{
 vi.useFakeTimers();vi.stubGlobal('XMLHttpRequest',Xhr);
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({state:'queued'})}).mockResolvedValueOnce({ok:true,json:async()=>({state:'running'})});vi.stubGlobal('fetch',fetch);
 const state=vi.fn();const result=api.convertFile({port:1,token:'test'},new File(['pdf'],'a.pdf'),undefined,vi.fn(),state);
 expect(Xhr.instance.timeout).toBe(0);expect(Xhr.instance.send.mock.calls[0][0].get('jobId')).toBeTruthy();
 await vi.advanceTimersByTimeAsync(500);expect(state).toHaveBeenLastCalledWith('queued');
 await vi.advanceTimersByTimeAsync(500);expect(state).toHaveBeenLastCalledWith('running');expect(fetch.mock.calls[0][1].headers['X-API-Token']).toBe('test');
 Xhr.instance.dispatchEvent(new Event('load'));Xhr.instance.dispatchEvent(new Event('loadend'));await result;expect(vi.getTimerCount()).toBe(0);
});
it('cleans up polling after the server reports that the PDF worker was stopped',async()=>{
 vi.useFakeTimers();vi.stubGlobal('XMLHttpRequest',Xhr);vi.stubGlobal('fetch',vi.fn());
 const result=api.convertFile({port:1,token:'test'},new File(['pdf'],'a.pdf'));
 const rejected=expect(result).rejects.toThrow('任务已停止');Xhr.instance.status=408;Xhr.instance.responseText=JSON.stringify({detail:'任务已停止'});Xhr.instance.dispatchEvent(new Event('load'));Xhr.instance.dispatchEvent(new Event('loadend'));await rejected;expect(vi.getTimerCount()).toBe(0);
});
it('keeps the existing transport timeout for non-PDF formats',async()=>{
 vi.stubGlobal('XMLHttpRequest',Xhr);const result=api.convertFile({port:1,token:'test'},new File(['md'],'a.md'));expect(Xhr.instance.timeout).toBe(300000);Xhr.instance.dispatchEvent(new Event('load'));Xhr.instance.dispatchEvent(new Event('loadend'));await result;
});
