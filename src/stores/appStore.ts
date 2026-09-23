import { create } from "zustand";

export interface FileEntry {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "pending" | "converting" | "done" | "error";
  progress: number;
  result?: string;
  file?: File;
  relativePath?: string;
  sourcePath?: string;
  cachePath?: string;
  preview?: string;
  charCount?: number;
}

export interface ExportOptions {
  format: "individual" | "combined" | "zip";
  preserveNames: boolean;
  structure: "flat" | "preserve";
}

interface AppState {
  port: number | null;
  token: string | null;
  isReady: boolean;
  isConverting: boolean;
  files: FileEntry[];
  exportOptions: ExportOptions;

  setConnection: (port: number, token: string) => void;
  setReady: (ready: boolean) => void;
  setConverting: (converting: boolean) => void;
  addFiles: (files: FileEntry[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  updateFileStatus: (id: string, status: FileEntry["status"], progress: number, result?: string) => void;
  patchFile: (id: string, fields: Partial<FileEntry>) => void;
  setExportOptions: (options: Partial<ExportOptions>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  port: null,
  token: null,
  isReady: false,
  isConverting: false,
  files: [],
  exportOptions: {
    format: "individual",
    preserveNames: true,
    structure: "flat",
  },

  setConnection: (port, token) => set({ port, token }),
  setReady: (ready) => set({ isReady: ready }),
  setConverting: (converting) => set({ isConverting: converting }),

  addFiles: (newFiles) =>
    set((state) => ({ files: [...state.files, ...newFiles] })),

  removeFile: (id) =>
    set((state) => ({ files: state.files.filter((f) => f.id !== id) })),

  clearFiles: () => set({ files: [] }),

  updateFileStatus: (id, status, progress, result) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id ? { ...f, status, progress, result } : f
      ),
    })),

  patchFile: (id, fields) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, ...fields } : f)),
    })),

  setExportOptions: (options) =>
    set((state) => ({
      exportOptions: { ...state.exportOptions, ...options },
    })),
}));
