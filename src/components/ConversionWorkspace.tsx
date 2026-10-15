import { useEffect, useState } from "react";
import { FileText, ShieldCheck, Layers, ArrowRight } from "lucide-react";
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
  const [selected, setSelected] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const hasFiles = files.length > 0;
  const done = files.filter(f => f.status === "done" && f.cachePath).length;
  const pending = files.filter(f => f.status === "pending" || f.status === "converting").length;
  useEffect(() => {
    if (selected && !files.some(f => f.id === selected)) setSelected(null);
    if (!files.length) setClosed(false);
  }, [files, selected]);
  useEffect(() => {
    if (auto && !closed && !selected) {
      const file = files.find(f => f.status === "done" && f.cachePath);
      if (file) setSelected(file.id);
    }
  }, [files, auto, closed, selected]);

  if (!hasFiles) return <div className="workspace-page conversion-empty">
    <div className="desktop-hero">
      <p className="desktop-eyebrow"><span />{en ? "YOUR FILES. YOUR WORKSPACE." : "本地处理 · 专注内容"}</p>
      <h2>{en ? <>Your documents.<br /><span>Ready for Markdown.</span></> : <>把文件，变成<span>清晰的 Markdown。</span></>}</h2>
      <p className="desktop-hero-description">{en ? "Convert, read and review your documents in one local workspace." : "从格式转换到全文阅读，再到脱敏审核，在本地完成。"}</p>
    </div>
    <DropZone />
    <div className="desktop-feature-row">
      <div><FileText /><h3>{en ? "Multiple formats" : "多格式转换"}</h3><p>{en ? "PDF, Office, images and archives" : "PDF、Office、图片与压缩包"}</p></div>
      <div><Layers /><h3>{en ? "Built for batches" : "适合批量处理"}</h3><p>{en ? "Files, folders and structured exports" : "批量导入，按目录结构导出"}</p></div>
      <div><ShieldCheck /><h3>{en ? "Review before sharing" : "分享之前，先审核"}</h3><p>{en ? "Review redactions and keep recovery packs" : "脱敏全文对照，独立映射恢复"}</p></div>
    </div>
  </div>;

  return <div className="workspace-page desktop-conversion">
    <div className="desktop-workspace-heading">
      <PageHeading title={en ? "Convert files" : "文件转换"} description={en ? "Read the full result, then continue to redaction review or export." : "查看转换后的全文，继续脱敏审核或导出。"} />
      <div className="desktop-task-summary" role="status">
        <span>{en ? `${files.length} documents` : `${files.length} 个文件`}</span>
        <span className="completed">{en ? `${done} completed` : `${done} 已完成`}</span>
        {pending > 0 && <span>{en ? `${pending} pending / processing` : `${pending} 待处理 / 处理中`}</span>}
      </div>
    </div>
    <DropZone compact />
    <div className={`desktop-conversion-grid ${files.length === 1 ? "single" : ""}`}>
      <section className="desktop-queue" aria-label={en ? "File queue" : "文件队列"}>
        <FileList selectedId={selected} onPreview={id => { setSelected(id); setClosed(false); }} />
      </section>
      <section className="desktop-result" aria-label={en ? "Conversion result" : "转换结果"}>
        {selected ? <Preview key={selected} inline fileId={selected} onClose={() => { setSelected(null); setClosed(true); }} /> :
          <div className="desktop-result-empty"><span><FileText /></span><h3>{en ? "Your result appears here" : "转换结果将在这里呈现"}</h3><p>{en ? "Select a completed file to read the full Markdown text." : "选择已完成文件，查看完整 Markdown 内容。"}</p><small><ArrowRight size={14} />{en ? "This preview contains original converted text." : "此处预览为转换后的原文。"}</small></div>}
      </section>
    </div>
  </div>;
}
