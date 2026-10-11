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

export const privacyApi = {
  exportReviewed(conn: PrivacyConnection, data: unknown) {
    return post<{ path: string; vaultPath: string; files: number }>(conn, "privacy/export", data);
  },
  redact(conn: PrivacyConnection, content: string, options: PrivacyOptions, passphrase: string) {
    return post<PrivacyResult>(conn, "redact", { content, options, passphrase });
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
