# MarkAllDown

将 PDF、Office、图片等文件转换为 Markdown，支持批量处理、中文 OCR、脱敏审核与加密恢复。

**[立即网页试用](https://markalldown-preview.ardentpeach129.chatgpt.site) · [下载桌面预发布 v3.0.0](https://github.com/TuSiV/markalldown/releases/tag/v3.0.0) · [3.0.0 预发布](https://github.com/TuSiV/markalldown/releases/tag/v3.0.0) · [全部版本](https://github.com/TuSiV/markalldown/releases)**

> 当前分支：`main` · 版本：**3.0.0（预发布）** · 桌面启动优化与浏览器双语预发布版。网页试用为独立部署的 3.0.0 浏览器版，支持中文 / English；线上部署不会随分支提交自动更新。

## 选择使用方式

| 使用方式 | 适用场景 | 入口 |
|---|---|---|
| 浏览器版 | 无需安装，文件在当前浏览器中处理；支持转换、OCR、脱敏与恢复 | [打开网页试用](https://markalldown-preview.ardentpeach129.chatgpt.site) |
| 桌面版 | 本机批量文件与文件夹转换、目录导出、可选 AI 辅助识别 | [下载 v3.0.0](https://github.com/TuSiV/markalldown/releases/tag/v3.0.0) |

桌面安装包包含转换服务与 OCR 模型，无需另装 Python。Windows 选择 `x64-setup.exe`；Mac 按芯片选择 Apple Silicon `aarch64.dmg` 或 Intel `x64.dmg`。校验文件为同一发布页的 `SHA256SUMS.txt`。

macOS 安装包使用临时签名，未经过 Apple Developer ID 签名及公证；首次打开可能需要在“系统设置 → 隐私与安全性”中允许打开。

## 主要功能

- **文件转换**：PDF、DOCX、PPTX、XLSX、HTML、CSV、Markdown 等常用文档转为 Markdown。
- **中文 OCR**：识别图片与扫描 PDF；带文字层的 PDF 优先提取文字。
- **批量与预览**：导入多个文件或文件夹，查看处理状态、阅读全文及 Markdown 源文。
- **导出**：单文件保存、合并 Markdown、保留目录结构或 ZIP。
- **界面语言**：桌面版可在设置中切换中文 / English。在线浏览器版通过页眉切换，保留当前任务；语言切换不翻译文档正文或文件名。
- **脱敏审核**：规则、自定义敏感词与白名单，逐文件检查全文并确认后导出。
- **独立恢复**：使用脱敏 Markdown、加密 JSON 恢复包与口令恢复文本；桌面版可选用本机加密恢复库。
- **可选 AI**：仅桌面版提供辅助候选识别，默认关闭，须配置服务并明确同意外发脱敏稿。
- **旧格式提取**：桌面版支持本地提取 DOC / PPT 等旧格式正文；浏览器 Office 转换可打包提取出的资源。
- **离线资源**：浏览器设置提供“准备全部离线资源”，用于缓存 PDF / OCR 等资源。
- **启动与队列**：桌面启动期间即可选择文件，服务就绪后自动处理；失败可原地重试并保留已选文件。

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
4. 需要脱敏时，先在“脱敏审核”中配置规则、填写至少 8 字符的口令，逐文件审核并确认，再导出脱敏版。
5. 需要恢复时，在“文件恢复”中选择脱敏 Markdown、对应恢复包及口令，检查预览后另存。

## 支持范围与数据处理

桌面和浏览器使用不同转换引擎，格式支持、资源提取与排版结果可能不同。复杂表格、公式和 OCR 结果应对照原件检查；转换目标是 Markdown 内容，不是原始版面的完整复刻。

桌面转换与 OCR 在本机进行，本地服务仅监听回环地址并使用随机令牌鉴权。转换缓存正常退出时清理，异常退出可能残留。

**脱敏与恢复为实验性功能。** 普通预览、复制及普通导出仍包含原文；需要分享时请使用“导出脱敏版”。自动规则可能漏检，图片像素、链接目标与来源元数据不保证清除，须人工检查。

恢复包包含加密的敏感映射，须与脱敏正文分开保管；不要连同父目录一起分享。恢复只能还原转换后的 Markdown 文本，不能重建原始 Word / PDF。桌面本机恢复库默认关闭，启用后保存加密恢复数据；原文缓存不会因启用脱敏而被加密。

可选 AI 仅在明确同意后向所配置服务发送脱敏稿，最多前 20,000 字符；候选须人工采用。浏览器版不提供云端 AI。

## 从源码运行

Node.js 22.12+、Python 3.12、Rust stable；Windows 需要 C++ 构建工具，macOS 需要 Xcode Command Line Tools。仅开发浏览器版时无需 Python 和 Rust。

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

桌面后端采用目录式打包，必须保留完整的 `src-tauri/binaries/runtime/` 运行环境，不能只复制可执行文件。

浏览器开发与构建：

```bash
npm ci
npm run dev:web
npm run build:web
npm run preview:web
```

静态产物为 `dist-web/`，可部署到 HTTPS 托管；电脑本地开发可使用 localhost。

## 文档与开发

`main` 是唯一长期维护分支，包含桌面转换、脱敏与恢复、浏览器工作台和启动优化。后续功能通过临时分支与 PR 开发，完成后删除临时分支。历史版本通过 [Release 与标签](https://github.com/TuSiV/markalldown/releases) 获取。

分支代码可能晚于已发布的安装包；下载 v3.0.0 不会自动包含其后提交的修复。当前 3.0.0 保持预发布状态。

- [版本说明](RELEASE_NOTES.md)
- [桌面构建与验证](BUILDING.md)
- [浏览器与本地引擎实现说明](docs/LOCAL_WEB_IMPLEMENTATION.md)
- [桌面启动测量与实现记录](docs/DESKTOP_STARTUP.md)
- [历史 README 与开发过程归档](docs/archive/README-development-history.md)（历史快照，不作为当前使用说明）

## 许可证

MIT。转换能力基于 [Microsoft MarkItDown](https://github.com/microsoft/markitdown) 等组件，第三方依赖分别遵循其许可证。
