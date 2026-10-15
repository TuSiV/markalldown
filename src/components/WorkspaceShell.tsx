import { FileText, ShieldCheck, RotateCcw, FileDown, Settings, CheckCircle2 } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useI18n } from "../i18n";
import type { Workspace } from "../stores/uiStore";
export function Sidebar({ page, onNavigate }: { page: Workspace; onNavigate: (page: Workspace) => void }) {
  const en = useI18n(s => s.locale) === "en-US";
  const ready = useAppStore(s => s.isReady);
  const items = [ ["convert", "文件转换", "Convert files", FileText], ["redaction", "脱敏审核", "Redaction review", ShieldCheck], ["recovery", "文件恢复", "Restore files", RotateCcw], ["export", "导出中心", "Export center", FileDown], ["settings", "设置", "Settings", Settings] ] as const;
  return <aside className="desktop-sidebar">
    <p className="desktop-nav-caption">{en ? "WORKSPACES" : "工作空间"}</p>
    <nav aria-label={en ? "Workspaces" : "工作空间"} className="desktop-navigation">{items.map(([id,zh,eng,Icon]) => <button key={id} aria-label={en ? eng : zh} aria-current={page === id ? "page" : undefined} onClick={() => onNavigate(id)} className="desktop-nav-item" title={en ? eng : zh}><Icon className="w-5 h-5 shrink-0" /><span className="desktop-nav-label">{en ? eng : zh}</span></button>)}</nav>
    <div className="desktop-local-status"><CheckCircle2 className={`w-4 h-4 ${ready ? "text-emerald-600" : "text-slate-400"}`} /><p className="desktop-nav-label desktop-local-title">{ready ? (en ? "Local service ready" : "本地服务就绪") : (en ? "Connecting…" : "正在连接…")}</p><p className="desktop-nav-label">{en ? "AI sends text only with your consent." : "AI 外发须单独授权。"}</p></div>
  </aside>;
}
export function PageHeading({ title, description }: { title: string; description: string }) {
  return <div className="desktop-page-heading"><h2 className="text-2xl font-semibold tracking-tight text-slate-800">{title}</h2><p className="mt-2 text-sm text-slate-500">{description}</p></div>;
}
