import { FileText, FileDown, Settings, CheckCircle2 } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useI18n } from "../i18n";
import type { Workspace } from "../stores/uiStore";
export function Sidebar({ page, onNavigate }: { page: Workspace; onNavigate: (page: Workspace) => void }) {
  const en = useI18n(s => s.locale) === "en-US";
  const ready = useAppStore(s => s.isReady);
  const items = [ ["convert", "文件转换", "Convert files", FileText], ["export", "导出中心", "Export center", FileDown], ["settings", "设置", "Settings", Settings] ] as const;
  return <aside className="w-20 lg:w-52 shrink-0 border-r border-slate-200 bg-[#f8fafc] flex flex-col p-3">
    <p className="hidden lg:block text-xs uppercase tracking-widest text-slate-500 px-3 py-4">{en ? "WORKSPACES" : "工作空间"}</p>
    <nav aria-label={en ? "Workspaces" : "工作空间"} className="space-y-2">{items.map(([id,zh,eng,Icon]) => <button key={id} aria-label={en ? eng : zh} aria-current={page === id ? "page" : undefined} onClick={() => onNavigate(id)} className={`w-full flex items-center justify-center lg:justify-start gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${page === id ? "bg-blue-100 text-blue-800" : "text-slate-600 hover:bg-slate-200/60"}`}><Icon className="w-5 h-5 shrink-0" /><span className="hidden lg:inline">{en ? eng : zh}</span></button>)}</nav>
    <div className="mt-auto rounded-xl bg-white border border-slate-200 p-3 text-xs text-slate-500"><CheckCircle2 className={`w-4 h-4 ${ready ? "text-emerald-600" : "text-slate-400"}`} /><p className="hidden lg:block mt-2 font-semibold text-slate-700">{en ? "Local workspace" : "本地工作区"}</p><p className="hidden lg:block mt-1">{en ? "Conversion results are saved locally." : "转换结果在本机保存。"}</p></div>
  </aside>;
}
export function PageHeading({ title, description }: { title: string; description: string }) {
  return <div className="mb-5"><h2 className="text-2xl font-semibold tracking-tight text-slate-800">{title}</h2><p className="mt-2 text-sm text-slate-500">{description}</p></div>;
}
