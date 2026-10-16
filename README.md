# MarkAllDown

将 PDF、Office、图片等文件转换为 Markdown，支持批量处理、中文 OCR。

**[立即网页试用](https://markalldown-preview.ardentpeach129.chatgpt.site) · [下载本分支桌面版 v1.2.0](https://github.com/TuSiV/markalldown/releases/tag/v1.2.0) · [3.0.0 预发布](https://github.com/TuSiV/markalldown/releases/tag/v3.0.0) · [全部版本](https://github.com/TuSiV/markalldown/releases)**

> 当前分支：`main` · 版本：**1.2.0** · 桌面转换版。网页试用为独立部署的 3.0.0 浏览器版，支持中文 / English；该入口不代表本分支包含浏览器版源码。

## 选择使用方式

| 使用方式 | 适用场景 | 入口 |
|---|---|---|
| 浏览器版 | 无需安装，文件在当前浏览器中处理；支持转换、OCR、脱敏与恢复 | [打开网页试用](https://markalldown-preview.ardentpeach129.chatgpt.site) |
| 桌面版 | 本机批量文件与文件夹转换、目录导出 | [下载 v1.2.0](https://github.com/TuSiV/markalldown/releases/tag/v1.2.0) |

桌面安装包包含转换服务与 OCR 模型，无需另装 Python。Windows 选择 `x64-setup.exe`；Mac 按芯片选择 Apple Silicon `aarch64.dmg` 或 Intel `x64.dmg`。校验文件为同一发布页的 `SHA256SUMS.txt`。

macOS 安装包使用临时签名，未经过 Apple Developer ID 签名及公证；首次打开可能需要在“系统设置 → 隐私与安全性”中允许打开。

## 主要功能

- **文件转换**：PDF、DOCX、PPTX、XLSX、HTML、CSV、Markdown 等常用文档转为 Markdown。
- **中文 OCR**：识别图片与扫描 PDF；带文字层的 PDF 优先提取文字。
- **批量与预览**：导入多个文件或文件夹，查看处理状态、阅读全文及 Markdown 源文。
- **导出**：单文件保存、合并 Markdown、保留目录结构或 ZIP。
- **界面语言**：桌面版可在设置中切换中文 / English。在线浏览器版通过页眉切换，保留当前任务；语言切换不翻译文档正文或文件名。

## 快速开始

### 网页试用

1. 打开 [MarkAllDown 网页版](https://markalldown-preview.ardentpeach129.chatgpt.site)，按需要选择“中文”或“English”。
2. 选择或拖入文件，等待转换完成后预览。
3. 下载转换结果；包含提取资源时以 ZIP 打包 Markdown 与资源。
4. 如需分享脱敏内容，进入脱敏审核，检查全文，先保存加密恢复包并确认，再下载脱敏 Markdown。

网页文件处理在浏览器中完成，不连接桌面 Python 服务。首次使用需下载页面与引擎资源；文档及口令不写入离线缓存。刷新或关闭页面会清除会话中的文档与口令，请先下载结果并单独保管恢复包。浏览器可能回收离线缓存。

### 桌面使用

1. 下载并安装对应系统的安装包。
2. 打开应用，选择文件或文件夹；转换完成后预览全文。
3. 在导出工作区选择保存位置与格式，或将单个 Markdown 存到原文件旁。

## 支持范围与数据处理

本分支桌面版不支持旧格式 `.doc` / `.ppt`，请先转为 `.docx` / `.pptx`。在线浏览器版采用独立引擎，支持范围与本分支不同。复杂表格、公式和 OCR 结果应对照原件检查；转换目标是 Markdown 内容，不是原始版面的完整复刻。

桌面转换与 OCR 在本机进行，本地服务仅监听回环地址并使用随机令牌鉴权。转换缓存正常退出时清理，异常退出可能残留。

## 从源码运行

Node.js 22.12+、Python 3.12、Rust stable；Windows 需要 C++ 构建工具，macOS 需要 Xcode Command Line Tools。

```bash
npm ci
python -m pip install -r backend/requirements.txt
python scripts/build.py --sidecar-only
npm run tauri dev
```

桌面完整打包：

```bash
python scripts/build.py
```

## 文档与分支

| 分支 | 版本 | 范围 |
|---|---|---|
| [main](https://github.com/TuSiV/markalldown/tree/main) | 1.2.0 | 桌面转换、OCR、导出 |
| [feature/redaction-ai](https://github.com/TuSiV/markalldown/tree/feature/redaction-ai) | 2.2.1 | 桌面脱敏、恢复、可选 AI |
| [feature/local-web-conversion](https://github.com/TuSiV/markalldown/tree/feature/local-web-conversion) | 2.3.0-rc.5 | 桌面旧格式、浏览器转换与离线资源 |
| [perf/desktop-startup](https://github.com/TuSiV/markalldown/tree/perf/desktop-startup) | 3.0.0 预发布 | 桌面启动优化、浏览器中英切换 |

- [版本说明](RELEASE_NOTES.md)
- [历史 README 与开发过程归档](docs/archive/README-development-history.md)（历史快照，不作为当前使用说明）

## 许可证

MIT。转换能力基于 [Microsoft MarkItDown](https://github.com/microsoft/markitdown)，第三方依赖分别遵循其许可证。
