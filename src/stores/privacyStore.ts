import { create } from "zustand";
import type { PrivacyResult } from "../lib/privacyApi";

export interface PreparedDocument {
  fileId: string; optionsKey: string; passphrase: string; cachePath: string;
  original: string; value: PrivacyResult; approved: boolean;
}
export interface PrivacySettings {
  categories: string[]; keywords: string; whitelist: string; passphrase: string;
  anonymousNames: boolean; saveToLibrary: boolean;
}
interface PrivacyState extends PrivacySettings {
  preparedFiles: Record<string, PreparedDocument>;
  updateSettings: (patch: Partial<PrivacySettings>) => void;
  setPreparedFiles: (value: Record<string, PreparedDocument> | ((old: Record<string, PreparedDocument>) => Record<string, PreparedDocument>)) => void;
}
export const defaultPrivacySettings: PrivacySettings = {
  categories: ["phone", "email", "id_card", "bank_account", "credit_code"],
  keywords: "", whitelist: "", passphrase: "", anonymousNames: true, saveToLibrary: false,
};
// Session memory only: no persist middleware, passwords or plaintext on disk.
export const usePrivacyStore = create<PrivacyState>((set) => ({
  ...defaultPrivacySettings, preparedFiles: {},
  updateSettings: (patch) => set(old => {
    const invalidate = (["categories", "keywords", "whitelist", "passphrase"] as const)
      .some(key => key in patch && JSON.stringify(patch[key]) !== JSON.stringify(old[key]));
    return { ...patch, ...(invalidate ? { preparedFiles: {} } : {}) };
  }),
  setPreparedFiles: (value) => set(old => ({ preparedFiles: typeof value === "function" ? value(old.preparedFiles) : value })),
}));
export const terms = (text: string) => [...new Set(text.split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
export const policyKey = (settings: PrivacySettings) => JSON.stringify({ categories: settings.categories, keywords: terms(settings.keywords), whitelist: terms(settings.whitelist) });
