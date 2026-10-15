import {api, localizeError, type ConversionCheckpoint} from './api';
import {useAppStore, type FileEntry} from '../stores/appStore';
import {useUIStore} from '../stores/uiStore';
import {useI18n} from '../i18n';
import {toast} from 'sonner';

const waiting: string[] = [];
const active = new Map<string, {controller: AbortController; pausing: boolean}>();
let pumping = false;
const text = (zh: string, en: string) => useI18n.getState().locale === 'en-US' ? en : zh;
function checkpoint(id: string, info?: ConversionCheckpoint) {
  if (!info) return;
  const fields: Partial<FileEntry> = {};
  if (typeof info.completed === 'number') fields.completedPages = info.completed;
  if (typeof info.total === 'number') fields.totalPages = info.total;
  if (info.total && typeof info.completed === 'number') fields.progress = 20 + 80 * info.completed / info.total;
  useAppStore.getState().patchFile(id, fields);
}

export function enqueueConversions(entries: FileEntry[]) {
  useAppStore.getState().addFiles(entries);
  waiting.push(...entries.map(file => file.id)); pump();
}

function pump() {
  if (pumping) return;
  pumping = true;
  try {
    const store = useAppStore.getState();
    if (!store.port || !store.isReady) return;
    while (active.size < useUIStore.getState().concurrency && waiting.length) {
      const id = waiting.shift()!;
      const entry = useAppStore.getState().files.find(file => file.id === id);
      if (!entry || entry.status !== 'pending' || !entry.file) continue;
      const worker = {controller: new AbortController(), pausing: false};
      active.set(id, worker);
      void execute(entry, worker);
    }
  } finally {
    pumping = false;
    useAppStore.getState().setConverting(active.size > 0 || waiting.length > 0);
  }
}

async function execute(entry: FileEntry, worker: {controller: AbortController; pausing: boolean}) {
  const store = useAppStore.getState(), id = entry.id, jobId = entry.jobId || id;
  const connection = {port: store.port!, token: store.token || ''};
  store.patchFile(id, {status: 'converting', jobId, conversionPhase: entry.jobId ? 'queued' : 'uploading', result: undefined});
  const run = (resume: boolean) => api.convertFile(connection, entry.file!, entry.relativePath,
    progress => { if (!worker.pausing) useAppStore.getState().patchFile(id, {progress}); },
    (conversionPhase, info) => {if (!worker.pausing) {useAppStore.getState().patchFile(id, {conversionPhase}); checkpoint(id, info);}},
    {signal: worker.controller.signal, jobId, concurrency: useUIStore.getState().concurrency, resume});
  try {
    let result;
    try { result = await run(!!entry.jobId); }
    catch (error) {
      if ((error as Error).message !== 'job_missing' || worker.pausing) throw error;
      store.patchFile(id, {completedPages: 0, totalPages: undefined, queueNote: text('会话缓存已失效，正在重新开始。','Session cache expired; restarting.')});
      result = await run(false);
    }
    if (result.kind === 'archive') {
      store.patchFile(id, {status: 'done', progress: 100, result: text('压缩包处理完成','Archive processed')});
      store.addFiles(result.files.map(file => ({id: crypto.randomUUID(), name: file.filename, size: file.charCount || 0, type: 'text/markdown', status: file.success ? 'done' : 'error', progress: file.success ? 100 : 0, result: file.success ? file.preview : file.error, preview: file.preview, cachePath: file.cachePath, charCount: file.charCount, warnings: file.warnings, engine: file.engine, relativePath: file.filename})));
    } else {
      store.patchFile(id, {status: 'done', progress: 100, result: result.preview, preview: result.preview, cachePath: result.cachePath, charCount: result.charCount, warnings: result.warnings, engine: result.engine, completedPages: result.totalPages, totalPages: result.totalPages});
    }
  } catch (error) {
    const raw = (error as Error).message;
    if (worker.pausing || (error as Error).name === 'AbortError' || raw === 'conversion_paused') store.patchFile(id, {status: 'paused'});
    else {
      store.patchFile(id, {status: 'error', result: localizeError(raw, useI18n.getState().locale)});
      toast.error(`${entry.name}: ${localizeError(raw, useI18n.getState().locale)}`);
    }
  } finally {
    active.delete(id); pump();
  }
}

export async function pauseConversion(id: string) {
  const store = useAppStore.getState(), file = store.files.find(file => file.id === id);
  if (!file) return;
  const index = waiting.indexOf(id);
  if (index >= 0) {waiting.splice(index, 1); store.patchFile(id, {status: 'paused'}); pump(); return;}
  const worker = active.get(id);
  if (!worker || worker.pausing) return;
  worker.pausing = true; store.patchFile(id, {status: 'pausing'});
  try {
    const info = await api.controlConversion({port: store.port!, token: store.token || ''}, file.jobId || id, 'pause');
    checkpoint(id, info);
    // Completion may win the race; let the original response deliver its result.
    if (info.state !== 'done') worker.controller.abort();
  } catch (error) {
    worker.controller.abort(); toast.error(text('已停止本次请求；恢复时会检查服务端检查点。','Request stopped; resume will check the server checkpoint.'));
  }
}

export function resumeConversion(id: string) {
  const store = useAppStore.getState(), file = store.files.find(file => file.id === id);
  if (!file?.file || !['paused', 'error'].includes(file.status) || active.has(id)) return;
  store.patchFile(id, {status: 'pending', result: undefined});
  waiting.push(id); pump();
}
export function retryFailedConversions() {
  for (const file of useAppStore.getState().files) if (file.status === 'error' && file.file) resumeConversion(file.id);
}
export async function removeConversion(id: string) {
  const store = useAppStore.getState(), file = store.files.find(file => file.id === id);
  if (file?.jobId && store.port) await api.controlConversion({port: store.port, token: store.token || ''}, file.jobId, 'discard');
  store.removeFile(id);
}
export async function clearConversions() {
  for (const file of [...useAppStore.getState().files]) await removeConversion(file.id);
}
useUIStore.subscribe((state, previous) => {if (state.concurrency !== previous.concurrency) pump();});
useAppStore.subscribe((state, previous) => {if (state.port !== previous.port || state.isReady !== previous.isReady) pump();});
