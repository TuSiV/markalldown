# MarkAllDown 3.0.2

[中文首页](README.md) · [English](README.en.md) · [Documentation](docs/README.md)

**Stable patch release · Windows x64 · macOS Apple Silicon / Intel**

[Download](https://github.com/TuSiV/markalldown/releases/tag/v3.0.2) · [Checksums](https://github.com/TuSiV/markalldown/releases/download/v3.0.2/SHA256SUMS.txt)

## 本次更新 / Changes

- 文件预览占据整个右侧栏，从顶部延伸到页脚上方，单文件和多文件均可充分利用窗口空间。
  Document previews use the entire right column from the top of the window to the footer, for both single and multiple files.
- 脱敏审核的敏感词与密码设置在上方并排；文件与对照区移至下方独立一行，可单独占据一整屏工作区高度。
  Sensitive terms and password settings sit side by side above a full-width document comparison that has its own workspace-screen height.
- 可恢复脱敏替代词改为英文短格式，例如 `【PHONE_ab12cd34_01】`、`【ID_ab12cd34_01】` 和 `【TERM_ab12cd34_01】`。
  Reversible placeholders use compact English codes, including PHONE, ID and TERM, with a short file identifier and sequence number.
- 保留旧长格式恢复支持，并验证跨桌面与网页恢复、多文件合并、片段恢复及占位符冲突检查。
  Existing long placeholders remain recoverable, with desktop/browser interoperability, combined files, excerpts and collision checks validated.

## Upgrade

Install 3.0.2 over 3.0.1. Use 3.0.2 or newer to restore newly generated short placeholders; existing recovery packs remain supported.

## Release contents

| Asset | Purpose |
|---|---|
| `MarkAllDown_3.0.2_x64-setup.exe` | Windows x64 NSIS installer |
| `MarkAllDown_3.0.2_x64_en-US.msi` | Windows x64 MSI installer |
| `MarkAllDown_3.0.2_aarch64.dmg` | Apple Silicon Mac |
| `MarkAllDown_3.0.2_x64.dmg` | Intel Mac |
| `MarkAllDown_3.0.2_UI-screenshots.zip` | Synthetic UI acceptance screenshots |
| `SHA256SUMS.txt` | SHA-256 checksums for installers and screenshots |

## Verification

Publication is gated on Windows x64, macOS arm64, macOS x64, desktop UI and browser acceptance for the exact release commit. Installers, screenshots and checksums are verified before the draft becomes the latest stable release. See [GitHub Actions](https://github.com/TuSiV/markalldown/actions/workflows/privacy-candidate.yml) for build and installation evidence.

## Operational boundaries

- macOS packages are ad-hoc signed, without Developer ID signing or notarization.
- PDF checkpoints last only for the current desktop session.
- Check OCR, tables, formulas and redaction against the source.
- UI screenshots use synthetic fixtures and mocked native interfaces; they supplement native installation tests.

[Security and privacy](SECURITY.md) · [Build guide](BUILDING.md)
