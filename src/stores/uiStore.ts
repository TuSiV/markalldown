import { create } from "zustand";
import type { ExportOptions } from "./appStore";
export type Workspace = "convert" | "redaction" | "recovery" | "export" | "settings";
interface Preferences { concurrency: number; autoPreview: boolean; previewMode: "rendered" | "source"; fontSize: number; exportDefaults: ExportOptions }
const key = "markalldown.ui.preferences";
export const defaultPreferences: Preferences = { concurrency: 1, autoPreview: true, previewMode: "rendered", fontSize: 14, exportDefaults: { format: "individual", preserveNames: true, structure: "flat" } };
function read(): Preferences {
  try {
    const s = JSON.parse(localStorage.getItem(key) || "{}");
    return { concurrency: [1,2,3,4].includes(s.concurrency) ? s.concurrency : 1, autoPreview: typeof s.autoPreview === "boolean" ? s.autoPreview : true,
      previewMode: s.previewMode === "source" ? "source" : "rendered", fontSize: [14,16,18].includes(s.fontSize) ? s.fontSize : 14,
      exportDefaults: { format: ["individual","combined","zip"].includes(s.exportDefaults?.format) ? s.exportDefaults.format : "individual", preserveNames: typeof s.exportDefaults?.preserveNames === "boolean" ? s.exportDefaults.preserveNames : true, structure: s.exportDefaults?.structure === "preserve" ? "preserve" : "flat" } };
  } catch { return { ...defaultPreferences }; }
}
export const useUIStore = create<Preferences & { update: (patch: Partial<Preferences>) => void; reset: () => void }>((set,get) => ({ ...read(),
  update: patch => { set(patch); const { concurrency,autoPreview,previewMode,fontSize,exportDefaults } = get(); try { localStorage.setItem(key,JSON.stringify({ concurrency,autoPreview,previewMode,fontSize,exportDefaults })); } catch {} },
  reset: () => { get().update({ ...defaultPreferences }); },
}));
