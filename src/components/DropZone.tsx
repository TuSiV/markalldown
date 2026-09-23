import { useCallback, useState, useRef } from "react";
import { FolderOpen, FileArchive, FileText, Loader2, AlertCircle } from "lucide-react";
import { useAppStore, FileEntry } from "../stores/appStore";
import { api, localizeError } from "../lib/api";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile, readDir } from "@tauri-apps/plugin-fs";
import { join, basename } from "@tauri-apps/api/path";
import { toast } from "sonner";
import { useT, useI18n } from "../i18n";

interface DropZoneProps {
  compact?: boolean;
}

const UNSUPPORTED_FORMATS: Record<string, Record<string, string>> = {
  ".doc": {
    "zh-CN": "旧版 .doc 格式不支持，请转换为 .docx",
    "en-US": "Legacy .doc is not supported. Convert to .docx",
  },
  ".ppt": {
    "zh-CN": "旧版 .ppt 格式不支持，请转换为 .pptx",
    "en-US": "Legacy .ppt is not supported. Convert to .pptx",
  },
  ".rtf": {
    "zh-CN": "RTF 格式暂不支持",
    "en-US": "RTF is not supported yet",
  },
  ".odt": {
    "zh-CN": "OpenDocument 格式暂不支持",
    "en-US": "OpenDocument is not supported yet",
  },
};

type PickedFile = {
  path: string;
  name: string;
  relativePath: string;
  size: number;
};

async function collectFilesFromDir(dir: string, root: string, out: PickedFile[]) {
  const entries = await readDir(dir);
  for (const entry of entries) {
    const full = await join(dir, entry.name);
    if (entry.isDirectory) {
      await collectFilesFromDir(full, root, out);
    } else if (entry.isFile) {
      const rel = full.startsWith(root)
        ? full.slice(root.length).replace(/^[\\/]+/, "")
        : entry.name;
      out.push({
        path: full,
        name: entry.name,
        relativePath: rel.split("\\").join("/"),
        size: 0,
      });
    }
  }
}

export function DropZone({ compact = false }: DropZoneProps) {
  const { addFiles, setConverting, updateFileStatus, patchFile, port, token, isReady } = useAppStore();
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);

  const runConvert = useCallback(async (entries: FileEntry[]) => {
    if (!port) return;
    addFiles(entries);
    setConverting(true);

    let successCount = 0;
    let failCount = 0;
    const conn = { port, token: token || "" };

    for (const entry of entries) {
      updateFileStatus(entry.id, "converting", 0);
      try {
        const file = entry.file!;
        const result = await api.convertFile(conn, file, entry.relativePath, (progress) => {
          updateFileStatus(entry.id, "converting", progress);
        });

        if (result.kind === "archive") {
          const ok = result.files.filter(f => f.success).length;
          const failed = result.files.length - ok;
          updateFileStatus(entry.id, "done", 100, t("archiveSummary", { ok, failed }));
          addFiles(result.files.map(f => ({
            id: crypto.randomUUID(),
            name: f.filename,
            size: f.charCount || 0,
            type: "text/markdown",
            status: f.success ? ("done" as const) : ("error" as const),
            progress: f.success ? 100 : 0,
            result: f.success ? f.preview : f.error,
            preview: f.preview,
            cachePath: f.cachePath,
            charCount: f.charCount,
            relativePath: f.filename,
          })));
          successCount += ok;
          failCount += failed;
        } else {
          patchFile(entry.id, {
            status: "done",
            progress: 100,
            result: result.preview,
            preview: result.preview,
            cachePath: result.cachePath,
            charCount: result.charCount,
          });
          successCount++;
        }
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        updateFileStatus(entry.id, "error", 0, localizeError(raw, locale));
        failCount++;
      }
    }

    setConverting(false);
    if (successCount > 0) toast.success(t("convertOk", { n: successCount }));
    if (failCount > 0) toast.error(t("convertFail", { n: failCount }));
  }, [port, token, locale, addFiles, setConverting, updateFileStatus, patchFile, t]);

  const buildEntries = useCallback(async (picked: PickedFile[]): Promise<FileEntry[]> => {
    const entries: FileEntry[] = [];
    for (const p of picked) {
      const ext = "." + p.name.split(".").pop()?.toLowerCase();
      const reason = UNSUPPORTED_FORMATS[ext]?.[locale];
      if (reason) {
        toast.error(`${p.name}: ${reason}`);
        continue;
      }
      try {
        const bytes = await readFile(p.path);
        const file = new File([bytes], p.name, { type: "application/octet-stream" });
        entries.push({
          id: crypto.randomUUID(),
          name: p.name,
          size: bytes.byteLength || p.size,
          type: file.type,
          status: "pending",
          progress: 0,
          file,
          relativePath: p.relativePath,
          sourcePath: p.path,
        });
      } catch {
        toast.error(`${p.name}: ${t("saveFailed", { msg: p.name })}`);
      }
    }
    return entries;
  }, [locale, t]);

  const pickFiles = useCallback(async () => {
    if (!port || !isReady) {
      toast.error(t("serviceWait"));
      return;
    }
    setPicking(true);
    try {
      const selected = await open({ multiple: true, title: t("selectFiles") });
      const paths = Array.isArray(selected) ? selected : selected ? [selected as string] : [];
      if (paths.length === 0) return;
      const picked: PickedFile[] = [];
      for (const path of paths) {
        const name = await basename(path);
        picked.push({ path, name, relativePath: name, size: 0 });
      }
      const entries = await buildEntries(picked);
      if (entries.length === 0) return;
      await runConvert(entries);
    } catch (error) {
      toast.error(localizeError(error instanceof Error ? error.message : String(error), locale));
    } finally {
      setPicking(false);
    }
  }, [port, isReady, locale, buildEntries, runConvert, t]);

  const pickFolder = useCallback(async () => {
    if (!port || !isReady) {
      toast.error(t("serviceWait"));
      return;
    }
    setPicking(true);
    try {
      const selected = await open({ directory: true, multiple: false, title: t("selectFolder") });
      if (!selected || typeof selected !== "string") return;
      const root = selected;
      const picked: PickedFile[] = [];
      await collectFilesFromDir(root, root, picked);
      if (picked.length === 0) {
        toast.warning(t("folderEmpty"));
        return;
      }
      const entries = await buildEntries(picked);
      if (entries.length === 0) return;
      await runConvert(entries);
    } catch (error) {
      toast.error(localizeError(error instanceof Error ? error.message : String(error), locale));
    } finally {
      setPicking(false);
    }
  }, [port, isReady, locale, buildEntries, runConvert, t]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0 || !port || !isReady) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
      return;
    }
    const picked: PickedFile[] = [];
    for (const f of Array.from(list)) {
      if (f.size <= 0) continue;
      const webkitRel = (f as any).webkitRelativePath as string | undefined;
      const relativePath = webkitRel && webkitRel.includes("/")
        ? webkitRel.split("/").slice(1).join("/") || f.name
        : f.name;
      picked.push({ path: "", name: f.name, relativePath, size: f.size });
    }
    const entries: FileEntry[] = [];
    for (const p of picked) {
      const ext = "." + p.name.split(".").pop()?.toLowerCase();
      const reason = UNSUPPORTED_FORMATS[ext]?.[locale];
      if (reason) {
        toast.error(`${p.name}: ${reason}`);
        continue;
      }
      const f = Array.from(list).find(x => x.name === p.name) || Array.from(list)[0];
      entries.push({
        id: crypto.randomUUID(),
        name: p.name,
        size: p.size,
        type: f.type || "application/octet-stream",
        status: "pending",
        progress: 0,
        file: f,
        relativePath: p.relativePath,
      });
    }
    if (entries.length > 0) await runConvert(entries);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  }, [port, isReady, locale, runConvert]);

  if (!isReady) {
    return (
      <div className="w-full max-w-2xl p-12 border-2 border-dashed rounded-xl border-[rgba(55,53,47,0.09)] bg-[#f7f6f3]">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="w-8 h-8 text-[#2eaadc] animate-spin" />
          <div>
            <p className="text-lg font-medium text-[#37352f]">{t("serviceStarting")}</p>
            <p className="mt-1 text-sm text-[#787774]">{t("serviceStartHint")}</p>
          </div>
        </div>
      </div>
    );
  }

  const fileInput = (
    <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
  );
  const folderInput = (
    <input ref={folderInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
  );

  if (compact) {
    return (
      <div className="mb-4 p-4 border-2 border-dashed rounded-lg border-[rgba(55,53,47,0.09)]">
        {fileInput}
        {folderInput}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={pickFiles}
            disabled={picking}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#f7f6f3] hover:bg-[#e8e7e4] rounded-lg transition-colors disabled:opacity-50"
          >
            {picking ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {t("selectFiles")}
          </button>
          <button
            onClick={pickFolder}
            disabled={picking}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#f7f6f3] hover:bg-[#e8e7e4] rounded-lg transition-colors disabled:opacity-50"
          >
            <FolderOpen className="w-4 h-4" />
            {t("selectFolder")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl p-12 border-2 border-dashed rounded-xl border-[rgba(55,53,47,0.09)] hover:border-[#9b9a97] hover:bg-[#f7f6f3] transition-all duration-200">
      {fileInput}
      {folderInput}

      <div className="flex flex-col items-center gap-5 text-center">
        <div className="p-4 rounded-2xl bg-[#f7f6f3]">
          <FileText className="w-8 h-8 text-[#9b9a97]" />
        </div>

        <div>
          <p className="text-lg font-medium text-[#37352f]">{t("dropTitle")}</p>
          <p className="mt-1 text-sm text-[#787774]">{t("dropHint")}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={pickFiles}
            disabled={picking}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#2eaadc] text-white rounded-lg hover:bg-[#2eaadc]/90 transition-colors disabled:opacity-50"
          >
            {picking ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {t("selectFiles")}
          </button>
          <button
            onClick={pickFolder}
            disabled={picking}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#f7f6f3] text-[#37352f] rounded-lg hover:bg-[#e8e7e4] transition-colors disabled:opacity-50"
          >
            <FolderOpen className="w-4 h-4" />
            {t("selectFolder")}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 mt-2 text-xs text-[#9b9a97]">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            <span>{t("formatsDocs")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileArchive className="w-3.5 h-3.5" />
            <span>{t("formatsZip")}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-1 text-xs text-[#d9730d]">
          <AlertCircle className="w-3 h-3" />
          <span>{t("legacyWarn")}</span>
        </div>

        <p className="text-xs text-[#9b9a97]">{t("dropNote")}</p>
      </div>
    </div>
  );
}
