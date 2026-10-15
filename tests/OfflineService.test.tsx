import {afterEach,it,expect,vi} from 'vitest';
import {ensureOfflineService,offlineUnavailableReason} from '../src/web/offlineService';
function setup(service:object){
 vi.stubGlobal('isSecureContext',true);vi.stubGlobal('caches',{});
 Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:service});
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();delete (navigator as unknown as {serviceWorker?:unknown}).serviceWorker;});
it('uses an existing activated service when offline, without registering again',async()=>{
 const registration={active:{state:'activated'}};const register=vi.fn();setup({getRegistration:vi.fn().mockResolvedValue(registration),register});
 expect(await ensureOfflineService(new AbortController().signal)).toBe(registration);expect(register).not.toHaveBeenCalled();
});
it('registers the worker explicitly when automatic registration never ran',async()=>{
 const registration={active:{state:'activated'}};const register=vi.fn().mockResolvedValue(registration);setup({getRegistration:vi.fn().mockResolvedValue(undefined),register});
 expect(await ensureOfflineService(new AbortController().signal)).toBe(registration);expect(register).toHaveBeenCalledWith(expect.stringMatching(/\/sw\.js$/),{scope:expect.stringMatching(/\/$/)});
});
it('retries a failed registration with no remaining worker',async()=>{
 const register=vi.fn().mockResolvedValue({active:{state:'activated'}});setup({getRegistration:vi.fn().mockResolvedValue({active:null,waiting:null,installing:null}),register});
 await ensureOfflineService(new AbortController().signal);expect(register).toHaveBeenCalledOnce();
});
it('shows the underlying registration denial rather than silently waiting',async()=>{
 setup({getRegistration:vi.fn().mockResolvedValue(undefined),register:vi.fn().mockRejectedValue(new DOMException('Storage blocked','SecurityError'))});
 await expect(ensureOfflineService(new AbortController().signal)).rejects.toThrow('SecurityError: Storage blocked');
});
it('bounds readiness waits and reports a retryable timeout',async()=>{
 vi.useFakeTimers();setup({getRegistration:vi.fn().mockResolvedValue({installing:null}),register:vi.fn().mockResolvedValue({active:null,installing:null}),ready:new Promise(()=>{})});
 const request=ensureOfflineService(new AbortController().signal);const rejected=expect(request).rejects.toThrow('启动超时');await vi.advanceTimersByTimeAsync(20_000);await rejected;expect(vi.getTimerCount()).toBe(0);
});
it('detects an installation that becomes redundant',async()=>{
 const installing=new EventTarget() as EventTarget & {state:string};installing.state='installing';setup({getRegistration:vi.fn().mockResolvedValue({installing}),ready:new Promise(()=>{})});
 const request=ensureOfflineService(new AbortController().signal);const rejected=expect(request).rejects.toThrow('安装失败');await Promise.resolve();installing.state='redundant';installing.dispatchEvent(new Event('statechange'));await rejected;
});
it('cancels pending discovery without registering a late worker',async()=>{
 let discovered!:(value:unknown)=>void;const register=vi.fn();setup({getRegistration:()=>new Promise(r=>{discovered=r;}),register});
 const controller=new AbortController();const request=ensureOfflineService(controller.signal);const rejected=expect(request).rejects.toThrow('已取消');controller.abort();await rejected;discovered(undefined);await Promise.resolve();expect(register).not.toHaveBeenCalled();
});
it('explains missing browser capabilities',()=>{
 setup({});vi.stubGlobal('isSecureContext',false);expect(offlineUnavailableReason()).toContain('HTTPS');vi.stubGlobal('isSecureContext',true);delete (navigator as unknown as {serviceWorker?:unknown}).serviceWorker;expect(offlineUnavailableReason()).toContain('完整浏览器');
});
