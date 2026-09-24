# MarkAllDown

MarkAllDown 是一款本地桌面应用，可将 PDF / Office / 图片 / 压缩包等多种文件批量转换为 Markdown。转换引擎基于 [Microsoft MarkItDown](https://github.com/microsoft/markitdown)，并内置中文优先 OCR（扫描件与图片）。

> 产品名：**MarkAllDown** · 版本 **1.1.0** · 纯本地运行，不上传文件到外部服务（OCR 亦在本地）

## 功能

- **多格式转换**：PDF、DOCX、PPTX、XLSX、HTML、CSV、Markdown、epub、ipynb、音频元数据等
- **中文 OCR**：图片与扫描 PDF 自动识别文字（RapidOCR / PaddleOCR ONNX 模型）
- **批量与文件夹**：选择多个文件或整个文件夹，保留相对目录结构
- **导出方式**
  - 单文件 → **存到原位置**（源文件旁生成 `.md`）
  - 文件夹 → 导出到指定目录：**合并为一个 .md** / **按原目录结构生成** / ZIP
- **转换结果磁盘缓存**：全文写入本地缓存目录，预览/导出时按需读取，降低内存占用
- **中 / 英切换**：应用内一键切换；NSIS 安装向导支持简体中文 / English
- **本地 API 鉴权**：sidecar 使用随机 token，避免浏览器页面误调本机服务

## 架构

```text
┌─────────────────────┐     ┌──────────────────────────┐
│  Tauri UI (React)   │────▶│  markalldown-server.exe  │
│  markalldown.exe    │     │  FastAPI + MarkItDown    │
│  dialog/fs/i18n     │     │  + OCR + 缓存/导出        │
└─────────────────────┘     └──────────────────────────┘
         │ WebSocket/HTTP (127.0.0.1 + X-API-Token)
```

- **前端**：React 18 + TypeScript + Vite + Tailwind + Zustand
- **壳**：Tauri 2（启动/回收 Python sidecar，文件对话框）
- **后端**：Python FastAPI + MarkItDown + RapidOCR + pypdfium2

## 开发

### 前置要求

- Node.js 18+
- Python 3.11+
- Rust 1.77+

### 安装依赖

```bash
npm install
pip install -r backend/requirements.txt
```

### 开发模式

```bash
npm run tauri dev
```

### 完整打包

```bash
python scripts/build.py
```

或手动：

```bash
# 1) Python sidecar
cd backend
python -m PyInstaller markalldown_server.spec --clean --noconfirm

# 2) 拷贝 sidecar 到 Tauri 外部二进制目录
#    src-tauri/binaries/markalldown-server-<host-triple>.exe

# 3) 构建桌面安装包
npm run tauri build
```

产物：

| 路径 | 说明 |
|------|------|
| `src-tauri/target/release/bundle/nsis/MarkAllDown_*_x64-setup.exe` | NSIS 安装包（中/英向导） |
| `src-tauri/target/release/bundle/msi/MarkAllDown_*_x64_en-US.msi` | MSI 安装包（en-US） |
| `src-tauri/target/release/markalldown.exe` | 主程序 |
| `src-tauri/target/release/markalldown-server.exe` | 转换服务 sidecar |

## 使用说明

1. 启动应用后选择**文件**或**文件夹**
2. 转换完成后可**预览**（按需读缓存全文）
3. 单文件：点「存到原位置」；批量：点「导出」选择目录与格式
4. 右上角 **中 / EN** 切换界面语言

### 支持与限制

| 类型 | 说明 |
|------|------|
| 旧版 `.doc` / `.ppt` | 不支持，请先转为 `.docx` / `.pptx` |
| 图片 / 扫描 PDF | 走 OCR；无文字时会提示「未识别到文字」 |
| 带文字层的 PDF | 优先抽文字层（更快） |

## 安全与隐私

- 所有转换与 OCR 在本机完成
- 本机服务绑定 `127.0.0.1`，并要求随机 token（`X-API-Token`）
- 解压与导出路径做了穿越防护
- 转换结果缓存于 `%LOCALAPPDATA%\com.markalldown.app\cache`，退出时清空

## 许可证

MIT（转换能力依赖 Microsoft MarkItDown，详见其仓库许可）
