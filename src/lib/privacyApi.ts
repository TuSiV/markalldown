export interface PrivacyConnection { port: number; token: string }
export interface PrivacyOptions {
  categories: string[];
  keywords: string[];
  whitelist: string[];
}
export interface EncryptedVault {
  version: string;
  kdf: string;
  cipher: string;
  salt: string;
  nonce: string;
  data: string;
}
export interface PrivacyResult {
  documentId: string;
  processingId: string;
  sourceHash: string;
  content: string;
  vault: EncryptedVault;
  summary: { occurrences: number; unique: number; categories: Record<string, number>; findings: Array<{ category: string; original: string; count: number }> };
}
export interface PrivacySuggestion { text: string; category: string }

async function post<T>(conn: PrivacyConnection, endpoint: string, data: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${conn.port}/api/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Token": conn.token,
      "X-Locale": localStorage.getItem("markitdown.locale") || "zh-CN",
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(String(payload.detail || `HTTP ${response.status}`));
  }
  return response.json() as Promise<T>;
}

export interface RecoveryRequest { content: string; pack?: unknown; libraryPackId?: string; passphrase: string }
export interface RecoveryPreview { content: string; restored: number; integrity: "exact" | "edited" | "legacy"; originalMatch: boolean | null; documentIds: string[]; processingIds: string[] }
export interface LibraryPack { packId: string; savedAt: number; documents: number; legacy: boolean }
export const privacyApi = {
  previewRecovery(conn: PrivacyConnection, data: RecoveryRequest) { return post<RecoveryPreview>(conn, "recovery/preview", data); },
  saveRecovery(conn: PrivacyConnection, data: RecoveryRequest & { path: string; reviewed: boolean; allowEdited: boolean }) { return post<{path:string}>(conn,"recovery/save",data); },
  listLibrary(conn: PrivacyConnection) { return post<{packs: LibraryPack[]}>(conn,"recovery/library/list",{}); },
  findLibrary(conn: PrivacyConnection, content: string) { return post<{packs: LibraryPack[]}>(conn,"recovery/library/find",{content}); },
  saveLibrary(conn: PrivacyConnection, pack: unknown, passphrase: string) { return post<{packId:string}>(conn,"recovery/library/save",{pack,passphrase}); },
  deleteLibrary(conn: PrivacyConnection, packId: string) { return post<{deleted:boolean}>(conn,"recovery/library/delete",{packId}); },
  exportReviewed(conn: PrivacyConnection, data: unknown) {
    return post<{ path: string; vaultPath: string; files: number; packId: string; libraryPackId: string | null }>(conn, "privacy/export", data);
  },
  redact(conn: PrivacyConnection, content: string, options: PrivacyOptions, passphrase: string, documentId?: string) {
    return post<PrivacyResult>(conn, "redact", { content, options, passphrase, documentId });
  },
  restore(conn: PrivacyConnection, content: string, vaults: EncryptedVault[], passphrase: string) {
    return post<{ content: string; restored: number }>(conn, "restore", { content, vaults, passphrase });
  },
  suggest(conn: PrivacyConnection, redactedText: string, settings: {
    baseUrl: string; model: string; apiKey: string; consent: boolean;
  }) {
    return post<{ suggestions: PrivacySuggestion[] }>(conn, "ai/suggest", { redactedText, ...settings });
  },
};
