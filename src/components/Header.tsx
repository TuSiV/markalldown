import brandMark from "../assets/brand.svg";
import { FileDown, Loader2, Languages, ShieldCheck, RotateCcw, Settings } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useI18n, useT } from "../i18n";

interface HeaderProps {
  workspace?: boolean;
  onSettings?: () => void;
  onExport: () => void;
  onRedact: () => void;
  onRecovery: () => void;
}

export function Header({ onExport, onRedact, onRecovery, workspace = false, onSettings }: HeaderProps) {
  const { files, isReady } = useAppStore();
  const t = useT();
  const toggleLocale = useI18n((s) => s.toggleLocale);
  const english = useI18n(s => s.locale) === "en-US";
  const hasFiles = files.length > 0;
  const completedFiles = files.filter(f => f.status === "done" && f.cachePath).length;

  return (
    <header className="desktop-header">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <img className="desktop-brand-mark" src={brandMark} alt="" />
          <div>
            <h1 className="desktop-brand-name">{t("appName")}</h1>
            <p className="desktop-brand-caption">{english ? "LOCAL DOCUMENT WORKSPACE" : "本地文档工作台"}</p>
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

      <div className="desktop-header-actions">
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
        <button onClick={onRedact} disabled={!isReady} className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg disabled:opacity-50"><ShieldCheck className="w-4 h-4" />{english ? "Redact" : "脱敏审核"}</button>
        <button onClick={onRecovery} disabled={!isReady} className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg disabled:opacity-50"><RotateCcw className="w-4 h-4" />{english ? "Restore" : "文件恢复"}</button>
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
