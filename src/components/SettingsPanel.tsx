import { APP_VERSION } from "../version";
import brandMark from "../assets/brand.svg";
import { useState } from "react";
import { SlidersHorizontal, Eye, FileDown, Languages, ShieldCheck } from "lucide-react";
import { useI18n } from "../i18n";
import { useUIStore } from "../stores/uiStore";
import { useAppStore, type ExportOptions } from "../stores/appStore";
import { PageHeading } from "./WorkspaceShell";
export function SettingsPanel() {
  const { locale,setLocale } = useI18n();const en = locale === "en-US";
  const [tab,setTab] = useState("general");
  const p = useUIStore();const ready = useAppStore(s => s.isReady);
  const tr = (zh: string,eng: string) => en ? eng : zh;
  const setExport = (patch: Partial<ExportOptions>) => { const next = {...p.exportDefaults,...patch};p.update({ exportDefaults:next });useAppStore.getState().setExportOptions(next); };
  return <div className="workspace-page overflow-auto h-full"><PageHeading title={tr("设置","Settings")} description={tr("管理立即生效的界面、转换与导出偏好。","Manage working interface, conversion and export preferences.")} />
    <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-5 max-w-6xl">
      <div className="space-y-5">
        <div className="settings-tabs" role="tablist" aria-label={tr("设置分类", "Settings sections")}>{[["general",tr("通用与预览","General & preview"),Eye],["conversion",tr("转换","Conversion"),SlidersHorizontal],["export",tr("导出","Export"),FileDown]] .map(([id,label,Icon]) => {const Glyph=Icon as typeof Eye;return <button type="button" role="tab" aria-selected={tab===id} key={String(id)} onClick={()=>setTab(String(id))}><Glyph size={17}/>{String(label)}</button>;})}</div>
        <section hidden={tab!=="general"} className="ui-card settings-section space-y-4"><h3 className="section-title">{tr("通用与预览","General and preview")}</h3>
          <label className="settings-row">{tr("界面语言","Language")}<select value={locale} onChange={e => setLocale(e.target.value as "zh-CN" | "en-US")}><option value="zh-CN">中文</option><option value="en-US">English</option></select></label>
          <label className="settings-row">{tr("转换完成后自动预览","Automatically preview completed files")}<input className="ui-switch" type="checkbox" checked={p.autoPreview} onChange={e => p.update({autoPreview:e.target.checked})} /></label>
          <label className="settings-row">{tr("默认预览方式","Default preview mode")}<select value={p.previewMode} onChange={e => p.update({previewMode:e.target.value as "rendered" | "source"})}><option value="rendered">{tr("阅读预览","Rendered")}</option><option value="source">Markdown</option></select></label>
          <label className="settings-row">{tr("预览字号","Preview font size")}<select value={p.fontSize} onChange={e => p.update({fontSize:Number(e.target.value)})}>{[14,16,18].map(n => <option key={n} value={n}>{n} px</option>)}</select></label>
        </section>
        <section hidden={tab!=="conversion"} className="ui-card settings-section space-y-4"><h3 className="section-title">{tr("转换","Conversion")}</h3><label className="settings-row">{tr("并发转换数量（下一批生效）","Concurrent conversions (next batch)")}<select value={p.concurrency} onChange={e => p.update({concurrency:Number(e.target.value)})}>{[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}</select></label><p className="text-xs text-slate-500">{tr("PDF 文本提取与 OCR 自动处理；OCR 密集任务会排队，建议从 1 个并发开始。","PDF text extraction and OCR are automatic; OCR-heavy tasks may queue. Start with one concurrent conversion.")}</p></section>
        <section hidden={tab!=="export"} className="ui-card settings-section space-y-4"><h3 className="section-title">{tr("导出默认值","Export defaults")}</h3><label className="settings-row">{tr("默认格式","Default format")}<select value={p.exportDefaults.format} onChange={e => setExport({ format:e.target.value as ExportOptions["format"] })}><option value="individual">{tr("独立 MD","Individual MD")}</option><option value="combined">{tr("合并 MD","Combined MD")}</option><option value="zip">ZIP</option></select></label><label className="settings-row">{tr("保留原文件名","Preserve filenames")}<input className="ui-switch" type="checkbox" checked={p.exportDefaults.preserveNames} onChange={e => setExport({preserveNames:e.target.checked})}/></label><label className="settings-row">{tr("目录结构","Folder structure")}<select value={p.exportDefaults.structure} onChange={e => setExport({structure:e.target.value as ExportOptions["structure"]})}><option value="flat">{tr("平铺","Flat")}</option><option value="preserve">{tr("保留目录","Preserve folders")}</option></select></label></section>
        <button className="ui-secondary" onClick={() => {p.reset();useAppStore.getState().setExportOptions({...useUIStore.getState().exportDefaults});}}>{tr("恢复界面与导出默认设置","Reset interface and export preferences")}</button>
      </div>
      <aside className="space-y-5 settings-info"><section className="ui-card"><img className="settings-app-icon" src={brandMark} alt=""/><h3 className="section-title mt-4">MarkAllDown</h3><p className="text-sm mt-2">v{APP_VERSION}</p><p className="text-xs text-slate-500 mt-4">© YONGZHE CHEN</p><p className="text-sm mt-4">{ready ? tr("本地服务已连接","Local service connected") : tr("本地服务未就绪","Local service not ready")}</p></section><section className="ui-card text-sm space-y-3"><h3 className="section-title flex gap-2"><ShieldCheck size={18}/>{tr("隐私与存储","Privacy and storage")}</h3><p>{tr("这里只保存非敏感偏好。原文、脱敏词表和口令不写入偏好存储。","Only non-sensitive preferences are saved here. Source text, redaction terms and passwords are excluded.")}</p><p>{tr("恢复库需明确选择保存；AI 外发需单独同意。","Recovery packs are retained only on request; AI transmission requires separate consent.")}</p><p>{tr("重置偏好不删除文件、恢复包或审核状态。","Resetting preferences does not delete files, recovery packs or review state.")}</p></section></aside>
    </div>
  </div>;
}
