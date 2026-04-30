import { useCallback, useState, useRef } from "react";
import { FolderOpen, FileArchive, FileText, Loader2, AlertCircle } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { api } from "../lib/api";
import { toast } from "sonner";

interface DropZoneProps {
  compact?: boolean;
}

const UNSUPPORTED_FORMATS: Record<string, string> = {
  '.doc': '旧版 .doc 格式不支持，请转换为 .docx',
  '.ppt': '旧版 .ppt 格式不支持，请转换为 .pptx',
  '.rtf': 'RTF 格式暂不支持',
  '.odt': 'OpenDocument 格式暂不支持',
};

export function DropZone({ compact = false }: DropZoneProps) {
  const { addFiles, setConverting, updateFileStatus, port, isReady } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    if (!port || !isReady) {
      toast.error("服务尚未就绪，请稍候...");
      return;
    }

    const allFiles = Array.from(fileList).filter(f => f.size > 0);
    if (allFiles.length === 0) {
      toast.warning("未选择任何文件");
      return;
    }

    const acceptedFiles: File[] = [];
    const rejectedFiles: { file: File; reason: string }[] = [];

    for (const f of allFiles) {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      if (UNSUPPORTED_FORMATS[ext]) {
        rejectedFiles.push({ file: f, reason: UNSUPPORTED_FORMATS[ext] });
      } else {
        acceptedFiles.push(f);
      }
    }

    if (rejectedFiles.length > 0) {
      for (const r of rejectedFiles) {
        toast.error(`${r.file.name}: ${r.reason}`);
      }
    }

    if (acceptedFiles.length === 0) return;

    const fileEntries = acceptedFiles.map(f => {
      const relativePath = (f as any).webkitRelativePath || f.name;
      return {
        id: crypto.randomUUID(),
        name: f.name,
        size: f.size,
        type: f.type || "application/octet-stream",
        status: "pending" as const,
        progress: 0,
        file: f,
        relativePath: relativePath,
      };
    });

    addFiles(fileEntries);
    setConverting(true);

    let successCount = 0;
    let failCount = 0;

    for (const entry of fileEntries) {
      updateFileStatus(entry.id, "converting", 0);
      
      try {
        const result = await api.convertFile(port, entry.file!, entry.relativePath, (progress) => {
          updateFileStatus(entry.id, "converting", progress);
        });
        
        updateFileStatus(entry.id, "done", 100, result);
        successCount++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        updateFileStatus(entry.id, "error", 0, errorMsg);
        failCount++;
      }
    }

    setConverting(false);

    if (successCount > 0) {
      toast.success(`成功转换 ${successCount} 个文件`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} 个文件转换失败`);
    }
  }, [port, isReady, addFiles, setConverting, updateFileStatus]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  }, [processFiles]);

  if (!isReady) {
    return (
      <div className="w-full max-w-2xl p-12 border-2 border-dashed rounded-xl border-[rgba(55,53,47,0.09)] bg-[#f7f6f3]">
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="w-8 h-8 text-[#2eaadc] animate-spin" />
          <div>
            <p className="text-lg font-medium text-[#37352f]">正在启动服务...</p>
            <p className="mt-1 text-sm text-[#787774]">首次启动可能需要几秒钟</p>
          </div>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="mb-4 p-4 border-2 border-dashed rounded-lg border-[rgba(55,53,47,0.09)]">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore
          webkitdirectory=""
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#f7f6f3] hover:bg-[#e8e7e4] rounded-lg transition-colors"
          >
            <FileText className="w-4 h-4" />
            选择文件
          </button>
          <button
            onClick={() => folderInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#f7f6f3] hover:bg-[#e8e7e4] rounded-lg transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            选择文件夹
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl p-12 border-2 border-dashed rounded-xl border-[rgba(55,53,47,0.09)] hover:border-[#9b9a97] hover:bg-[#f7f6f3] transition-all duration-200">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        onChange={handleFileChange}
        className="hidden"
      />
      
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="p-4 rounded-2xl bg-[#f7f6f3]">
          <FileText className="w-8 h-8 text-[#9b9a97]" />
        </div>
        
        <div>
          <p className="text-lg font-medium text-[#37352f]">
            选择要转换的文件
          </p>
          <p className="mt-1 text-sm text-[#787774]">
            支持批量上传文件或整个文件夹
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#2eaadc] text-white 
                       rounded-lg hover:bg-[#2eaadc]/90 transition-colors"
          >
            <FileText className="w-4 h-4" />
            选择文件
          </button>
          <button
            onClick={() => folderInputRef.current?.click()}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#f7f6f3] text-[#37352f] 
                       rounded-lg hover:bg-[#e8e7e4] transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            选择文件夹
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 mt-2 text-xs text-[#9b9a97]">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            <span>PDF, DOCX, PPTX, XLSX</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileArchive className="w-3.5 h-3.5" />
            <span>ZIP, RAR, 7z</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-1 text-xs text-[#d9730d]">
          <AlertCircle className="w-3 h-3" />
          <span>不支持旧版 .doc/.ppt 格式，请转换为 .docx/.pptx</span>
        </div>
      </div>
    </div>
  );
}
