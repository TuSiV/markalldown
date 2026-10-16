<div align="center">

<img src="src/assets/brand.svg" width="80" height="80" alt="MarkAllDown logo" />

# MarkAllDown

### Documents to Markdown. Local conversion, reviewed sharing.

Local OCR · Batch processing · Redaction · Encrypted recovery

[简体中文](README.md) · **English**

**[Try the web app](https://markalldown-preview.ardentpeach129.chatgpt.site)** · **[Download v3.0.0](https://github.com/TuSiV/markalldown/releases/tag/v3.0.0)** · [Quick start](#quick-start) · [Documentation](docs/README.md)

Windows x64 · macOS Apple Silicon / Intel · Web · English / Chinese UI

</div>

---

![Document conversion and full-text Markdown preview](docs/assets/conversion.png)

<sub>Real application components with synthetic documents and mocked service/native interfaces. Screenshots show the Chinese UI; English is also available. Native installation and real conversion have separate CI checks.</sub>

## What you can do

| Convert and read | Review and share |
|---|---|
| **Convert documents** — PDF, Office, images, HTML, and other common inputs; extract text from legacy Office formats. | **Review redaction** — Rules, custom terms, allowlists, full-text comparison, and per-file approval. |
| **Recognize Chinese text** — Local OCR for images and scanned PDFs; use the text layer where available. | **Recover Markdown** — Restore text with its encrypted JSON recovery pack and password. |
| **Manage desktop batches** — Folder import, adjustable concurrency, pause/resume, and retry. | **Choose your output** — Individual files, combined Markdown, directory layouts, or ZIP. |
| **Work in a browser** — Local processing with optional offline PDF/OCR resources. | **Switch UI languages** — Keep tasks, filenames, and document text unchanged. |

## Web or desktop?

| | Browser | Desktop |
|---|---|---|
| **Start** | [Open the web app](https://markalldown-preview.ardentpeach129.chatgpt.site) | Install a Windows or macOS package |
| **Processing** | Browser-local engines and OCR | Bundled local service and OCR models |
| **Files / output** | File selection or drag-and-drop; Markdown/resource ZIP downloads | Files, folders, batch queues, and local export directories |
| **Privacy workflow** | Reviewed redaction and independent encrypted recovery packs | Also offers an optional local encrypted recovery library |
| **AI suggestions** | No cloud AI | Optional; off by default, with explicit consent to send masked text |
| **Offline use** | Prepare resources first; browser caches may be evicted | Conversion runtime and OCR are bundled; no separate Python installation |

The versions use different engines and may produce different formatting or extracted resources. Mobile browsers need HTTPS. Native iOS/Android apps are not provided.

## Download

| Platform | Installer |
|---|---|
| Windows x64 | [EXE](https://github.com/TuSiV/markalldown/releases/download/v3.0.0/MarkAllDown_3.0.0_x64-setup.exe) · [MSI](https://github.com/TuSiV/markalldown/releases/download/v3.0.0/MarkAllDown_3.0.0_x64_en-US.msi) |
| macOS · Apple Silicon | [ARM64 DMG](https://github.com/TuSiV/markalldown/releases/download/v3.0.0/MarkAllDown_3.0.0_aarch64.dmg) |
| macOS · Intel | [x64 DMG](https://github.com/TuSiV/markalldown/releases/download/v3.0.0/MarkAllDown_3.0.0_x64.dmg) |

[Release notes](RELEASE_NOTES.md) · [SHA256 checksums](https://github.com/TuSiV/markalldown/releases/download/v3.0.0/SHA256SUMS.txt) · [All releases](https://github.com/TuSiV/markalldown/releases)

**Using the old 3.0.0 prerelease?** Download the rebuilt stable installer. It includes the combined-export option fix and new checksums despite sharing the version number.

macOS packages are ad-hoc signed, without Apple Developer ID signing or notarization. First launch may require approval in System Settings → Privacy & Security.

## Quick start

### Convert

1. Open the web or desktop app and select files. Desktop also supports folders.
2. Inspect the reading preview or Markdown source after conversion.
3. Download the browser result, or choose a desktop export directory and format. Browser results containing extracted resources are packaged as ZIP.

Desktop can queue files while its service starts. Switch UI language in the browser header or desktop settings; document text and filenames stay unchanged.

### Redact and recover

1. Open redaction review, configure rules, custom terms, and allowlists; enter a password of at least eight characters.
2. Review every document's full original and masked text, correct findings, and approve it.
3. Export masked Markdown. **Keep recovery packs separate from the text you share.** Browser export requires saving and acknowledging the pack first.
4. To recover, select the masked Markdown, matching JSON pack, and password; inspect the result and save a new file.

<details>
<summary><strong>More screenshots: redaction and macOS dark mode</strong></summary>

![Full-text redaction review](docs/assets/redaction.png)

![macOS dark-mode workspace](docs/assets/mac-dark.png)

Synthetic acceptance scenes. macOS surfaces use Tauri/WebKit, not native NSGlassEffectView.

</details>

## Data and limitations

- **Local processing:** browser conversion does not use a hosted document-conversion API. First use downloads app, engine, and model resources. Desktop uses a token-protected loopback service.
- **Optional outbound AI:** desktop sends masked text only after consent, capped at the first 20,000 characters; suggestions require manual adoption.
- **Session data:** refreshing or closing the browser clears in-memory documents and passwords. Offline caches exclude them. Desktop conversion caches are cleared on normal exit; crashes can leave remnants.
- **Review is essential:** ordinary preview, copy, and export contain original text. Redaction does not guarantee removal from image pixels, metadata, link targets, or missed text.
- **Recovery restores Markdown:** it does not recreate Office/PDF binaries. Check OCR, tables, and formulas against the source. Desktop PDF checkpoints last only for the current session.

Redaction and recovery are experimental. See [Security and privacy](SECURITY.md) for encryption, consent, cache, and recovery boundaries.

## Development and documentation

`main` is the single maintained branch for desktop and web; tags retain historical releases.

| Goal | Guide |
|---|---|
| Run, build, or verify the application | [Build guide](BUILDING.md) |
| Understand engines, offline resources, and browser limits | [Web implementation](docs/LOCAL_WEB_IMPLEMENTATION.md) |
| Diagnose or measure desktop startup | [Startup guide](docs/DESKTOP_STARTUP.md) |
| Find verification evidence and historical records | [Documentation index](docs/README.md) |

---

<div align="center">

Maintained by YONGZHE CHEN · MIT<br />
Built with <a href="https://github.com/microsoft/markitdown">Microsoft MarkItDown</a> and other components under their respective licenses.

</div>
