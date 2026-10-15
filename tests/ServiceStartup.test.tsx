import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {invoke, isTauri} from '@tauri-apps/api/core';
import {api} from '../src/lib/api';

vi.mock('@tauri-apps/api/core', () => ({invoke: vi.fn(), isTauri: vi.fn()}));
beforeEach(() => { vi.useFakeTimers(); vi.mocked(isTauri).mockReturnValue(true); localStorage.clear(); });
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('reports a native loader failure immediately instead of polling a fallback port', async () => {
  vi.mocked(invoke).mockRejectedValue('service_exited');
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(api.waitForServer()).rejects.toThrow('转换服务启动时已退出');
  expect(fetch).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('detects a service that exits while its health endpoint is still unavailable', async () => {
  vi.mocked(invoke).mockResolvedValueOnce({port: 1234, token: 'test'}).mockRejectedValue('service_exited');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  const pending = expect(api.waitForServer()).rejects.toThrow('转换服务启动时已退出');
  await vi.advanceTimersByTimeAsync(1000);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});

it('cleans up health timers when the service becomes ready after a failed connection', async () => {
  vi.mocked(invoke).mockResolvedValue({port: 1234, token: 'test'});
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Not ready')).mockResolvedValue({ok:true}));
  const pending = api.waitForServer();
  await vi.advanceTimersByTimeAsync(1000);
  await expect(pending).resolves.toEqual({port:1234, token:'test'});
  expect(vi.getTimerCount()).toBe(0);
});

it('restarts the native service when retrying', async () => {
  vi.mocked(invoke).mockResolvedValue(undefined);
  await api.restartServer();
  expect(invoke).toHaveBeenCalledWith('restart_service');
});

it('retains browser development support without swallowing desktop errors', async () => {
  vi.mocked(isTauri).mockReturnValue(false);
  const fetch = vi.fn().mockResolvedValue({ok:true}); vi.stubGlobal('fetch', fetch);
  await expect(api.waitForServer()).resolves.toEqual({port:18765, token:''});
  expect(invoke).not.toHaveBeenCalled();
});
