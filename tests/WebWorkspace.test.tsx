import {afterEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import WebApp from '../src/web/WebApp';
import {convert} from '../src/web/convert';
vi.mock('../src/web/convert',()=>({extensions:'.md,.doc',defaultLimits:{maxFileMB:30,timeoutSeconds:120},convert:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('Web workspace progressive disclosure',()=>{
 it('shows a usable importer without empty queue or result panels',()=>{
  render(<WebApp/>);
  expect(screen.getByRole('button',{name:'选择文件'})).toBeTruthy();
  expect(screen.queryByRole('heading',{name:/转换队列/})).toBeNull();
  expect(screen.queryByRole('heading',{name:'转换结果'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'文件恢复'}));
  expect(screen.getByLabelText('选择脱敏文件')).toBeTruthy();
  expect(screen.getByLabelText('选择恢复 JSON')).toBeTruthy();
 });
 it('reveals actual results after import and returns to the landing after clearing',async()=>{
  vi.mocked(convert).mockResolvedValue({content:'# Local contract',assets:[],warnings:[],engine:'utf8',format:'md',elapsedMs:1});
  const {container}=render(<WebApp/>);
  fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File(['# Local contract'],'contract.md')]}});
  await screen.findByRole('heading',{name:'Local contract'});
  expect(screen.getByRole('button',{name:'下载 Markdown'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'复制'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'清空'}));
  await waitFor(()=>expect(screen.queryByRole('heading',{name:'转换结果'})).toBeNull());
  expect(screen.getByRole('button',{name:'选择文件'})).toBeTruthy();
 });
});
