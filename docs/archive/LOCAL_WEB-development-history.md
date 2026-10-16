# Web implementation development snapshot

[Current documentation](../README.md) · [English home](../../README.md) · [中文首页](../../README.zh-CN.md)

> Historical snapshot, not current instructions. Old branch names, test counts, and pending items reflect the original writing stage.

[View the original rendered document](https://github.com/TuSiV/markalldown/blob/bf0d48198f9afc30954f54850f7ccfac72ac04b9/docs/LOCAL_WEB_IMPLEMENTATION.md)

<details>
<summary><strong>Expand the preserved source</strong></summary>

````markdown
# 本地转换与浏览器工作台实现说明

基础：`feature/redaction-ai@7482b60`；目标：`feature/local-web-conversion`。版本仍为 2.2.1，不自动发布 Release。

## 实现范围

| 部分 | 已实现 |
|---|---|
| 桌面 | anydoc 0.2.4 提取 DOC/PPT/PPS/POT/RTF/ODT/ODS/ODP/XLSB 正文；现有现代 Office/PDF/OCR 路径保留；空正文失败；返回引擎、耗时、遗漏提示 |
| Web | 独立 Vite web 模式，React 单列/两列工作台；WASM Worker；DOC/PPT/XLS/XLSB 和常用新格式；Office 资源 ZIP；取消、重试、逐个处理、大小/时间限制 |
| OCR | 同源 Tesseract LSTM + 中英文整数量化模型；PDF.js legacy 兼容构建；混合 PDF 按原页序保留文字页并 OCR 扫描页；初始化可取消；中文字符之间的 OCR 空格规范化 |
| 隐私 | 各类确定性规则、自定义词、白名单、全文审核；独立下载加密恢复包；确认已保存恢复包后才启用脱敏正文下载；文件名审核；不导出原始资源 |
| 恢复 | 独立 MD/JSON 导入；兼容桌面 MAD-R1、MAD-R2、MAD-M1；scrypt 16384/8/1 + AES-256-GCM；文档/导出哈希；错误口令、未知占位符及篡改清单拒绝；修改文件提示与另存 |
| 离线 | 页面/引擎自动预缓存，OCR/PDF 单独准备缓存；成功标记在所有资源完成后写入；文档、明文映射及口令不进缓存 |

## 验证

- 70 项 Python 测试通过；视觉迭代后 30 项 Vitest 测试通过。
- 桌面 5 个页面在 1440/800 像素下检查；浏览器页面在 1440、768、390 像素下检查，无水平溢出。
- 实际 Chromium 浏览器验证：中文 DOCX 正文/金额/表格/图片 ZIP、DOC/PPT/XLS/XLSB、中文旧 DOC/PPT、浏览器→Python 和 Python→浏览器恢复、断网重开、本地中英文 OCR、混合 PDF、禁用 OCR 时显式失败、初始化取消并推进下一份文件。
- 浏览器测试无外部请求、无 pageerror；恢复与格式测试使用真实引擎，不是接口 mock。
- `npm audit --audit-level=high`：0 vulnerabilities。
- 本地环境为 Linux + Chromium 140；未把手机尺寸模拟当作 iPhone Safari 或 Android 真机验证。Windows/macOS 安装后的验证由新分支 CI 执行，待其完成。

## 实测基准

语料为 10 份合成/开源测试文档，两个引擎各在独立进程中运行5次，记录中位数；包含冷启动首次转换，但不计进程启动和导入时间。RSS 增量以1ms采样，只用于本机参考，不是移动设备内存保证，也不是完整性评分。

| 文件 | anydoc 中位 ms | MarkItDown 中位 ms |
|---|---:|---:|
| sample.doc | 0.3 | 不支持/失败 |
| sample.ppt | 0.11 | 不支持/失败 |
| sample.xls | 0.112 | 11.005 |
| sample.xlsb | 0.095 | 不支持/失败 |
| chinese.doc | 0.023 | 不支持/失败 |
| chinese.ppt | 0.123 | 不支持/失败 |
| 中文合同.docx | 6.322 | 183.511 |
| 中文表格.xlsx | 0.185 | 9.604 |
| 中文汇报.pptx | 0.619 | 11.594 |
| 中文合同.rtf | 0.007 | 4.038 |

本次 Linux Python anydoc 包目录实测 8,262,021 bytes（含 Python 包与本机扩展），不是安装包增量。
Web 全部静态资源约 35.82 MiB；WASM 6,691,779 bytes；可选 OCR 资源约 23.9 MiB。页面自动缓存和可选模型缓存分开。

不能据此承诺 Windows/macOS 安装包增量或整体缩到几 MB。原生安装包应比较同平台的 CI 构建产物。

## 明确限制与后续

- 桌面新增 anydoc 路径目前提取正文并明确提示未导出图片资源；浏览器 Office 路径可提取资源。未将现代桌面引擎整体切换。
- PDF/OCR 不承诺重建复杂版面、合并表格或公式；普通 PDF 图片不导出，Office 合并单元格展开并提示。
- 脱敏下载只包含 Markdown。原始图片/附件不跟随导出；正文中的资源引用因此可能不可用。图片本身尚未提供脱敏审核。
- 浏览器暂不提供云端 AI、恢复包自动本机库、手机系统分享导入、原生 iOS/Android 安装包、打印/PDF 输出。上述能力不以可点击的假按钮出现。
- 文档与口令只在会话内存中；关闭/刷新会清除。恢复包应独立保管；浏览器无法验证下载确已落盘，只能要求用户确认。
- 离线缓存受浏览器回收影响；手机需要 HTTPS，localhost 可用于电脑开发。首次 OCR 需下载本站模型或先准备离线资源。

## 开发与复现

```bash
npm ci
python -m venv .venv
# Windows 改用 .venv/Scripts/python；已有 Python 时可设置 MAD_PYTHON=python
.venv/bin/python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
npm test
.venv/bin/python -m unittest discover -s tests -v
npm run build
npm run build:web
CHROME_PATH=/path/to/chrome npm run test:ui
CHROME_PATH=/path/to/chrome npm run test:web
.venv/bin/python scripts/benchmark_engines.py
```

CI 的 `Local browser conversion` 上传 Web 静态包、检查记录和截图；`Desktop builds` 上传 Windows x64 / macOS arm64 / macOS x64 安装产物及安装验证。新分支不会自动创建 Release。


## 视觉迭代

首屏隐藏空队列，突出分级标题、文件导入和简短功能说明；导入后切换紧凑工作区。单文件使用通栏正文，批量提供侧栏，手机优先呈现结果。加入统一图标、文档转换示意、拖入状态、处理中状态、阅读排版和恢复文件选择区。原有转换与审核逻辑保留。

本地已通过构建和30项前端测试。新增空状态与清空返回的组件验证，CI 另外生成首屏与各工作区的桌面/手机尺寸截图；此次托管编辑未另启本地浏览器预览。
````

</details>
