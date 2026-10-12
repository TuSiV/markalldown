import { useEffect, useState } from "react";
import { StatCard } from "./Visual";
import { FileText } from "lucide-react";
import { DropZone } from "./DropZone";
import { FileList } from "./FileList";
import { Preview } from "./Preview";
import { PageHeading } from "./WorkspaceShell";
import { useAppStore } from "../stores/appStore";
import { useUIStore } from "../stores/uiStore";
import { useI18n } from "../i18n";
export function ConversionWorkspace() {
  const files = useAppStore(s => s.files);
  const en = useI18n(s => s.locale) === "en-US";
  const auto = useUIStore(s => s.autoPreview);
  const [selected,setSelected] = useState<string | null>(null);
  const [closed,setClosed] = useState(false);
  useEffect(() => { if (selected && !files.some(f => f.id === selected)) setSelected(null); }, [files,selected]);
  useEffect(() => { if (auto && !closed && !selected) { const f = files.find(f => f.status === "done" && f.cachePath); if (f) setSelected(f.id); } }, [files,auto,closed,selected]);
  return <div className="workspace-page flex flex-col h-full min-h-0">
    <PageHeading title={en ? "Convert files" : "文件转换"} description={en ? "Import documents or folders, then preview Markdown and continue to review or export." : "导入文件或文件夹，查看 Markdown 全文，再进入脱敏审核或导出。"} />
    <div className="grid grid-cols-3 gap-3 mb-5"><StatCard value={files.filter(f=>f.cachePath || f.status !== "done").length} label={en ? "Documents" : "文件任务"} /><StatCard value={files.filter(f=>f.status === "done" && f.cachePath).length} label={en ? "Converted" : "转换完成"} tone="green" /><StatCard value={files.filter(f=>f.status === "pending" || f.status === "converting").length} label={en ? "Processing" : "待处理 / 处理中"} tone="amber" /></div>
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,1fr)_minmax(360px,1fr)] gap-5 flex-1 min-h-0 overflow-auto">
      <div className="flex flex-col min-h-[360px] min-w-0"><DropZone compact={files.length > 0} /><FileList selectedId={selected} onPreview={id => { setSelected(id);setClosed(false); }} /></div>
      <div className="min-h-[380px] min-w-0">{selected ? <Preview key={selected} inline fileId={selected} onClose={() => {setSelected(null);setClosed(true);}} /> : <div className="h-full min-h-[380px] bg-white border border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-500 gap-3"><FileText className="w-10 h-10 text-slate-300" /><p>{en ? "Select a completed file to preview" : "选择已完成文件查看全文"}</p><p className="text-xs">{en ? "Preview displays original converted text." : "此处预览为转换后的原文。"}</p></div>}</div>
    </div>
  </div>;
}
