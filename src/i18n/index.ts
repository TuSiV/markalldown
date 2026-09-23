import { create } from "zustand";
import { dict, Locale, MessageKey } from "./dict";

const STORAGE_KEY = "markitdown.locale";

function detectLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "zh-CN" || saved === "en-US") return saved;
  const nav = navigator.language || "zh-CN";
  return nav.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: detectLocale(),
  setLocale: (locale) => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    set({ locale });
  },
  toggleLocale: () => {
    const next: Locale = get().locale === "zh-CN" ? "en-US" : "zh-CN";
    get().setLocale(next);
  },
}));

export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  let text: string = dict[locale][key] ?? dict["zh-CN"][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

export function useT() {
  const locale = useI18n((s) => s.locale);
  return (key: MessageKey, vars?: Record<string, string | number>) => t(locale, key, vars);
}

export type { Locale, MessageKey };
