import { FileText, CheckCircle2, XCircle, Loader2, Trash2, Eye, AlertCircle, FolderOpen } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useState } from "react";
import { Preview } from "./Preview";
import { api, localizeError } from "../lib/api";
import { toast } from "sonner";
import { useT, useI18n } from "../i18n";

export function FileList() {
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
    setSavingId(id);
    try {
      const dir = await api.saveBesideSource(
        { port, token: token || "" },
        {
          name: file.name,
          content: file.result,
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
      case "converting":
        return <Loader2 className="w-4 h-4 text-[#2eaadc] animate-spin" />;
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
      case "pending": return t("statusPending");
      case "converting": return t("statusConverting");
      case "done": return t("statusDone");
      case "error": return t("statusError");
      default: return "";
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-[#787774]">
          {t("fileList", { n: files.length })}
        </h2>
        <button
          onClick={clearFiles}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#787774]
                     hover:text-[#eb5757] hover:bg-[rgba(235,87,87,0.1)] rounded-md transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t("clearAll")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border border-[rgba(55,53,47,0.09)]">
        {files.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-[#9b9a97]">
            <p>{t("emptyList")}</p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(55,53,47,0.09)]">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#f7f6f3] transition-colors"
              >
                <div className="flex-shrink-0">
                  {getStatusIcon(file.status)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#9b9a97] flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{file.name}</span>
                    <span className="text-xs text-[#9b9a97]">{getStatusText(file.status)}</span>
                  </div>

                  {file.status === "converting" && (
                    <div className="mt-1.5 w-full bg-[#f7f6f3] rounded-full h-1.5">
                      <div
                        className="bg-[#2eaadc] h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  )}

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
                  {file.status === "done" && file.cachePath && (
                    <button
                      onClick={() => setPreviewFile(file.id)}
                      className="p-1.5 text-[#9b9a97] hover:text-[#2eaadc] hover:bg-[rgba(46,170,220,0.1)]
                                 rounded-md transition-colors"
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
                    onClick={() => removeFile(file.id)}
                    className="p-1.5 text-[#9b9a97] hover:text-[#eb5757] hover:bg-[rgba(235,87,87,0.1)]
                               rounded-md transition-colors"
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
