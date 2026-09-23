import { invoke } from "@tauri-apps/api/core";
import { ExportOptions } from "../stores/appStore";

const MAX_RETRIES = 60;
const RETRY_INTERVAL = 1000;

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
      }>;
    };

interface ConnectionInfo {
  port: number;
  token: string;
}

async function getConnectionInfo(): Promise<ConnectionInfo> {
  try {
    const info = await invoke<{ port: number; token: string }>("get_connection_info");
    const port = Number(info?.port) || 18765;
    const token = String(info?.token ?? "");
    return { port, token };
  } catch {
    // Dev outside Tauri: fall back to local defaults
    return { port: 18765, token: "" };
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
  async waitForServer(): Promise<ConnectionInfo> {
    const info = await getConnectionInfo();

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(`http://127.0.0.1:${info.port}/api/health`, {
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          return info;
        }
      } catch {
        // Server not ready
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
    onProgress?: (progress: number) => void
  ): Promise<ConvertResult> {
    const formData = new FormData();
    formData.append("file", file);
    if (relativePath) {
      formData.append("relativePath", relativePath);
    }

    const xhr = new XMLHttpRequest();

    return new Promise((resolve, reject) => {
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
              });
            }
          } catch {
            reject(new Error("parse_error"));
          }
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

      xhr.timeout = 300000;
      xhr.open("POST", `http://127.0.0.1:${conn.port}/api/convert`);
      const tokenHeader = authHeaders(conn.token);
      for (const [key, value] of Object.entries(tokenHeader)) {
        xhr.setRequestHeader(key, value);
      }
      xhr.send(formData);
    });
  },

  async exportFiles(
    conn: ConnectionInfo,
    files: Array<{ name: string; content?: string; relativePath?: string; cachePath?: string }>,
    options: ExtendedExportOptions
  ): Promise<void> {
    const response = await fetch(`http://127.0.0.1:${conn.port}/api/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(conn.token),
      },
      body: JSON.stringify({
        files,
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

    if (options.format === "zip") {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "markitdown-export.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
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
