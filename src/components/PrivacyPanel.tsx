import { FileGlyph, StatCard, HighlightedText } from "./Visual";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { privacyApi, PrivacySuggestion, PrivacyResult } from "../lib/privacyApi";
import { useAppStore } from "../stores/appStore";
import { useI18n } from "../i18n";
import { usePrivacyStore, type PrivacySettings, terms } from "../stores/privacyStore";

const CATEGORY_OPTIONS = [
  ["phone", "手机号", "Phone"],
  ["email", "邮箱", "Email"],
  ["id_card", "身份证号", "National ID"],
  ["bank_account", "银行账号", "Bank account"],
  ["credit_code", "统一社会信用代码", "Company ID"],
  ["case_number", "案件编号", "Case number"],
  ["date", "日期", "Date"],
  ["amount", "金额", "Amount"],
  ["address", "地址", "Address"],
  ["file_code", "合同/文件编号", "Document ID"],
];
export function PrivacyPanel({ onExport }: { onExport: () => void }) {
  const { files, port, token, exportOptions, privacyEnabled: enabled, setPrivacyEnabled: setEnabled } = useAppStore();
  const locale = useI18n(s => s.locale);
  const english = locale === "en-US";
  const tr = (zh: string, en: string) => english ? en : zh;
  const { categories, keywords, whitelist, passphrase, anonymousNames, saveToLibrary,
    preparedFiles, setPreparedFiles, updateSettings } = usePrivacyStore();
  function setter<K extends keyof PrivacySettings>(key: K) {
    return (value: PrivacySettings[K] | ((old: PrivacySettings[K]) => PrivacySettings[K])) => {
      const current = usePrivacyStore.getState()[key];
      updateSettings({ [key]: typeof value === "function" ? (value as (old: PrivacySettings[K]) => PrivacySettings[K])(current) : value });
    };
  }
  const setCategories = setter("categories"), setKeywords = setter("keywords"), setWhitelist = setter("whitelist");
  const setPassphrase = setter("passphrase"), setAnonymousNames = setter("anonymousNames");
  const [reviewedRedaction, setReviewedRedaction] = useState<PrivacyResult | null>(null);
  const [viewMode, setViewMode] = useState<"masked" | "compare" | "marked">("compare");
  const originalPane = useRef<HTMLPreElement>(null);
  const maskedPane = useRef<HTMLPreElement>(null);
  const syncedScroll = useRef(new WeakMap<HTMLPreElement, number>());
  const syncScroll = (source: HTMLPreElement, target: HTMLPreElement | null) => {
    if (viewMode !== "compare" || !target) return;
    const expected = syncedScroll.current.get(source);
    syncedScroll.current.delete(source);
    // Ignore the scroll event caused by moving the other pane, avoiding feedback.
    if (expected !== undefined && Math.abs(source.scrollTop - expected) < 1) return;
    const sourceRange = source.scrollHeight - source.clientHeight;
    if (sourceRange <= 0) return;
    const progress = Math.max(0, Math.min(1, source.scrollTop / sourceRange));
    const next = progress * Math.max(0, target.scrollHeight - target.clientHeight);
    if (Math.abs(target.scrollTop - next) < 1) return;
    target.scrollTop = next;
    syncedScroll.current.set(target, target.scrollTop);
  };
  useEffect(() => {
    syncedScroll.current = new WeakMap();
    for (const pane of [originalPane.current, maskedPane.current]) {
      if (pane) pane.scrollTop = 0;
    }
  }, [viewMode, reviewedRedaction]);
  const [busy, setBusy] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [reviewFileId, setReviewFileId] = useState("");
  const [findings, setFindings] = useState<Array<{ category: string; original: string; count: number }>>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [aiBaseUrl, setAiBaseUrl] = useState("https://api.openai.com/v1");
  const [aiModel, setAiModel] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [suggestions, setSuggestions] = useState<PrivacySuggestion[]>([]);

  const policyKey = JSON.stringify({ categories, keywords: terms(keywords), whitelist: terms(whitelist) });
  useEffect(() => {
    setReviewedRedaction(null); setPreviewCount(null);
    setPreviewText(""); setFindings([]); setSuggestions([]); setAiConsent(false);
  }, [policyKey, passphrase]);
  useEffect(() => { setAiConsent(false); }, [aiBaseUrl, aiModel, reviewFileId, aiEnabled]);
  const ready = files.filter(f => f.status === "done" && f.cachePath);
  const selectedFile = ready.find(f => f.id === reviewFileId) || ready[0];
  const prepared = selectedFile ? preparedFiles[selectedFile.id] : undefined;
  const validPrepared = (file: typeof ready[number]) => {
    const p = preparedFiles[file.id];
    return p && p.optionsKey === policyKey && p.passphrase === passphrase && p.cachePath === file.cachePath ? p : undefined;
  };
  const approvedCount = ready.filter(f => validPrepared(f)?.approved).length;
  const conn = port ? { port, token: token || "" } : null;
  const options = () => ({ categories, keywords: terms(keywords), whitelist: terms(whitelist) });
  const validate = () => {
    if (!conn) throw new Error(tr("本地服务未就绪", "Local service not ready"));
    if (passphrase.length < 8) throw new Error(tr("映射加密口令至少 8 个字符", "Vault passphrase requires at least 8 characters"));
    if (ready.length > 100) throw new Error(tr("每批最多 100 个文件，请拆分批次", "At most 100 documents per batch; split the batch"));
    if (!ready.length) throw new Error(tr("没有已转换文件", "No converted files"));
    return conn;
  };

  // Reuse the exact reviewed result when export settings are unchanged. Otherwise
  // placeholder IDs would be different between preview and export.
  const prepareFirst = async (): Promise<PrivacyResult> => {
    const connection = validate();
    const file = ready.find(f => f.id === reviewFileId) || ready[0];
    const optionsKey = JSON.stringify(options());
    const original = await api.readCachedText(connection, file.cachePath!);
    setSourceText(original);
    if (prepared && prepared.fileId === file.id && prepared.optionsKey === optionsKey &&
        prepared.passphrase === passphrase && prepared.cachePath === file.cachePath && original === prepared.original) {
      return prepared.value;
    }
    const value = await privacyApi.redact(connection, original, options(), passphrase, file.documentId);
    if (file.documentId !== value.documentId) useAppStore.getState().patchFile(file.id, { documentId: value.documentId });
    setPreparedFiles(old => ({ ...old, [file.id]: { fileId: file.id, optionsKey, passphrase, cachePath: file.cachePath!, original, value, approved: false } }));
    return value;
  };
  const preview = async () => {
    setBusy(true);
    try {
      const processed = await prepareFirst();
      setAiConsent(false);
      setReviewedRedaction(processed);
      setPreviewText(processed.content);
      setPreviewCount(processed.summary.occurrences);
      setFindings(processed.summary.findings);
      setSuggestions([]);
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  };

  const suggest = async () => {
    setBusy(true);
    try {
      const connection = validate();
      if (!aiConsent) throw new Error(tr("须明确同意外发脱敏稿", "Explicit consent to send redacted text is required"));
      if (!aiModel.trim()) throw new Error(tr("请填写模型名称", "Enter an AI model"));
      // Require the actual outbound text to have been previewed under the same
      // rule settings. We never silently reprocess and transmit unseen text.
      const selectedFile = ready.find(f => f.id === reviewFileId) || ready[0];
      if (!prepared || !reviewedRedaction || reviewedRedaction !== prepared.value ||
          prepared.fileId !== selectedFile.id ||
          prepared.optionsKey !== JSON.stringify(options()) || prepared.passphrase !== passphrase || prepared.cachePath !== selectedFile.cachePath) {
        throw new Error(tr("请先预览当前文件的完整待发送内容；调整规则后须重新预览", "Preview the outbound text first; review again after changing rules"));
      }
      const processed = prepared.value;
      const current = await api.readCachedText(connection, selectedFile.cachePath!);
      if (current !== prepared.original) throw new Error(tr("原文已改变，请重新审核", "Source changed; review again"));
      if (!prepared.approved) throw new Error(tr("请先确认全文审核", "Approve full document review first"));
      const result = await privacyApi.suggest(connection, processed.content.slice(0, 20000), {
        baseUrl: aiBaseUrl.trim(), model: aiModel.trim(), apiKey: aiKey, consent: aiConsent,
      });
      setAiConsent(false);
      setSuggestions(result.suggestions);
      toast.success(tr(`AI 提出了 ${result.suggestions.length} 条待审核建议`, `AI proposed ${result.suggestions.length} candidates`));
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally { setBusy(false); }
  };

  const chooseFile = (id: string) => { setReviewFileId(id); setPreviewCount(null); setReviewedRedaction(null); setPreviewText(""); setFindings([]); };
  return <section className="privacy-workspace">
    <div className="review-banner"><div><h3>{tr("先识别，再审核，最后导出", "Detect, review, then export")}</h3><p>{tr("每批最多 100 个文件；每批一个恢复包，可单独恢复任一文件。", "Up to 100 documents per batch; one pack can restore any document.")}</p></div><label className="switch-label"><input className="ui-switch" type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />{tr("启用脱敏", "Enable redaction")}</label></div>
    {!enabled && <div className="empty-workspace"><h3>{tr("启用脱敏以开始审核", "Enable redaction to begin")}</h3><p>{tr("原文预览、复制和保存与脱敏导出分别处理。", "Original preview, copy and save are separate from redacted export.")}</p></div>}
    {enabled && <fieldset disabled={busy} className="review-grid">
      <aside className="ui-card review-queue space-y-4">
        <div className="card-title"><h3>{tr("审核文件队列", "Review queue")}</h3><span className="count-pill">{ready.length}</span></div>
        <div className="review-file-list">{ready.map(f => <button type="button" key={f.id} aria-pressed={selectedFile?.id === f.id} onClick={() => chooseFile(f.id)} className="review-file"><FileGlyph name={f.name}/><span className="min-w-0 flex-1"><strong>{f.name}</strong><span className={`status-badge ${validPrepared(f)?.approved ? "status-done" : "status-pending"}`}>{validPrepared(f)?.approved ? tr("已审核", "Reviewed") : tr("待审核", "Pending")}</span></span></button>)}</div>
        {!ready.length && <p className="hint">{tr("请先转换或导入 MD 文件。", "Convert or import Markdown first.")}</p>}
        <label className="sr-only">{tr("选择要预览的文件", "Select file to review")}<select value={reviewFileId} onChange={e => chooseFile(e.target.value)}><option value="">{tr("首个已转换文件", "First completed file")}</option>{ready.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <details className="rule-details" open><summary>{tr("检测规则", "Detection rules")}</summary><div className="rule-chips">{CATEGORY_OPTIONS.map(([key,zh,en]) => <label className={categories.includes(key) ? "rule-chip active" : "rule-chip"} key={key}><input type="checkbox" checked={categories.includes(key)} onChange={e => setCategories(old => e.target.checked ? [...old,key] : old.filter(v => v !== key))}/>{english ? en : zh}</label>)}</div></details>
        <label className="form-label">{tr("自定义敏感词（每行一个，精确替换）", "Sensitive terms (one exact phrase per line)")}<textarea value={keywords} onChange={e => setKeywords(e.target.value)} rows={3} placeholder={tr("姓名、公司、项目名称…", "Names, organizations, projects…")}/></label>
        <label className="form-label">{tr("白名单（每行一个，不替换）", "Whitelist (one phrase per line, not redacted)")}<textarea value={whitelist} onChange={e => setWhitelist(e.target.value)} rows={2}/></label>
      </aside>
      <div className="ui-card review-document min-w-0">
        <div className="card-title"><div><h3>{selectedFile?.name || tr("全文审核", "Full review")}</h3><p className="hint">Markdown · {previewCount === null ? tr("等待识别", "Awaiting detection") : tr(`${previewCount} 处替换`, `${previewCount} replacements`)}</p></div></div>
        <div className="segmented-controls" aria-label={tr("审核视图", "Review view")}><button type="button" aria-pressed={viewMode === "marked"} onClick={() => setViewMode("marked")}>{tr("标记原文", "Marked original")}</button><button type="button" aria-pressed={viewMode === "masked"} onClick={() => setViewMode("masked")}>{tr("脱敏稿", "Masked text")}</button><button type="button" aria-pressed={viewMode === "compare"} onClick={() => setViewMode("compare")}>{tr("左右对照", "Compare")}</button></div>
        {previewCount !== null ? <div className={viewMode === "compare" ? "review-text-columns" : "review-text-single"}>
          {viewMode !== "masked" && <div><p className="pane-label">{tr("原文 · 仅本地", "Original · local")}</p><pre ref={originalPane} onScroll={e => syncScroll(e.currentTarget, maskedPane.current)} className="review-paper"><HighlightedText text={sourceText} terms={findings}/></pre></div>}
          {viewMode !== "marked" && <div><p className="pane-label">{tr("脱敏后的完整文本", "Full masked text")}</p><pre ref={maskedPane} onScroll={e => syncScroll(e.currentTarget, originalPane.current)} className="review-paper">{previewText}</pre></div>}
        </div> : <div className="empty-workspace"><h3>{tr("全文将在此展示", "Full text appears here")}</h3><p>{tr("设置检测规则与口令后，检查所选文件。", "Set rules and a password, then review the selected file.")}</p></div>}
        <div className="review-document-footer"><button type="button" disabled={busy || !ready.length} onClick={preview} className="ui-primary">{busy ? tr("处理中…", "Processing…") : tr("检查所选文件的脱敏内容", "Review selected file")}</button>
          {prepared && reviewedRedaction === prepared.value && <label className="review-approval"><input type="checkbox" checked={prepared.approved} onChange={e => {const approved=e.target.checked;setPreparedFiles(old => ({...old,[prepared.fileId]:{...prepared,approved}}));}}/>{tr("我已检查所选文件的全文及替换结果", "I reviewed the entire selected document and replacements")}</label>}
          <button type="button" className="ui-secondary" disabled={!ready.some(f => f.id !== selectedFile?.id && !validPrepared(f)?.approved)} onClick={() => {const f=ready.find(f => f.id !== selectedFile?.id && !validPrepared(f)?.approved);if(f)chooseFile(f.id);}}>{tr("下一份待审核", "Next pending file")}</button>
        </div>
      </div>
      <aside className="space-y-4">
        <div className="ui-card space-y-4"><h3 className="section-title">{tr("审核统计", "Review summary")}</h3><div className="grid grid-cols-2 gap-2"><StatCard value={previewCount ?? "—"} label={tr("当前替换", "Replacements")}/><StatCard value={approvedCount} label={tr("已审核文件", "Reviewed files")} tone="green"/></div><p className="hint">{tr(`整批审核：${approvedCount}/${ready.length} 个文件已确认`, `Batch review: ${approvedCount}/${ready.length} approved`)}</p>
          <div className="finding-list">{findings.map((item,i) => <div className="finding-row" key={`${item.category}-${i}`}><span><strong>{item.original}</strong><small>{CATEGORY_OPTIONS.find(c=>c[0]===item.category)?.[english ? 2 : 1] || item.category} × {item.count}</small></span><button type="button" className="text-button" onClick={() => {setWhitelist(prev => [...terms(prev),item.original].filter((x,i,arr)=>arr.indexOf(x)===i).join("\n"));setPreviewCount(null);}}>{tr("加入白名单", "Whitelist")}</button></div>)}</div>
        </div>
        <div className="ui-card space-y-4"><h3 className="section-title">{tr("加密与导出", "Encryption and export")}</h3><label className="form-label">{tr("映射文件加密口令（至少8字符，不会保存）", "Vault passphrase (8+ chars, never stored)")}<input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} autoComplete="new-password"/></label>
          <label className="checkbox-row"><input type="checkbox" checked={anonymousNames} onChange={e => setAnonymousNames(e.target.checked)}/><span>{tr("匿名化脱敏版文件名和目录（可选，默认保留原文件名）", "Anonymize redacted output filenames and folders (optional; keep original names by default)")}</span></label>
          <label className="checkbox-row"><input type="checkbox" checked={saveToLibrary} onChange={e => updateSettings({saveToLibrary:e.target.checked})}/><span>{tr("导出时将加密恢复包另存到本机恢复库（默认关闭，不保存原文或口令）", "Also keep the encrypted recovery pack in the local library (off by default; no source or password)")}</span></label>
          <button type="button" className="ui-primary w-full" disabled={busy || !ready.length || ready.length>100 || approvedCount!==ready.length} onClick={onExport}>{tr(`完成审核，前往导出（${ready.length} 个文件）`, `Finish review and export (${ready.length} files)`)}</button>
          {prepared && <details className="identity-details"><summary>{tr("文档与脱敏版本编号", "Document and processing IDs")}</summary><p>{prepared.value.documentId}</p><p>{prepared.value.processingId}</p></details>}
        </div>
        <div className="ui-card space-y-3"><label className="switch-label"><input className="ui-switch" type="checkbox" checked={aiEnabled} onChange={e => setAiEnabled(e.target.checked)}/>{tr("可选 AI 辅助识别（默认关闭）", "Optional AI suggestions (off by default)")}</label>
          {aiEnabled && <div className="space-y-3"><p className="notice warning">{tr("AI 接收最多 2 万字符的脱敏稿；漏检内容仍可能外发。候选词须人工确认。", "AI receives up to 20K masked characters; missed sensitive text may still leave your device. Review suggestions manually.")}</p><input type="url" aria-label="AI endpoint" value={aiBaseUrl} onChange={e => setAiBaseUrl(e.target.value)}/><input aria-label="AI model" value={aiModel} onChange={e => setAiModel(e.target.value)} placeholder={tr("模型名称", "Model ID")}/><input type="password" aria-label="AI API key" value={aiKey} onChange={e => setAiKey(e.target.value)} autoComplete="off"/><label className="checkbox-row"><input type="checkbox" checked={aiConsent} onChange={e => setAiConsent(e.target.checked)}/>{tr("我同意将当前脱敏稿发送至指定 AI 服务", "I agree to send this redacted text to the selected AI service")}</label><button type="button" className="ui-secondary w-full" disabled={busy || !aiConsent} onClick={suggest}>{tr("获取 AI 候选敏感词", "Get AI candidate terms")}</button>{suggestions.map((item,i) => <div className="finding-row" key={i}><span>{item.text}</span><button type="button" className="text-button" onClick={() => {setKeywords(prev => [...terms(prev),item.text].filter((x,i,arr)=>arr.indexOf(x)===i).join("\n"));setSuggestions(prev=>prev.filter((_,idx)=>idx!==i));}}>{tr("加入词表", "Add term")}</button></div>)}</div>}
        </div>
        <p className="notice">{tr("仍须检查未识别文字、链接和图片。恢复包单独加密保存。", "Review undetected text, links and images. Recovery mappings are saved separately and encrypted.")}</p>
      </aside>
    </fieldset>}
  </section>;
}
