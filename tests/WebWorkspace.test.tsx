import {useI18n} from '../src/i18n';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,within} from '@testing-library/react';
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


beforeEach(()=>useI18n.setState({locale:'zh-CN'}));

it('switches all workspaces and remembers the interface language without changing documents',async()=>{
 const content='# 本地合同\n\n清晰的 Markdown。';
 vi.mocked(convert).mockResolvedValue({content,assets:[],warnings:[],engine:'utf8',format:'md',elapsedMs:1});
 const {container,unmount}=render(<WebApp/>);
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File([content],'合同.md')]}});
 await screen.findByRole('heading',{name:'本地合同'});
 fireEvent.click(screen.getByRole('button',{name:'English',exact:true}));
 expect(document.documentElement.lang).toBe('en-US');
 expect(localStorage.getItem('markitdown.locale')).toBe('en-US');
 expect(screen.getByRole('button',{name:'Choose files'})).toBeTruthy();
 expect(screen.getByRole('heading',{name:'本地合同'})).toBeTruthy();
 expect(screen.getByText('合同.md')).toBeTruthy();
 fireEvent.click(within(screen.getByRole('navigation',{name:'Workspace'})).getByRole('button',{name:'Redaction review',exact:true}));
 expect(screen.getByLabelText('Recovery password (at least 8 characters)')).toBeTruthy();
 expect(screen.getByLabelText('Phone numbers')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Restore files',exact:true}));
 expect(screen.getByRole('button',{name:'Choose redacted file',exact:true})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Settings',exact:true}));
 expect(screen.getByLabelText('Maximum file size (MB)')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'中文',exact:true}));
 expect(screen.getByLabelText('单文件大小上限（MB）')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'English',exact:true}));
 unmount();render(<WebApp/>);
 expect(screen.getByRole('button',{name:'Choose files'})).toBeTruthy();
});

it('still switches language when browser storage is unavailable',()=>{
 const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Storage blocked','SecurityError');});
 render(<WebApp/>);fireEvent.click(screen.getByRole('button',{name:'English',exact:true}));
 expect(screen.getByRole('button',{name:'Choose files'})).toBeTruthy();
 fail.mockRestore();
});
