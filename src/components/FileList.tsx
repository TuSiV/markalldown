import { FileText, CheckCircle2, XCircle, Loader2, Trash2, Eye, AlertCircle, FolderOpen, Pause, Play, RotateCcw } from "lucide-react";
import { pauseConversion, resumeConversion, retryFailedConversions, removeConversion, clearConversions } from "../lib/desktopQueue";
import { useAppStore } from "../stores/appStore";
import { useState } from "react";
import { FileGlyph } from "./Visual";
import { Preview } from "./Preview";
import { api, localizeError } from "../lib/api";
import { toast } from "sonner";
import { useT, useI18n } from "../i18n";

export function FileList({ onPreview, selectedId }: { onPreview?: (id: string) => void; selectedId?: string | null }) {
  const { files, removeFile, clearFiles, port, token } = useAppStore();
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleSaveBeside = async (id: string) => {
    const file = files.find(f => f.id === id);
    if (!file || !port) return;
    if (!file.sourcePath) {
      toast.error(t("noSourceForSave"));
      return;
    }
    if (useAppStore.getState().privacyEnabled) {
      const { confirm } = await import("@tauri-apps/plugin-dialog");
      if (!await confirm(locale === "en-US" ? "Save original text containing sensitive information?" : "另存含敏感信息的原文？", { title: "MarkAllDown", kind: "warning" })) return;
    }
    setSavingId(id);
    try {
      const dir = await api.saveBesideSource(
        { port, token: token || "" },
        {
          name: file.name,
          content: file.cachePath ? undefined : file.result,
          cachePath: file.cachePath,
          sourcePath: file.sourcePath,
        }
      );
      toast.success(t("savedTo", { path: dir }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(t("saveFailed", { msg: localizeError(msg, locale) }));
    } finally {
      setSavingId(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paused":
        return <Pause className="w-4 h-4" />;
      case "pausing":
      case "converting":
        return <Loader2 className="w-4 h-4 text-[#2563eb] animate-spin" />;
      case "done":
        return <CheckCircle2 className="w-4 h-4 text-[#0f7b6c]" />;
      case "error":
        return <XCircle className="w-4 h-4 text-[#eb5757]" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-[rgba(55,53,47,0.09)]" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "paused": return locale === "en-US" ? "Paused" : "已暂缓";
      case "pausing": return locale === "en-US" ? "Stopping" : "正在暂缓";
      case "pending": return t("statusPending");
      case "converting": return t("statusConverting");
      case "done": return t("statusDone");
      case "error": return t("statusError");
      default: return "";
    }
  };

  return (
    <>
      <div className="queue-heading">
        <h2 className="font-semibold text-slate-700">
          {t("fileList", { n: files.length })}
        </h2>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#787774]
                     hover:text-[#2563eb] hover:bg-[rgba(37,99,235,0.1)] rounded-md transition-colors"
          disabled={!files.some(file => file.status === 'error' && file.file)}
          onClick={retryFailedConversions}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {locale === 'en-US' ? 'Retry failed' : '重试失败项'}
        </button>
        <button
          onClick={() => void clearConversions().catch(error => toast.error(String(error)))}
          disabled={files.some(f => ["converting", "pending", "pausing"].includes(f.status))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#787774]
                     hover:text-[#eb5757] hover:bg-[rgba(235,87,87,0.1)] rounded-md transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t("clearAll")}
        </button>
      </div>

      {files.length > 0 && <p className="queue-checkpoint-hint">{locale === 'en-US' ? 'PDFs resume from completed pages; an unfinished page is redone. Other formats restart. Checkpoints are cleared when the task is removed or the app exits.' : 'PDF 保留已完成页，未完成页会重做；其他格式重新开始。移除任务或退出应用会清理检查点。'}</p>}
      <div className="file-queue flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-[#9b9a97]">
            <p>{t("emptyList")}</p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(55,53,47,0.09)]">
            {files.map((file) => (
              <div
                key={file.id}
                className={`file-row ${selectedId === file.id ? "selected" : ""}`}
              >
                <div className="flex-shrink-0">
                  <FileGlyph name={file.name} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">

                    <button disabled={file.status !== "done" || !file.cachePath} onClick={() => onPreview ? onPreview(file.id) : setPreviewFile(file.id)} className="file-name truncate">{file.name}</button>
                    <span className={`status-badge status-${file.status}`}>{getStatusIcon(file.status)}{file.status === 'converting' && file.conversionPhase === 'queued' ? (locale === 'en-US' ? 'Queued' : '排队中') : file.status === 'converting' && file.conversionPhase === 'uploading' ? (locale === 'en-US' ? 'Reading file' : '正在读取文件') : getStatusText(file.status)}</span>
                  </div>

                  {file.status === "converting" && (
                    <div className="mt-1.5 w-full bg-[#f7f6f3] rounded-full h-1.5">
                      <div
                        className="bg-[#2563eb] h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  )}

                  {file.status === 'converting' && file.conversionPhase === 'queued' && <p className="text-xs text-slate-500 mt-1">{locale === 'en-US' ? 'Waiting for an available worker; processing time has not started.' : '等待空闲转换进程，尚未开始计算转换时限。'}</p>}

                  {!!file.totalPages && <p className="text-xs text-slate-500 mt-1">{locale === 'en-US' ? `Completed ${file.completedPages || 0} / ${file.totalPages} pages` : `已完成 ${file.completedPages || 0} / ${file.totalPages} 页`}</p>}
                  {file.status === 'error' && !file.file && <p className="text-xs text-slate-500 mt-1">{locale === 'en-US' ? 'Reimport the original archive to retry this extracted file.' : '请重新导入源压缩包后重试此内部文件。'}</p>}
                  {file.queueNote && <p className="text-xs text-slate-500 mt-1">{file.queueNote}</p>}
                  {file.status === "error" && file.result && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3 h-3 text-[#eb5757]" />
                      <p className="text-xs text-[#eb5757] truncate">{file.result}</p>
                    </div>
                  )}
                </div>

                <span className="text-xs text-[#9b9a97] flex-shrink-0">
                  {formatSize(file.size)}
                </span>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {['pending','converting','pausing'].includes(file.status) && <button className="queue-control" disabled={file.status === 'pausing'} title={locale === 'en-US' ? 'Pause and release worker' : '暂缓并让其他文件先转换'} aria-label={`${locale === 'en-US' ? 'Pause' : '暂缓'} ${file.name}`} onClick={() => void pauseConversion(file.id)}><Pause size={16}/></button>}
                  {file.file && ['paused','error'].includes(file.status) && <button className="queue-control" title={file.status === 'paused' ? (locale === 'en-US' ? 'Resume at queue end' : '恢复并排到队尾') : (locale === 'en-US' ? 'Retry at queue end' : '重试并排到队尾')} aria-label={`${file.status === 'paused' ? (locale === 'en-US' ? 'Resume' : '继续') : (locale === 'en-US' ? 'Retry' : '重试')} ${file.name}`} onClick={() => resumeConversion(file.id)}>{file.status === 'paused' ? <Play size={16}/> : <RotateCcw size={16}/>}</button>}

                  {file.status === "done" && file.cachePath && (
                    <button
                      onClick={() => onPreview ? onPreview(file.id) : setPreviewFile(file.id)}
                      className="p-1.5 text-[#9b9a97] hover:text-[#2563eb] hover:bg-[rgba(37,99,235,0.1)]
                                 rounded-md transition-colors"
                      aria-label={`${t("preview")} ${file.name}`}
                      title={t("preview")}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                  {file.status === "done" && file.cachePath && file.sourcePath && (
                    <button
                      onClick={() => handleSaveBeside(file.id)}
                      disabled={savingId === file.id}
                      className="p-1.5 text-[#9b9a97] hover:text-[#0f7b6c] hover:bg-[rgba(15,123,108,0.1)]
                                 rounded-md transition-colors disabled:opacity-50"
                      title={t("saveBesideTitle")}
                    >
                      {savingId === file.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FolderOpen className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => void removeConversion(file.id).catch(error => toast.error(String(error)))}
                    disabled={["converting", "pending", "pausing"].includes(file.status)}
                    className="p-1.5 text-[#9b9a97] hover:text-[#eb5757] hover:bg-[rgba(235,87,87,0.1)]
                               rounded-md transition-colors"
                    aria-label={`${t("remove")} ${file.name}`}
                    title={t("remove")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewFile && (
        <Preview
          fileId={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  );
}
