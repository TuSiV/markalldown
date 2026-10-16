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
import "./mac.css";
import { useUIStore } from "./stores/uiStore";
import { RefreshCw } from "lucide-react";

function App() {
  const appearance = useDesktopAppearance();
  const { setConnection, setReady } = useAppStore();
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const [panel, setPanel] = useState<Workspace>("convert");
  const [initError, setInitError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const isReady = useAppStore(s => s.isReady);
  const en = locale === "en-US";

  const colorMode = useUIStore(s => s.macAppearance);
  useEffect(() => {
    if (appearance.platform !== "macos") return;
    document.documentElement.dataset.macAppearance = colorMode;
    document.documentElement.style.colorScheme = colorMode === "system" ? "light dark" : colorMode;
    return () => { delete document.documentElement.dataset.macAppearance; document.documentElement.style.colorScheme = ""; };
  }, [appearance.platform, colorMode]);

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



  useEffect(() => {
    if (isReady || initError) return;
    const started = performance.now();
    const timer = setInterval(() => setElapsed(Math.floor((performance.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [isReady, initError]);

  const retryService = async () => {
    setRestarting(true);
    try {
      await api.restartServer();
      setInitError(null);
      setElapsed(0);
      const conn = await api.waitForServer();
      setConnection(conn.port, conn.token);
      setReady(true);
    } catch (error) {
      setInitError(error instanceof Error ? error.message : String(error));
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div className="desktop-app" data-platform={appearance.platform} data-reduce-transparency={appearance.reduceTransparency} data-increase-contrast={appearance.increaseContrast} data-reduce-motion={appearance.reduceMotion}>
      <Header workspace onSettings={() => setPanel("settings")} onExport={() => setPanel("export")} onRedact={() => setPanel("redaction")} onRecovery={() => setPanel("recovery")} />

      <main className="desktop-main">
        <Sidebar page={panel} onNavigate={setPanel} />
        <div className="desktop-content">
          {!isReady && <div role={initError ? "alert" : "status"} className="service-status">
            <div><strong>{initError ? t("serviceFailed") : t("serviceStarting")}</strong>
              <p>{initError || (en ? `You can select files now. Conversion starts when the service is ready. Waiting ${elapsed}s.` : `可先选择文件，服务就绪后自动转换。已等待 ${elapsed} 秒。`)}</p>
              {!initError && elapsed >= 15 && <p>{en ? "Startup is taking longer than expected. See service-startup.log in the app logs." : "启动时间超出预期，可查看应用日志中的 service-startup.log。"}</p>}
            </div>
            {initError && <button className="ui-secondary" disabled={restarting} onClick={retryService}><RefreshCw size={16} />{t("retry")}</button>}
          </div>}
          <div hidden={panel !== "convert"} className="h-full"><ConversionWorkspace /></div>
          <div hidden={panel !== "redaction"} className="h-full"><RedactionPanel onClose={() => setPanel("convert")} onExport={() => setPanel("export")} /></div>
          <div hidden={panel !== "recovery"} className="h-full"><RecoveryPanel onClose={() => setPanel("convert")} /></div>
          <div hidden={panel !== "export"} className="h-full"><ExportPanel workspace onClose={() => setPanel("convert")} onRedact={() => setPanel("redaction")} /></div>
          <div hidden={panel !== "settings"} className="h-full"><SettingsPanel platform={appearance.platform} /></div>
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

