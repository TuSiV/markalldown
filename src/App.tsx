import { useState, useEffect } from "react";
import { Toaster } from "sonner";
import { DropZone } from "./components/DropZone";
import { FileList } from "./components/FileList";
import { ExportPanel } from "./components/ExportPanel";
import { Header } from "./components/Header";
import { useAppStore } from "./stores/appStore";
import { api } from "./lib/api";
import { RefreshCw } from "lucide-react";

function App() {
  const { files, setPort, setReady, isReady } = useAppStore();
  const [showExport, setShowExport] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const port = await api.waitForServer();
        setPort(port);
        setReady(true);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        setInitError(errorMsg);
      }
    };
    init();
  }, []);

  const hasFiles = files.length > 0;

  if (initError) {
    return (
      <div className="flex flex-col h-screen bg-white items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <span className="text-3xl">!</span>
          </div>
          <h2 className="text-xl font-medium text-[#37352f]">服务启动失败</h2>
          <p className="text-sm text-[#787774] bg-red-50 p-3 rounded-lg text-left">
            {initError}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-6 py-2.5 text-sm bg-[#2eaadc] text-white rounded-lg hover:bg-[#2eaadc]/90 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <Header onExport={() => setShowExport(!showExport)} />
      
      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden p-6">
          {!hasFiles ? (
            <div className="flex-1 flex items-center justify-center">
              <DropZone />
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <DropZone compact />
              <FileList />
            </div>
          )}
        </div>

        {showExport && (
          <ExportPanel onClose={() => setShowExport(false)} />
        )}
      </main>

      <footer className="px-6 py-2 border-t border-[rgba(55,53,47,0.09)] bg-[#f7f6f3]">
        <div className="flex items-center justify-between text-xs text-[#9b9a97]">
          <span>MarkItDown Desktop v1.0.0</span>
          <span>© 2026 YONGZHE CHEN. All rights reserved.</span>
        </div>
      </footer>

      <Toaster position="bottom-right" richColors />
    </div>
  );
}

export default App;
