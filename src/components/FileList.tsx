import { FileText, CheckCircle2, XCircle, Loader2, Trash2, Eye, AlertCircle } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import { useState } from "react";
import { Preview } from "./Preview";

export function FileList() {
  const { files, removeFile, clearFiles } = useAppStore();
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "converting":
        return <Loader2 className="w-4 h-4 text-[#2eaadc] animate-spin" />;
      case "done":
        return <CheckCircle2 className="w-4 h-4 text-[#0f7b6c]" />;
      case "error":
        return <XCircle className="w-4 h-4 text-[#eb5757]" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-[rgba(55,53,47,0.09)]" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "pending": return "等待中";
      case "converting": return "转换中";
      case "done": return "已完成";
      case "error": return "失败";
      default: return "";
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-[#787774]">
          文件列表 ({files.length})
        </h2>
        <button
          onClick={clearFiles}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#787774] 
                     hover:text-[#eb5757] hover:bg-[rgba(235,87,87,0.1)] rounded-md transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          清空全部
        </button>
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg border border-[rgba(55,53,47,0.09)]">
        {files.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-[#9b9a97]">
            <p>暂无文件</p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(55,53,47,0.09)]">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#f7f6f3] transition-colors"
              >
                <div className="flex-shrink-0">
                  {getStatusIcon(file.status)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#9b9a97] flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{file.name}</span>
                    <span className="text-xs text-[#9b9a97]">{getStatusText(file.status)}</span>
                  </div>
                  
                  {file.status === "converting" && (
                    <div className="mt-1.5 w-full bg-[#f7f6f3] rounded-full h-1.5">
                      <div
                        className="bg-[#2eaadc] h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  )}
                  
                  {file.status === "error" && file.result && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3 h-3 text-[#eb5757]" />
                      <p className="text-xs text-[#eb5757] truncate">{file.result}</p>
                    </div>
                  )}
                </div>

                <span className="text-xs text-[#9b9a97] flex-shrink-0">
                  {formatSize(file.size)}
                </span>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {file.status === "done" && (
                    <button
                      onClick={() => setPreviewFile(file.id)}
                      className="p-1.5 text-[#9b9a97] hover:text-[#2eaadc] hover:bg-[rgba(46,170,220,0.1)] 
                                 rounded-md transition-colors"
                      title="预览"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => removeFile(file.id)}
                    className="p-1.5 text-[#9b9a97] hover:text-[#eb5757] hover:bg-[rgba(235,87,87,0.1)] 
                               rounded-md transition-colors"
                    title="移除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewFile && (
        <Preview
          fileId={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  );
}
