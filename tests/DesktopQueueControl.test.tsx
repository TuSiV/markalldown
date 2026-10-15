import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {FileList} from '../src/components/FileList';
import {useAppStore} from '../src/stores/appStore';
import {useUIStore,defaultPreferences} from '../src/stores/uiStore';
import {useI18n} from '../src/i18n';
import {api} from '../src/lib/api';
import {enqueueConversions} from '../src/lib/desktopQueue';
vi.mock('../src/lib/api',()=>({api:{convertFile:vi.fn(),controlConversion:vi.fn()},localizeError:(s:string)=>s}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
beforeEach(()=>{vi.clearAllMocks();useI18n.setState({locale:'zh-CN'});useUIStore.setState({...defaultPreferences,concurrency:1});useAppStore.setState({files:[],port:1,token:'test',isReady:true,isConverting:false});});
afterEach(cleanup);
const entry=(id:string)=>({id,name:id+'.pdf',size:1,type:'application/pdf',status:'pending' as const,progress:0,file:new File(['pdf'],id+'.pdf')});
const result=(name:string)=>({kind:'single' as const,filename:name,preview:'Converted',cachePath:'/cache/'+name,charCount:9});
it('pauses a slow PDF, runs the next file, then resumes from the same server checkpoint',async()=>{
 vi.mocked(api.convertFile).mockImplementation(async(_connection,file,_path,_progress,onState,options)=>{
  if(file.name==='slow.pdf'&&!options?.resume){onState?.('running',{completed:2,total:5});return await new Promise((_resolve,reject)=>options!.signal!.addEventListener('abort',()=>reject(new DOMException('paused','AbortError'))));}
  return result(file.name);
 });
 vi.mocked(api.controlConversion).mockResolvedValue({state:'paused',completed:2,total:5});
 render(<FileList/>);enqueueConversions([entry('slow'),entry('next')]);
 await screen.findByText('已完成 2 / 5 页');fireEvent.click(screen.getByRole('button',{name:'暂缓 slow.pdf'}));
 await screen.findByRole('button',{name:'继续 slow.pdf'});await waitFor(()=>expect(useAppStore.getState().files.find(f=>f.id==='next')?.status).toBe('done'));
 expect(api.convertFile).toHaveBeenCalledTimes(2);fireEvent.click(screen.getByRole('button',{name:'继续 slow.pdf'}));
 await waitFor(()=>expect(useAppStore.getState().files.every(f=>f.status==='done')).toBe(true));
 expect(vi.mocked(api.convertFile).mock.calls[2][5]).toMatchObject({resume:true,jobId:'slow'});
});
it('retries a failed task without reselecting the original file and preserves successful tasks',async()=>{
 vi.mocked(api.convertFile).mockRejectedValueOnce(Error('failed once')).mockResolvedValueOnce(result('ok.pdf')).mockResolvedValueOnce(result('bad.pdf'));
 render(<FileList/>);enqueueConversions([entry('bad'),entry('ok')]);
 await screen.findByRole('button',{name:'重试 bad.pdf'});await waitFor(()=>expect(useAppStore.getState().files.find(f=>f.id==='ok')?.status).toBe('done'));
 fireEvent.click(screen.getByRole('button',{name:'重试失败项'}));await waitFor(()=>expect(useAppStore.getState().files.every(f=>f.status==='done')).toBe(true));
 expect(api.convertFile).toHaveBeenCalledTimes(3);expect(vi.mocked(api.convertFile).mock.calls[2][5]).toMatchObject({resume:true,jobId:'bad'});
});
it('uses one global concurrency limit across separately added batches',async()=>{
 const finish:Array<()=>void>=[];vi.mocked(api.convertFile).mockImplementation(async(_c,file)=>await new Promise(resolve=>finish.push(()=>resolve(result(file.name)))));
 useUIStore.setState({concurrency:2});enqueueConversions([entry('a'),entry('b')]);enqueueConversions([entry('c'),entry('d')]);
 expect(api.convertFile).toHaveBeenCalledTimes(2);finish[0]();await waitFor(()=>expect(api.convertFile).toHaveBeenCalledTimes(3));finish[1]();await waitFor(()=>expect(api.convertFile).toHaveBeenCalledTimes(4));finish[2]();finish[3]();await waitFor(()=>expect(useAppStore.getState().isConverting).toBe(false));
});
