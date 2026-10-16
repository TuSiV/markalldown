# Build and verification guide

[Home](README.md) · [简体中文](README.zh-CN.md) · [Documentation](docs/README.md)

Run the desktop app from source, build native installers, or verify the browser workspace.

## Requirements

| Component | Version / platform |
|---|---|
| Node.js | 22.12+; release CI uses 24 |
| Python | 3.12 used by native CI |
| Rust | Stable, on the target operating system |
| Windows | C++ build tools; WebView2 for the desktop UI |
| macOS | Xcode Command Line Tools |

Browser development alone does not require Python or Rust. Browser/Python interoperability tests do require the backend dependencies.

## Desktop development

Create and activate a Python virtual environment first, then run:

```bash
npm ci
python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
python scripts/build.py --sidecar-only
npm run tauri dev
```

Build a complete installer on the target OS and architecture:

```bash
python scripts/build.py
```

| Platform | Bundle location |
|---|---|
| Windows EXE | `src-tauri/target/release/bundle/nsis/` |
| Windows MSI | `src-tauri/target/release/bundle/msi/` |
| macOS DMG | `src-tauri/target/release/bundle/dmg/` |

Numeric stable builds support NSIS and MSI. The `--prerelease` flag or `MAD_PRERELEASE=1` selects NSIS only on Windows; versions with a prerelease suffix also use NSIS. macOS loads its platform-specific Tauri configuration.

### Bundled runtime

PyInstaller builds an `onedir` distribution. The build script copies the entire environment to `src-tauri/binaries/runtime/`; Tauri packages it as `runtime/` in the application resources.

**Distribute the whole runtime directory.** Copying only the service executable omits its libraries and models. Release builds resolve the service from the resource directory; source paths are debug fallbacks.

## Browser development

```bash
npm ci
npm run dev:web
npm run build:web
npm run preview:web
```

Deploy `dist-web/` to HTTPS static hosting. Localhost is suitable for desktop development. See [browser implementation](docs/LOCAL_WEB_IMPLEMENTATION.md) for offline-resource and mobile limits.

## Source checks

After activating the Python environment, select its interpreter for frontend interoperability tests:

| Shell | Interpreter setting |
|---|---|
| Bash / zsh | `export MAD_PYTHON=python` |
| PowerShell | `$env:MAD_PYTHON="python"` |

```bash
npm ci
python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
python scripts/test_backend.py
npm test
npm run build
npm run build:web
npm audit --audit-level=high
```

The backend test entrypoint sets `ORT_DISABLE_TELEMETRY=1` before importing ONNX Runtime. Keep this ordering in replacement entrypoints.

<details>
<summary><strong>Rendering, packaged-service, and startup checks</strong></summary>

Use an installed Playwright browser, or set `CHROME_PATH` to a compatible Chrome executable.

```bash
npm run test:ui
npm run test:web
python scripts/smoke_service.py /path/to/markalldown-server
python scripts/smoke_desktop.py /path/to/markalldown
python scripts/benchmark_startup.py /path/to/markalldown-server --runs 5 --output startup-benchmark.json
```

Use the corresponding `.exe` paths on Windows. Rendering scripts use synthetic fixtures and mocked native interfaces where indicated; they do not replace native installation tests.

</details>

## macOS signing

Nested Mach-O dependencies and the hardened service are ad-hoc signed before the outer app is sealed. Check the final installed bundle with `scripts/check_macos_bundle.py`, including the final service entitlements from `src-tauri/Entitlements.plist`.

| Check | What it establishes |
|---|---|
| Deep/strict signature verification | Integrity of the signed bundle |
| Installed app and service smoke | Launch and functional service checks |
| Quarantined system assessment | Recorded Gatekeeper behavior |

Ad-hoc signatures do not provide Developer ID trust or notarization. CI process launches do not prove every browser/Finder first-launch interaction.

## CI and publication

| Trigger / job | Behavior |
|---|---|
| Ordinary main push or PR | Native matrix, desktop rendering, and reusable browser acceptance |
| Explicit prerelease marker | Publication after all required acceptance jobs succeed |
| 3.0.0 stable replacement | Version-specific, guarded rebuild/replacement workflow; not a generic future-release command |

The 3.0.0 stable run built four installers, screenshots, and checksums. Windows installation smoke used the NSIS installer; MSI was built and included in the verified asset set. Production third-party AI calls were not part of acceptance.

Canonical branding is `src/assets/brand.svg`; platform icons live under `src-tauri/icons/`. See the relevant generation scripts before changing derived artwork.

[Release evidence](docs/README.md#release-evidence) · [Security and privacy](SECURITY.md)
