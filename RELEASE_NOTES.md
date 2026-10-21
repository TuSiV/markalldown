# MarkAllDown 3.0.1

[中文首页](README.md) · [English](README.en.md) · [Documentation](docs/README.md)

**Stable patch release · Windows x64 · macOS Apple Silicon / Intel**

[Download](https://github.com/TuSiV/markalldown/releases/tag/v3.0.1) · [Checksums](https://github.com/TuSiV/markalldown/releases/download/v3.0.1/SHA256SUMS.txt)

## 本次更新 / Changes

- 多文件转换时，“选择文件 / 选择文件夹”只占左侧队列宽度，右侧预览向上延伸，增加可阅读空间。
  In batch conversion, import controls occupy only the queue column so the preview can use the full height beside them.
- “重试失败项”改为与“清空全部”一致的紧凑图标加文字样式，保留原有重试和禁用逻辑。
  Retry failed uses the same compact icon-and-text treatment as Clear all, with existing retry behavior retained.
- 脱敏审核“左右对照”支持双向同步滚动；按滚动进度跟随，适应替换后文本高度的变化。
  Redaction comparison supports bidirectional scrolling by relative position, including texts of different heights.
- 新增默认开启的“同步滚动”勾选项；取消后两侧独立滚动，重新勾选后恢复同步。
  A Sync scrolling checkbox is enabled by default. Turn it off for independent scrolling and on to resume synchronization.

## Upgrade

Install 3.0.1 over 3.0.0. This release uses a new version tag and newly built packages.

## Release contents

| Asset | Purpose |
|---|---|
| `MarkAllDown_3.0.1_x64-setup.exe` | Windows x64 NSIS installer |
| `MarkAllDown_3.0.1_x64_en-US.msi` | Windows x64 MSI installer |
| `MarkAllDown_3.0.1_aarch64.dmg` | Apple Silicon Mac |
| `MarkAllDown_3.0.1_x64.dmg` | Intel Mac |
| `MarkAllDown_3.0.1_UI-screenshots.zip` | Synthetic UI acceptance screenshots |
| `SHA256SUMS.txt` | SHA-256 checksums for installers and screenshots |

## Verification

Publication is gated on Windows x64, macOS arm64, macOS x64, desktop UI and browser acceptance for the exact release commit. Installers, screenshots and checksums are verified before the draft becomes the latest stable release. See [GitHub Actions](https://github.com/TuSiV/markalldown/actions/workflows/privacy-candidate.yml) for build and installation evidence.

## Operational boundaries

- macOS packages are ad-hoc signed, without Developer ID signing or notarization.
- PDF checkpoints last only for the current desktop session.
- Check OCR, tables, formulas and redaction against the source.
- UI screenshots use synthetic fixtures and mocked native interfaces; they supplement native installation tests.

[Security and privacy](SECURITY.md) · [Build guide](BUILDING.md)
