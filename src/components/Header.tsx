import { FileDown, Loader2 } from "lucide-react";
import { useAppStore } from "../stores/appStore";

interface HeaderProps {
  onExport: () => void;
}

export function Header({ onExport }: HeaderProps) {
  const { files, isReady, isConverting } = useAppStore();
  const hasFiles = files.length > 0;
  const completedFiles = files.filter(f => f.status === "done").length;

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-[rgba(55,53,47,0.09)] bg-white">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#2eaadc] flex items-center justify-center">
            <FileDown className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#37352f] leading-tight">MarkItDown</h1>
            <p className="text-[10px] text-[#9b9a97] leading-tight">© YONGZHE CHEN</p>
          </div>
        </div>
        
        {!isReady && (
          <span className="flex items-center gap-1.5 text-xs text-[#9b9a97]">
            <Loader2 className="w-3 h-3 animate-spin" />
            正在启动服务...
          </span>
        )}
        {isReady && (
          <span className="text-xs text-[#0f7b6c]">服务已就绪</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasFiles && (
          <span className="text-sm text-[#787774] mr-2">
            已完成 {completedFiles}/{files.length} 个文件
          </span>
        )}
        
        <button
          onClick={onExport}
          disabled={!hasFiles || completedFiles === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg
                     bg-[#2eaadc] text-white hover:bg-[#2eaadc]/90 disabled:opacity-50 
                     disabled:cursor-not-allowed transition-colors"
        >
          <FileDown className="w-4 h-4" />
          导出
        </button>
      </div>
    </header>
  );
}
