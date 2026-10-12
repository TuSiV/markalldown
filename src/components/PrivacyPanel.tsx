import { useEffect, useState } from "react";
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

  return (
    <section className="border-t border-gray-200 pt-4 space-y-3 text-xs text-[#37352f]">
      <label className="flex items-center gap-2 font-semibold text-sm cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        {tr("启用脱敏", "Enable redaction")}
      </label>
      <p className="text-[#787774]">
        {tr("先完成脱敏与全文审核，再到导出步骤保存已审核的脱敏文件。预览中的复制和保存仍使用原文。",
          "Complete redaction and full review before exporting. Preview copy/save still use original text.")}
      </p>
      <p>{tr("每批最多 100 个文件；每批一个恢复包，可从中单独恢复任一文件。", "Up to 100 files per batch; one recovery pack can restore any individual file.")}</p>
      {enabled && <fieldset disabled={busy} className="space-y-3">
        <div className="font-medium">{tr("检测类别", "Detection categories")}</div>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORY_OPTIONS.map(([key, zh, en]) => <label key={key} className="flex items-center gap-1">
            <input type="checkbox" checked={categories.includes(key)} onChange={e => setCategories(old => e.target.checked ? [...old, key] : old.filter(v => v !== key))} />
            {english ? en : zh}
          </label>)}
        </div>
        <label className="block space-y-1">
          <span className="font-medium">{tr("自定义敏感词（每行一个，精确替换）", "Sensitive terms (one exact phrase per line)")}</span>
          <textarea value={keywords} onChange={e => setKeywords(e.target.value)} rows={3} className="border rounded p-2 w-full" placeholder={tr("公司名称、人员姓名、项目名称…", "Organizations, names, projects...")} />
        </label>
        <label className="block space-y-1">
          <span className="font-medium">{tr("白名单（每行一个，不替换）", "Whitelist (one phrase per line, not redacted)")}</span>
          <textarea value={whitelist} onChange={e => setWhitelist(e.target.value)} rows={2} className="border rounded p-2 w-full" />
        </label>
        <label className="flex gap-2 items-start cursor-pointer">
          <input type="checkbox" checked={anonymousNames} onChange={e => setAnonymousNames(e.target.checked)} />
          <span>{tr("匿名化脱敏版文件名和目录（可选，默认保留原文件名）", "Anonymize redacted output filenames and folders (optional; keep original names by default)")}</span>
        </label>
        <label className="block space-y-1">
          <span className="font-medium">{tr("映射文件加密口令（至少8字符，不会保存）", "Vault passphrase (8+ chars, never stored)")}</span>
          <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} autoComplete="new-password" className="border rounded p-2 w-full" />
        </label>
        <select aria-label={tr("选择要预览的文件", "Select file to review")} value={reviewFileId} onChange={e => { setReviewFileId(e.target.value); setPreviewCount(null); setReviewedRedaction(null); setPreviewText(""); setFindings([]); }} className="border rounded p-2 w-full">
          <option value="">{tr("首个已转换文件", "First completed file")}</option>
          {ready.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={preview} className="border rounded px-3 py-2 disabled:opacity-50">
          {tr("检查所选文件的脱敏内容", "Review selected file")}
        </button>
        {previewCount !== null && <div className="bg-gray-50 border rounded p-2 space-y-1">
          <p>{tr(`所选文件检测到 ${previewCount} 处替换，请检查是否漏检或误检。`, `Selected file: ${previewCount} replacements. Review false positives and omissions.`)}</p>
          <div className="max-h-36 overflow-y-auto space-y-1">
            {findings.map((item, i) => <div key={`${item.category}-${i}`} className="flex gap-1 justify-between items-center border-b">
              <span className="break-all">{item.original} ({item.category} ×{item.count})</span>
              <button type="button" className="border rounded px-2 shrink-0" onClick={() => {
                setWhitelist(prev => [...terms(prev), item.original].filter((x, i, arr) => arr.indexOf(x) === i).join("\n"));
                setFindings(old => old.filter((_, idx) => idx !== i));
                setPreviewCount(null);
              }}>{tr("加入白名单", "Whitelist")}</button>
            </div>)}
          </div>
          <p className="text-[#787774]">{tr("以下为完整脱敏稿；AI 仅发送前 20,000 字符。", "Full redacted document; AI receives only the first 20,000 characters.")}</p>
          <details><summary>{tr("查看原文全文（仅本地）", "Full original text (local only)")}</summary>
            <pre className="whitespace-pre-wrap break-all max-h-64 overflow-y-auto">{sourceText}</pre>
          </details>
          <pre className="whitespace-pre-wrap break-all max-h-64 overflow-y-auto">{previewText}</pre>
        </div>}
        {prepared && reviewedRedaction === prepared.value && <label className="flex gap-2 items-start">
          <input type="checkbox" checked={prepared.approved} onChange={e => {
            const approved = e.target.checked;
            setPreparedFiles(old => ({ ...old, [prepared.fileId]: { ...prepared, approved } }));
          }} />
          {tr("我已检查所选文件的全文及替换结果", "I reviewed the entire selected document and replacements")}
        </label>}
        <p>{tr(`整批审核：${approvedCount}/${ready.length} 个文件已确认`, `Batch review: ${approvedCount}/${ready.length} approved`)}</p>
        <label className="flex items-center gap-2 font-medium cursor-pointer">
          <input type="checkbox" checked={aiEnabled} onChange={e => setAiEnabled(e.target.checked)} />
          {tr("可选 AI 辅助识别（默认关闭）", "Optional AI suggestions (off by default)")}
        </label>
        {aiEnabled && <div className="space-y-2 border rounded p-2">
          <p className="text-amber-700">{tr("AI 将接收脱敏后最多2万字符；漏检信息仍可能外发。结果只作为候选，不会自动替换。",
            "AI receives up to 20K redacted characters. Undetected sensitive data may still leave your device. Suggestions are never auto-applied.")}</p>
          <input type="url" value={aiBaseUrl} onChange={e => setAiBaseUrl(e.target.value)} placeholder="https://provider.example/v1" className="w-full p-2 rounded border" aria-label="AI endpoint" />
          <input value={aiModel} onChange={e => setAiModel(e.target.value)} placeholder={tr("模型标识，例如 provider-model", "Model ID")} className="w-full p-2 rounded border" aria-label="AI model" />
          <input type="password" value={aiKey} onChange={e => setAiKey(e.target.value)} placeholder="API key" autoComplete="off" className="w-full p-2 rounded border" aria-label="AI API key" />
          <label className="flex gap-2 items-start"><input type="checkbox" checked={aiConsent} onChange={e => setAiConsent(e.target.checked)} />{tr("我同意将当前脱敏稿发送至指定 AI 服务", "I agree to send this redacted text to the selected AI service")}</label>
          <button type="button" onClick={suggest} disabled={busy || !aiConsent} className="rounded border px-3 py-2 disabled:opacity-50">
            {tr("获取 AI 候选敏感词", "Get AI candidate terms")}
          </button>
          {suggestions.map((item, i) => <div key={`${item.category}-${item.text}-${i}`} className="flex items-center justify-between gap-2">
            <span className="break-all">{item.text} ({item.category})</span>
            <button className="border rounded px-2 py-1" onClick={() => {
              setKeywords(prev => [...terms(prev), item.text].filter((x, i, arr) => arr.indexOf(x) === i).join("\n"));
              setSuggestions(prev => prev.filter((_, idx) => idx !== i));
            }}>{tr("加入词表", "Add term")}</button>
          </div>)}
        </div>}
        <label className="flex gap-2 items-start">
          <input type="checkbox" checked={saveToLibrary} onChange={e => updateSettings({ saveToLibrary: e.target.checked })} />
          {tr("导出时将加密恢复包另存到本机恢复库（默认关闭，不保存原文或口令）", "Also keep the encrypted recovery pack in the local library (off by default; no source or password)")}
        </label>
        {prepared && <p className="break-all text-[#787774]">{tr("文档编号", "Document ID")}: {prepared.value.documentId}<br />{tr("脱敏版本编号", "Processing ID")}: {prepared.value.processingId}</p>}
        <p className="text-[#787774]">{tr("文件正文中的链接、图片及未识别文字不会被自动脱敏；若取消匿名文件名，原始路径还会暴露。分享前仍须检查。映射文件单独保存并以 AES-256-GCM 加密。",
          "Document content links, image pixels and undetected text are NOT automatically redacted. Filenames are anonymized only if the option above remains enabled. Encrypted recovery mapping is saved separately.")}</p>
        <button type="button" disabled={busy || !enabled || !ready.length || ready.length > 100 || approvedCount !== ready.length} onClick={onExport} className="w-full bg-[#0f7b6c] text-white rounded py-2.5 disabled:opacity-50">
          {busy ? tr("处理中…", "Processing...") : tr(`完成审核，前往导出（${ready.length} 个文件）`, `Finish review and export (${ready.length} files)`)}
        </button>
      </fieldset>}

    </section>
  );
}
