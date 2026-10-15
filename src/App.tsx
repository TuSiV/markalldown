import { useState, useEffect } from "react";
import { Toaster } from "sonner";
import { ConversionWorkspace } from "./components/ConversionWorkspace";
import { SettingsPanel } from "./components/SettingsPanel";
import { Sidebar } from "./components/WorkspaceShell";
import type { Workspace } from "./stores/uiStore";

import { ExportPanel } from "./components/ExportPanel";
import { RecoveryPanel } from "./components/RecoveryPanel";
import { RedactionPanel } from "./components/RedactionPanel";
import { Header } from "./components/Header";
import { useAppStore } from "./stores/appStore";
import { api } from "./lib/api";
import { useT, useI18n } from "./i18n";
import { useDesktopAppearance } from "./lib/desktopAppearance";
import "./desktop.css";
import { RefreshCw } from "lucide-react";

function App() {
  const appearance = useDesktopAppearance();
  const { setConnection, setReady } = useAppStore();
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const [panel, setPanel] = useState<Workspace>("convert");
  const [initError, setInitError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const init = async () => {
      try {
        const conn = await api.waitForServer();
        setConnection(conn.port, conn.token);
        setReady(true);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        setInitError(errorMsg);
      }
    };
    init();
  }, [setConnection, setReady]);



  if (initError) {
    return (
      <div className="flex flex-col h-screen bg-white items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <span className="text-3xl">!</span>
          </div>
          <h2 className="text-xl font-medium text-[#37352f]">{t("serviceFailed")}</h2>
          <p className="text-sm text-[#787774] bg-red-50 p-3 rounded-lg text-left">
            {initError}
          </p>
          <button
            disabled={restarting}
            onClick={async () => {
              setRestarting(true);
              try {
                await api.restartServer();
                window.location.reload();
              } catch (error) {
                setInitError(error instanceof Error ? error.message : String(error));
                setRestarting(false);
              }
            }}
            className="flex items-center gap-2 px-6 py-2.5 text-sm bg-[#2eaadc] text-white rounded-lg hover:bg-[#2eaadc]/90 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="desktop-app" data-platform={appearance.platform} data-reduce-transparency={appearance.reduceTransparency} data-increase-contrast={appearance.increaseContrast} data-reduce-motion={appearance.reduceMotion}>
      <Header workspace onSettings={() => setPanel("settings")} onExport={() => setPanel("export")} onRedact={() => setPanel("redaction")} onRecovery={() => setPanel("recovery")} />

      <main className="desktop-main">
        <Sidebar page={panel} onNavigate={setPanel} />
        <div className="desktop-content">
          <div hidden={panel !== "convert"} className="h-full"><ConversionWorkspace /></div>
          <div hidden={panel !== "redaction"} className="h-full"><RedactionPanel onClose={() => setPanel("convert")} onExport={() => setPanel("export")} /></div>
          <div hidden={panel !== "recovery"} className="h-full"><RecoveryPanel onClose={() => setPanel("convert")} /></div>
          <div hidden={panel !== "export"} className="h-full"><ExportPanel workspace onClose={() => setPanel("convert")} onRedact={() => setPanel("redaction")} /></div>
          <div hidden={panel !== "settings"} className="h-full"><SettingsPanel /></div>
        </div>
      </main>

      <footer className="desktop-footer">
        <div className="flex items-center justify-between text-xs text-[#9b9a97]">
          <span>{t("footer")}</span>
          <span>{t("copyright")}</span>
        </div>
      </footer>

      <Toaster position="bottom-right" richColors />
    </div>
  );
}

export default App;
