import { X, Copy, Download, FileText } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

interface PreviewProps {
  fileId: string;
  onClose: () => void;
}

export function Preview({ fileId, onClose }: PreviewProps) {
  const { files } = useAppStore();
  const file = files.find(f => f.id === fileId);

  if (!file || !file.result) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(file.result || "");
    toast.success("已复制到剪贴板");
  };

  const handleDownload = () => {
    const blob = new Blob([file.result || ""], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name.replace(/\.[^/.]+$/, "") + ".md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("已下载");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="flex flex-col w-full max-w-4xl h-[80vh] bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(55,53,47,0.09)]">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#9b9a97]" />
            <span className="text-sm font-medium">{file.name}</span>
            <span className="text-xs text-[#9b9a97]">→</span>
            <span className="text-sm text-[#2eaadc]">
              {file.name.replace(/\.[^/.]+$/, "")}.md
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#787774] 
                         hover:bg-[#f7f6f3] rounded-md transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              复制
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#787774] 
                         hover:bg-[#f7f6f3] rounded-md transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              下载
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-[#9b9a97] hover:text-[#37352f] hover:bg-[#f7f6f3] 
                         rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 prose prose-sm max-w-none">
          <ReactMarkdown>{file.result}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
