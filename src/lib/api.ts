import { invoke, isTauri } from "@tauri-apps/api/core";
import { ExportOptions } from "../stores/appStore";

const MAX_RETRIES = 120;
const RETRY_INTERVAL = 1000;

export interface ConversionCheckpoint {completed?: number; total?: number; current?: number | null; resumed?: number; checkpoint?: boolean}
export interface ConversionControl {signal?: AbortSignal; jobId?: string; concurrency?: number; resume?: boolean}

export interface ExtendedExportOptions extends ExportOptions {
  exportPath?: string;
}

export type ConvertResult =
  | {
      kind: "single";
      filename: string;
      cachePath: string;
      preview: string;
      charCount: number;
      warnings?: string[];
      engine?: string;
      totalPages?: number;
      resumedPages?: number;
    }
  | {
      kind: "archive";
      filename: string;
      files: Array<{
        filename: string;
        cachePath?: string;
        preview?: string;
        charCount?: number;
        error?: string;
        success: boolean;
        warnings?: string[];
        engine?: string;
      }>;
    };

interface ConnectionInfo {
  port: number;
  token: string;
}

async function getConnectionInfo(): Promise<ConnectionInfo> {
  if (!isTauri()) return { port: 18765, token: "" };
  try {
    const info = await invoke<{ port: number; token: string }>("get_connection_info");
    const port = Number(info?.port) || 18765;
    const token = String(info?.token ?? "");
    return { port, token };
  } catch (error) {
    throw new Error(localizeError(String(error), localStorage.getItem("markitdown.locale") || "zh-CN"));
  }
}

function authHeaders(token: string): Record<string, string> {
  const locale = localStorage.getItem("markitdown.locale") || "zh-CN";
  const headers: Record<string, string> = { "X-Locale": locale };
  if (token) headers["X-API-Token"] = token;
  return headers;
}

export function dirnameOf(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, "");
  const idx = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return idx >= 0 ? normalized.slice(0, idx) : normalized;
}

export function basenameOf(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, "");
  const idx = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

/** 将 api 内部错误码翻成当前语言 */
export function localizeError(message: string, locale: string): string {
  const en = locale === "en-US";
  const map: Record<string, string> = {
    service_exited: en
      ? "The conversion service stopped during startup. Retry to restart it. If it fails again, see service-startup.log in the app logs."
      : "转换服务启动时已退出。请重试以重新启动；如仍失败，请查看应用日志中的 service-startup.log。",
    service_start_failed: en
      ? "Unable to start the conversion service. Retry to restart it. If it fails again, reinstall the latest version."
      : "无法启动转换服务。请重试以重新启动；如仍失败，请重新安装最新版本。",
    parse_error: en ? "Failed to parse response" : "解析响应失败",
    auth_error: en
      ? "Unauthorized: local service token mismatch. Fully quit the app and reopen"
      : "未授权：本地服务 token 校验失败，请完全退出应用后重新打开",
    network_error: en ? "Network error" : "网络错误",
    timeout_error: en ? "Conversion timed out" : "转换超时",
  };
  if (map[message]) return map[message];
  const m = message.match(/^server_error:(\d+)$/);
  if (m) return en ? `Server error: ${m[1]}` : `服务器错误: ${m[1]}`;
  return message;
}

export const api = {
  async restartServer(): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke("restart_service");
    } catch (error) {
      throw new Error(localizeError(String(error), localStorage.getItem("markitdown.locale") || "zh-CN"));
    }
  },

  async waitForServer(): Promise<ConnectionInfo> {
    const deadline = Date.now() + 120_000;

    for (let i = 0; i < MAX_RETRIES && Date.now() < deadline; i++) {
      // Check the native child each time; a dead service must not look like loading.
      const info = await getConnectionInfo();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      try {
        const response = await fetch(`http://127.0.0.1:${info.port}/api/health`, {
          signal: controller.signal,
        });

        if (response.ok) {
          return info;
        }
      } catch {
        // Server not ready
      } finally {
        clearTimeout(timeout);
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
    }

    throw new Error(
      localStorage.getItem("markitdown.locale") === "en-US"
        ? "Cannot connect to conversion service. Please restart the app"
        : "无法连接到转换服务，请重启应用"
    );
  },

  async convertFile(
    conn: ConnectionInfo,
    file: File,
    relativePath?: string,
    onProgress?: (progress: number) => void,
    onState?: (state: "queued" | "running", checkpoint?: ConversionCheckpoint) => void,
    options: ConversionControl = {}
  ): Promise<ConvertResult> {
    const formData = new FormData();
    formData.append("file", file);
    if (relativePath) {
      formData.append("relativePath", relativePath);
    }

    const jobId = options.jobId || crypto.randomUUID();
    formData.append('jobId', jobId);
    formData.append('concurrency', String(options.concurrency || 1));
    const xhr = new XMLHttpRequest();

    return new Promise((resolve, reject) => {
      let polling: ReturnType<typeof setInterval> | undefined;
      let pending: AbortController | null = null;
      let finished = false;
      const poll = async () => {
        if (finished || pending) return;
        const controller = new AbortController(); pending = controller;
        const timer = setTimeout(() => controller.abort(), 2000);
        try {
          const response = await fetch(`http://127.0.0.1:${conn.port}/api/conversions/${jobId}`, {headers: authHeaders(conn.token), signal: controller.signal});
          if (response.ok) {
            const data = await response.json();
            if (!finished && (data.state === 'queued' || data.state === 'running')) onState?.(data.state, data);
          }
        } catch { /* The conversion response remains authoritative. */ }
        finally { clearTimeout(timer); pending = null; }
      };
      const cancel = () => { xhr.abort(); cleanup(); reject(new DOMException('已暂缓', 'AbortError')); };
      const cleanup = () => { finished = true; clearInterval(polling); pending?.abort(); options.signal?.removeEventListener('abort', cancel); };
      xhr.addEventListener('loadend', cleanup);
      {
        xhr.upload.addEventListener('load', () => { if (!finished) onState?.('queued'); });
        polling = setInterval(() => { void poll(); }, 500);
      }
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 50));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.is_archive && Array.isArray(response.files)) {
              resolve({
                kind: "archive",
                filename: response.filename,
                files: response.files,
              });
            } else {
              resolve({
                kind: "single",
                filename: response.filename,
                cachePath: response.cachePath || "",
                preview: response.preview || "",
                charCount: Number(response.charCount) || 0,
                warnings: response.warnings || [],
                engine: response.engine,
                totalPages: typeof response.totalPages === "number" ? response.totalPages : undefined,
                resumedPages: typeof response.resumedPages === "number" ? response.resumedPages : undefined,
              });
            }
          } catch {
            reject(new Error("parse_error"));
          }
        } else if (options.resume && xhr.status === 404) {
          reject(new Error("job_missing"));
        } else if (xhr.status === 401) {
          reject(new Error("auth_error"));
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.detail || `server_error:${xhr.status}`));
          } catch {
            reject(new Error(`server_error:${xhr.status}`));
          }
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("network_error"));
      });

      xhr.addEventListener("timeout", () => {
        reject(new Error("timeout_error"));
      });

      // All workers enforce their active-processing deadline on the server.
      xhr.timeout = 0;
      try {
        xhr.open("POST", options.resume ? `http://127.0.0.1:${conn.port}/api/conversions/${jobId}/resume` : `http://127.0.0.1:${conn.port}/api/convert`);
        const tokenHeader = authHeaders(conn.token);
        for (const [key, value] of Object.entries(tokenHeader)) {
          xhr.setRequestHeader(key, value);
        }
        xhr.addEventListener('abort', () => { cleanup(); reject(new DOMException('已暂缓', 'AbortError')); });
        options.signal?.addEventListener('abort', cancel, {once: true});
        if (options.signal?.aborted) { cancel(); return; }
        if (options.resume) xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(options.resume ? JSON.stringify({concurrency: options.concurrency || 1}) : formData);
      } catch (error) { cleanup(); reject(error); }
    });
  },

  async controlConversion(conn: ConnectionInfo, jobId: string, action: 'pause' | 'discard'): Promise<ConversionCheckpoint & {state: string}> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`http://127.0.0.1:${conn.port}/api/conversions/${jobId}/${action}`, {method: 'POST', headers: authHeaders(conn.token), signal: controller.signal});
      if (response.status === 404) return {state: 'missing'};
      if (!response.ok) throw Error('任务操作失败，请重试');
      return await response.json();
    } finally { clearTimeout(timer); }
  },

  async exportFiles(
    conn: ConnectionInfo,
    files: Array<{ name: string; content?: string; relativePath?: string; cachePath?: string }>,
    options: ExtendedExportOptions
  ): Promise<string> {
    const response = await fetch(`http://127.0.0.1:${conn.port}/api/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(conn.token),
      },
      body: JSON.stringify({
        files,
        returnPath: true,
        options: {
          format: options.format,
          preserveNames: options.preserveNames,
          structure: options.structure,
          exportPath: options.exportPath,
        }
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `导出失败: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success || typeof result.path !== "string") throw new Error("Invalid export result");
    return result.path;
  },

  /** 将单个转换结果写到源文件同目录 */
  async saveBesideSource(
    conn: ConnectionInfo,
    file: { name: string; content?: string; cachePath?: string; sourcePath: string }
  ): Promise<string> {
    const exportPath = dirnameOf(file.sourcePath);
    if (!exportPath) {
      throw new Error("无法确定源文件目录");
    }
    await api.exportFiles(
      conn,
      [{
        name: file.name,
        content: file.content,
        cachePath: file.cachePath,
        relativePath: basenameOf(file.sourcePath),
      }],
      {
        format: "individual",
        preserveNames: true,
        structure: "flat",
        exportPath,
      }
    );
    return exportPath;
  },

  async readCachedText(conn: ConnectionInfo, cachePath: string): Promise<string> {
    const url = new URL(`http://127.0.0.1:${conn.port}/api/text`);
    url.searchParams.set("path", cachePath);
    const response = await fetch(url, { headers: authHeaders(conn.token) });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `读取缓存失败: ${response.status}`);
    }
    const data = await response.json();
    return data.content ?? "";
  },
};
