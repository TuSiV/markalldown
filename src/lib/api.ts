import { ExportOptions } from "../stores/appStore";

const MAX_RETRIES = 60;
const RETRY_INTERVAL = 1000;

export interface ExtendedExportOptions extends ExportOptions {
  exportPath?: string;
}

export const api = {
  async waitForServer(): Promise<number> {
    const port = 18765;
    
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
          signal: controller.signal,
        });
        
        clearTimeout(timeout);
        
        if (response.ok) {
          return port;
        }
      } catch {
        // Server not ready
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
    }
    
    throw new Error("无法连接到转换服务，请重启应用");
  },

  async convertFile(
    port: number,
    file: File,
    relativePath?: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
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
            resolve(response.markdown);
          } catch {
            reject(new Error("解析响应失败"));
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.detail || `服务器错误: ${xhr.status}`));
          } catch {
            reject(new Error(`服务器错误: ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("网络错误"));
      });

      xhr.timeout = 300000;
      xhr.open("POST", `http://127.0.0.1:${port}/api/convert`);
      xhr.send(formData);
    });
  },

  async exportFiles(
    port: number,
    files: Array<{ name: string; content: string; relativePath?: string }>,
    options: ExtendedExportOptions
  ): Promise<void> {
    const response = await fetch(`http://127.0.0.1:${port}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
};
