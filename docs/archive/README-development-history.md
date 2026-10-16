# 历史 README 与开发过程归档

> 本文保存 README 改写前的完整快照，可能包含过时版本号、阶段性结论与已完成的待办，不作为当前使用或验收依据。
> 分支：`main`；原始提交：[bb98a24](https://github.com/TuSiV/markalldown/blob/bb98a249bc265b78f64703fc20fbab88c13d4377/README.md)。当前说明见 [README](../../README.md)。

---

# MarkAllDown

MarkAllDown 是一款本地桌面应用，可将 PDF / Office / 图片 / 压缩包等多种文件批量转换为 Markdown。转换引擎基于 [Microsoft MarkItDown](https://github.com/microsoft/markitdown)，并内置中文优先 OCR（扫描件与图片）。

> 产品名：**MarkAllDown** · 版本 **1.2.0** · 纯本地运行，不上传文件到外部服务（OCR 亦在本地）

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

- Node.js 22.12+（CI 使用 24）
- Python 3.11+
- Rust stable；Windows 需 C++ 构建工具，macOS 需 Xcode Command Line Tools

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
#    Windows: src-tauri/binaries/markalldown-server-<host-triple>.exe
#    macOS: src-tauri/binaries/markalldown-server-<host-triple>

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

### macOS 安装包

1.2.0 同时提供 Apple Silicon（aarch64）与 Intel（x64）DMG。转换服务与 OCR 模型随应用内置，无需另装 Python。请在 [1.1.1 发布页](https://github.com/TuSiV/markalldown/releases/tag/v1.2.0) 选择对应架构；Windows EXE/MSI 位于同一发布页，并附 SHA256SUMS.txt。

macOS 包使用 ad-hoc 临时签名，未获 Developer ID 签名及公证。CI 已验证 DMG 复制安装、实际桌面启动及内置服务转换/OCR/导出；未逐控件做人工界面验收。主分支保留文件转换功能，2.0.0 脱敏/AI 功能在独立功能分支。

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

### Mac 下载后显示“损坏”

1.1.1 / 2.0.0 缺少完整应用包签名；此前直接启动验收没有覆盖浏览器下载后的 Gatekeeper 检查。请改用 1.2.0 / 2.0.1。新版本对应用包、主程序和内置转换服务验证签名，并记录下载隔离状态下的系统评估。

临时签名不是 Apple Developer ID 签名或公证，首次启动仍可能被拦截。确认下载来源与 SHA256SUMS.txt 一致后，按 macOS 的“系统设置 → 隐私与安全性 → 仍要打开”处理。不要关闭系统整体 Gatekeeper。若仍显示损坏，检查 `codesign --verify --deep --strict --verbose=2 /Applications/MarkAllDown.app`，保留输出以区分签名失效与信任策略拦截。

## main 1.2.0 界面更新

转换、导出、设置使用独立工作区，细化文件图标、状态、选中反馈、按钮、表单和预览排版。语言、全文预览方式、字号、自动预览、并发转换和导出默认值均实际生效。导出显示后端返回的真实保存路径。main 保留转换、OCR 和导出功能；脱敏审核与恢复在 feature/redaction-ai 分支。
