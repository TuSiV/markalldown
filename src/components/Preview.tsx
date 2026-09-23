import { X, Copy, Download, FileText, FolderOpen, Loader2 } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { api, localizeError } from "../lib/api";
import { useT, useI18n } from "../i18n";

interface PreviewProps {
  fileId: string;
  onClose: () => void;
}

export function Preview({ fileId, onClose }: PreviewProps) {
  const { files, port, token } = useAppStore();
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const file = files.find(f => f.id === fileId);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!file) return;
      if (!file.cachePath) {
        setContent(file.result || "");
        setLoading(false);
        return;
      }
      if (!port) {
        setContent(file.preview || file.result || "");
        setLoading(false);
        return;
      }
      try {
        const text = await api.readCachedText({ port, token: token || "" }, file.cachePath);
        if (!cancelled) setContent(text);
      } catch {
        if (!cancelled) setContent(file.preview || file.result || "");
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

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown);
    toast.success(t("copied"));
  };

  const handleDownload = () => {
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
    setSaving(true);
    try {
      const dir = await api.saveBesideSource(
        { port, token: token || "" },
        {
          name: file.name,
          content: markdown,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex flex-col w-full max-w-4xl h-[80vh] bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(55,53,47,0.09)]">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#9b9a97]" />
            <span className="text-sm font-medium">{file.name}</span>
            <span className="text-xs text-[#9b9a97]">→</span>
            <span className="text-sm text-[#2eaadc]">
              {file.name.replace(/\.[^/.]+$/, "")}.md
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleSaveBeside}
              disabled={saving || !file.sourcePath}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#787774]
                         hover:bg-[#f7f6f3] rounded-md transition-colors disabled:opacity-50"
              title={file.sourcePath ? t("saveBesideTitle") : t("noSourcePath")}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
              {t("saveBeside")}
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#787774]
                         hover:bg-[#f7f6f3] rounded-md transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {t("copy")}
            </button>
            <button
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

        <div className="flex-1 overflow-y-auto p-6 prose prose-sm max-w-none">
          {loading ? (
            <div className="flex items-center gap-2 text-[#9b9a97] text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("loadingFull")}
            </div>
          ) : (
            <ReactMarkdown>{markdown}</ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}
