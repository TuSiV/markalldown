import { X, Copy, Download, FileText, FolderOpen, Loader2 } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useUIStore } from "../stores/uiStore";
import { useState, useEffect } from "react";
import { api, localizeError } from "../lib/api";
import { useT, useI18n } from "../i18n";

interface PreviewProps {
  fileId: string;
  onClose: () => void;
  inline?: boolean;
}

export function Preview({ fileId, onClose, inline = false }: PreviewProps) {
  const { files, port, token, privacyEnabled } = useAppStore();
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const { previewMode, fontSize, update } = useUIStore();
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const file = files.find(f => f.id === fileId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setContent(null); setFailed(false);
    const load = async () => {
      if (!file) return;
      if (!file.cachePath) {
        setContent(file.result || "");
        setLoading(false);
        return;
      }
      if (!port) {
        setContent(file.preview || file.result || "");
        setFailed(true);
        setLoading(false);
        return;
      }
      try {
        const text = await api.readCachedText({ port, token: token || "" }, file.cachePath);
        if (!cancelled) setContent(text);
      } catch {
        if (!cancelled) { setContent(file.preview || file.result || ""); setFailed(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [fileId, file?.cachePath, port, token]);

  if (!file) return null;

  const markdown = content ?? file.preview ?? file.result ?? "";

  const confirmOriginal = async () => {
    if (!privacyEnabled) return true;
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    return confirm(locale === "en-US" ? "This preview contains original sensitive text. Continue copying or saving?" : "当前预览为含敏感信息的原文，确定复制或保存？", { title: "MarkAllDown", kind: "warning" });
  };
  const handleCopy = async () => {
    if (!await confirmOriginal()) return;
    try { await navigator.clipboard.writeText(markdown); toast.success(t("copied")); } catch (e) { toast.error(String(e)); }
  };

  const handleDownload = async () => {
    if (!await confirmOriginal()) return;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name.replace(/\.[^/.]+$/, "") + ".md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t("downloaded"));
  };

  const handleSaveBeside = async () => {
    if (!port) {
      toast.error(t("serviceNotReady"));
      return;
    }
    if (!file.sourcePath) {
      toast.error(t("noSourceForSave"));
      return;
    }
    if (!await confirmOriginal()) return;
    setSaving(true);
    try {
      const dir = await api.saveBesideSource(
        { port, token: token || "" },
        {
          name: file.name,
          content: file.cachePath ? undefined : markdown,
          cachePath: file.cachePath,
          sourcePath: file.sourcePath,
        }
      );
      toast.success(t("savedTo", { path: dir }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(t("saveFailed", { msg: localizeError(errorMsg, locale) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={inline ? "flex min-h-0 h-full flex-col" : "fixed inset-0 z-50 flex items-center justify-center bg-black/50"} onClick={inline ? undefined : onClose}>
      <div
        className={inline ? "flex flex-col h-full min-h-0 bg-white rounded-xl border overflow-hidden" : "flex flex-col w-full max-w-4xl h-[80vh] bg-white rounded-xl shadow-2xl overflow-hidden"}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-wrap gap-2 items-center justify-between px-4 py-3 border-b border-[rgba(55,53,47,0.09)]">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#9b9a97]" />
            <span className="text-sm font-medium">{file.name}</span>
            <span className="text-xs text-[#9b9a97]">→</span>
            <span className="text-sm text-[#2563eb]">
              {file.name.replace(/\.[^/.]+$/, "")}.md
              {privacyEnabled && (locale === "en-US" ? " (original)" : "（原文）")}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleSaveBeside}
              disabled={saving || loading || failed || !file.sourcePath}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#787774]
                         hover:bg-[#f7f6f3] rounded-md transition-colors disabled:opacity-50"
              title={file.sourcePath ? t("saveBesideTitle") : t("noSourcePath")}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
              {t("saveBeside")}
            </button>
            <button
              disabled={loading || failed}
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#787774]
                         hover:bg-[#f7f6f3] rounded-md transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {t("copy")}
            </button>
            <button
              disabled={loading || failed}
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#787774]
                         hover:bg-[#f7f6f3] rounded-md transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {t("download")}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-[#9b9a97] hover:text-[#37352f] hover:bg-[#f7f6f3]
                         rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="preview-toolbar flex gap-2 px-4 py-3 border-b text-xs">
          <button className="ui-tab" aria-pressed={previewMode === "rendered"} onClick={() => update({ previewMode: "rendered" })}>{locale === "en-US" ? "Rendered" : "阅读预览"}</button>
          <button className="ui-tab" aria-pressed={previewMode === "source"} onClick={() => update({ previewMode: "source" })}>{locale === "en-US" ? "Markdown source" : "Markdown 源文"}</button>
          <span className="ml-auto text-slate-500 self-center">{markdown.length.toLocaleString()} {locale === "en-US" ? "characters" : "字符"}</span>
          {failed && <span className="text-red-700">{locale === "en-US" ? "Full text unavailable; excerpt only" : "全文读取失败，仅显示片段；请重新打开"}</span>}
        </div>
        <div style={{ fontSize }} className="flex-1 overflow-y-auto p-7 markdown-view document-paper">
          {file.warnings?.map(w => <p key={w} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 mb-3">{w}</p>)}
          {loading ? (
            <div className="flex items-center gap-2 text-[#9b9a97] text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("loadingFull")}
            </div>
          ) : (
            previewMode === "source" ? <pre className="whitespace-pre-wrap break-all">{markdown}</pre> : <ReactMarkdown>{markdown}</ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}
