import { FileDown, Loader2, Languages, ShieldCheck, RotateCcw, Settings } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useI18n, useT } from "../i18n";

interface HeaderProps {
  workspace?: boolean;
  onSettings?: () => void;
  onExport: () => void;
}

export function Header({ onExport, workspace = false, onSettings }: HeaderProps) {
  const { files, isReady, isConverting } = useAppStore();
  const t = useT();
  const toggleLocale = useI18n((s) => s.toggleLocale);
  const english = useI18n(s => s.locale) === "en-US";
  const hasFiles = files.length > 0;
  const completedFiles = files.filter(f => f.status === "done" && f.cachePath).length;

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-[rgba(55,53,47,0.09)] bg-white">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#2563eb] flex items-center justify-center">
            <FileDown className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#37352f] leading-tight">{t("appName")}</h1>
            <p className="text-[10px] text-[#9b9a97] leading-tight">© YONGZHE CHEN</p>
          </div>
        </div>

        {!isReady && (
          <span className="flex items-center gap-1.5 text-xs text-[#9b9a97]">
            <Loader2 className="w-3 h-3 animate-spin" />
            {t("serviceStarting")}
          </span>
        )}
        {isReady && (
          <span className="service-pill">{t("serviceReady")}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasFiles && (
          <span className="text-sm text-[#787774] mr-2">
            {t("progress", { done: completedFiles, total: files.length })}
          </span>
        )}

        {workspace ? <div className="language-segments" role="group" aria-label="中文 / English"><button type="button" aria-pressed={!english} onClick={() => useI18n.getState().setLocale("zh-CN")}>中</button><button type="button" aria-pressed={english} onClick={() => useI18n.getState().setLocale("en-US")}>EN</button></div> : <>        <button
          onClick={toggleLocale}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#787774] rounded-lg hover:bg-[#f7f6f3] transition-colors"
          title="中文 / English"
        >
          <Languages className="w-4 h-4" />
          {t("langSwitch")}
        </button>

</>}

        {onSettings && <button className="icon-button" onClick={onSettings} aria-label={english ? "Open settings" : "打开设置"}><Settings size={19}/></button>}
        {!workspace && <>
        <button
          onClick={onExport}
          disabled={!isReady}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                     bg-[#2563eb] text-white hover:bg-[#2563eb]/90 disabled:opacity-50
                     disabled:cursor-not-allowed transition-colors"
        >
          <FileDown className="w-4 h-4" />
          {t("export")}
        </button>
        </>}
      </div>
    </header>
  );
}
