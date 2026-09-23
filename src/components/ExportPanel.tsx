import { useState } from "react";
import { X, FolderOpen, FileDown, Archive, Loader2, Check } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { api, localizeError } from "../lib/api";
import { toast } from "sonner";
import { useT, useI18n } from "../i18n";

interface ExportPanelProps {
  onClose: () => void;
}

export function ExportPanel({ onClose }: ExportPanelProps) {
  const { files, port, token, exportOptions, setExportOptions } = useAppStore();
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const [exporting, setExporting] = useState(false);
  const [exportPath, setExportPath] = useState<string>("");

  const completedFiles = files.filter(f => f.status === "done" && f.cachePath);

  const handleSelectFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("pickExportTitle"),
      });

      if (selected && typeof selected === "string") {
        setExportPath(selected);
        toast.success(t("savedTo", { path: selected }));
      }
    } catch {
      toast.error(t("pickFailed"));
    }
  };

  const handleExport = async () => {
    if (!port) {
      toast.error(t("serviceNotReady"));
      return;
    }

    const conn = { port, token: token || "" };

    if (!exportPath) {
      toast.warning(t("pickFolderFirst"));
      return;
    }

    setExporting(true);
    try {
      const completedData = completedFiles.map(f => ({
        name: f.name,
        cachePath: f.cachePath,
        relativePath: f.relativePath || f.name,
      }));

      await api.exportFiles(conn, completedData, {
        ...exportOptions,
        exportPath: exportPath,
      });

      toast.success(t("exportSuccess", { n: completedFiles.length, path: exportPath }));
      onClose();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(t("exportFailed", { msg: localizeError(errorMsg, locale) }));
    } finally {
      setExporting(false);
    }
  };

  const formatItems = [
    { value: "individual", label: t("fmtIndividual"), icon: FileDown },
    { value: "combined", label: t("fmtCombined"), icon: FileDown },
    { value: "zip", label: t("fmtZip"), icon: Archive },
  ] as const;

  const structureItems = [
    { value: "flat", label: t("structureFlat") },
    { value: "preserve", label: t("structurePreserve") },
  ] as const;

  return (
    <div className="w-80 border-l border-[rgba(55,53,47,0.09)] bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(55,53,47,0.09)]">
        <h2 className="text-sm font-semibold">{t("exportSettings")}</h2>
        <button
          onClick={onClose}
          className="p-1 text-[#9b9a97] hover:text-[#37352f] hover:bg-[#f7f6f3]
                     rounded-md transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <label className="text-xs font-medium text-[#787774] uppercase tracking-wider">
            {t("exportLocation")}
          </label>
          <div className="mt-2">
            <button
              onClick={handleSelectFolder}
              className="w-full flex items-center gap-2 p-3 text-left text-sm border border-[rgba(55,53,47,0.09)]
                         rounded-lg hover:bg-[#f7f6f3] transition-colors"
            >
              <FolderOpen className="w-4 h-4 text-[#2eaadc]" />
              <span className={exportPath ? "text-[#37352f]" : "text-[#9b9a97]"}>
                {exportPath || t("pickExportDir")}
              </span>
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-[#787774] uppercase tracking-wider">
            {t("exportOutputFormat")}
          </label>
          <div className="mt-2 space-y-2">
            {formatItems.map(({ value, label, icon: Icon }) => (
              <label
                key={value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                  ${exportOptions.format === value
                    ? "border-[#2eaadc] bg-[rgba(46,170,220,0.1)]"
                    : "border-[rgba(55,53,47,0.09)] hover:bg-[#f7f6f3]"
                  }`}
              >
                <input
                  type="radio"
                  name="format"
                  value={value}
                  checked={exportOptions.format === value}
                  onChange={(e) => setExportOptions({ format: e.target.value as any })}
                  className="sr-only"
                />
                <Icon className={`w-4 h-4 ${exportOptions.format === value ? "text-[#2eaadc]" : "text-[#9b9a97]"}`} />
                <span className="text-sm">{label}</span>
                {exportOptions.format === value && (
                  <Check className="w-4 h-4 text-[#2eaadc] ml-auto" />
                )}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-[#787774] uppercase tracking-wider">
            {t("fileNaming")}
          </label>
          <div className="mt-2">
            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-[#f7f6f3] transition-colors">
              <input
                type="checkbox"
                checked={exportOptions.preserveNames}
                onChange={(e) => setExportOptions({ preserveNames: e.target.checked })}
                className="w-4 h-4 rounded border-[rgba(55,53,47,0.09)]"
              />
              <div>
                <span className="text-sm">{t("preserveNames")}</span>
                <p className="text-xs text-[#9b9a97] mt-0.5">
                  {t("preserveNamesHint")}
                </p>
              </div>
            </label>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-[#787774] uppercase tracking-wider">
            {t("folderStructure")}
          </label>
          <div className="mt-2 space-y-2">
            {structureItems.map(({ value, label }) => (
              <label
                key={value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                  ${exportOptions.structure === value
                    ? "border-[#2eaadc] bg-[rgba(46,170,220,0.1)]"
                    : "border-[rgba(55,53,47,0.09)] hover:bg-[#f7f6f3]"
                  }`}
              >
                <input
                  type="radio"
                  name="structure"
                  value={value}
                  checked={exportOptions.structure === value}
                  onChange={(e) => setExportOptions({ structure: e.target.value as any })}
                  className="sr-only"
                />
                <FolderOpen className={`w-4 h-4 ${exportOptions.structure === value ? "text-[#2eaadc]" : "text-[#9b9a97]"}`} />
                <span className="text-sm">{label}</span>
                {exportOptions.structure === value && (
                  <Check className="w-4 h-4 text-[#2eaadc] ml-auto" />
                )}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[rgba(55,53,47,0.09)]">
        <button
          onClick={handleExport}
          disabled={exporting || completedFiles.length === 0 || !exportPath}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium
                     rounded-lg bg-[#2eaadc] text-white hover:bg-[#2eaadc]/90 disabled:opacity-50
                     disabled:cursor-not-allowed transition-colors"
        >
          {exporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("exporting")}
            </>
          ) : (
            <>
              <FileDown className="w-4 h-4" />
              {t("exportCount", { n: completedFiles.length })}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
