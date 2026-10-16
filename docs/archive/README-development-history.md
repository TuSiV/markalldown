# README development history

[Current documentation](../README.md) · [English home](../../README.en.md) · [中文首页](../../README.md)

> Historical snapshot, not current instructions. Old branch names, test counts, and pending items reflect the original writing stage.

[View the original rendered document](https://github.com/TuSiV/markalldown/blob/bf0d48198f9afc30954f54850f7ccfac72ac04b9/docs/archive/README-development-history.md)

<details>
<summary><strong>Expand the preserved source</strong></summary>

````markdown
# 历史 README 与开发过程归档

> 本文保存 README 改写前的完整快照，可能包含过时版本号、阶段性结论与已完成的待办，不作为当前使用或验收依据。
> 分支：`perf/desktop-startup`；原始提交：[6090b7a](https://github.com/TuSiV/markalldown/blob/6090b7a12d939377edd323fe39cf93b65b97bd0e/README.md)。当前说明见 [README](../../README.md)。

---

# MarkAllDown

MarkAllDown 是一款本地桌面应用，可将 PDF / Office / 图片 / 压缩包等多种文件批量转换为 Markdown。转换引擎基于 [Microsoft MarkItDown](https://github.com/microsoft/markitdown)，并内置中文优先 OCR（扫描件与图片）。

> 产品名：**MarkAllDown** · 版本 **2.3.0-rc.4（预发布）** · 默认纯本地运行；仅启用可选 AI 且明确同意后，会向所选 AI 服务发送脱敏稿（OCR 始终在本地）

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

仅准备内置运行环境：

```bash
python scripts/build.py --sidecar-only
# 生成 src-tauri/binaries/runtime/ 完整目录，之后再运行 npm run tauri build。
```

后端使用目录式打包，必须分发整个运行环境，不能单独拷贝可执行文件。

产物：

| 路径 | 说明 |
|------|------|
| `src-tauri/target/release/bundle/nsis/MarkAllDown_*_x64-setup.exe` | NSIS 安装包（中/英向导） |
| `src-tauri/target/release/bundle/msi/MarkAllDown_*_x64_en-US.msi` | MSI 安装包（en-US） |
| `src-tauri/target/release/markalldown.exe` | 主程序 |
| `src-tauri/binaries/runtime/` | 打包前的完整转换运行环境；安装后位于应用资源目录 `runtime/` |

## 使用说明

1. 启动应用后选择**文件**或**文件夹**
2. 转换完成后可**预览**（按需读缓存全文）
3. 单文件：点「存到原位置」；批量：点「导出」选择目录与格式
4. 右上角 **中 / EN** 切换界面语言

### 支持与限制

| 类型 | 说明 |
|------|------|
| 旧版 `.doc` / `.ppt` | 本分支通过本地 anydoc 直接提取正文，复杂表格及图片需对照原件检查 |
| 图片 / 扫描 PDF | 走 OCR；无文字时会提示「未识别到文字」 |
| 带文字层的 PDF | 优先抽文字层（更快） |

## 安全与隐私

- 所有转换与 OCR 在本机完成
- 本机服务绑定 `127.0.0.1`，并要求随机 token（`X-API-Token`）
- 解压与导出路径做了穿越防护
- 转换结果缓存于 `%LOCALAPPDATA%\com.markalldown.app\cache`，退出时清空

## 许可证

MIT（转换能力依赖 Microsoft MarkItDown，详见其仓库许可）


## 可选脱敏 / 恢复 / AI 辅助识别（实验性）

1. 转换文件后打开导出设置，启用可选脱敏，选择规则及自定义敏感词、白名单，填写至少 8 字符的映射口令。
2. 对整批每个文件分别检查完整原文及脱敏稿，排除误检并补充漏检，逐文件确认全文审核。调整规则或口令会清除审核状态。
3. 选择导出目录及 individual / combined / zip 格式。默认保留原文件名；仅显式选择匿名化时使用 document_0001.md 等名称及平铺目录，可在脱敏审核或导出面板切换。使用“导出脱敏版”，后端先验证恢复后的原文 SHA-256，再写入并核验加密映射，最后生成独立批次目录。
4. 脱敏输出保存在 `redacted-批次ID` 文件夹；恢复映射保存在其旁边的 `recovery-批次ID.json`。ZIP 内不包含映射。不要连同整个父目录一起分享。
5. 恢复时选择 Markdown、对应映射及正确口令。恢复的是转换后的 Markdown 文本，不是原来的 Word/PDF 二进制文件。

普通导出和普通预览的复制/下载/保存仍使用原文。脱敏开启时显示原文标识，并通过桌面确认对话框防止误导出。

AI 默认关闭，需要指定兼容 Chat Completions 的接口、模型及会话 API Key。先预览并确认全文，再同意外发，AI 最多收到脱敏稿前 20,000 字符。换接口、模型、文件或规则会清除同意状态；请求完成也会清除。候选仅能人工加入词表，不自动修改文档。无实际外部 AI 调用参与本次验证。

**边界**：这是 Markdown 文本替换功能。图片像素、OCR 漏识别、未列入词表的姓名/机构/项目、链接目的地及来源元数据不保证清除。人工检查必须涵盖这些内容。跨文件占位符仍隔离；同一文件中的相同项保持一致。白名单按词作用于全文，可能排除其重叠匹配。

每批最多 100 个文件；请求正文最多 10 MB；单篇规则处理最多 5,000,000 字符及 20,000 个候选匹配；恢复最多 100 份映射。达到上限会报错而非静默截断。对原文已有 MAD 占位符的二次处理，导出恢复验证可能要求原有映射；先恢复后再脱敏。

原文缓存不会被映射加密。新增缓存使用匿名文件名，POSIX 目录/文件权限为 700/600；Windows 权限依赖系统账户 ACL。正常退出清理缓存，异常退出仍可能残留。此功能不是安全删除工具。

Node.js 需要 22.12+（本轮使用 24.19）。

测试：`python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt`；`python -m unittest discover -s tests -v`；`npm ci`；`npm test`；`npm run build`。Windows/macOS 桌面启动、侧车打包和安装包仍需目标系统验证。

### Mac 下载后显示“损坏”

1.1.1 / 2.0.0 缺少完整应用包签名；此前直接启动验收没有覆盖浏览器下载后的 Gatekeeper 检查。请改用 1.1.2 / 2.0.1。新版本对应用包、主程序和内置转换服务验证签名，并记录下载隔离状态下的系统评估。

临时签名不是 Apple Developer ID 签名或公证，首次启动仍可能被拦截。确认下载来源与 SHA256SUMS.txt 一致后，按 macOS 的“系统设置 → 隐私与安全性 → 仍要打开”处理。不要关闭系统整体 Gatekeeper。若仍显示损坏，检查 `codesign --verify --deep --strict --verbose=2 /Applications/MarkAllDown.app`，保留输出以区分签名失效与信任策略拦截。

## 2.1.0：独立脱敏审核、导出与恢复

- 主界面提供三个入口：**脱敏审核**、**导出**、**文件恢复**。先在脱敏审核中配置规则、逐文件检查全文并确认；导出只保存已经审核的脱敏结果。规则、口令、文件内容变化都会使原审核失效。
- 每批最多 100 个文件，支持单文件、合并和 ZIP 导出。**一批一个加密 JSON 恢复包**，保存在脱敏输出目录旁边；分享文件时不要分享恢复包。
- 文件正文带不包含姓名、原文件名等内容的随机文档/脱敏版本编号。复制或改名不会影响匹配。同一次导入的文档编号固定；重新脱敏产生新版本编号，重新导入原文则作为新的文档处理。
- 恢复无需转换文件或查询导出历史。选任一脱敏 MD、该批恢复包与口令，即可单独恢复；不需要同时提供整批 MD。恢复前显示全文及校验状态，确认后另存新文件，不覆盖已有文件。
- 新恢复包的映射和清单均加密认证，包含文档/版本关联、导出文件编号及内容哈希。原样导出文件显示“与导出清单一致”；编辑或截取后的内容只能恢复已知占位符，必须额外确认。旧版恢复包继续可用，但无法提供新清单的完整性校验。
- **本机恢复库默认关闭**。可在导出时选择另存加密恢复包，也可在独立恢复界面明确导入、匹配和移除恢复包。库只存加密恢复数据、随机编号、数量与时间，不存原文、原文件路径或口令，不是云端备份。它在正常退出后保留，与退出清理的转换缓存分离。
- 恢复输出仍是 Markdown 文本，不能重建原始 Word/PDF。高级跨文件主体统一和超长 AI 分段不包含在本次升级中。


## 2.2.0 工作台与设置

A+B 混合 UI 使用浅色侧边导航，转换、脱敏审核、文件恢复、导出中心和设置各自拥有独立页面。切换页面保留当前会话的文件、审核结果及恢复预览；不会因此把原文或口令写入偏好存储。

- 转换：导入文件/目录，队列状态、全文阅读/Markdown 源文预览、原文复制/保存。读取全文失败时仅显示片段并禁用复制/下载。
- 审核：实际文件队列、检测规则、全文对照、逐文件确认、下一份待审核及已有 AI 显式外发授权。规则或口令变化继续清除旧审核。
- 恢复：MD + 加密 JSON 或本机库，实际匹配/预览结果、确认全文后另存。恢复包格式仍为 JSON，不引入概念稿中的 MRP。
- 导出：实际批次、审核数量、格式/目录/命名选择与成功输出路径。匿名命名可选，默认保留原名。
- 设置：语言、自动预览、阅读/源文模式、字号、下一批 1–4 个并发任务以及导出默认值，全部立即生效。偏好持久化只含这些非敏感字段；重置不删除文件或恢复库。PDF/OCR 共享引擎按资源情况排队。

未实现的开机启动、自动更新、缓存占用和日志目录操作不作为按钮出现。取消/清理缓存也不冒充“从队列移除”。转换运行时暂时禁用移除及清空队列。


### 2.2.1 细节 UI 与渲染检查

统一文件类型图标、状态徽标、按钮、表单、开关、分段切换及文档排版。脱敏审核使用队列 / 全文对照 / 统计操作三栏；恢复提供真实进度提示；导出采用配置卡片与批次汇总；设置分类选项卡可实际切换。

`npm run test:ui` 使用 Playwright 检查五个页面的 1440 / 800 像素渲染、高亮与审核操作，并输出截图。可用 `CHROME_PATH` 指定 Chrome，`UI_SCREENSHOT_DIR` 指定截图目录。截图使用标注的示例服务与文件选择器，不包含真实用户文档；后端及原生安装检查另行验证真实功能。发布流程同时要求 UI 渲染和三个原生平台通过。


## 本地浏览器版（feature/local-web-conversion）

从 `feature/redaction-ai` 的 `7482b60` 派生。桌面构建保留现有入口；浏览器版使用独立的构建模式，不连接 Python 服务。

```bash
npm ci
npm run dev:web
npm run build:web
npm run preview:web
```

`dist-web/` 可部署到 HTTPS 静态托管。文件在浏览器 Worker 内转换，支持中文本地 OCR、资源 ZIP、脱敏全文审核及独立恢复；桌面和浏览器的加密恢复包可互相使用。基础页面和转换引擎自动缓存，设置中的“准备全部离线资源”另外缓存 OCR/PDF 资源。浏览器可能清理缓存，文档和口令不会写入该缓存。

手机访问需要 HTTPS；电脑本地开发可用 localhost。浏览器版提供文件选择与拖入，尚未注册手机系统分享导入，也未生成原生 iOS/Android 安装包。桌面旧格式路径当前仅导出正文，浏览器 Office 路径支持嵌入资源打包。

实现范围、验证证据、基准方法和限制见 [本地转换与 Web 实现说明](docs/LOCAL_WEB_IMPLEMENTATION.md)。本分支构建只上传验证与安装包 artifacts，不自动创建 Release。

### Web 视觉与状态布局

浅色首屏采用中心导入区、分级标题和简洁导航；未导入时不显示空队列与结果区。导入后切换紧凑工作区，单文件使用通栏结果，批量时提供文件侧栏；手机优先显示结果。脱敏、恢复与设置统一表单和排版。处理引擎标识作为测试属性保留，不作为用户界面文案。


### 桌面视觉统一与 macOS 材质适配

第三分支的桌面入口独立使用 `src/desktop.css`，与 Web 共用 `src/assets/brand.svg`；Windows ICO、macOS ICNS 和桌面 PNG 已从该矢量源生成。未导入时突出导入入口，不展示空队列或结果；单文件通栏阅读，批量保留文件队列。脱敏审核、恢复、导出及设置统一字体、表单、状态和间距。

macOS 遵循 Apple 对导航层与内容层的区分：侧栏使用克制的自定义 WebKit 材质，正文、审核稿和恢复结果保持实色。保留系统原生标题栏与窗口按钮。通过 AppKit `NSWorkspace` 读取减少透明度、增强对比度和减少动态效果；进入前台时刷新，窗口可见时每三秒检查变化。读取失败时使用不透明背景，系统媒体查询也提供降级处理；Windows 使用实色导航。

**实现边界**：这是依据 Liquid Glass 设计原则优化的 Tauri/WebKit 界面，不是原生 `NSGlassEffectView`，也未实现折射或原生玻璃形变。当前不引入透明窗口私有 API，不改变 macOS 12 最低系统要求。原生材质或 Icon Composer 分层图标若另行引入，需针对对应系统与 SDK 验证。

`npm run test:ui` 覆盖空状态、单文件、批量、五个工作区、800×600 最小窗口，以及模拟 Mac 系统偏好变化与高对比度。截图是实际 React 组件配合模拟原生接口的渲染证据，不能替代 macOS 原生材质和系统设置的人工验收。原生安装包构建及启动检查由 Windows / Apple Silicon / Intel 的 CI 完成。

参考：[Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)、[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)。


### 2.3.0-rc.3 预发布

视觉优化后的桌面候选版本从本分支发布，Windows 提供 NSIS EXE，Mac 提供 Apple Silicon 与 Intel DMG。此候选版本不提供 MSI；正式版与候选版在同一应用标识下安装，安装前退出正在运行的应用。安装包版本、设置页和页脚统一读取/对应 2.3.0-rc.3。

预发布仅在提交消息含 `[prerelease]` 时运行发布任务，且须三个原生平台和界面检查成功；先建立草稿、上传安装包/截图与 SHA256，再核对附件名称、长度和可用的服务端摘要，最后公开为 prerelease，不改变最新正式版。Mac 材质实现边界和未公证状态见发布说明。

### 桌面 PDF 队列与超时（开发分支）

直接导入的 PDF 使用独立转换进程，单个进程实际处理最多 5 分钟；等待 PDF 队列的时间不计入该时限。超时或客户端断开后，服务会终止并回收该进程，再处理下一份 PDF。界面显示“正在读取文件”“排队中”与转换状态。所有格式均使用可回收进程；其它格式和压缩包的暂缓恢复会重新开始。

若大 PDF 超时，请拆分页码范围后重试；该机制用于避免单份异常文件阻塞后续任务，不保证大文件能在时限内完成。已发布的安装包不会随分支代码更新，需安装包含此修复的新构建。

### 并发、暂缓、重试与断点续转（2.3.0-rc.3）

设置中的 1～4 个并发控制实际运行的转换进程，多个导入批次共用上限。转换中和等待中的任务可暂缓，继续或失败重试会排到队尾。直接导入的 PDF 按页保存已完成结果，恢复时跳过已完成页；未完成页会重新处理，其它格式及压缩包从头处理。

检查点包含原始文档与已提取文字，仅保存在本机当前会话的私有临时目录。移除任务或正常退出会清理；不支持关闭应用后恢复。OCR 线程按并发数量限制，每页渲染最多约 2000 万像素。异常断电或强制杀死应用时不能保证临时目录立即清理。

`scripts/benchmark_queue.py` 使用合成的文字、扫描和混合 PDF 分别测量 1/2/4 并发的总耗时及可读取时的进程峰值内存；CI 保存各平台结果。单次合成测试不代表所有真实文档的加速比。



### 桌面启动优化（待原生安装包验收）

后端改用 PyInstaller 目录式打包，避免每次启动释放单文件运行环境。转换依赖按实际任务延迟导入；启动期间可先选择文件，服务就绪后自动处理队列。启动失败可原地重试，保留已选文件与设置。

阶段耗时记录在应用日志目录 `service-timings.jsonl`，只含阶段、耗时和进程号。`service-startup.log` 继续收集加载器错误。性能测量方法、验证边界和待验收项见 [启动优化记录](docs/DESKTOP_STARTUP.md)。

### 浏览器版语言

页眉的“中文 / English”可随时切换界面语言，覆盖转换、脱敏、恢复、设置及常见状态和错误提示。语言偏好保存在当前浏览器；存储受限时仍可切换。切换不会翻译文件正文、文件名、脱敏内容或恢复结果，也不会清空当前任务。
````

</details>
