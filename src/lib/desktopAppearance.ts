import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface DesktopAppearance {
  platform: string;
  reduceTransparency: boolean;
  increaseContrast: boolean;
  reduceMotion: boolean;
}

// An opaque fallback is intentional: never guess that native accessibility settings are off.
const fallback: DesktopAppearance = {
  platform: "unknown", reduceTransparency: true, increaseContrast: false, reduceMotion: false,
};

export function useDesktopAppearance() {
  const [appearance, setAppearance] = useState(fallback);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshing = false;
    const refresh = async () => {
      if (disposed || refreshing) return;
      if (timer) clearTimeout(timer);
      refreshing = true;
      try {
        const next = await invoke<DesktopAppearance>("get_desktop_appearance");
        if (!disposed) setAppearance(next);
        // WebKit media queries don't consistently expose all NSWorkspace preferences.
        // Poll only a visible Mac window; also refresh immediately when returning to the app.
        if (!disposed && next.platform === "macos" && !document.hidden)
          timer = setTimeout(refresh, 3000);
      } catch {
        // Keep the opaque fallback; service startup and document conversion stay independent.
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return appearance;
}
