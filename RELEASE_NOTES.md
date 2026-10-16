# MarkAllDown 3.0.0 · 预发布

本版本来自 `perf/desktop-startup`，用于正式发布前的体验与反馈。GitHub Release 标记为 prerelease，不作为最新稳定版。

## 桌面启动

- 内置 Python 转换服务改为目录式分发，避免每次启动解压单文件运行环境。
- 转换和 OCR 依赖按实际任务加载，基础服务先就绪。
- 启动期间可选择文件；服务就绪后自动转换。
- 服务启动失败可原地重试，保留已选文件和工作区设置。
- 显示真实等待时间，并保存本地阶段耗时日志，便于定位启动问题。

## 已包含的工作能力

- 本地文件与文件夹批量转换，支持 PDF、Office、旧版 Office、图片及压缩包。
- 可调并发队列、任务暂缓与继续、失败重试；PDF 使用当前会话内已完成页的检查点。
- 脱敏全文审核、导出及独立文件恢复、加密恢复库。
- Windows 桌面界面与 macOS 浅色/深色、透明度及对比度适配。
- 浏览器本地转换、离线资源及恢复包互通。

## 发布验证

发布任务必须等待同一提交的 Windows x64、macOS Apple Silicon、macOS Intel、桌面 UI 和浏览器验收全部成功；随后校验三份安装包、UI 截图及 SHA256。

Linux 目录式服务连续 5 次就绪中位数约 0.52 秒，仅为开发环境测量，不代表 Windows/macOS 冷启动或首次转换时间。

## 下载

- Windows x64：`MarkAllDown_3.0.0_x64-setup.exe`
- macOS Apple Silicon：`MarkAllDown_3.0.0_aarch64.dmg`
- macOS Intel：`MarkAllDown_3.0.0_x64.dmg`
- `SHA256SUMS.txt`：下载完整性校验。

macOS 使用临时签名，未作 Developer ID 公证；最终签名完整性与系统信任评估分别记录。首次模型加载仍可能有等待；PDF 检查点限当前会话。处理重要材料时，请核对 OCR、表格和脱敏结果。
