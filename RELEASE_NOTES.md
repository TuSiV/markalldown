# MarkAllDown 3.0.0

[Home](README.md) · [简体中文](README.zh-CN.md) · [Documentation](docs/README.md)

**Stable release · Windows x64 · macOS Apple Silicon / Intel**

[Download](https://github.com/TuSiV/markalldown/releases/tag/v3.0.0) · [Checksums](https://github.com/TuSiV/markalldown/releases/download/v3.0.0/SHA256SUMS.txt) · [Acceptance run](https://github.com/TuSiV/markalldown/actions/runs/38850938759)

## Highlights

| Area | Result |
|---|---|
| Desktop startup | Directory-based bundled Python runtime; conversion/OCR dependencies load on demand |
| Startup workflow | Select files while starting; process queued files once ready; retry without losing selection |
| Browser language | English/Chinese switching across workspaces and common status/errors, with remembered preference where storage permits |
| Export options | Combined output disables irrelevant naming/folder controls and explains the fixed `combined.md` filename |
| Diagnostics | Actual elapsed startup time and local phase logs, without an invented progress percentage |

Switching UI language preserves tasks, document content, filenames, and recovery results.

## Included workflows

- Local document/folder conversion, Chinese OCR, and legacy Office text extraction.
- Desktop adjustable concurrency, task pause/resume, failure retry, and session-scoped PDF page checkpoints.
- Full-text redaction review, independent recovery, encrypted packs, and an optional desktop recovery library.
- Browser-local conversion, optional offline resources, and desktop/browser recovery-pack interoperability.
- Desktop workspaces with macOS light/dark and accessibility preference adaptation.

## Upgrade from the old 3.0.0 prerelease

The stable release was rebuilt from the unified main source and replaced the old prerelease assets and tag target. It includes the export-option fix.

**Download and reinstall the stable package even if the installed prerelease already says 3.0.0.** Verify against the new checksum file, not a previously saved one.

## Release contents

| Asset | Purpose |
|---|---|
| `MarkAllDown_3.0.0_x64-setup.exe` | Windows x64 NSIS installer |
| `MarkAllDown_3.0.0_x64_en-US.msi` | Windows x64 MSI installer |
| `MarkAllDown_3.0.0_aarch64.dmg` | Apple Silicon Mac |
| `MarkAllDown_3.0.0_x64.dmg` | Intel Mac |
| `MarkAllDown_3.0.0_UI-screenshots.zip` | Synthetic UI acceptance screenshots |
| `SHA256SUMS.txt` | Checksums for installers and screenshot archive |

## Verification

Release source: [bf0d481](https://github.com/TuSiV/markalldown/commit/bf0d48198f9afc30954f54850f7ccfac72ac04b9). The same commit passed all five required acceptance groups before publication.

| Group | Scope |
|---|---|
| Windows x64 | Source checks, EXE/MSI build, bundled service, and installed NSIS app |
| macOS arm64 | Source checks, DMG build, installed app/service, signing and system-policy records |
| macOS x64 | Same native checks on Intel |
| Desktop UI | Workspace rendering and interaction with synthetic fixtures |
| Browser | Actual conversion, offline OCR, recovery, language, and responsive-layout checks |

The run passed 94 backend and 64 frontend tests. Staged and final asset sets were checked before marking the release stable/latest. These are results for this release commit, not a count promised for future source revisions.

## Operational boundaries

- macOS packages are ad-hoc signed, without Developer ID signing or notarization.
- Lazy loading can move some waiting time to the first conversion/OCR task.
- PDF checkpoints last only for the current desktop session.
- Check OCR, tables, formulas, and redaction against the source.
- UI screenshots and simulated mobile widths do not establish physical-device or every native-control acceptance.

[Security and privacy](SECURITY.md) · [Startup measurement scope](docs/DESKTOP_STARTUP.md)
