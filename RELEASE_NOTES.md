# MarkAllDown 3.0.3

[中文首页](README.md) · [English](README.en.md) · [Documentation](docs/README.md)

**Stable patch release · Windows x64 · macOS Apple Silicon / Intel**

[Download](https://github.com/TuSiV/markalldown/releases/tag/v3.0.3) · [Checksums](https://github.com/TuSiV/markalldown/releases/download/v3.0.3/SHA256SUMS.txt)

## 本次更新 / Changes

- 脱敏审核左右设置列总高度对齐，敏感词与规则输入区延伸至右列底部。
  Redaction settings columns align at both edges; sensitive-term and whitelist fields expand to match the full right column.
- 缩小审核统计中的数字卡片、间距和明细高度，各张卡片保持自然高度与原有位置。
  Review summary metrics, spacing and findings are more compact, while individual cards retain their natural heights and existing positions.
- 修复深色模式下“敏感词与规则”标题颜色，保留独立整屏对照、同步滚动及英文短替代词。
  Fix the sensitive-terms heading color in dark mode; full-screen comparison, optional scroll synchronization and compact English placeholders remain available.

## Upgrade

Install 3.0.3 over 3.0.2. Existing recovery packs remain supported.

## Release contents

| Asset | Purpose |
|---|---|
| `MarkAllDown_3.0.3_x64-setup.exe` | Windows x64 NSIS installer |
| `MarkAllDown_3.0.3_x64_en-US.msi` | Windows x64 MSI installer |
| `MarkAllDown_3.0.3_aarch64.dmg` | Apple Silicon Mac |
| `MarkAllDown_3.0.3_x64.dmg` | Intel Mac |
| `MarkAllDown_3.0.3_UI-screenshots.zip` | Synthetic UI acceptance screenshots |
| `SHA256SUMS.txt` | SHA-256 checksums for installers and screenshots |

## Verification

Publication is gated on Windows x64, macOS arm64, macOS x64, desktop UI and browser acceptance for the exact release commit. Installers, screenshots and checksums are verified before the draft becomes the latest stable release. See [GitHub Actions](https://github.com/TuSiV/markalldown/actions/workflows/privacy-candidate.yml) for build and installation evidence.

## Operational boundaries

- macOS packages are ad-hoc signed, without Developer ID signing or notarization.
- PDF checkpoints last only for the current desktop session.
- Check OCR, tables, formulas and redaction against the source.
- UI screenshots use synthetic fixtures and mocked native interfaces; they supplement native installation tests.

[Security and privacy](SECURITY.md) · [Build guide](BUILDING.md)
