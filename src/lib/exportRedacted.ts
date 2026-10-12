import { api } from "./api";
import { privacyApi, type EncryptedVault, type PrivacyConnection } from "./privacyApi";
import { usePrivacyStore, policyKey } from "../stores/privacyStore";
import { useAppStore, type ExportOptions } from "../stores/appStore";

export function redactionReviewStatus() {
  const settings = usePrivacyStore.getState();
  const ready = useAppStore.getState().files.filter(f => f.status === "done" && f.cachePath);
  const key = policyKey(settings);
  const approved = ready.filter(f => {
    const p = settings.preparedFiles[f.id];
    return p?.approved && p.optionsKey === key && p.passphrase === settings.passphrase && p.cachePath === f.cachePath;
  }).length;
  return { ready, approved };
}
export async function exportRedacted(conn: PrivacyConnection, exportPath: string, options: ExportOptions) {
  const settings = usePrivacyStore.getState();
  const { ready, approved } = redactionReviewStatus();
  if (!ready.length || approved !== ready.length) throw new Error("请先到脱敏审核确认整批文件 / Review every document first");
  const membership = ready.map(f => f.id).join("|");
  const files = [], vaults: EncryptedVault[] = [];
  for (const [index, file] of ready.entries()) {
    const p = settings.preparedFiles[file.id];
    const original = await api.readCachedText(conn, file.cachePath!);
    if (original !== p.original) {
      usePrivacyStore.getState().setPreparedFiles(old => { const next = { ...old }; delete next[file.id]; return next; });
      throw new Error("原文已改变，请重新审核 / Source changed; review again");
    }
    const name = `document_${String(index + 1).padStart(4, "0")}.md`;
    files.push({ name: settings.anonymousNames ? name : file.name,
      relativePath: settings.anonymousNames ? name : (file.relativePath || file.name),
      content: p.value.content, sourceHash: p.value.sourceHash, reviewed: true });
    vaults.push(p.value.vault);
  }
  const live = usePrivacyStore.getState();
  if (membership !== redactionReviewStatus().ready.map(f => f.id).join("|") ||
      live.anonymousNames !== settings.anonymousNames || live.saveToLibrary !== settings.saveToLibrary ||
      !useAppStore.getState().privacyEnabled || policyKey(live) !== policyKey(settings) || live.passphrase !== settings.passphrase ||
      ready.some(f => live.preparedFiles[f.id] !== settings.preparedFiles[f.id] || !live.preparedFiles[f.id]?.approved)) {
    throw new Error("文件或审核状态已改变，请重新审核 / Review state changed");
  }
  return privacyApi.exportReviewed(conn, { files, pack: { format: "MarkAllDownEncryptedVaultPack", version: 2, vaults },
    passphrase: settings.passphrase, saveToLibrary: settings.saveToLibrary,
    options: { ...options, exportPath, structure: settings.anonymousNames ? "flat" : options.structure } });
}
