import { useState } from "react";
import { X, FolderOpen, FileDown, Archive, Loader2, Check } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { api, localizeError } from "../lib/api";
import { toast } from "sonner";
import { useT, useI18n } from "../i18n";

interface ExportPanelProps {
  workspace?: boolean;
  onClose: () => void;
}

export function ExportPanel({ onClose, workspace = false }: ExportPanelProps) {
  const { files, port, token, exportOptions, setExportOptions } = useAppStore();
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const [delivery, setDelivery] = useState<{ path: string } | null>(null);
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

      const output = await api.exportFiles(conn, completedData, {
        ...exportOptions,
        exportPath: exportPath,
      });

      toast.success(t("exportSuccess", { n: completedFiles.length, path: exportPath }));
      setDelivery({ path: typeof output === "string" ? output : exportPath });
      if (!workspace) onClose();
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
    <div className={workspace ? "workspace-page h-full overflow-auto flex flex-col" : "w-80 border-l border-[rgba(55,53,47,0.09)] bg-white flex flex-col"}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(55,53,47,0.09)]">
        <h2 className="text-2xl font-semibold">{locale === "en-US" ? "Export center" : "导出中心"}</h2>
        <button
          onClick={onClose}
          aria-label={locale === "en-US" ? "Back to conversion" : "返回转换"}
          className="p-1 text-[#9b9a97] hover:text-[#37352f] hover:bg-[#f7f6f3]
                     rounded-md transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className={workspace ? "export-layout" : ""}>
      <div className={workspace ? "export-config-grid" : "flex-1 overflow-y-auto p-4 space-y-6"}>
        <div>
          <label className="text-xs font-medium text-[#787774] uppercase tracking-wider">
            {t("exportLocation")}
          </label>
          <div className="mt-2">
            <button
              onClick={handleSelectFolder}
              disabled={exporting}
              className="w-full flex items-center gap-2 p-3 text-left text-sm border border-[rgba(55,53,47,0.09)]
                         rounded-lg hover:bg-[#f7f6f3] transition-colors"
            >
              <FolderOpen className="w-4 h-4 text-[#2563eb]" />
              <span className={exportPath ? "text-[#37352f]" : "text-[#9b9a97]"}>
                {exportPath || t("pickExportDir")}
              </span>
            </button>
          </div>
        </div>

        <div className="ui-card">
          <label className="text-xs font-medium text-[#787774] uppercase tracking-wider">
            {t("exportOutputFormat")}
          </label>
          <div className="mt-2 space-y-2">
            {formatItems.map(({ value, label, icon: Icon }) => (
              <label
                data-selected={exportOptions.format === value}
                key={value}
                className={`export-option flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                  ${exportOptions.format === value
                    ? "border-[#2563eb] bg-[rgba(37,99,235,0.1)]"
                    : "border-[rgba(55,53,47,0.09)] hover:bg-[#f7f6f3]"
                  }`}
              >
                <input
                  type="radio"
                  name="format"
                  disabled={exporting}
                  value={value}
                  checked={exportOptions.format === value}
                  onChange={(e) => setExportOptions({ format: e.target.value as any })}
                  className="sr-only"
                />
                <Icon className={`w-4 h-4 ${exportOptions.format === value ? "text-[#2563eb]" : "text-[#9b9a97]"}`} />
                <span className="export-option-label"><strong>{label}</strong><small>{value === "individual" ? (locale === "en-US" ? "One Markdown document per file" : "每个文件单独保存为 Markdown") : value === "combined" ? (locale === "en-US" ? "Combine all content in one document" : "将整批内容合并到一个文档") : (locale === "en-US" ? "Package Markdown files together" : "将 Markdown 文件打包保存")}</small></span>
                {exportOptions.format === value && (
                  <Check className="w-4 h-4 text-[#2563eb] ml-auto" />
                )}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-[#787774] uppercase tracking-wider">
            {t("fileNaming")} {exportOptions.format === "combined" && <span>{locale === "en-US" ? "(combined.md)" : "（合并文件固定为 combined.md）"}</span>}
          </label>
          <div className="mt-2">
            <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-[#f7f6f3] transition-colors">
              <input
                type="checkbox"
                checked={exportOptions.preserveNames}
                disabled={exporting || exportOptions.format === "combined"}
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
                    ? "border-[#2563eb] bg-[rgba(37,99,235,0.1)]"
                    : "border-[rgba(55,53,47,0.09)] hover:bg-[#f7f6f3]"
                  }`}
              >
                <input
                  type="radio"
                  name="structure"
                  value={value}
                  disabled={exporting || exportOptions.format === "combined"}
                  checked={exportOptions.structure === value}
                  onChange={(e) => setExportOptions({ structure: e.target.value as any })}
                  className="sr-only"
                />
                <FolderOpen className={`w-4 h-4 ${exportOptions.structure === value ? "text-[#2563eb]" : "text-[#9b9a97]"}`} />
                <span className="text-sm">{label}</span>
                {exportOptions.structure === value && (
                  <Check className="w-4 h-4 text-[#2563eb] ml-auto" />
                )}
              </label>
            ))}
          </div>
        </div>
      </div>

      {workspace && <div className="ui-card export-batch mx-4 mb-4 text-sm space-y-3">
        <h3 className="font-semibold">{locale === "en-US" ? "Current batch" : "本次导出批次"} · {completedFiles.length}</h3>
        <p className="text-slate-500">{locale === "en-US" ? "Converted Markdown" : "转换后的 Markdown 全文"}</p>
        <ul className="max-h-48 overflow-auto divide-y">{completedFiles.map(f => <li className="batch-file" key={f.id}><FileDown size={17}/><span>{f.relativePath || f.name}</span><span className="status-badge status-done">{locale === "en-US" ? "Ready" : "可导出"}</span></li>)}</ul>
        {delivery && <div role="status" className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-2 break-all"><p className="font-semibold">{locale === "en-US" ? "Export completed" : "导出已完成"}</p><p>{delivery.path}</p></div>}
      </div>}
      </div>
      <div className="export-actions p-4 border-t border-[rgba(55,53,47,0.09)]">
        <button
          onClick={handleExport}
          disabled={exporting || completedFiles.length === 0 || !exportPath}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium
                     rounded-lg bg-[#2563eb] text-white hover:bg-[#2563eb]/90 disabled:opacity-50
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
