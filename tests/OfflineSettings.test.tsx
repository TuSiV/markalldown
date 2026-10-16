import {useI18n} from '../src/i18n';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import WebApp from '../src/web/WebApp';
import {ensureOfflineService,offlineUnavailableReason} from '../src/web/offlineService';
import {prepareOfflineResources} from '../src/web/offlinePreparation';
vi.mock('../src/web/convert',()=>({extensions:'.md',defaultLimits:{maxFileMB:30,timeoutSeconds:120},convert:vi.fn()}));
vi.mock('../src/web/offlineService',()=>({ensureOfflineService:vi.fn(),offlineUnavailableReason:vi.fn()}));
vi.mock('../src/web/offlinePreparation',()=>({prepareOfflineResources:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('keeps preparation clickable even when automatic readiness stays pending',()=>{
 vi.mocked(ensureOfflineService).mockReturnValue(new Promise(()=>{}));vi.mocked(offlineUnavailableReason).mockReturnValue(null);
 render(<WebApp/>);fireEvent.click(screen.getByRole('button',{name:'设置'}));
 expect((screen.getByRole('button',{name:'准备全部离线资源'}) as HTMLButtonElement).disabled).toBe(false);expect(screen.getByText('正在检查离线服务…')).toBeTruthy();
});
it('shows startup failure and lets the user retry preparation successfully',async()=>{
 vi.mocked(ensureOfflineService).mockRejectedValue(Error('离线服务启动失败：SecurityError: Storage blocked'));vi.mocked(offlineUnavailableReason).mockReturnValue(null);vi.mocked(prepareOfflineResources).mockResolvedValue();
 render(<WebApp/>);fireEvent.click(screen.getByRole('button',{name:'设置'}));await screen.findByText(/SecurityError: Storage blocked/);
 const button=screen.getByRole('button',{name:'准备全部离线资源'}) as HTMLButtonElement;expect(button.disabled).toBe(false);fireEvent.click(button);await screen.findByText('离线资源已准备完成。');expect(prepareOfflineResources).toHaveBeenCalledOnce();await waitFor(()=>expect(button.disabled).toBe(false));
});
it('explains a capability restriction beside the disabled button',()=>{
 vi.mocked(offlineUnavailableReason).mockReturnValue('当前浏览环境没有提供离线缓存');render(<WebApp/>);fireEvent.click(screen.getByRole('button',{name:'设置'}));expect((screen.getByRole('button',{name:'准备全部离线资源'}) as HTMLButtonElement).disabled).toBe(true);expect(screen.getByText('当前浏览环境没有提供离线缓存')).toBeTruthy();expect(ensureOfflineService).not.toHaveBeenCalled();
});


beforeEach(()=>useI18n.setState({locale:'zh-CN'}));
