import { useEffect, useRef, useState } from "react";
import { confirm, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { X, Upload } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useI18n } from "../i18n";
import { privacyApi, type LibraryPack, type RecoveryPreview, type RecoveryRequest } from "../lib/privacyApi";

export function RecoveryPanel({ onClose }: { onClose: () => void }) {
  const { port, token } = useAppStore();
  const english = useI18n(s => s.locale) === "en-US";
  const tr = (zh: string, en: string) => english ? en : zh;
  const conn = port ? { port, token: token || "" } : null;
  const documentInput = useRef<HTMLInputElement>(null);
  const mappingInput = useRef<HTMLInputElement>(null);
  const [document, setDocument] = useState<File | null>(null);
  const [mapping, setMapping] = useState<File | null>(null);
  const [mode, setMode] = useState("file");
  const [packId, setPackId] = useState("");
  const [password, setPassword] = useState("");
  const [packs, setPacks] = useState<LibraryPack[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<(RecoveryPreview & { request: RecoveryRequest }) | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [allowEdited, setAllowEdited] = useState(false);
  const error = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));
  const refreshLibrary = async () => {
    if (!conn) return;
    try { setPacks((await privacyApi.listLibrary(conn)).packs); } catch (e) { error(e); }
  };
  useEffect(() => { void refreshLibrary(); }, [port, token]);
  useEffect(() => { setPreview(null); setReviewed(false); setAllowEdited(false); }, [document, mapping, mode, packId, password]);
  const readDocument = async () => {
    if (!document || document.size > 10_000_000) throw new Error(tr("请选择不超过 10MB 的脱敏 Markdown", "Select a redacted Markdown file up to 10MB"));
    return new TextDecoder("utf-8", { ignoreBOM: true }).decode(await document.arrayBuffer());
  };
  const inspect = async () => {
    if (!conn) return;
    setBusy(true);
    try {
      const content = await readDocument();
      let request: RecoveryRequest;
      if (mode === "library") {
        if (!packId) throw new Error(tr("请选择本地恢复包", "Select a local recovery pack"));
        request = { content, libraryPackId: packId, passphrase: password };
      } else {
        if (!mapping || mapping.size > 10_000_000) throw new Error(tr("请选择不超过 10MB 的加密恢复包", "Select an encrypted recovery pack up to 10MB"));
        request = { content, pack: JSON.parse(await mapping.text()), passphrase: password };
      }
      const result = await privacyApi.previewRecovery(conn, request);
      setPreview({ ...result, request }); setReviewed(false); setAllowEdited(false);
    } catch (e) { setPreview(null); error(e); } finally { setBusy(false); }
  };
  const find = async () => {
    if (!conn) return;
    setBusy(true);
    try {
      const matches = (await privacyApi.findLibrary(conn, await readDocument())).packs;
      if (!matches.length) { toast.info(tr("本地库没有匹配记录，请选择外部恢复包", "No matching local pack; select an external recovery pack")); return; }
      await refreshLibrary(); setMode("library"); setPackId(matches[0].packId);
      toast.success(tr(`找到 ${matches.length} 个匹配恢复包，请确认选择后预览`, `Found ${matches.length} matching packs; confirm your selection before preview`));
    } catch (e) { error(e); } finally { setBusy(false); }
  };
  const keepPack = async () => {
    if (!conn || !preview?.request.pack) return;
    setBusy(true);
    try {
      await privacyApi.saveLibrary(conn, preview.request.pack, password);
      await refreshLibrary(); toast.success(tr("加密恢复包已存入本机恢复库", "Encrypted pack saved in the local recovery library"));
    } catch (e) { error(e); } finally { setBusy(false); }
  };
  const removePack = async () => {
    if (!conn || !packId) return;
    if (!await confirm(tr("仅从本机恢复库移除此记录？请先确认另有恢复包备份。", "Remove this local pack? Make sure you have another copy first."), { title: "MarkAllDown", kind: "warning" })) return;
    setBusy(true);
    try { await privacyApi.deleteLibrary(conn, packId); setPackId(""); setPreview(null); await refreshLibrary(); }
    catch (e) { error(e); } finally { setBusy(false); }
  };
  const saveResult = async () => {
    if (!conn || !preview || !document || !reviewed || (preview.integrity !== "exact" && !allowEdited)) return;
    setBusy(true);
    try {
      const path = await save({ defaultPath: document.name.replace(/\.(md|txt)$/i, "") + "_restored.md", filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (!path) return;
      const result = await privacyApi.saveRecovery(conn, { ...preview.request, path, reviewed, allowEdited });
      toast.success(tr(`恢复副本已保存：${result.path}`, `Restored copy saved: ${result.path}`));
    } catch (e) { error(e); } finally { setBusy(false); }
  };
  return <section className="workspace-page h-full overflow-y-auto">
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex justify-between items-center"><h2 className="text-2xl font-semibold text-slate-800">{tr("文件恢复", "Restore files")}</h2><button onClick={onClose} aria-label={tr("关闭恢复", "Close recovery")}><X className="w-5 h-5" /></button></div>
      <p className="text-sm text-[#787774]">{tr("无需先转换文件。选择脱敏 Markdown、加密恢复包和口令，预览后另存恢复副本。恢复的是文本，不会重建原始 Word/PDF。", "No conversion required. Select redacted Markdown, an encrypted pack and its password; preview and save a new copy. Recovery restores text, not the original Word/PDF file.")}</p>
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)] gap-5 items-start">
      <fieldset disabled={busy} className="bg-white border rounded-lg p-4 space-y-4 text-sm">
        <div className="rounded-lg border border-[#2eaadc]/40 bg-[#2eaadc]/5 p-4 space-y-3">
          <label htmlFor="recovery-document" className="block font-semibold text-[#37352f]">{tr("脱敏 Markdown 文件", "Redacted Markdown file")}</label>
          <input id="recovery-document" ref={documentInput} type="file" accept=".md,.txt" className="hidden" onChange={e => setDocument(e.target.files?.[0] || null)} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => documentInput.current?.click()} className="inline-flex items-center gap-2 min-h-11 rounded-lg bg-[#167da5] hover:bg-[#116685] px-4 py-2.5 font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167da5] disabled:opacity-50">
              <Upload className="w-4 h-4" aria-hidden="true" />{tr("选择 MD 文件", "Choose MD file")}
            </button>
            <p aria-live="polite" className="min-w-0 break-all text-[#37352f]">{document ? document.name : tr("尚未选择 MD 文件", "No MD file selected")}</p>
          </div>
        </div>
        <button type="button" disabled={!document || !conn} onClick={find} className="min-h-11 border border-[#787774] rounded-lg px-4 py-2 font-medium hover:bg-gray-100 disabled:opacity-50">{tr("在本地恢复库匹配", "Find a local recovery pack")}</button>
        <label className="block space-y-1"><span>{tr("恢复映射来源", "Recovery mapping source")}</span><select value={mode} onChange={e => setMode(e.target.value)} className="border rounded p-2 w-full"><option value="file">{tr("外部加密恢复包", "External encrypted pack")}</option><option value="library">{tr("本机恢复库", "Local recovery library")}</option></select></label>
        {mode === "file" ? <div className="rounded-lg border border-[#2eaadc]/40 bg-[#2eaadc]/5 p-4 space-y-3">
          <label htmlFor="recovery-mapping" className="block font-semibold text-[#37352f]">{tr("加密恢复包 JSON", "Encrypted recovery pack JSON")}</label>
          <input id="recovery-mapping" ref={mappingInput} type="file" accept=".json" className="hidden" onChange={e => setMapping(e.target.files?.[0] || null)} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => mappingInput.current?.click()} className="inline-flex items-center gap-2 min-h-11 rounded-lg bg-[#167da5] hover:bg-[#116685] px-4 py-2.5 font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#167da5] disabled:opacity-50">
              <Upload className="w-4 h-4" aria-hidden="true" />{tr("选择 JSON 恢复包", "Choose JSON recovery pack")}
            </button>
            <p aria-live="polite" className="min-w-0 break-all text-[#37352f]">{mapping ? mapping.name : tr("尚未选择 JSON 恢复包", "No JSON pack selected")}</p>
          </div>
        </div> : <div className="space-y-2">
          <label className="block space-y-1"><span>{tr("选择本地恢复包", "Select local recovery pack")}</span><select value={packId} onChange={e => setPackId(e.target.value)} className="border rounded p-2 w-full"><option value="">{tr("请选择", "Select a pack")}</option>{packs.map(p => <option key={p.packId} value={p.packId}>{p.packId.slice(0,12)} · {new Date(p.savedAt*1000).toLocaleString()} · {p.documents} {tr("份映射", "mappings")}{p.legacy ? " (legacy)" : ""}</option>)}</select></label>
          <button type="button" disabled={!packId} onClick={removePack} className="min-h-11 border border-red-300 bg-red-50 rounded-lg px-4 py-2 font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">{tr("从本机库移除所选恢复包", "Remove selected local pack")}</button>
        </div>}
        <p className="text-xs text-[#787774]">{tr("恢复库只保留你明确保存的加密恢复包、随机编号和保存时间，不保存原文或口令；也不是云端备份。", "The library keeps only explicitly saved encrypted packs, random IDs and timestamps. It stores no source text or passwords and is not a cloud backup.")}</p>
        <label className="block space-y-1"><span>{tr("恢复包口令", "Recovery pack password")}</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" className="border rounded p-2 w-full" /></label>
        <button type="button" disabled={!conn || !document || !password || (mode === "file" ? !mapping : !packId)} onClick={inspect} className="min-h-11 bg-[#167da5] hover:bg-[#116685] text-white font-semibold rounded-lg px-5 py-2.5 shadow-sm disabled:opacity-50">{busy ? tr("处理中…", "Processing...") : tr("预览恢复结果", "Preview recovery")}</button>
      </fieldset>
      {preview ? <div className="bg-white border rounded-lg p-4 space-y-3 text-sm">
        <p className={preview.integrity === "exact" ? "text-green-700" : "text-amber-700"}>{preview.integrity === "exact" ? tr("文件与加密导出清单一致", "File matches the authenticated export manifest") : preview.integrity === "legacy" ? tr("旧版恢复包：可恢复占位符，无法认证导出文件完整性", "Legacy pack: placeholders can be restored, but export integrity cannot be authenticated") : tr("文件已编辑或为片段：只能恢复已知占位符，不代表全文与原文一致", "Edited document or excerpt: restores known placeholders; does not prove the full text matches the original")}</p>
        <p>{tr(`已恢复 ${preview.restored} 处占位符`, `Restored ${preview.restored} placeholders`)}</p>
        <pre aria-label={tr("恢复结果全文", "Full recovery preview")} className="whitespace-pre-wrap break-all border rounded p-3 max-h-96 overflow-y-auto">{preview.content}</pre>
        <label className="flex gap-2 items-start"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} disabled={busy} />{tr("我已检查恢复结果全文", "I reviewed the full recovered document")}</label>
        {preview.integrity !== "exact" && <label className="flex gap-2 items-start"><input type="checkbox" checked={allowEdited} onChange={e => setAllowEdited(e.target.checked)} disabled={busy} />{tr("我确认仅恢复已知占位符，不将结果视为原文完整性证明", "I accept placeholder-only recovery without proof of original integrity")}</label>}
        <div className="flex flex-wrap gap-2"><button type="button" onClick={saveResult} disabled={busy || !reviewed || (preview.integrity !== "exact" && !allowEdited)} className="min-h-11 bg-[#0f7b6c] hover:bg-[#0c6256] text-white font-semibold rounded-lg px-5 py-2.5 shadow-sm disabled:opacity-50">{tr("另存恢复副本", "Save restored copy")}</button>
          {preview.request.pack !== undefined && <button type="button" onClick={keepPack} disabled={busy} className="min-h-11 border border-[#787774] rounded-lg px-4 py-2 font-medium hover:bg-gray-100 disabled:opacity-50">{tr("将此加密恢复包保存到本机库", "Keep this encrypted pack locally")}</button>}</div>
      </div> : <div className="ui-card min-h-[360px] flex flex-col justify-center text-center text-slate-500"><p className="font-semibold">{tr("恢复结果全文预览", "Full recovery preview")}</p><p className="mt-3 text-sm">{tr("选择 MD 与加密 JSON，输入口令后预览。", "Select Markdown and encrypted JSON, then enter the password to preview.")}</p></div>}
      </div>
    </div>
  </section>;
}
